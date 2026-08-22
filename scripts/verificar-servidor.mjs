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
import { createServer } from 'node:http';
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
  let muerto = null;
  hijo.stdout.on('data', (b) => (salida += b));
  hijo.stderr.on('data', (b) => (salida += b));
  // Con un servidor de una corrida anterior vivo en el mismo puerto, el hijo
  // moria con EADDRINUSE, `/api/salud` respondia 200 desde el INTRUSO y la
  // puerta imprimia 15 OK contra un servidor que no era el suyo.
  hijo.on('exit', (codigo) => { muerto = codigo; });

  const base = `http://127.0.0.1:${puerto}`;
  const limite = Date.now() + 15000;
  for (;;) {
    if (muerto !== null) {
      throw new Error(
        `el servidor murio al arrancar (codigo ${muerto}). ` +
          `¿Hay otro escuchando en :${puerto} de una corrida anterior?\n${salida}`
      );
    }
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
      // Si ya salio, `once('exit')` no resuelve nunca y la puerta se cuelga
      // con "unsettled top-level await" en vez de decir que paso.
      if (muerto === null) {
        hijo.kill('SIGTERM');
        await new Promise((ok) => hijo.once('exit', ok));
      }
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
    // `Vary` solo se comprobaba en el caso PERMITIDO, que es justo donde no
    // importa: el envenenamiento de cache solo es posible en esta rama, y
    // mover el `setHeader` detras del `includes` no mataba ningun chequeo.
    chk('cors · el origen ajeno tambien recibe Vary, o una cache reparte mal',
      /origin/i.test(cab(getMalo, 'vary') ?? ''), String(cab(getMalo, 'vary')));
    chk('cors · los metodos son exactamente los que existen, ni uno mas',
      cab(pre, 'access-control-allow-methods') === 'GET, PUT, POST, OPTIONS',
      String(cab(pre, 'access-control-allow-methods')));
    // Con Bearer desde localStorage no hacen falta credenciales; activarlas
    // seria superficie a cambio de nada, y nadie lo estaba mirando.
    chk('cors · no se piden credenciales, que aqui no hacen falta',
      cab(pre, 'access-control-allow-credentials') === null &&
        cab(get, 'access-control-allow-credentials') === null);
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

    // El respaldo de un año pesa cientos de KB y llega en varios trozos. Con
    // `bruto += t` sobre cada Buffer, un caracter de dos bytes partido en la
    // frontera entre trozos se convertia en U+FFFD y se perdia. Comprobado:
    // 128 KB de 'ó' volvian con 4 destruidos, con 200 OK. Y `gymmate_prs`
    // esta indexado POR EL NOMBRE del ejercicio, asi que "Elevación lateral"
    // corrompido parte su historial de PR en dos.
    //
    // Se usa un cuerpo hecho SOLO de caracteres de dos bytes: cualquier corte
    // en un offset impar parte uno por la mitad, asi que si el troceo existe
    // esto lo ve seguro. Con nombres realistas el fallo depende del
    // alineamiento y se escapa la mitad de las veces.
    for (const kb of [128, 400]) {
      const texto = 'ó'.repeat((kb * 1024) / 2);
      const p2 = await fetch(`${s.base}/api/datos`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ datos: { gymmate_history: texto } }),
      });
      const v2 = await (await fetch(`${s.base}/api/datos`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
      const vuelto = v2?.datos?.gymmate_history ?? '';
      const rotos = (vuelto.match(/\uFFFD/g) ?? []).length;
      chk(`datos · ${kb} KB con acentos vuelven intactos, sin caracteres destruidos`,
        p2.ok && vuelto === texto,
        rotos ? `${rotos} caracteres destruidos` : `codigo ${p2.status}, ${vuelto.length} de ${texto.length}`);
    }

    // El limite de 8 MB tiene que dar 413, no matar el socket: `fetch` daria
    // "Failed to fetch", que es literalmente lo que se ve sin cobertura, y la
    // app culparia a la conexion para siempre.
    const enorme = await fetch(`${s.base}/api/datos`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ datos: { x: 'a'.repeat(9 * 1024 * 1024) } }),
    }).catch((e) => ({ status: 0, error: e.message }));
    chk('datos · una copia de mas de 8 MB da 413, no una caida de socket',
      enorme.status === 413, enorme.status === 0 ? `el socket murio: ${enorme.error}` : `codigo ${enorme.status}`);
    const vivo = await fetch(`${s.base}/api/salud`);
    chk('datos · y el servidor sigue en pie despues', vivo.ok, `codigo ${vivo.status}`);

    // Y la copia buena no se pisa con la que fue rechazada.
    const tras = await (await fetch(`${s.base}/api/datos`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
    chk('datos · la copia anterior sobrevive al rechazo',
      typeof tras?.datos?.gymmate_history === 'string', JSON.stringify(tras?.datos ?? null).slice(0, 40));
  } finally {
    await s.cerrar();
  }
}

