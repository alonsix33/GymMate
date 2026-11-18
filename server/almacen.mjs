/**
 * Donde vive la copia de tus datos en el servidor.
 *
 * Dos modos, y el servidor elige solo:
 *
 *   1. Postgres, si hay `DATABASE_URL`. OJO: Railway NO la inyecta sola por
 *      añadir el plugin. Hay que crear la variable en ESTE servicio con una
 *      referencia: `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
 *   2. Un fichero JSON en `DATOS_DIR` (por defecto `/data`), si no hay
 *      Postgres. Sirve con un volumen de Railway montado ahi.
 *
 * Y si no hay ninguna de las dos, arranca igual pero lo DICE en `/api/salud`:
 * el disco de un contenedor sin volumen se borra en cada despliegue, y un
 * backup que se evapora en silencio es peor que no tener backup.
 */
import { readFile, writeFile, mkdir, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = process.env.DATOS_DIR || '/data';
const FICHERO = join(DIR, 'gymmate.json');

let pg = null;
let modo = 'efimero';

/**
 * Si esta conexion necesita TLS o no.
 *
 * Forzar SSL contra la red PRIVADA de Railway es un fallo de arranque: el
 * Postgres interno no negocia TLS y `pg` responde "The server does not
 * support SSL connections". El servicio no levanta y el healthcheck lo
 * reinicia en bucle.
 *
 * Y tampoco hace falta: `*.railway.internal` no sale del proyecto. TLS es
 * para lo que cruza internet, que es el caso de `DATABASE_PUBLIC_URL`.
 */
export function necesitaTls(url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // Una URL que ni se puede parsear no va a conectar de todos modos; que
    // falle con el error de conexion de verdad y no con uno de TLS.
    return false;
  }
  if (/(^|\.)railway\.internal$/i.test(host)) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  if (/[?&]sslmode=disable(&|$)/i.test(url)) return false;
  return true;
}

/** Un fallo de TLS y no otra cosa: solo entonces vale reintentar sin el. */
function esFalloDeTls(e) {
  return /does not support SSL|SSL.*not enabled|no pg_hba.*SSL/i.test(String(e?.message ?? ''));
}

// ==========================================
// VERSIONES Y PROTECCION CONTRA SOBRESCRITURA
// ==========================================

/**
 * Cuantas copias anteriores se conservan. Antes habia UN solo slot que cada
 * subida sobrescribia sin comparar: un telefono con el almacenamiento vacio
 * (reinstalacion, Safari que limpia el sitio) que pulsara "Subir copia"
 * destruia la unica copia buena.
 */
export const VERSIONES_MAX = Number(process.env.VERSIONES_COPIA) || 10;
/** Por debajo de esto una copia es "pequeña" y no se protege (una cuenta nueva). */
export const MIN_SESIONES_PROTEGIDAS = 5;
/** Una subida con menos de esta fraccion de las sesiones guardadas se rechaza. */
export const FRACCION_MINIMA = 0.5;

/** Lo que se compara entre copias: cuanto hay dentro. */
export function resumenDe(datos) {
  const h = datos?.gymmate_history;
  const prs = datos?.gymmate_prs;
  return {
    sesiones: Array.isArray(h) ? h.length : 0,
    records: prs && typeof prs === 'object' && !Array.isArray(prs) ? Object.keys(prs).length : 0,
  };
}

export class CopiaRechazada extends Error {
  constructor(actual, nueva) {
    super(
      `La copia que intentas subir tiene ${nueva.sesiones} sesiones y la guardada tiene ${actual.sesiones}: ` +
        'no se sube para no perder la buena.'
    );
    this.codigo = 409;
    this.detalle = { codigo: 'copia_menor', actual, nueva };
  }
}

/** Devuelve la razon para rechazar la subida, o null si se puede guardar. */
export function evaluarSubida(actual, nueva) {
  if (!actual) return null;
  if (actual.sesiones >= MIN_SESIONES_PROTEGIDAS && nueva.sesiones < actual.sesiones * FRACCION_MINIMA) {
    return new CopiaRechazada(actual, nueva);
  }
  return null;
}

/** Escribe sin dejar nunca un fichero a medias: temporal + rename (atomico). */
async function escribirAtomico(ruta, contenido) {
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, contenido);
  await rename(tmp, ruta);
}

export async function iniciarAlmacen() {
  if (process.env.DATABASE_URL) {
    const { default: Pg } = await import('pg');
    const url = process.env.DATABASE_URL;
    const abrir = (tls) =>
      new Pg.Pool({ connectionString: url, ssl: tls ? { rejectUnauthorized: false } : false });

    pg = abrir(necesitaTls(url));
    try {
      await pg.query('SELECT 1');
    } catch (e) {
      // Cinturon y tirantes: si el host no se reconocio pero el servidor
      // tampoco habla TLS, se reintenta sin el en vez de morir. Solo ante un
      // fallo de TLS: cualquier otro error tiene que salir a la luz.
      if (!esFalloDeTls(e)) throw e;
      console.warn('Postgres no acepta TLS; se reintenta sin él.');
      await pg.end().catch(() => {});
      pg = abrir(false);
    }
    await pg.query(`
      CREATE TABLE IF NOT EXISTS respaldo (
        id          TEXT PRIMARY KEY,
        datos       JSONB NOT NULL,
        actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // Las copias ANTERIORES: cada subida archiva la que sustituye.
    await pg.query(`
      CREATE TABLE IF NOT EXISTS respaldo_versiones (
        n           BIGSERIAL PRIMARY KEY,
        id          TEXT NOT NULL,
        datos       JSONB NOT NULL,
        actualizado TIMESTAMPTZ NOT NULL,
        sesiones    INTEGER NOT NULL DEFAULT 0,
        archivada   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    modo = 'postgres';
    return modo;
  }
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, '.escritura'), 'ok');
    modo = 'fichero';
  } catch {
    modo = 'efimero';
  }
  return modo;
}

