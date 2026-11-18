import { describe, it, expect, beforeEach } from 'vitest';
import { loadTrainingGroup, updateEjercicio } from '@/features/workout';
import { resetSession } from '@/state/session';

beforeEach(() => {
  localStorage.clear();
  resetSession();
  document.body.innerHTML = '<div id="fierroWorkout"></div><div id="fierroCoachSesion"></div>';
});

/**
 * Escribir el peso de un ejercicio por primera vez creaba la fila de "volumen
 * por musculo" y eso repintaba la sesion ENTERA: los campos se reemplazaban, el
 * foco caia al body y el siguiente toque en otro campo no escribia nada.
 */
describe('teclear no reemplaza los campos (el foco no se pierde)', () => {
  it('al aparecer la primera fila de volumen por musculo, los inputs siguen siendo los mismos nodos', async () => {
    await loadTrainingGroup('grupo1');
    const antes = [...document.querySelectorAll('input[data-sesion="valor"]')];
    expect(antes.length).toBeGreaterThan(3);

    (document.getElementById('sets-0') as HTMLInputElement).value = '4';
    (document.getElementById('reps-0') as HTMLInputElement).value = '10';
    (document.getElementById('peso-0') as HTMLInputElement).value = '57.5';
    updateEjercicio(0);

    const despues = [...document.querySelectorAll('input[data-sesion="valor"]')];
    expect(despues.length).toBe(antes.length);
    despues.forEach((n, i) => expect(n).toBe(antes[i]));
    // y la fila de volumen SI aparecio
    expect(document.querySelectorAll('.f-volumen__fila').length).toBe(1);
  });

  it('el foco sigue en el campo que lo tenia', async () => {
    await loadTrainingGroup('grupo1');
    const sets = document.getElementById('sets-1') as HTMLInputElement;
    sets.focus();
    (document.getElementById('sets-0') as HTMLInputElement).value = '4';
    (document.getElementById('reps-0') as HTMLInputElement).value = '10';
    (document.getElementById('peso-0') as HTMLInputElement).value = '50';
    updateEjercicio(0);
    expect(document.activeElement).toBe(sets);
  });
});
