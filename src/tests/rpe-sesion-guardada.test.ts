import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadTrainingGroup } from '@/features/workout';
import { saveCurrentSession, updateExercise, resetSession, registrarRPEDeSesionGuardada } from '@/state/session';
import { getHistory } from '@/utils/storage';

beforeEach(() => {
  localStorage.clear();
  resetSession();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('el RPE de sesion llega al historial aunque ya estuviera guardada', () => {
  it('guardar y luego elegir RPE al cerrar lo anota en esa misma sesion', async () => {
    await loadTrainingGroup('grupo1');
    updateExercise(0, 4, 10, 100);
    expect(saveCurrentSession()).toBe('new');
    expect(getHistory()[0].rpe).toBeUndefined();
    expect(registrarRPEDeSesionGuardada({ value: 8, label: 'Muy exigente' })).toBe(true);
    const h = getHistory();
    expect(h).toHaveLength(1);
    expect(h[0].rpe).toEqual({ value: 8, label: 'Muy exigente' });
  });
  it('sin sesion guardada no inventa nada', () => {
    expect(registrarRPEDeSesionGuardada({ value: 8, label: 'x' })).toBe(false);
    expect(getHistory()).toHaveLength(0);
  });
});