export function modoAlmacen() {
  return modo;
}

export async function leer(id = 'yo') {
  if (pg) {
    const r = await pg.query('SELECT datos, actualizado FROM respaldo WHERE id = $1', [id]);
    return r.rows[0] ? { datos: r.rows[0].datos, actualizado: r.rows[0].actualizado } : null;
  }
  if (modo === 'efimero') return null;
  try {
    const bruto = await readFile(FICHERO, 'utf8');
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}

export async function guardar(datos, id = 'yo', { forzar = false } = {}) {
  const actualizado = new Date().toISOString();
  const nueva = resumenDe(datos);
  if (pg) {
    // Una transaccion: archivar la anterior y escribir la nueva son un solo paso.
    const cliente = await pg.connect();
    try {
      await cliente.query('BEGIN');
      const r = await cliente.query('SELECT datos, actualizado FROM respaldo WHERE id = $1 FOR UPDATE', [id]);
      const previa = r.rows[0];
      if (previa) {
        const actual = resumenDe(previa.datos);
        const rechazo = forzar ? null : evaluarSubida(actual, nueva);
        if (rechazo) throw rechazo;
        await cliente.query(
          'INSERT INTO respaldo_versiones (id, datos, actualizado, sesiones) VALUES ($1, $2, $3, $4)',
          [id, previa.datos, previa.actualizado, actual.sesiones]
        );
        await cliente.query(
          `DELETE FROM respaldo_versiones WHERE id = $1 AND n NOT IN
             (SELECT n FROM respaldo_versiones WHERE id = $1 ORDER BY n DESC LIMIT $2)`,
          [id, VERSIONES_MAX]
        );
      }
      await cliente.query(
        `INSERT INTO respaldo (id, datos, actualizado) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET datos = $2, actualizado = $3`,
        [id, datos, actualizado]
      );
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
    return { actualizado, resumen: nueva };
  }
  if (modo === 'efimero') {
    // No se traga el fallo: quien llama tiene que poder decirlo en pantalla.
    throw new Error('sin almacenamiento persistente');
  }
  const previa = await leer(id);
  if (previa) {
    const rechazo = forzar ? null : evaluarSubida(resumenDe(previa.datos), nueva);
    if (rechazo) throw rechazo;
    // Id estrictamente creciente: dos subidas en el mismo milisegundo daban el
    // mismo nombre y una version pisaba a la otra.
    const existentes = await nombresDeVersiones();
    const mayor = existentes.reduce((m, f) => Math.max(m, Number(f.match(/\d+/)[0])), 0);
    await escribirAtomico(join(DIR, `gymmate.v${Math.max(Date.now(), mayor + 1)}.json`), JSON.stringify(previa));
    const versiones = (await nombresDeVersiones()).sort();
    for (const viejo of versiones.slice(0, Math.max(0, versiones.length - VERSIONES_MAX))) {
      await unlink(join(DIR, viejo)).catch(() => {});
    }
  }
  await escribirAtomico(FICHERO, JSON.stringify({ datos, actualizado }));
  return { actualizado, resumen: nueva };
}

async function nombresDeVersiones() {
  try {
    return (await readdir(DIR)).filter((f) => /^gymmate\.v\d+\.json$/.test(f));
  } catch {
    return [];
  }
}

/** Las copias anteriores, la mas reciente primero: { id, actualizado, sesiones }. */
export async function listarVersiones(id = 'yo') {
  if (pg) {
    const r = await pg.query(
      'SELECT n, actualizado, sesiones FROM respaldo_versiones WHERE id = $1 ORDER BY n DESC',
      [id]
    );
    return r.rows.map((x) => ({ id: String(x.n), actualizado: x.actualizado, sesiones: x.sesiones }));
  }
  if (modo === 'efimero') return [];
  const salida = [];
  for (const f of (await nombresDeVersiones()).sort().reverse()) {
    try {
      const v = JSON.parse(await readFile(join(DIR, f), 'utf8'));
      salida.push({ id: f.match(/\d+/)[0], actualizado: v.actualizado, sesiones: resumenDe(v.datos).sesiones });
    } catch {
      // Una version ilegible no impide listar las demas.
    }
  }
  return salida;
}

export async function leerVersion(versionId, id = 'yo') {
  if (!/^\d+$/.test(String(versionId))) return null;
  if (pg) {
    const r = await pg.query('SELECT datos, actualizado FROM respaldo_versiones WHERE id = $1 AND n = $2', [id, versionId]);
    return r.rows[0] ? { datos: r.rows[0].datos, actualizado: r.rows[0].actualizado } : null;
  }
  if (modo === 'efimero') return null;
  try {
    return JSON.parse(await readFile(join(DIR, `gymmate.v${versionId}.json`), 'utf8'));
  } catch {
    return null;
  }
}
