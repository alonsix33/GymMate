#!/usr/bin/env node
/**
 * Puerta del servidor.
 *
 * Existe porque faltaba. Las otras tres puertas conducen la app en un
 * navegador contra un servidor de pruebas propio, todas en el MISMO origen, y
 * por eso ninguna vio el defecto real: `OPTIONS /api/datos` respondia 401 y
 * las respuestas no llevaban `Access-Control-Allow-Origin`, con lo que el
 * campo URL de PERFIL —cuyo unico proposito es la PWA en Netlify hablando con
 * la API en Railway— no podia funcionar nunca. La app pintaba "sin conexion"
 * y el servidor estaba perfectamente vivo.
 *
 * Leccion, la misma de siempre: un chequeo que solo cubre el camino comodo
 * apaga la sospecha. Aqui se levanta el servidor DE VERDAD, en tres
 * configuraciones distintas, y se le habla como le hablaria un navegador.
 *
 * Cada caso se probo matando su mutante antes de darlo por bueno.
 *
 * Sale 1 ante cualquier fallo. Uso: node scripts/verificar-servidor.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'token-de-prueba-largo-0123456789';
const BUENO = 'https://gymmate.netlify.app';
const MALO = 'https://sitio-cualquiera.example';

let fallos = 0;
let ejecutados = 0;
const chk = (n, ok, d = '') => {
  ejecutados++;
  if (!ok) fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${n}${d ? ' :: ' + d : ''}`);
};

/** Levanta el servidor real y espera a que responda de verdad, no a un sleep. */
async function levantar(puerto, entorno = {}) {
  const datos = await mkdtemp(join(tmpdir(), 'gymmate-puerta-'));
  const hijo = spawn(process.execPath, [join(RAIZ, 'server', 'index.mjs')], {
    env: { ...process.env, PORT: String(puerto), GYMMATE_TOKEN: TOKEN, DATOS_DIR: datos, ...entorno },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stdout.on('data', (b) => (salida += b));
  hijo.stderr.on('data', (b) => (salida += b));

  const base = `http://127.0.0.1:${puerto}`;
  const limite = Date.now() + 15000;
  for (;;) {
    if (Date.now() > limite) {
      hijo.kill('SIGKILL');
      throw new Error(`el servidor no arranco en 15 s:\n${salida}`);
    }
    try {
      const r = await fetch(`${base}/api/salud`);
      if (r.ok) break;
    } catch {
      // Todavia no escucha. Se reintenta sin dormir a ciegas.
    }
  }
  return {
    base,
    salida: () => salida,
    async cerrar() {
      hijo.kill('SIGTERM');
      await new Promise((ok) => hijo.once('exit', ok));
      await rm(datos, { recursive: true, force: true });
    },
  };
}

const cab = (r, n) => r.headers.get(n);

// ==========================================================================
// A. Con ORIGEN_PERMITIDO: la PWA en Netlify hablando con la API en Railway
// ==========================================================================
{
  const s = await levantar(4731, { ORIGEN_PERMITIDO: BUENO });
  try {
    // El preflight que el navegador manda SOLO, antes del pedido de verdad,
    // por llevar la cabecera Authorization. Nunca trae el token: exigirselo
    // era el defecto.
    const pre = await fetch(`${s.base}/api/datos`, {
      method: 'OPTIONS',
      headers: {
        Origin: BUENO,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    chk('cors · el preflight NO exige token', pre.status !== 401, `codigo ${pre.status}`);
    chk('cors · el preflight se acepta', pre.status === 204, `codigo ${pre.status}`);
    chk('cors · y devuelve el origen concreto, nunca *',
      cab(pre, 'access-control-allow-origin') === BUENO, String(cab(pre, 'access-control-allow-origin')));
    chk('cors · deja pasar Authorization',
      /authorization/i.test(cab(pre, 'access-control-allow-headers') ?? ''), String(cab(pre, 'access-control-allow-headers')));
    chk('cors · deja pasar PUT, que es con lo que se sube la copia',
      /PUT/.test(cab(pre, 'access-control-allow-methods') ?? ''), String(cab(pre, 'access-control-allow-methods')));

    // El pedido de verdad. Sin esta cabecera el navegador descarta la
    // respuesta aunque el servidor la haya calculado entera.
    const get = await fetch(`${s.base}/api/datos`, {
      headers: { Origin: BUENO, Authorization: `Bearer ${TOKEN}` },
    });
    chk('cors · la respuesta real lleva allow-origin',
      cab(get, 'access-control-allow-origin') === BUENO, String(cab(get, 'access-control-allow-origin')));
    chk('cors · y lleva Vary: Origin, para que ninguna cache la reparta mal',
      /origin/i.test(cab(get, 'vary') ?? ''), String(cab(get, 'vary')));

    // Un 401 sin cabeceras CORS le llega al navegador como fallo de red: la
    // app diria "sin conexion" con el servidor vivo y el token mal escrito.
    const mal = await fetch(`${s.base}/api/datos`, {
      headers: { Origin: BUENO, Authorization: 'Bearer equivocado' },
    });
    chk('cors · el 401 tambien la lleva, o el error se lee como caida de red',
      mal.status === 401 && cab(mal, 'access-control-allow-origin') === BUENO,
      `${mal.status} / ${cab(mal, 'access-control-allow-origin')}`);

    // /api/salud es lo PRIMERO que llama la tarjeta de PERFIL.
    const salud = await fetch(`${s.base}/api/salud`, { headers: { Origin: BUENO } });
    chk('cors · /api/salud la lleva', cab(salud, 'access-control-allow-origin') === BUENO,
      String(cab(salud, 'access-control-allow-origin')));

    // El coach responde en streaming con writeHead propio: se comprueba que
    // no se pierde por el camino.
    const coach = await fetch(`${s.base}/api/coach`, {
      method: 'POST',
      headers: { Origin: BUENO, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: 'hola' }),
    });
    chk('cors · el coach en streaming la conserva',
      cab(coach, 'access-control-allow-origin') === BUENO, String(cab(coach, 'access-control-allow-origin')));

    // Un origen que no esta en la lista no debe poder leer nada.
    const preMalo = await fetch(`${s.base}/api/datos`, {
      method: 'OPTIONS',
      headers: { Origin: MALO, 'Access-Control-Request-Method': 'PUT' },
    });
    chk('cors · un origen ajeno no pasa el preflight', preMalo.status === 403, `codigo ${preMalo.status}`);
    const getMalo = await fetch(`${s.base}/api/datos`, {
      headers: { Origin: MALO, Authorization: `Bearer ${TOKEN}` },
    });
    chk('cors · y su respuesta no lleva allow-origin, asi el navegador la tira',
      cab(getMalo, 'access-control-allow-origin') === null, String(cab(getMalo, 'access-control-allow-origin')));
    chk('cors · nunca se responde con el comodin *',
      cab(get, 'access-control-allow-origin') !== '*' && cab(pre, 'access-control-allow-origin') !== '*');

    // La copia entera, ida y vuelta, que es para lo que existe todo esto.
    const puesta = await fetch(`${s.base}/api/datos`, {
      method: 'PUT',
      headers: { Origin: BUENO, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ datos: { gymmate_history: [{ date: '2026-08-01' }], version: 1 } }),
    });
    chk('datos · se sube la copia desde otro origen', puesta.ok, `codigo ${puesta.status}`);
    const vuelta = await fetch(`${s.base}/api/datos`, {
      headers: { Origin: BUENO, Authorization: `Bearer ${TOKEN}` },
    });
    const cuerpo = await vuelta.json();
    chk('datos · y vuelve igual', cuerpo?.datos?.gymmate_history?.[0]?.date === '2026-08-01',
      JSON.stringify(cuerpo?.datos ?? null).slice(0, 80));
  } finally {
    await s.cerrar();
  }
}

// ==========================================================================
// B. Sin ORIGEN_PERMITIDO: el comportamiento de antes, intacto
// ==========================================================================
{
  const s = await levantar(4732);
  try {
    chk('por defecto · el arranque dice que no hay origenes',
      /origenes CORS\s*:\s*ninguno/.test(s.salida()), s.salida().split('\n').find((l) => l.includes('origenes')) ?? '');

    const get = await fetch(`${s.base}/api/datos`, {
      headers: { Origin: BUENO, Authorization: `Bearer ${TOKEN}` },
    });
    chk('por defecto · no se abre a nadie sin pedirlo',
      cab(get, 'access-control-allow-origin') === null, String(cab(get, 'access-control-allow-origin')));

    const mismo = await fetch(`${s.base}/api/datos`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    chk('por defecto · el mismo origen sigue funcionando', mismo.ok, `codigo ${mismo.status}`);

    const sinToken = await fetch(`${s.base}/api/datos`);
    chk('auth · sin token no se entra', sinToken.status === 401, `codigo ${sinToken.status}`);

    // El preflight sigue sin filtrar nada cuando no hay lista.
    const pre = await fetch(`${s.base}/api/datos`, {
      method: 'OPTIONS',
      headers: { Origin: BUENO, 'Access-Control-Request-Method': 'PUT' },
    });
    chk('por defecto · el preflight se rechaza si no hay lista', pre.status === 403, `codigo ${pre.status}`);
  } finally {
    await s.cerrar();
  }
}

// ==========================================================================
// C. Sin GYMMATE_TOKEN: la API tiene que quedar CERRADA, no abierta
// ==========================================================================
{
  const s = await levantar(4733, { GYMMATE_TOKEN: '' });
  try {
    const r = await fetch(`${s.base}/api/datos`);
    chk('auth · sin GYMMATE_TOKEN la API queda cerrada, no abierta',
      r.status === 401, `codigo ${r.status}`);
    const salud = await fetch(`${s.base}/api/salud`);
    const j = await salud.json();
    const aviso = (j.avisos ?? []).find((a) => /GYMMATE_TOKEN/.test(a)) ?? '';
    chk('salud · y lo dice en voz alta', aviso !== '', JSON.stringify(j.avisos));
    // El aviso decia "la API está abierta a cualquiera" mientras el servidor
    // respondia 401 a todo. Un rotulo que miente sobre el riesgo es peor que
    // no tenerlo: hace tomar la decision al reves.
    chk('salud · y el aviso no dice lo contrario de lo que hace',
      !/abierta|sin protecc|cualquiera puede/i.test(aviso), aviso);
    chk('salud · protegido: false cuando de verdad no lo esta', j.protegido === false, String(j.protegido));
  } finally {
    await s.cerrar();
  }
}

console.log(`\n${ejecutados} chequeos de servidor ejecutados`);
const CHEQUEOS_MINIMO = 24;
if (ejecutados < CHEQUEOS_MINIMO) {
  fallos++;
  console.log(
    `\nFALLA solo se ejecutaron ${ejecutados} chequeos (minimo ${CHEQUEOS_MINIMO}): ` +
      'borrar casos no puede ser una forma de poner la puerta en verde.'
  );
}
if (fallos > 0) {
  console.log(`\n${fallos} fallo(s) en la puerta del servidor.`);
  process.exit(1);
}
console.log('Puerta del servidor: sin discrepancias.');
