import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { contextoCompleto } from '@/features/coach-ia';
import { addToHistory, getHistory, saveHistory, savePRs } from '@/utils/storage';
import { sesionesSinSubir, picoDe } from '@/utils/zonas';
import { initGamification } from '@/features/gamification';
import type { HistorySession } from '@/types';

/**
 * Regresiones del 13-nov-2026, con SOLO APIs que existian antes del arreglo:
 * estas pruebas se corrieron contra el codigo viejo y fallaron, y pasan con el
 * nuevo. (Las que usan modulos nuevos estan en coach-estado.test.ts.)
 *
 * "Hoy" es vie 13 nov 2026, 22:14 en Lima. La zona de las pruebas es Lima
 * (`TZ=America/Lima` en el script `test`).
 */

const AHORA = new Date('2026-11-13T22:14:00-05:00');

interface EjTest {
  nombre: string; sets: number; reps: number; peso: number; volumen: number; completado: boolean;
  esMancuerna: boolean; grupoMuscular: string; excluido?: boolean;
}
function ej(nombre: string, sets: number, reps: number, peso: number, musculo = 'Espalda'): EjTest {
  return {
    nombre, sets, reps, peso, volumen: sets * reps * peso, completado: sets > 0,
    esMancuerna: false, grupoMuscular: musculo,
  };
}

function sesion(
  id: string, fecha: string, hora: string, grupo: string, ejercicios: EjTest[]
): HistorySession {
  const iso = new Date(`${fecha}T${hora}-05:00`).toISOString();
  const vol = ejercicios.reduce((t, e) => t + e.volumen, 0);
  return {
    sessionId: id, date: fecha, savedAt: iso, grupo, type: 'weights',
    volumenTotal: vol, volumenPorGrupo: { Espalda: vol }, ejercicios,
  } as unknown as HistorySession;
}

beforeEach(() => {
  localStorage.clear();
  initGamification();
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});
afterEach(() => { vi.useRealTimers(); });

describe('falla 5 · una sesion por dia y por entrenamiento', () => {
  it('dos guardados del mismo dia y mismo entrenamiento son UNA sesion', () => {
    // Reanudar un borrador perdia el sessionId: el segundo guardado entraba
    // como sesion nueva al lado del primero.
    addToHistory(sesion('A', '2026-11-13', '19:00:00', 'GRUPO 4 - Espalda + Bíceps', [
      ej('Jalón al Pecho', 4, 10, 55),
    ]));
    addToHistory(sesion('B', '2026-11-13', '21:30:00', 'GRUPO 4 - Espalda + Bíceps', [
      ej('Jalón al Pecho', 4, 10, 55), ej('Remo en Máquina', 4, 10, 60),
    ]));
    const h = getHistory();
    expect(h).toHaveLength(1);
    expect(h[0].ejercicios.map((e) => e.nombre)).toEqual(['Jalón al Pecho', 'Remo en Máquina']);
  });

  it('el volumen del dia no se cuenta dos veces', () => {
    addToHistory(sesion('A', '2026-11-13', '19:00:00', 'G4', [ej('Jalón al Pecho', 4, 10, 55)]));
    addToHistory(sesion('B', '2026-11-13', '21:30:00', 'G4', [ej('Jalón al Pecho', 4, 10, 55)]));
    expect(contextoCompleto()?.resumen.volumenPorGrupo.Espalda).toBe(4 * 10 * 55);
  });

  it('dos entrenamientos DISTINTOS el mismo dia siguen siendo dos guardados', () => {
    addToHistory(sesion('A', '2026-11-13', '10:00:00', 'Piernas', [ej('Prensa', 4, 10, 180, 'Piernas')]));
    addToHistory(sesion('B', '2026-11-13', '20:00:00', 'Espalda', [ej('Jalón al Pecho', 4, 10, 55)]));
    expect(getHistory()).toHaveLength(2);
  });
});

describe('falla 4 · una sesion nueva no trae ejercicios que el usuario no confirmo', () => {
  it('los ejercicios de plantilla en 0x0@0 no entran a la bitacora', () => {
    addToHistory(sesion('A', '2026-11-13', '20:00:00', 'GRUPO 4 - Espalda + Bíceps', [
      ej('Jalón al Pecho', 4, 10, 55),
      ej('Remo Mancuerna', 0, 0, 0),
      ej('Abdominales en Máquina', 0, 0, 0, 'Core'),
    ]));
    expect(getHistory()[0].ejercicios.map((e) => e.nombre)).toEqual(['Jalón al Pecho']);
    expect(contextoCompleto()?.bitacora).not.toContain('Abdominales');
    expect(contextoCompleto()?.bitacora).not.toContain('0x0@0');
  });
});

