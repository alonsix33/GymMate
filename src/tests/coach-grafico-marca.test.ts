import { describe, it, expect } from 'vitest';
import { parsearMarcaDeGrafico, quitarMarcaDeGrafico } from '@/features/coach-grafico';
import type { HistorySession } from '@/types';

function ses(fecha: string, nombre: string, peso: number, extra: Record<string, unknown> = {}): HistorySession {
  return {
    sessionId: `s_${fecha}`, date: fecha, savedAt: `${fecha}T19:00:00-05:00`, grupo: 'G', type: 'weights', volumenTotal: 1, volumenPorGrupo: {},
    ejercicios: [{ nombre, sets: 4, reps: 10, peso, volumen: 40 * peso, completado: true, esMancuerna: false, grupoMuscular: 'Espalda', ...extra }],
  } as unknown as HistorySession;
}
const H = [ses('2026-11-10', 'Jalón al Pecho', 55), ses('2026-11-05', 'Jalón al Pecho', 52.5), ses('2026-10-30', 'Remo en Máquina', 60)];

describe('marca [[grafico|tipo|ejercicio]] del modelo (la app valida y dibuja con sus datos)', () => {
  it('tipos sin ejercicio', () => {
    for (const tipo of ['semanas', 'volumen_semanal', 'sin_tocar', 'reparto', 'hoy_vs_ultima']) {
      const r = parsearMarcaDeGrafico(`Mira esto.\n[[grafico|${tipo}]]`, H);
      expect(r.grafico).toEqual({ tipo });
      expect(r.limpio).toBe('Mira esto.');
    }
  });
  it('peso y 1rm con un ejercicio que SI esta en el historial', () => {
    expect(parsearMarcaDeGrafico('x [[grafico|peso|Jalón al Pecho]]', H).grafico).toEqual({ tipo: 'peso', ejercicio: 'Jalón al Pecho' });
    expect(parsearMarcaDeGrafico('x [[grafico|1rm|Jalón al Pecho]]', H).grafico).toEqual({ tipo: '1rm', ejercicio: 'Jalón al Pecho' });
  });
  it('un ejercicio inventado no dibuja nada (el modelo no puede mandar un grafico de algo que no hay)', () => {
    expect(parsearMarcaDeGrafico('[[grafico|peso|Sentadilla Hack]]', H).grafico).toBeNull();
  });
  it('un ejercicio que solo tiene series excluidas tampoco', () => {
    const h = [ses('2026-11-10', 'Fantasma', 50, { excluido: true })];
    expect(parsearMarcaDeGrafico('[[grafico|peso|Fantasma]]', h).grafico).toBeNull();
  });
  it('peso sin ejercicio, o un tipo que no existe, no dibuja', () => {
    expect(parsearMarcaDeGrafico('[[grafico|peso]]', H).grafico).toBeNull();
    expect(parsearMarcaDeGrafico('[[grafico|tarta]]', H).grafico).toBeNull();
  });
  it('la marca se quita siempre del texto, valida o no', () => {
    expect(parsearMarcaDeGrafico('Hola [[grafico|tarta]]', H).limpio).toBe('Hola');
  });
  it('quitarMarcaDeGrafico oculta tambien una marca a medio escribir (streaming)', () => {
    expect(quitarMarcaDeGrafico('Mira.\n[[grafico|pe')).toBe('Mira.');
    expect(quitarMarcaDeGrafico('Mira.\n[[grafico|peso|Jalón al Pecho]]')).toBe('Mira.');
    expect(quitarMarcaDeGrafico('Sin marca')).toBe('Sin marca');
  });
  it('si hay mas de una, solo la primera valida', () => {
    const r = parsearMarcaDeGrafico('[[grafico|reparto]] y [[grafico|semanas]]', H);
    expect(r.grafico).toEqual({ tipo: 'reparto' });
  });
});
