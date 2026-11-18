import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadTrainingGroup, toggleCompletado, aplicarSugerido, pasoDePeso, sugeridoDe, ajustarCampo } from '@/features/workout';
import { sessionData, resetSession, guardarBorradorSiHayCambios, saveCurrentSession } from '@/state/session';
import { saveHistory, getDraft, getHistory } from '@/utils/storage';
import type { HistorySession } from '@/types';

/**
 * "Precargar la ultima vez": se VE atenuado en cada campo (placeholder) pero NO
 * es un dato hasta que el usuario lo acepta con ✓ o lo ajusta con +/−. Si fuera
 * dato, guardar sin tocar nada registraria ejercicios que no se hicieron (el
 * defecto de los "0x0@0" y del Abdominales fantasma).
 */
const ej = (n: string, s: number, r: number, p: number, mano = false) => ({
  nombre: n, sets: s, reps: r, peso: p, volumen: s * r * p, completado: true, esMancuerna: mano, grupoMuscular: 'Espalda',
});
const sesion = (id: string, fecha: string, e: ReturnType<typeof ej>[]): HistorySession =>
  ({ sessionId: id, date: fecha, savedAt: `${fecha}T17:00:00.000Z`, grupo: 'GRUPO 4 - Espalda + Bíceps', type: 'weights',
     volumenTotal: e.reduce((t, x) => t + x.volumen, 0), volumenPorGrupo: {}, ejercicios: e }) as unknown as HistorySession;

const campo = (c: string, i = 0) => document.getElementById(`${c}-${i}`) as HTMLInputElement;

beforeEach(async () => {
  localStorage.clear();
  document.body.innerHTML = '<div id="fierroWorkout"></div>';
  resetSession();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  saveHistory([
    sesion('a', '2026-11-12', [ej('Jalón al Pecho', 4, 10, 55), ej('Curl Martillo', 4, 10, 10, true)]),
  ]);
  expect(await loadTrainingGroup('grupo4')).toBe(true);
});

describe('la ultima vez se ve, pero no es un dato', () => {
  it('cada campo muestra lo de la ultima vez ATENUADO (placeholder) y vacio', () => {
    expect(campo('sets').placeholder).toBe('4');
    expect(campo('reps').placeholder).toBe('10');
    expect(campo('peso').placeholder).toBe('55');
    expect(campo('peso').value).toBe('');
  });
  it('la sesion NO tiene datos hasta que el usuario acepta: volumen 0', () => {
    expect(sessionData.ejercicios[0].volumen).toBe(0);
  });
  it('guardar sin tocar nada no registra ningun ejercicio', () => {
    saveCurrentSession();
    expect(getHistory().find((s) => s.sessionId !== 'a')?.ejercicios ?? []).toHaveLength(0);
  });
  it('un ejercicio que nunca se hizo no tiene sugerencia', () => {
    expect(sugeridoDe(2)).toBeNull(); // Remo Mancuerna, sin historial
    expect(campo('peso', 2)?.placeholder ?? '0').toBe('0');
  });
});

describe('un solo toque en ✓ repite lo de la ultima vez', () => {
  it('✓ con el ejercicio vacio = 4x10@55 completado', () => {
    toggleCompletado(0);
    const e = sessionData.ejercicios[0];
    expect([e.sets, e.reps, e.peso, e.completado]).toEqual([4, 10, 55, true]);
    expect(e.volumen).toBe(4 * 10 * 55);
  });
  it('✓ sobre un ejercicio SIN historial no lo marca como hecho', () => {
    toggleCompletado(2);
    expect(sessionData.ejercicios[2].completado).toBe(false);
  });
  it('no pisa lo que el usuario ya escribio', () => {
    campo('peso').value = '57.5';
    campo('peso').dispatchEvent(new Event('change', { bubbles: true }));
    campo('sets').value = '3';
    expect(aplicarSugerido(0)).toBe(true); // rellena SOLO lo vacio (reps)
    expect(campo('peso').value).toBe('57.5');
    expect(campo('sets').value).toBe('3');
    expect(campo('reps').value).toBe('10');
  });
});

describe('los botones + y −', () => {
  it('el PRIMER + parte de la ultima vez y suma el paso: 55 → 57.5 (no se pierde el toque)', () => {
    ajustarCampo(0, 'peso', 'mas');
    expect(campo('peso').value).toBe('57.5');
    expect([campo('sets').value, campo('reps').value]).toEqual(['4', '10']);
    ajustarCampo(0, 'peso', 'mas');
    expect(campo('peso').value).toBe('60');
    ajustarCampo(0, 'peso', 'menos');
    expect(campo('peso').value).toBe('57.5');
  });
  it('en mancuerna el paso es 1: 10 → 11', () => {
    ajustarCampo(3, 'peso', 'mas');
    expect(campo('peso', 3).value).toBe('11');
  });
  it('sets y reps suben de 1, y nada baja de 0', () => {
    ajustarCampo(0, 'sets', 'mas');
    expect(campo('sets').value).toBe('5');
    for (let i = 0; i < 12; i++) ajustarCampo(0, 'reps', 'menos');
    expect(Number(campo('reps').value)).toBe(0);
  });
  it('si ya tocaste algo, un 0 es decision tuya y no se vuelve a rellenar', () => {
    campo('peso').value = '60';
    campo('peso').dispatchEvent(new Event('change', { bubbles: true }));
    ajustarCampo(0, 'reps', 'mas'); // reps estaba vacio, peso ya tiene valor: NO rellena
    expect(campo('reps').value).toBe('1');
    expect(campo('sets').value).toBe('');
  });
  it('sin historial parte de 0', () => {
    ajustarCampo(2, 'peso', 'mas'); // Remo Mancuerna, mancuerna, sin historial
    expect(campo('peso', 2).value).toBe('1');
  });
});

describe('paso del peso', () => {
  it('2.5 kg en barra y maquina, 1 kg en mancuerna', () => {
    expect(pasoDePeso(0)).toBe(2.5); // Jalon al Pecho
    expect(pasoDePeso(3)).toBe(1); // Curl Martillo (mancuerna)
  });
});

describe('el borrador se vuelca al ocultar la app', () => {
  it('con series reales, escribe el borrador sin esperar los 15 s', () => {
    toggleCompletado(0);
    localStorage.removeItem('gymmate_draft');
    guardarBorradorSiHayCambios();
    expect(getDraft()?.ejercicios[0].peso).toBe(55);
  });
  it('una plantilla en 0 NO es un borrador', () => {
    localStorage.removeItem('gymmate_draft');
    guardarBorradorSiHayCambios();
    expect(getDraft()).toBeNull();
  });
});
