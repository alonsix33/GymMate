import { describe, it, expect, beforeEach, vi } from 'vitest';
import { subirCopia } from '@/features/backend';

/**
 * 1.4 (cliente) · "Subir copia" entiende el rechazo del servidor.
 *
 * El servidor responde 409 cuando la copia que sube este telefono tiene mucho
 * menos que la guardada. La app tiene que decir con numeros por que, y solo
 * subir igual (`?forzar=1`) si el usuario lo confirma.
 */
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('gymmate_backend_token', 'tok');
  vi.restoreAllMocks();
});

function responde(status: number, cuerpo: unknown = {}) {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }));
  vi.stubGlobal('fetch', f);
  return f;
}

describe('subirCopia', () => {
  it('sin token no intenta nada', async () => {
    localStorage.clear();
    expect(await subirCopia()).toMatchObject({ ok: false, error: 'sin backend configurado' });
  });
  it('una subida normal va a /api/datos SIN forzar', async () => {
    const f = responde(200, { ok: true });
    expect(await subirCopia()).toEqual({ ok: true });
    expect(f.mock.calls[0][0]).toBe('/api/datos');
    expect(f.mock.calls[0][1]).toMatchObject({ method: 'PUT' });
  });
  it('con forzar pide ?forzar=1', async () => {
    const f = responde(200, { ok: true });
    await subirCopia({ forzar: true });
    expect(f.mock.calls[0][0]).toBe('/api/datos?forzar=1');
  });
  it('un 409 devuelve cuantas sesiones hay de cada lado, sin dar la subida por buena', async () => {
    responde(409, { error: 'no se sube', actual: { sesiones: 92 }, nueva: { sesiones: 0 } });
    const r = await subirCopia();
    expect(r.ok).toBe(false);
    expect(r.rechazada).toEqual({ guardada: 92, esta: 0 });
  });
  it('un 409 sin detalle no revienta', async () => {
    responde(409, {});
    expect((await subirCopia()).rechazada).toEqual({ guardada: 0, esta: 0 });
  });
  it('401, 413 y otros errores se explican', async () => {
    responde(401);
    expect((await subirCopia()).error).toMatch(/token/i);
    responde(413);
    expect((await subirCopia()).error).toMatch(/8 MB/);
    responde(500, { error: 'se cayo' });
    expect((await subirCopia()).error).toBe('se cayo');
  });
  it('un fallo de red no revienta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));
    expect(await subirCopia()).toEqual({ ok: false, error: 'sin red' });
  });
});
