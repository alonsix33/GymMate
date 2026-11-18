import { describe, it, expect, beforeEach } from 'vitest';
import { loadTrainingGroup } from '@/features/workout';
import { updateExercise, toggleExerciseCompleted, resetSession } from '@/state/session';
import { renderSesion } from '@/ui/workout-view';
import { saveHistory } from '@/utils/storage';
import { mostrarGuiaEjercicio } from '@/ui/session-screens';
import type { HistorySession } from '@/types';

beforeEach(() => {
  localStorage.clear();
  resetSession();
  document.body.innerHTML = '<div id="c"></div>';
});

describe('57.5 kg se ve como 57.5, no como 58', () => {
  it('la tarjeta de un ejercicio hecho', async () => {
    await loadTrainingGroup('grupo1');
    updateExercise(0, 4, 10, 57.5);
    toggleExerciseCompleted(0, true);
    const c = document.getElementById('c') as HTMLElement;
    renderSesion(c);
    expect(c.innerHTML).toContain('57.5 kg');
    expect(c.innerHTML).not.toMatch(/·\s*58 kg/);
  });

  it('"Última vez" de la tarjeta y de la guia', async () => {
    await loadTrainingGroup('grupo1');
    const nombre = (await import('@/state/session')).sessionData.ejercicios[0].nombre;
    const previa = {
      sessionId: 'p', date: '2026-11-05', savedAt: '2026-11-05T19:00:00-05:00', grupo: 'GRUPO 1 - Piernas + Glúteos', type: 'weights',
      volumenTotal: 2300, volumenPorGrupo: {},
      ejercicios: [{ nombre, sets: 4, reps: 10, peso: 57.5, volumen: 2300, completado: true, esMancuerna: false, grupoMuscular: 'Piernas' }],
    } as unknown as HistorySession;
    saveHistory([previa]);
    const c = document.getElementById('c') as HTMLElement;
    renderSesion(c);
    expect(c.innerHTML).toContain('4×10 · 57.5 kg');
    mostrarGuiaEjercicio(nombre);
    expect(document.body.innerHTML).toContain('4×10 · 57.5 kg');
  });
});