// ==========================================================================
// A2. El camino de STREAMING de verdad, con un upstream de mentira
//
// El chequeo de arriba comprueba la cabecera sobre un 503 —el servidor no
// tiene clave y sale antes de llegar al `writeHead(200)` del streaming—, o
// sea sobre el unico camino que NO es el que dice cubrir. Comprobado: borrar
// las cabeceras justo antes de ese `writeHead(200)` no mataba ni un chequeo.
// Aqui se levanta un falso api.anthropic.com que responde SSE de verdad.
// ==========================================================================
{
  // Habla el formato de OpenAI, que es el que usa DeepSeek: el texto va en
  // `choices[0].delta.content` y el stream cierra con `data: [DONE]`.
  let vistoPorElModelo = null;
  const falso = createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (t) => (cuerpo += t));
    req.on('end', () => {
      try {
        vistoPorElModelo = JSON.parse(cuerpo);
      } catch {
        vistoPorElModelo = null;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"cin"}}]}\n');
      res.write('data: {"choices":[{"delta":{"reasoning_content":"NO DEBE SALIR"}}]}\n');
      res.write('data: {"choices":[{"delta":{"content":"cuenta"}}]}\n');
      res.write('data: [DONE]\n');
      res.end();
    });
  });
  await new Promise((ok) => falso.listen(4734, '127.0.0.1', ok));

  const s = await levantar(4735, {
    ORIGEN_PERMITIDO: BUENO,
    COACH_API_KEY: 'clave-de-mentira',
    COACH_URL: 'http://127.0.0.1:4734/v1/messages',
  });
  try {
    const r = await fetch(`${s.base}/api/coach`, {
      method: 'POST',
      headers: { Origin: BUENO, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      // Con contexto de verdad: mandando `contexto: null` la rama que arma el
      // bloque no se ejecutaba, y el chequeo de "no se manda cache_control"
      // pasaba sin haber recorrido el unico sitio donde podria aparecer.
      body: JSON.stringify({
        pregunta: '¿como voy?',
        contexto: {
          panorama: [{
            ejercicio: 'Press Banca', unaRepMax: 137, unaRepMaxHistorico: 127, estimable: true,
            pico: 120, actual: 100, posicion: 62, zona: 'ambar',
            sesionesEstancado: 3, sesiones: 41, ultimaVez: '2026-08-18',
          }],
          resumen: {
            hoy: '2026-08-22',
            sesiones: 208, desde: '2025-08-22', hasta: '2026-08-20', racha: 5, mejorRacha: 21,
            diasDesdeUltima: 126, sesionesUltimos7: 0, sesionesUltimos30: 0, sesionesEsteMes: 0,
            volumenPorGrupo: { Pecho: 90000 }, volumenUltimos30: 0,
            pesoCorporal: 78.4, grasaCorporal: 14.4,
          },
          bitacora: '2026-08-18 Pecho · Press Banca 4x8@100',
        },
      }),
    });
    chk('streaming · el coach responde 200, no 503', r.status === 200, `codigo ${r.status}`);
    chk('streaming · y la respuesta del stream lleva allow-origin',
      cab(r, 'access-control-allow-origin') === BUENO, String(cab(r, 'access-control-allow-origin')));
    chk('streaming · sin cache, que ahi va el historial',
      /no-store/.test(cab(r, 'cache-control') ?? ''), String(cab(r, 'cache-control')));
    const texto = await r.text();
    chk('streaming · el texto del modelo llega recompuesto', texto === 'cincuenta', JSON.stringify(texto));
    // `[DONE]` no es JSON: si se intentara parsear se tragaria en el catch,
    // pero si se reenviara como texto saldria en pantalla.
    chk('streaming · el cierre [DONE] no se cuela en la respuesta',
      !texto.includes('DONE'), JSON.stringify(texto));
    // El borrador del modelo no es su respuesta.
    chk('streaming · el razonamiento no se pinta como si fuera la respuesta',
      !texto.includes('NO DEBE SALIR'), JSON.stringify(texto));

    // Lo que se le manda al modelo. Es la unica forma de comprobar sin gastar
    // una llamada de verdad que la peticion tiene la forma que DeepSeek pide.
    chk('modelo · se pide el modelo configurado',
      vistoPorElModelo?.model === 'deepseek-v4-flash', String(vistoPorElModelo?.model));
    chk('modelo · el modo pensante va APAGADO, que aqui solo cuesta',
      vistoPorElModelo?.thinking?.type === 'disabled', JSON.stringify(vistoPorElModelo?.thinking));
    chk('modelo · el prompt de sistema es el primer mensaje',
      vistoPorElModelo?.messages?.[0]?.role === 'system', String(vistoPorElModelo?.messages?.[0]?.role));
    chk('modelo · todos los contenidos son cadenas, no bloques de Anthropic',
      (vistoPorElModelo?.messages ?? []).every((m) => typeof m.content === 'string'),
      JSON.stringify((vistoPorElModelo?.messages ?? []).map((m) => typeof m.content)));
    chk('modelo · no se manda `cache_control`, que DeepSeek no conoce',
      !JSON.stringify(vistoPorElModelo ?? {}).includes('cache_control'));
    chk('modelo · se pide en streaming', vistoPorElModelo?.stream === true, String(vistoPorElModelo?.stream));
    // Y que el contexto de verdad haya llegado: si no, los chequeos de arriba
    // estarian mirando una peticion sin el bloque que importa.
    const conPanorama = (vistoPorElModelo?.messages ?? []).some(
      (m) => typeof m.content === 'string' && m.content.includes('PANORAMA')
    );
    chk('modelo · el bloque de contexto llego al modelo', conPanorama);

    // Lo que el modelo LEE de verdad, no solo que el bloque este. Estos tres
    // salen de un fallo real: el coach dijo "Hoy es 2026-04-18" —la fecha de
    // la ultima sesion— siendo 22 de agosto, y razono cuatro meses de
    // conclusiones sobre esa base.
    // SOLO el mensaje del contexto, no todos juntos: el prompt de sistema
    // contiene el ejemplo "sesiones en lo que va de este mes: 0" dentro de su
    // propia regla, asi que buscar en el conjunto daba positivo aunque el
    // resumen viajara vacio. Un chequeo que acierta por el motivo equivocado.
    const bloque = (vistoPorElModelo?.messages ?? [])
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .find((c) => c.includes('PANORAMA —')) ?? '';
    chk('contexto · le dice al modelo QUE DIA ES HOY',
      /HOY ES 2026-08-22/.test(bloque), bloque.split('\n').find((l) => l.startsWith('HOY')) ?? '(no aparece)');
    chk('contexto · y le prohibe deducir la fecha de otra cosa',
      /No la deduzcas/i.test(bloque));
    chk('contexto · lleva las cuentas de calendario ya hechas',
      /en lo que va de este mes: 0/.test(bloque) && /hace 126 dias/.test(bloque),
      bloque.split('\n').filter((l) => /mes:|hace \d+ dias/.test(l)).join(' | ') || '(no aparecen)');

    const sistema = vistoPorElModelo?.messages?.[0]?.content ?? '';
    // La regla era tan ancha que el coach se negaba a decir "no has entrenado
    // este mes" con las fechas delante. Prudencia mal calibrada tambien es
    // una respuesta inutil.
    chk('sistema · la regla acota, no paraliza: se puede leer un calendario',
      /Lo que la regla NO prohíbe, y tienes que hacer:/.test(sistema) &&
        /Leer y comparar FECHAS/.test(sistema) &&
        /no has entrenado este mes/i.test(sistema));
    chk('sistema · y sigue prohibiendo inventar una metrica de la app',
      /NO calcules NADA/.test(sistema));
  } finally {
    await s.cerrar();
    await new Promise((ok) => falso.close(ok));
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
const CHEQUEOS_MINIMO = 50;
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