describe('falla 6 · "sesiones sin subir"', () => {
  const sesiones = (): HistorySession[] => [
    // Dos guardados el 13-nov (como el registro del dia): la cuenta no puede
    // subir por eso.
    sesion('c', '2026-11-13', '21:30:00', 'G4', [ej('Jalón al Pecho', 4, 10, 55)]),
    sesion('b', '2026-11-13', '19:00:00', 'Espalda', [ej('Jalón al Pecho', 4, 10, 55)]),
    sesion('a', '2026-11-09', '19:00:00', 'G4', [ej('Jalón al Pecho', 4, 10, 55)]),
    sesion('p', '2026-10-01', '19:00:00', 'G4', [ej('Jalón al Pecho', 4, 10, 60)]),
  ];

  it('cuenta DIAS, no guardados: el 13-nov dos veces es un dia', () => {
    expect(sesionesSinSubir('Jalón al Pecho', sesiones(), 60)).toBe(2);
  });

  it('da el mismo numero dos veces seguidas con los mismos datos', () => {
    const h = sesiones();
    expect(sesionesSinSubir('Jalón al Pecho', h, 60)).toBe(sesionesSinSubir('Jalón al Pecho', h, 60));
  });

  it('un guardado MAS el mismo dia no cambia la cuenta', () => {
    const antes = sesionesSinSubir('Jalón al Pecho', sesiones(), 60);
    const mas = [sesion('d', '2026-11-13', '22:10:00', 'G4', [ej('Jalón al Pecho', 4, 10, 55)]), ...sesiones()];
    expect(sesionesSinSubir('Jalón al Pecho', mas, 60)).toBe(antes);
  });

  it('un dia NUEVO cambia la cuenta en 1 como maximo', () => {
    const antes = sesionesSinSubir('Jalón al Pecho', sesiones(), 60);
    const nuevo = [sesion('e', '2026-11-14', '19:00:00', 'G4', [ej('Jalón al Pecho', 4, 10, 55)]), ...sesiones()];
    expect(sesionesSinSubir('Jalón al Pecho', nuevo, 60) - antes).toBe(1);
  });
});

describe('falla 1 · la bitacora y las fechas', () => {
  it('la primera linea es la ULTIMA sesion y el dia de la semana ya viene escrito', () => {
    saveHistory([
      sesion('x', '2026-11-12', '19:00:00', 'Piernas', [ej('Prensa', 4, 10, 180, 'Piernas')]),
      sesion('y', '2026-11-10', '19:00:00', 'Pecho', [ej('Press Banca', 4, 10, 80, 'Pecho')]),
    ]);
    const lineas = (contextoCompleto()?.bitacora ?? '').split('\n');
    expect(lineas[0]).toMatch(/^jue 12 nov · /);
    expect(lineas[1]).toMatch(/^mar 10 nov · /);
  });

  it('no hay ningun otro formato de fecha en la bitacora (ni 2026-11-12 ni 12-11)', () => {
    saveHistory([sesion('x', '2026-11-12', '19:00:00', 'Piernas', [ej('Prensa', 4, 10, 180, 'Piernas')])]);
    const b = contextoCompleto()?.bitacora ?? '';
    expect(b).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(b).not.toMatch(/\b\d{1,2}-\d{1,2}\b/);
  });

  it('una sesion guardada a las 22:30 de Lima es del MISMO dia, no del siguiente', () => {
    // 22:30 en Lima = 03:30 UTC del dia siguiente.
    const tarde = {
      ...sesion('n', '2026-11-13', '22:30:00', 'Espalda', [ej('Jalón al Pecho', 4, 10, 55)]),
    } as HistorySession;
    delete (tarde as { date?: string }).date;
    saveHistory([tarde]);
    expect(contextoCompleto()?.resumen.hasta).toBe('2026-11-13');
  });
});

describe('falla 8 · el outlier no cuenta en el pico', () => {
  it('una serie EXCLUIDA no entra en el pico, y el PR guardado tampoco', () => {
    const h = [
      sesion('a', '2026-11-12', '19:00:00', 'Piernas', [ej('Hip Thrust', 2, 10, 55, 'Glúteos')]),
      sesion('o', '2026-10-20', '19:00:00', 'Piernas', [
        { ...ej('Hip Thrust', 4, 10, 450, 'Glúteos'), excluido: true },
      ]),
    ] as HistorySession[];
    expect(picoDe('Hip Thrust', h)).toBe(55);
    saveHistory(h);
    savePRs({ 'Hip Thrust': { peso: 450, sets: 4, reps: 10, volumen: 18000, date: '2026-10-20T00:00:00.000Z' } });
    const p = contextoCompleto()?.panorama.find((e) => e.ejercicio === 'Hip Thrust');
    expect(p?.pico).toBe(55);
  });
});
