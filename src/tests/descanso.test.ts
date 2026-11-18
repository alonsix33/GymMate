import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeTimer, pauseTimer, stopTimer, descansoRestante, iniciarDescansoAutomatico, ultimoDescanso } from '@/features/timer';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T20:00:00-05:00'));
  document.body.innerHTML = '<div id="fierroDescanso"></div>';
});
afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

describe('el descanso va por RELOJ DE PARED, no por cuenta de ticks', () => {
  it('cuenta atras normal', () => {
    initializeTimer(60);
    vi.advanceTimersByTime(10_000);
    expect(descansoRestante()).toBe(50);
  });

  it('con la pantalla bloqueada (sin ticks) al volver el tiempo ya paso', () => {
    initializeTimer(60);
    // iOS congela los timers: el reloj avanza 45 s sin ningun tick.
    vi.setSystemTime(Date.now() + 45_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(descansoRestante()).toBe(15);
  });

  it('si ya acabo mientras estaba bloqueada, termina al volver', () => {
    initializeTimer(30);
    vi.setSystemTime(Date.now() + 120_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(descansoRestante()).toBe(0);
  });

  it('pausar congela lo que falta y reanudar sigue desde ahi', () => {
    initializeTimer(60);
    vi.advanceTimersByTime(20_000);
    pauseTimer();
    vi.advanceTimersByTime(30_000); // pausado: no cuenta
    expect(descansoRestante()).toBe(40);
    pauseTimer();
    vi.advanceTimersByTime(10_000);
    expect(descansoRestante()).toBe(30);
  });
});

describe('descanso automatico al marcar el check', () => {
  it('arranca con el ultimo tiempo que elegiste', () => {
    initializeTimer(120);
    stopTimer();
    expect(ultimoDescanso()).toBe(120);
    iniciarDescansoAutomatico();
    expect(descansoRestante()).toBe(120);
  });
  it('sin eleccion previa son 90 s', () => {
    expect(ultimoDescanso()).toBe(90);
    iniciarDescansoAutomatico();
    expect(descansoRestante()).toBe(90);
  });
});
