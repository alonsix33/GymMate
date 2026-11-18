import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { loadGamificationState } from '@/features/gamification/state';
import { registrarError, erroresRecientes, textoDeErrores, instalarRegistroDeErrores } from '@/utils/errores';

beforeEach(() => localStorage.clear());

describe('la gamificacion usa el mismo lector que el resto (con rescate)', () => {
  it('un estado dañado se copia a __corrupto antes de descartarse', () => {
    localStorage.setItem('gymmate_gamification', '{"roto":');
    loadGamificationState();
    const copias = Object.keys(localStorage).filter((k) => k.startsWith('gymmate_gamification__corrupto_'));
    expect(copias.length).toBe(1);
  });
});

describe('una sola version', () => {
  it('vite.config.ts la lee de package.json (ya no hay 3.1.0 en uno y 3.2.0 en otro)', () => {
    const vite = readFileSync('vite.config.ts', 'utf8');
    expect(vite).not.toMatch(/const APP_VERSION = '\d/);
    expect(vite).toMatch(/package\.json/);
  });
});

describe('registro de errores', () => {
  it('guarda los ultimos 20, con fecha y mensaje, sin reventar', () => {
    for (let i = 0; i < 25; i++) registrarError(new Error(`fallo ${i}`), 'prueba');
    const l = erroresRecientes();
    expect(l).toHaveLength(20);
    expect(l[19].mensaje).toContain('fallo 24');
    expect(l[0].mensaje).toContain('fallo 5');
    expect(typeof l[0].fecha).toBe('string');
  });
  it('trunca mensajes enormes', () => {
    registrarError(new Error('x'.repeat(5000)), 'prueba');
    expect(erroresRecientes()[0].mensaje.length).toBeLessThanOrEqual(400);
  });
  it('un valor que no es Error tambien se registra', () => {
    registrarError('texto suelto', 'prueba');
    registrarError({ a: 1 }, 'prueba');
    expect(erroresRecientes()).toHaveLength(2);
  });
  it('los eventos globales error y unhandledrejection llegan al registro', () => {
    instalarRegistroDeErrores();
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: new Error('boom') }));
    const rechazo = new Event('unhandledrejection') as Event & { reason?: unknown };
    rechazo.reason = new Error('promesa rota');
    window.dispatchEvent(rechazo);
    const t = textoDeErrores();
    expect(t).toContain('boom');
    expect(t).toContain('promesa rota');
  });
});
