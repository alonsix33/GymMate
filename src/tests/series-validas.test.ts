import { describe, it, expect, beforeEach } from 'vitest';
import { saveHistory, savePRs } from '@/utils/storage';
import { calculate1RM, calculateVolumenPorGrupo, calculateProgressive } from '@/utils/calculations';
import { calculateSessionVolume } from '@/features/gamification/xp';
import { ejerciciosDelHistorial } from '@/ui/hueso';
import { countUniqueExercises } from '@/features/gamification/achievements';
import { seriesValidas, esSerieValida } from '@/utils/series';
import type { HistorySession } from '@/types';

/**
 * "Marcar como no hecho" solo lo respetaban el coach y las zonas: las
 * calculadoras, los graficos, el historial y la XP seguian contando la serie.
 * Un unico criterio (`seriesValidas`) para todos.
 */
function ej(nombre: string, peso: number, extra: Record<string, unknown> = {}) {
  return { nombre, sets: 4, reps: 10, peso, volumen: 4 * 10 * peso, completado: true, esMancuerna: false, grupoMuscular: 'Piernas', ...extra };
}
function ses(fecha: string, ejercicios: ReturnType<typeof ej>[]): HistorySession {
  return {
    sessionId: `s_${fecha}`, date: fecha, savedAt: `${fecha}T19:00:00-05:00`, grupo: 'G1', type: 'weights',
    volumenTotal: 0, volumenPorGrupo: {}, ejercicios,
  } as unknown as HistorySession;
}

const FIJO = [
  ses('2026-11-10', [ej('Hip Thrust', 450, { excluido: true, motivoExclusion: 'outlier' })]),
  ses('2026-11-05', [ej('Hip Thrust', 100), ej('Fantasma', 50, { excluido: true, motivoExclusion: 'no_hecho' })]),
];

beforeEach(() => {
  localStorage.clear();
  saveHistory(FIJO);
});

describe('seriesValidas', () => {
  it('quita las excluidas y las de volumen 0', () => {
    const l = [ej('A', 10), ej('B', 20, { excluido: true }), ej('C', 0)];
    expect(seriesValidas(l).map((e) => e.nombre)).toEqual(['A']);
    expect(esSerieValida(l[1])).toBe(false);
  });
});

describe('las excluidas no cuentan en ningun calculo', () => {
  it('1RM parte del peso real, no del 450 excluido', () => {
    const r = calculate1RM('Hip Thrust');
    expect(r?.bestPerformance.peso).toBe(100);
  });
  it('un ejercicio solo con series excluidas no tiene 1RM', () => {
    expect(calculate1RM('Fantasma')).toBeNull();
  });
  it('peso progresivo usa el mejor peso valido', () => {
    savePRs({});
    const r = calculateProgressive('Hip Thrust');
    expect(r?.current).toBe(100);
    expect(calculateProgressive('Fantasma')).toBeNull();
  });
  it('volumen por grupo salta lo excluido', () => {
    const v = calculateVolumenPorGrupo([ej('A', 10), ej('B', 500, { excluido: true })] as never);
    expect(v.Piernas).toBe(400);
  });
  it('el volumen de sesion salta lo excluido', () => {
    expect(calculateSessionVolume([ej('A', 10), ej('B', 500, { excluido: true })] as never)).toBe(400);
  });
  it('los ejercicios del historial no incluyen los que solo tienen series excluidas', () => {
    expect(ejerciciosDelHistorial(FIJO)).toEqual(['Hip Thrust']);
  });
  it('ejercicios unicos (logros) no cuentan el no hecho', () => {
    expect(countUniqueExercises(FIJO)).toBe(1);
  });
});
