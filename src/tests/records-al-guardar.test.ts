import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadTrainingGroup } from '@/features/workout';
import { saveCurrentSession, updateExercise, resetSession, sessionData } from '@/state/session';
import { getPR, getPRs, savePRs } from '@/utils/storage';

beforeEach(() => {
  localStorage.clear();
  resetSession();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('el record se fija al GUARDAR, no al teclear', () => {
  it('teclear un peso mayor no toca los records', async () => {
    await loadTrainingGroup('grupo1');
    const nombre = sessionData.ejercicios[0].nombre;
    updateExercise(0, 4, 10, 180);
    expect(getPR(nombre)).toBeNull();
  });

  it('un 450 tecleado por error y corregido a 45 no deja record', async () => {
    await loadTrainingGroup('grupo1');
    const nombre = sessionData.ejercicios[0].nombre;
    updateExercise(0, 4, 10, 4);
    updateExercise(0, 4, 10, 45);
    updateExercise(0, 4, 10, 450);
    updateExercise(0, 4, 10, 45);
    saveCurrentSession();
    expect(getPR(nombre)?.peso).toBe(45);
  });

  it('al guardar el record pasa a ser el mejor peso de la sesion', async () => {
    await loadTrainingGroup('grupo1');
    const nombre = sessionData.ejercicios[0].nombre;
    updateExercise(0, 4, 10, 180);
    expect(saveCurrentSession()).toBe('new');
    expect(getPR(nombre)?.peso).toBe(180);
  });

  it('un peso menor al record guardado no lo baja', async () => {
    await loadTrainingGroup('grupo1');
    const nombre = sessionData.ejercicios[0].nombre;
    savePRs({ [nombre]: { peso: 200, sets: 4, reps: 8, volumen: 6400, date: '2026-01-01' } });
    updateExercise(0, 4, 10, 180);
    saveCurrentSession();
    expect(getPR(nombre)?.peso).toBe(200);
  });

  it('un peso de mas de 3 veces el record no lo desplaza al guardar sin confirmar', async () => {
    await loadTrainingGroup('grupo1');
    const nombre = sessionData.ejercicios[0].nombre;
    savePRs({ [nombre]: { peso: 100, sets: 4, reps: 8, volumen: 3200, date: '2026-01-01' } });
    updateExercise(0, 4, 10, 450);
    saveCurrentSession();
    expect(getPRs()[nombre].peso).toBe(100);
  });

  it('una serie marcada como no hecha no fija record', async () => {
    await loadTrainingGroup('grupo1');
    const nombre = sessionData.ejercicios[0].nombre;
    updateExercise(0, 4, 10, 180);
    sessionData.ejercicios[0].excluido = true;
    saveCurrentSession();
    expect(getPR(nombre)).toBeNull();
  });
});
