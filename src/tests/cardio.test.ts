import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  stopCardioWorkout,
  incrementAmrapRound,
  selectCardioMode,
  adjustCardioConfig,
  pauseCardioTimerOnNavigation,
} from '../features/cardio';
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

  it('modos distintos de AMRAP usan cardioState.currentRound', () => {
    cardioState.mode = 'tabata';
    cardioState.currentRound = 8;
    cardioState.totalTimeElapsed = 240;
    cardioState.workTimeTotal = 160;
    cardioState.restTimeTotal = 80;

    stopCardioWorkout();

    const [session] = getHistory();
    // Detención manual (CARDIO-11): la ronda 8 estaba en curso, no completada
    expect(session.stats?.roundsCompleted).toBe(7);
  });
});

// ==========================================
// CARDIO-11 — no sobreestimar rondas al detener manualmente a mitad de ronda
// ==========================================

describe('finishCardioWorkout (CARDIO-11)', () => {
  it('resta la ronda en curso (no completada) al detener manualmente', () => {
    cardioState.mode = 'circuit';
    cardioState.currentRound = 3; // ronda 3 en curso, aún no completada
    cardioState.totalTimeElapsed = 90;
    cardioState.workTimeTotal = 60;
    cardioState.restTimeTotal = 30;

    stopCardioWorkout();

    const [session] = getHistory();
    expect(session.stats?.roundsCompleted).toBe(2);
  });

  it('nunca reporta rondas negativas si se detiene en la ronda 1', () => {
    cardioState.mode = 'tabata';
    cardioState.currentRound = 1;
    cardioState.totalTimeElapsed = 10;
    cardioState.workTimeTotal = 10;
    cardioState.restTimeTotal = 0;

    stopCardioWorkout();

    const [session] = getHistory();
    expect(session.stats?.roundsCompleted).toBe(0);
  });
});

describe('selectCardioMode', () => {
  it('acepta cualquier modo válido sin lanzar', () => {
    document.body.innerHTML += '<div id="cardioConfigView"></div>';
    expect(() => selectCardioMode('emom')).not.toThrow();
    expect(cardioState.mode).toBe('emom');
  });
});

// ==========================================
// CARDIO-06 — piso de configuración por campo (no un piso genérico de 5)
// ==========================================

describe('adjustCardioConfig (CARDIO-06)', () => {
  it('el piso de "rounds" es 1, no 5 (Circuito empieza en 3 rondas)', () => {
    cardioState.mode = 'circuit';
    cardioState.config = { rounds: 3, work: 40, rest: 20, roundRest: 60 };

    adjustCardioConfig('rounds', -1);
    expect(cardioState.config.rounds).toBe(2);

    adjustCardioConfig('rounds', -1);
    expect(cardioState.config.rounds).toBe(1);

    // No debe saltar a 5 al intentar bajar de 1
    adjustCardioConfig('rounds', -1);
    expect(cardioState.config.rounds).toBe(1);
  });

  it('el piso de "duration" (AMRAP) es 60s, nunca un valor que no sea múltiplo de 60 (CARDIO-07)', () => {
    cardioState.mode = 'amrap';
    cardioState.config = { duration: 120 };

    adjustCardioConfig('duration', -60);
    expect(cardioState.config.duration).toBe(60);

    // Sin el fix, esto habría caído a 5 (fracción de minuto en el display)
    adjustCardioConfig('duration', -60);
    expect(cardioState.config.duration).toBe(60);
    expect((cardioState.config.duration || 0) % 60).toBe(0);
  });

  it('otros campos (work/rest) conservan el piso genérico de 5 segundos', () => {
    cardioState.mode = 'tabata';
    cardioState.config = { rounds: 8, work: 20, rest: 10 };

    adjustCardioConfig('rest', -10);
    expect(cardioState.config.rest).toBe(5);
  });
});

// ==========================================
// CARDIO-04 — detener el timer al navegar fuera de la vista de cardio
// ==========================================

describe('pauseCardioTimerOnNavigation (CARDIO-04)', () => {
  it('no lanza cuando no hay ningún timer corriendo', () => {
    expect(() => pauseCardioTimerOnNavigation()).not.toThrow();
  });

  it('pausa el estado de cardio para que no siga corriendo en segundo plano', () => {
    cardioState.mode = 'tabata';
    cardioState.isPaused = false;

    pauseCardioTimerOnNavigation();

    expect(cardioState.isPaused).toBe(true);
  });
});
