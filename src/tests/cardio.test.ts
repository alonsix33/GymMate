import { describe, it, expect, beforeEach, vi } from 'vitest';
import { stopCardioWorkout, incrementAmrapRound, selectCardioMode } from '../features/cardio';
import { cardioState, resetCardioState } from '../state/session';
import { getHistory } from '../utils/storage';

beforeEach(() => {
  localStorage.clear();
  resetCardioState();
  document.body.innerHTML = `
    <div id="cardioSelectorView"></div>
    <div id="cardioConfigView"></div>
    <div id="cardioTimerView"></div>
    <div id="cardioSummaryView" class="hidden"></div>
  `;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

// ==========================================
// CARDIO-01 — sessionId único por sesión de cardio
// ==========================================

describe('finishCardioWorkout / stopCardioWorkout (CARDIO-01)', () => {
  it('genera sessionId distintos para sesiones de cardio consecutivas y ambas persisten', () => {
    // Sesión 1
    cardioState.mode = 'tabata';
    cardioState.currentRound = 8;
    cardioState.totalTimeElapsed = 240;
    cardioState.workTimeTotal = 160;
    cardioState.restTimeTotal = 80;
    stopCardioWorkout();

    resetCardioState();

    // Sesión 2
    cardioState.mode = 'tabata';
    cardioState.currentRound = 8;
    cardioState.totalTimeElapsed = 240;
    cardioState.workTimeTotal = 160;
    cardioState.restTimeTotal = 80;
    stopCardioWorkout();

    const history = getHistory();
    expect(history.length).toBe(2);
    expect(history[0].sessionId).toBeDefined();
    expect(history[1].sessionId).toBeDefined();
    expect(history[0].sessionId).not.toBe(history[1].sessionId);
  });
});

// ==========================================
// CARDIO-02 — contador real de rondas AMRAP
// ==========================================

describe('finishCardioWorkout (CARDIO-02)', () => {
  it('guarda el conteo real de rondas de AMRAP, no un valor fijo', () => {
    cardioState.mode = 'amrap';
    cardioState.totalTimeElapsed = 600;
    cardioState.workTimeTotal = 600;
    cardioState.restTimeTotal = 0;
    cardioState.currentRound = 1; // nunca se incrementa en modo AMRAP

    incrementAmrapRound();
    incrementAmrapRound();
    incrementAmrapRound();
    incrementAmrapRound();
    incrementAmrapRound();

    stopCardioWorkout();

    const [session] = getHistory();
    expect(session.stats?.roundsCompleted).toBe(5);
  });

  it('modos distintos de AMRAP siguen usando cardioState.currentRound', () => {
    cardioState.mode = 'tabata';
    cardioState.currentRound = 8;
    cardioState.totalTimeElapsed = 240;
    cardioState.workTimeTotal = 160;
    cardioState.restTimeTotal = 80;

    stopCardioWorkout();

    const [session] = getHistory();
    expect(session.stats?.roundsCompleted).toBe(8);
  });
});

describe('selectCardioMode', () => {
  it('acepta cualquier modo válido sin lanzar', () => {
    document.body.innerHTML += '<div id="cardioConfigView"></div>';
    expect(() => selectCardioMode('emom')).not.toThrow();
    expect(cardioState.mode).toBe('emom');
  });
});
