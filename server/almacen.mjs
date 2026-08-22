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
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

export async function guardar(datos, id = 'yo') {
  const actualizado = new Date().toISOString();
  if (pg) {
    await pg.query(
      `INSERT INTO respaldo (id, datos, actualizado) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET datos = $2, actualizado = $3`,
      [id, datos, actualizado]
    );
    return { actualizado };
  }
  if (modo === 'efimero') {
    // No se traga el fallo: quien llama tiene que poder decirlo en pantalla.
    throw new Error('sin almacenamiento persistente');
  }
  await writeFile(FICHERO, JSON.stringify({ datos, actualizado }));
  return { actualizado };
}
