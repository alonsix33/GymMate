import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadTrainingGroup } from '@/features/workout';
import { sessionData, saveCurrentSession, updateExercise, resetSession, sessionId } from '@/state/session';
import { getHistory } from '@/utils/storage';

/**
 * Guardar una rutina, volver al inicio SIN terminar y cargar otra: son dos
 * sesiones. `sessionId` se reutilizaba y la segunda sustituia a la primera.
 * Pasa por `loadTrainingGroup`, que es el camino real de la app.
 */
beforeEach(() => {
  localStorage.clear();
  resetSession();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function registrarYGuardar(grupoId: string, indice: number, peso: number) {
  expect(await loadTrainingGroup(grupoId)).toBe(true);
  updateExercise(indice, 4, 10, peso);
  saveCurrentSession();
}

describe('una rutina nueva es una sesion nueva', () => {
  it('guardar la rutina A y luego la B deja DOS sesiones', async () => {
    await registrarYGuardar('grupo1', 0, 180);
    const idA = sessionId;
    await registrarYGuardar('grupo4', 0, 55);
    expect(sessionId).not.toBe(idA);
    const h = getHistory();
    expect(h).toHaveLength(2);
    expect(h.map((s) => s.grupo).sort()).toEqual([
      'GRUPO 1 - Piernas + Glúteos',
      'GRUPO 4 - Espalda + Bíceps',
    ]);
  });

  it('la rutina B no hereda los ejercicios de la A', async () => {
    await registrarYGuardar('grupo1', 0, 180);
    expect(await loadTrainingGroup('grupo4')).toBe(true);
    expect(sessionData.grupo).toBe('GRUPO 4 - Espalda + Bíceps');
    expect(sessionData.ejercicios.every((e) => e.volumen === 0)).toBe(true);
  });

  it('seguir editando la MISMA rutina sigue actualizando, no duplicando', async () => {
    await registrarYGuardar('grupo1', 0, 180);
    updateExercise(0, 4, 10, 185);
    saveCurrentSession();
    const h = getHistory();
    expect(h).toHaveLength(1);
    expect(h[0].ejercicios.find((e) => e.nombre.startsWith('Prensa'))?.peso).toBe(185);
  });
});
