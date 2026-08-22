#!/usr/bin/env node
/**
 * GymMate en Railway: sirve la PWA construida y expone la API minima.
 *
 * Sin framework y con una sola dependencia (`pg`, y solo si usas Postgres).
 * Node trae `http` y `fetch`; lo demas serian 200 paquetes para hacer lo que
 * caben en este archivo.
 *
 *   GET  /api/salud   estado del servicio: si hay clave del modelo y si el
 *                     almacenamiento es persistente de verdad.
 *   GET  /api/datos   la ultima copia guardada.
 *   PUT  /api/datos   guarda una copia (el mismo JSON que el CSV, entero).
 *   POST /api/coach   pregunta al modelo, respondiendo en streaming.
 *   /*                la PWA.
 *
 * Todo `/api/*` (menos `/api/salud`) exige `Authorization: Bearer <token>`
 * contra `GYMMATE_TOKEN`. Es una app de una persona: sin eso, la URL publica
 * de Railway deja tu historial a la vista y tu clave del modelo al alcance de
 * cualquiera que quiera gastarla.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciarAlmacen, modoAlmacen, leer, guardar } from './almacen.mjs';
import { responderCoach } from './coach.mjs';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const PUERTO = Number(process.env.PORT) || 3000;
const TOKEN = process.env.GYMMATE_TOKEN || '';
const LIMITE_CUERPO = 8 * 1024 * 1024; // 8 MB: un historial largo cabe de sobra

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(cuerpo));
};

function autorizado(req) {
  if (!TOKEN) return false;
  const cabecera = req.headers.authorization || '';
  const dado = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
  // Comparacion de longitud constante: con `===` el tiempo de respuesta filtra
  // cuantos caracteres del token son correctos.
  if (dado.length !== TOKEN.length) return false;
  let dif = 0;
  for (let i = 0; i < TOKEN.length; i++) dif |= dado.charCodeAt(i) ^ TOKEN.charCodeAt(i);
  return dif === 0;
}

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    let bruto = '';
    req.on('data', (t) => {
      bruto += t;
      if (bruto.length > LIMITE_CUERPO) {
        rechazar(new Error('cuerpo demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolver(bruto ? JSON.parse(bruto) : {});
      } catch {
        rechazar(new Error('JSON invalido'));
      }
    });
    req.on('error', rechazar);
  });
}

async function servirEstatico(req, res, ruta) {
  // `normalize` mas la comprobacion de prefijo: sin esto, `/../.env` sale del
  // directorio y sirve lo que le pidas.
  const rel = normalize(decodeURIComponent(ruta)).replace(/^(\.\.[/\\])+/, '');
  let archivo = join(DIST, rel === '/' ? 'index.html' : rel);
  if (!archivo.startsWith(DIST)) return json(res, 403, { error: 'prohibido' });

  let info = await stat(archivo).catch(() => null);
  if (info?.isDirectory()) {
    archivo = join(archivo, 'index.html');
    info = await stat(archivo).catch(() => null);
  }
  // La PWA es de una sola pagina: lo que no sea un fichero, es index.html.
  if (!info) {
    archivo = join(DIST, 'index.html');
    info = await stat(archivo).catch(() => null);
    if (!info) return json(res, 503, { error: 'falta dist/: ¿corrio `npm run build`?' });
  }

  const ext = extname(archivo);
  const inmutable = /-[A-Za-z0-9_]{8,}\./.test(archivo) || archivo.includes('/fonts/');
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    // Los ficheros con hash en el nombre no cambian nunca; el resto, y sobre
    // todo el service worker, no se pueden cachear o la app se queda vieja.
    'Cache-Control': inmutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(await readFile(archivo));
}

const servidor = createServer(async (req, res) => {
  const ruta = (req.url ?? '/').split('?')[0];

  if (ruta === '/api/salud') {
    return json(res, 200, {
      ok: true,
      almacenamiento: modoAlmacen(),
      persistente: modoAlmacen() !== 'efimero',
      coach: Boolean(process.env.ANTHROPIC_API_KEY),
      protegido: Boolean(TOKEN),
      // Se dice en voz alta lo que falta, en vez de fingir que todo esta bien.
      avisos: [
        !TOKEN && 'Falta GYMMATE_TOKEN: la API está abierta a cualquiera.',
        modoAlmacen() === 'efimero' &&
          'Sin Postgres ni volumen: lo que guardes se borra en el próximo despliegue.',
        !process.env.ANTHROPIC_API_KEY && 'Falta ANTHROPIC_API_KEY: el coach responde en local.',
      ].filter(Boolean),
    });
  }

  if (ruta.startsWith('/api/')) {
    if (!autorizado(req)) {
      return json(res, 401, {
        error: TOKEN ? 'token inválido' : 'el servidor no tiene GYMMATE_TOKEN configurado',
      });
    }
    try {
      if (ruta === '/api/datos' && req.method === 'GET') {
        const g = await leer();
        return json(res, 200, g ?? { datos: null, actualizado: null });
      }
      if (ruta === '/api/datos' && req.method === 'PUT') {
        const cuerpo = await leerCuerpo(req);
        if (!cuerpo || typeof cuerpo.datos !== 'object' || cuerpo.datos === null) {
          return json(res, 400, { error: 'se esperaba { datos: {...} }' });
        }
        const r = await guardar(cuerpo.datos);
        return json(res, 200, { ok: true, ...r });
      }
      if (ruta === '/api/coach' && req.method === 'POST') {
        return await responderCoach(req, res, await leerCuerpo(req));
      }
      return json(res, 404, { error: 'no existe' });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'método no permitido' });
  }
  try {
    await servirEstatico(req, res, ruta);
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

const modo = await iniciarAlmacen();
servidor.listen(PUERTO, '0.0.0.0', () => {
  console.log(`GymMate escuchando en :${PUERTO}`);
  console.log(`  almacenamiento : ${modo}${modo === 'efimero' ? '  ← SE BORRA en cada despliegue' : ''}`);
  console.log(`  coach          : ${process.env.ANTHROPIC_API_KEY ? 'con modelo' : 'sin clave (responde en local)'}`);
  console.log(`  API protegida  : ${TOKEN ? 'sí' : 'NO — falta GYMMATE_TOKEN'}`);
});
