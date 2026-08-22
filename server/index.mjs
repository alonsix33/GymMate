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

/**
 * Los origenes que pueden hablar con esta API desde otro dominio.
 *
 * Vacio = solo mismo origen, que es lo que habia antes de esto. Se listan
 * separados por coma en la variable del servicio, por ejemplo:
 *   ORIGEN_PERMITIDO=https://gymmate.netlify.app,https://gymmate.app
 *
 * Nunca `*`. Con `*` cualquier pagina que visites podria pedirle tu historial
 * a este servidor; el token no salva de eso porque el navegador se lo manda
 * igual si la propia pagina lo tiene. Un origen concreto sí.
 */
const ORIGENES = (process.env.ORIGEN_PERMITIDO || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

// `*` es lo primero que escribe quien conoce CORS de oidas, y aqui entraba
// como cadena literal: `ORIGENES.includes(origen)` no lo casa nunca. El
// arranque imprimia `origenes CORS : *`, que se lee como "abierto", y la app
// legitima se quedaba fuera con un 403. Es el mismo rotulo que miente, otra
// vez. Mejor no arrancar que arrancar mintiendo.
if (ORIGENES.some((o) => o === '*' || o.includes('*'))) {
  console.error(
    'ORIGEN_PERMITIDO no admite comodines. Pon los dominios concretos separados por coma,\n' +
      'por ejemplo: ORIGEN_PERMITIDO=https://tu-app.netlify.app'
  );
  process.exit(1);
}

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
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    // Que ninguna cache intermedia se quede con el historial. La RFC dice que
    // no deberia guardar una respuesta a un pedido con `Authorization`, pero
    // depender de que todo intermediario entre el telefono y Railway cumpla
    // la norma no es una defensa.
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(cuerpo));
};

/**
 * Deja las cabeceras CORS puestas si el origen del pedido esta en la lista.
 *
 * Se llama al principio de TODO pedido: `writeHead` fusiona lo que ya esta
 * puesto con `setHeader`, asi que el streaming del coach y los 401 tambien
 * las llevan. Una respuesta de error sin cabeceras CORS le llega al navegador
 * como un fallo de red generico y la app pinta "sin conexion" cuando en
 * realidad el token estaba mal.
 *
 * `Vary: Origin` va siempre que haya `Origin`, tambien cuando NO se permite:
 * sin el, una cache intermedia puede servirle a un origen la respuesta que
 * calculo para otro.
 */
function aplicarCors(req, res) {
  const origen = (req.headers.origin || '').replace(/\/$/, '');
  if (!origen) return false;
  res.setHeader('Vary', 'Origin');
  if (!ORIGENES.includes(origen)) return false;
  res.setHeader('Access-Control-Allow-Origin', origen);
  return true;
}

/**
 * El permiso previo que el navegador pide solo, antes del pedido de verdad.
 *
 * Aqui NO se puede exigir el token: el navegador no manda `Authorization` en
 * un preflight, asi que pedirlo lo condena al 401 y el pedido real no llega a
 * salir nunca. Es lo que rompia la app servida desde Netlify. No entrega
 * ningun dato: solo dice que metodos y cabeceras se aceptan.
 */
function esPreflight(req) {
  return req.method === 'OPTIONS' && typeof req.headers['access-control-request-method'] === 'string';
}

function autorizado(req) {
  if (!TOKEN) return false;
  const cabecera = req.headers.authorization || '';
  const dado = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
  // Comparacion de tiempo constante: con `===` el tiempo de respuesta filtra
  // cuantos caracteres del token son correctos.
  // El corte por longitud sale ANTES del bucle, asi que el tiempo constante
  // solo vale entre tokens de la misma longitud; la longitud si se filtra.
  // Sobre red esa señal es ruido, y el cuerpo del error es identico en todos
  // los casos. Se dice aqui para que nadie lea la linea de abajo como una
  // garantia que no da.
  if (dado.length !== TOKEN.length) return false;
  let dif = 0;
  for (let i = 0; i < TOKEN.length; i++) dif |= dado.charCodeAt(i) ^ TOKEN.charCodeAt(i);
  return dif === 0;
}

/**
 * Junta el cuerpo del pedido. Acumula BYTES y decodifica UNA vez al final.
 *
 * Antes hacia `bruto += t` sobre cada `Buffer`, y eso decodifica cada trozo
 * por separado: cuando un caracter UTF-8 de dos bytes cae partido en la
 * frontera entre dos trozos, cada mitad se convierte en U+FFFD y se pierde
 * para siempre. Comprobado: un cuerpo de 128 KB de 'ó' volvia con 4
 * caracteres destruidos, y uno de 400 KB con 12. Con 200 OK y sin una sola
 * señal.
 *
 * No era cosmetico. `gymmate_prs` esta indexado POR EL NOMBRE del ejercicio,
 * asi que "Elevación lateral" corrompido se convierte en un ejercicio
 * fantasma y parte su historial de PR en dos. Y `bajarCopia()` escribe la
 * copia encima de localStorage: restaurar grababa la corrupcion en el dato
 * bueno.
 *
 * De paso el limite pasa a contar bytes de verdad. `bruto.length` sobre una
 * cadena cuenta unidades UTF-16, que no es lo que el cuerpo pesa.
 */
