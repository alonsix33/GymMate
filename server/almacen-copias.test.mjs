/**
 * 1.4 · La copia del servidor ya no es un solo slot que se sobrescribe a ciegas.
 *
 * Antes: un telefono con el almacenamiento vacio (reinstalacion, Safari que
 * limpia el sitio) que pulsara "Subir copia" destruia la UNICA copia buena.
 * Ahora cada subida archiva la anterior, y una copia con mucho menos contenido
 * que la guardada se RECHAZA (409) salvo que se fuerce.
 *
 * Corre en modo fichero siempre y contra un Postgres REAL cuando hay
 * `PG_TEST_URL` (el CI lo levanta; en local, un Postgres cualquiera).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sesiones = (n, prefijo = 's') => Array.from({ length: n }, (_, i) => ({ sessionId: `${prefijo}${i}` }));
const copia = (n, prefijo) => ({ gymmate_history: sesiones(n, prefijo), gymmate_prs: { Prensa: { peso: 180 } } });

async function cargar(env) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import('./almacen.mjs');
}

const modos = [
  {
    nombre: 'fichero',
    activo: true,
    async preparar(extra = {}) {
      const dir = await mkdtemp(join(tmpdir(), 'gymmate-'));
      const a = await cargar({ DATABASE_URL: undefined, DATOS_DIR: dir, ...extra });
      expect(await a.iniciarAlmacen()).toBe('fichero');
      return { a, limpiar: () => rm(dir, { recursive: true, force: true }), dir };
    },
  },
  {
    nombre: 'postgres REAL',
    activo: !!process.env.PG_TEST_URL,
    async preparar(extra = {}) {
      const { default: Pg } = await import('pg');
      const admin = new Pg.Pool({ connectionString: process.env.PG_TEST_URL });
      await admin.query('DROP TABLE IF EXISTS respaldo_versiones');
      await admin.query('DROP TABLE IF EXISTS respaldo');
      await admin.end();
      const a = await cargar({ DATABASE_URL: process.env.PG_TEST_URL, ...extra });
      expect(await a.iniciarAlmacen()).toBe('postgres');
      return { a, limpiar: async () => {} };
    },
  },
];

for (const modo of modos) {
  (modo.activo ? describe : describe.skip)(`copia del servidor · ${modo.nombre}`, () => {
    let ctx;
    beforeEach(async () => {
      ctx = await modo.preparar();
    });
    afterEach(async () => {
      await ctx.limpiar();
    });

    it('la primera copia se guarda y no hay versiones anteriores', async () => {
      await ctx.a.guardar(copia(10, 'a'));
      expect((await ctx.a.leer()).datos.gymmate_history).toHaveLength(10);
      expect(await ctx.a.listarVersiones()).toEqual([]);
    });

    it('cada subida ARCHIVA la anterior, y se puede recuperar entera', async () => {
      await ctx.a.guardar(copia(10, 'a'));
      await ctx.a.guardar(copia(12, 'b'));
      const v = await ctx.a.listarVersiones();
      expect(v).toHaveLength(1);
      expect(v[0].sesiones).toBe(10);
      const vieja = await ctx.a.leerVersion(v[0].id);
      expect(vieja.datos.gymmate_history[0].sessionId).toBe('a0');
      expect((await ctx.a.leer()).datos.gymmate_history[0].sessionId).toBe('b0');
    });

    it('un telefono VACIO que sube no destruye la copia buena (409)', async () => {
      await ctx.a.guardar(copia(40, 'a'));
      await expect(ctx.a.guardar({})).rejects.toMatchObject({ codigo: 409, detalle: { codigo: 'copia_menor', actual: { sesiones: 40 }, nueva: { sesiones: 0 } } });
      expect((await ctx.a.leer()).datos.gymmate_history).toHaveLength(40);
      expect(await ctx.a.listarVersiones()).toEqual([]); // el rechazo no archiva nada
    });

    it('el limite es la mitad: 50 % pasa, por debajo se rechaza', async () => {
      await ctx.a.guardar(copia(10, 'a'));
      await ctx.a.guardar(copia(5, 'b')); // justo la mitad: pasa
      await ctx.a.guardar(copia(10, 'c'));
      await expect(ctx.a.guardar(copia(4, 'd'))).rejects.toMatchObject({ codigo: 409 });
    });

    it('una cuenta pequeña no se protege (menos de 5 sesiones)', async () => {
      await ctx.a.guardar(copia(3, 'a'));
      await ctx.a.guardar({});
      expect((await ctx.a.leer()).datos).toEqual({});
    });

    it('con forzar SI se sube, y la buena queda archivada', async () => {
      await ctx.a.guardar(copia(40, 'a'));
      await ctx.a.guardar(copia(2, 'b'), 'yo', { forzar: true });
      expect((await ctx.a.leer()).datos.gymmate_history).toHaveLength(2);
      const v = await ctx.a.listarVersiones();
      expect(v[0].sesiones).toBe(40);
      expect((await ctx.a.leerVersion(v[0].id)).datos.gymmate_history).toHaveLength(40);
    });

    it('la version mas reciente va primero', async () => {
      await ctx.a.guardar(copia(10, 'a'));
      await ctx.a.guardar(copia(11, 'b'));
      await ctx.a.guardar(copia(12, 'c'));
      expect((await ctx.a.listarVersiones()).map((x) => x.sesiones)).toEqual([11, 10]);
    });

    it('un id de version raro no lee nada (ni sale del directorio)', async () => {
      expect(await ctx.a.leerVersion('../../etc/passwd')).toBeNull();
      expect(await ctx.a.leerVersion('abc')).toBeNull();
      expect(await ctx.a.leerVersion('999999')).toBeNull();
    });
  });

  (modo.activo ? describe : describe.skip)(`copia del servidor · ${modo.nombre} · poda`, () => {
    it('conserva solo las ultimas VERSIONES_COPIA y la mas reciente sobrevive', async () => {
      const ctx = await modo.preparar({ VERSIONES_COPIA: '3' });
      try {
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 3)); // nombres de version distintos
          await ctx.a.guardar(copia(10 + i, `v${i}`));
        }
        const v = await ctx.a.listarVersiones();
        expect(v).toHaveLength(3);
        expect(v.map((x) => x.sesiones)).toEqual([16, 15, 14]);
      } finally {
        await ctx.limpiar();
      }
    });
  });
}

describe('copia del servidor · modo fichero · escritura atomica', () => {
  it('no deja ficheros temporales a medias', async () => {
    const ctx = await modos[0].preparar();
    try {
      for (let i = 0; i < 4; i++) await ctx.a.guardar(copia(10 + i, 'x'));
      const ficheros = await readdir(ctx.dir);
      expect(ficheros.filter((f) => f.endsWith('.tmp'))).toEqual([]);
      expect(ficheros).toContain('gymmate.json');
    } finally {
      await ctx.limpiar();
    }
  });
});

describe('resumenDe', () => {
  it('cuenta sesiones y records, y no revienta con formas raras', async () => {
    const a = await cargar({ DATABASE_URL: undefined, DATOS_DIR: tmpdir() });
    expect(a.resumenDe({ gymmate_history: [1, 2, 3], gymmate_prs: { A: 1, B: 2 } })).toEqual({ sesiones: 3, records: 2 });
    expect(a.resumenDe({})).toEqual({ sesiones: 0, records: 0 });
    expect(a.resumenDe(null)).toEqual({ sesiones: 0, records: 0 });
    expect(a.resumenDe({ gymmate_history: 'x', gymmate_prs: [] })).toEqual({ sesiones: 0, records: 0 });
  });
});
