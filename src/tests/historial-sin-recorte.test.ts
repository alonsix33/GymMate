import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addToHistory, saveHistory, getHistory, avisoDeHistorialGrande } from '@/utils/storage';
import { AVISAR_HISTORIAL_EN } from '@/constants';
import type { HistorySession } from '@/types';

/**
 * 1.3 · El historial NO se recorta en silencio.
 *
 * Antes `saveHistory` tiraba todo lo que pasara de 200 sesiones (~10 meses) sin
 * decir nada, y ademas MUTABA el arreglo del llamador.
 */
const ses = (i: number): HistorySession =>
  ({ sessionId: `s${i}`, date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, savedAt: new Date(2026, 0, 1, 12, 0, i).toISOString(), grupo: `G${i}`, type: 'weights', volumenTotal: 1, volumenPorGrupo: {}, ejercicios: [] }) as unknown as HistorySession;
const muchas = (n: number) => Array.from({ length: n }, (_, i) => ses(i));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sin recorte', () => {
  it('guarda 250 sesiones: ninguna se pierde', () => {
    expect(saveHistory(muchas(250))).toBe(true);
    expect(getHistory()).toHaveLength(250);
  });
  it('no muta el arreglo que le pasan', () => {
    const h = muchas(250);
    saveHistory(h);
    expect(h).toHaveLength(250);
  });
  it('la sesion numero 201 NO empuja fuera a la mas vieja', () => {
    saveHistory(muchas(200));
    addToHistory({ ...ses(999), grupo: 'Nueva', date: '2026-02-01', savedAt: '2026-02-01T12:00:00.000Z' });
    const h = getHistory();
    expect(h).toHaveLength(201);
    expect(h.map((s) => s.sessionId)).toContain('s0');
  });
});

describe('el aviso de historial grande', () => {
  it('no avisa por debajo del umbral', () => {
    saveHistory(muchas(AVISAR_HISTORIAL_EN - 1));
    expect(avisoDeHistorialGrande('2026-11-18')).toBeNull();
  });
  it('avisa con el numero de sesiones, y UNA vez al dia', () => {
    saveHistory(muchas(AVISAR_HISTORIAL_EN));
    expect(avisoDeHistorialGrande('2026-11-18')).toBe(AVISAR_HISTORIAL_EN);
    expect(avisoDeHistorialGrande('2026-11-18')).toBeNull();
    expect(avisoDeHistorialGrande('2026-11-19')).toBe(AVISAR_HISTORIAL_EN);
  });
});