function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    const trozos = [];
    let bytes = 0;
    let cortado = false;
    req.on('data', (t) => {
      if (cortado) return;
      bytes += t.length;
      if (bytes > LIMITE_CUERPO) {
        cortado = true;
        // Antes se hacia `req.destroy()` a secas: el socket moria sin
        // respuesta y `fetch` en el navegador daba "Failed to fetch", que es
        // literalmente lo mismo que se ve sin cobertura. La app culpaba a la
        // conexion. Un 413 se puede distinguir y explicar.
        // Se rechaza pero NO se destruye el socket todavia: matarlo aqui
        // impide escribir la respuesta, y `fetch` en el navegador da
        // "Failed to fetch", identico a estar sin cobertura. Quien recoge el
        // rechazo escribe el 413 y destruye despues. Los trozos que sigan
        // llegando se tiran, asi que la memoria no crece.
        const e = new Error('la copia es demasiado grande para este servidor');
        e.codigo = 413;
        e.cortarDespues = req;
        rechazar(e);
        return;
      }
      trozos.push(t);
    });
    req.on('end', () => {
      if (cortado) return;
      try {
        const texto = Buffer.concat(trozos).toString('utf8');
        resolver(texto ? JSON.parse(texto) : {});
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
  const permitido = aplicarCors(req, res);

  if (esPreflight(req)) {
    if (!permitido) return json(res, 403, { error: 'origen no permitido' });
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  if (ruta === '/api/salud') {
    return json(res, 200, {
      ok: true,
      almacenamiento: modoAlmacen(),
      // `fichero` NO garantiza persistencia: puede ser un volumen o puede ser
      // el disco efimero del contenedor, y desde aqui no se distinguen.
      persistente: modoAlmacen() === 'postgres',
      coach: Boolean(process.env.ANTHROPIC_API_KEY),
      protegido: Boolean(TOKEN),
      // Se dice en voz alta lo que falta, en vez de fingir que todo esta bien.
      avisos: [
        // Decia "la API está abierta a cualquiera", que es al reves de lo que
        // hace `autorizado()`: sin token devuelve 401 a todo. Un aviso que
        // miente sobre el riesgo hace tomar la decision equivocada.
        !TOKEN && 'Falta GYMMATE_TOKEN: la API no acepta a nadie hasta que la configures.',
        // Este aviso solo saltaba en modo `efimero`, o sea cuando NI SIQUIERA
        // se puede escribir un fichero. Pero el caso real y silencioso es el
        // otro: sin Postgres y sin volumen, `/data` se crea sin problema, el
        // modo es `fichero`, y la copia se borra igual en el proximo
        // despliegue. El servidor no puede distinguir un volumen montado de
        // una carpeta cualquiera, asi que en vez de afirmar, avisa de que hay
        // que mirarlo en Railway.
        modoAlmacen() === 'efimero' &&
          'Sin almacenamiento: lo que guardes se borra en el próximo despliegue.',
        modoAlmacen() === 'fichero' &&
          'Copia en fichero: comprueba en Railway que haya un volumen montado en /data. ' +
            'Sin volumen ni Postgres, se borra en el próximo despliegue.',
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
      // El cuerpo demasiado grande tiene su propio codigo: si sale como 500,
      // la app no puede distinguirlo de un fallo del servidor.
      json(res, e.codigo ?? 500, { error: e.message });
      // Ya con la respuesta escrita, se corta lo que quede por llegar.
      if (e.cortarDespues) e.cortarDespues.destroy();
      return;
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'método no permitido' });
  }
  try {
    await servirEstatico(req, res, ruta);
  } catch (e) {
    // `servirEstatico` escribe la cabecera ANTES de leer el fichero: si la
    // lectura falla despues (EACCES, o el fichero desaparece a mitad de un
    // despliegue), un segundo `writeHead` lanza ERR_HTTP_HEADERS_SENT dentro
    // del catch, escapa del manejador async y tumba el proceso.
    if (!res.headersSent) json(res, 500, { error: e.message });
    else res.end();
  }
});

// Un rechazo suelto no puede tumbar el servidor y dejar a Alonso sin copia ni
// coach hasta que Railway lo reinicie. Se registra y se sigue.
process.on('unhandledRejection', (e) => {
  console.error('rechazo sin capturar:', e instanceof Error ? e.stack : e);
});

const modo = await iniciarAlmacen();
servidor.listen(PUERTO, '0.0.0.0', () => {
  console.log(`GymMate escuchando en :${PUERTO}`);
  console.log(`  almacenamiento : ${modo}${modo === 'efimero' ? '  ← SE BORRA en cada despliegue' : ''}`);
  console.log(`  coach          : ${process.env.ANTHROPIC_API_KEY ? 'con modelo' : 'sin clave (responde en local)'}`);
  console.log(`  API protegida  : ${TOKEN ? 'sí' : 'NO — falta GYMMATE_TOKEN'}`);
  console.log(`  origenes CORS  : ${ORIGENES.length ? ORIGENES.join(', ') : 'ninguno (solo mismo origen)'}`);
});
