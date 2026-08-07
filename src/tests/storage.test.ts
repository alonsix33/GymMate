import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setSessionGroup,
  setSessionExercises,
  saveCurrentSession,
  saveDraftNow,
  resetSession,
} from '../state/session';
import { saveWorkout, finishWorkout, selectRPE, confirmRPE, skipRPE } from '../features/workout';
import { getDraft, getHistory } from '../utils/storage';
import type { ExerciseData, MuscleGroup } from '../types';

// ==========================================
// HELPERS
// ==========================================

function seedSession(): void {
  const ejercicios: ExerciseData[] = [
    {
      nombre: 'Press Banca',
      sets: 3,
      reps: 10,
      peso: 50,
      esMancuerna: false,
      grupoMuscular: 'Pecho' as MuscleGroup,
      volumen: 1500,
      completado: true,
    },
  ];
  setSessionGroup('Pecho');
  setSessionExercises(ejercicios);
}

/** Simula QuotaExceededError en cualquier escritura a localStorage */
function mockStorageFull() {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  });
}

beforeEach(() => {
  localStorage.clear();
  resetSession();
  document.body.innerHTML = `
    <p id="saveMessage" class="hidden text-status-success"></p>
    <div id="rpeModal"></div>
    <button id="confirmRPEBtn"></button>
    <div id="rpeValue"></div>
    <div id="rpeLabel"></div>
  `;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==========================================
// CORE-01 — saveCurrentSession() a bajo nivel
// ==========================================

describe('saveCurrentSession (CORE-01)', () => {
  it('devuelve "new" y persiste cuando localStorage funciona', () => {
    seedSession();
    const result = saveCurrentSession();
    expect(result).toBe('new');
    expect(getHistory().length).toBe(1);
  });

  it('devuelve "failed" y no persiste nada cuando localStorage.setItem lanza QuotaExceededError', () => {
    seedSession();
    const spy = mockStorageFull();

    const result = saveCurrentSession();

    expect(result).toBe('failed');
    spy.mockRestore();
    expect(getHistory().length).toBe(0);
  });

  it('no borra el draft existente cuando el guardado falla', () => {
    seedSession();
    saveDraftNow();
    expect(getDraft()).not.toBeNull();

    const spy = mockStorageFull();
    const result = saveCurrentSession();
    spy.mockRestore();

    expect(result).toBe('failed');
    expect(getDraft()).not.toBeNull();
  });
});

// ==========================================
// CORE-01 — saveWorkout() (UI)
// ==========================================

describe('saveWorkout (CORE-01)', () => {
  it('muestra un mensaje de éxito cuando el guardado funciona', () => {
    seedSession();
    saveWorkout();

    const msg = document.getElementById('saveMessage')!;
    expect(msg.classList.contains('hidden')).toBe(false);
    expect(msg.classList.contains('text-status-success')).toBe(true);
    expect(msg.textContent).toContain('guardado correctamente');
  });

  it('muestra un error explícito (no un falso éxito) cuando el guardado falla', () => {
    seedSession();
    saveDraftNow();

    const spy = mockStorageFull();
    saveWorkout();
    spy.mockRestore();

    const msg = document.getElementById('saveMessage')!;
    expect(msg.classList.contains('hidden')).toBe(false);
    expect(msg.classList.contains('text-status-error')).toBe(true);
    expect(msg.classList.contains('text-status-success')).toBe(false);
    expect(msg.textContent).toContain('No se pudo guardar');

    // El draft sigue disponible: el usuario no perdió sus datos
    expect(getDraft()).not.toBeNull();
    expect(getHistory().length).toBe(0);
  });
});

// ==========================================
// CORE-01 — confirmRPE()/skipRPE() (segundo punto de pérdida de datos)
// ==========================================

describe('confirmRPE / skipRPE (CORE-01) — no terminan la sesión si el guardado falla', () => {
  it('confirmRPE: aborta, avisa, y conserva el draft cuando el guardado falla', async () => {
    seedSession();
    saveDraftNow();

    finishWorkout(); // hasUnsavedData() true + confirm() mockeado true → pendingSaveBeforeRPE = true
    selectRPE(7);

    const spy = mockStorageFull();
    await confirmRPE();
    spy.mockRestore();

    expect(window.alert).toHaveBeenCalled();
    // El draft no se borró (endSession() no se llegó a ejecutar)
    expect(getDraft()).not.toBeNull();
    expect(getHistory().length).toBe(0);
  });

  it('skipRPE: aborta, avisa, y conserva el draft cuando el guardado falla', async () => {
    seedSession();
    saveDraftNow();

    finishWorkout();

    const spy = mockStorageFull();
    await skipRPE();
    spy.mockRestore();

    expect(window.alert).toHaveBeenCalled();
    expect(getDraft()).not.toBeNull();
    expect(getHistory().length).toBe(0);
  });
});
