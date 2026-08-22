/**
 * Donde vive la copia de tus datos en el servidor.
 *
 * Dos modos, y el servidor elige solo:
 *
 *   1. Postgres, si Railway inyecta `DATABASE_URL`. Es lo que pasa en cuanto
 *      añades el plugin de Postgres al proyecto: cero configuracion tuya.
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

export async function iniciarAlmacen() {
  if (process.env.DATABASE_URL) {
    const { default: Pg } = await import('pg');
    pg = new Pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    });
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
