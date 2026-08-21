/**
 * W-01…W-04: la logica pura que decide lo que el usuario LEE.
 *
 * Cada caso de aqui es un numero o un texto que el mockup enseña; si cambia,
 * la pantalla miente.
 */
import { describe, it, expect } from 'vitest';
import {
  reloj,
  partirNombreDeGrupo,
  intensidadDe,
  ultimaVezDe,
  ultimoVolumenDelGrupo,
} from '@/ui/workout-view';
import { zonaDeRPE, posicionDeRPE, filasDeXP, RPE_MIN, RPE_MAX } from '@/ui/session-screens';
import type { HistorySession } from '@/types';
import type { SessionXPSummary } from '@/types/gamification';

describe('reloj', () => {
  it('formatea m:ss sin rellenar el minuto, como el mockup', () => {
    expect(reloj(84)).toBe('1:24');
    expect(reloj(2530)).toBe('42:10');
    expect(reloj(0)).toBe('0:00');
    expect(reloj(9)).toBe('0:09');
  });

  it('pasa a h:mm:ss cuando la sesion cruza la hora', () => {
    expect(reloj(3600)).toBe('1:00:00');
    expect(reloj(3760)).toBe('1:02:40');
  });

  it('no produce numeros negativos ni NaN', () => {
    expect(reloj(-30)).toBe('0:00');
  });
});

describe('partirNombreDeGrupo', () => {
  it('separa el prefijo del titular', () => {
    expect(partirNombreDeGrupo('GRUPO 1 - Piernas + Glúteos')).toEqual({
      titulo: 'Piernas + Glúteos',
      prefijo: 'GRUPO 1',
    });
  });

  it('una rutina propia no tiene prefijo', () => {
    expect(partirNombreDeGrupo('Mi rutina de empuje')).toEqual({
      titulo: 'Mi rutina de empuje',
      prefijo: '',
    });
  });

  it('un guion sin espacios NO es separador: "Push-Pull" es un solo nombre', () => {
    expect(partirNombreDeGrupo('Push-Pull')).toEqual({ titulo: 'Push-Pull', prefijo: '' });
  });
});

describe('intensidadDe', () => {
  it('usa la regla de zonas del README: <70 / 70-95 / 95+', () => {
    expect(intensidadDe(60, 100)).toBe('suave');
    expect(intensidadDe(69.9, 100)).toBe('suave');
    expect(intensidadDe(70, 100)).toBe('moderada');
    expect(intensidadDe(94.9, 100)).toBe('moderada');
    expect(intensidadDe(95, 100)).toBe('intensa');
    expect(intensidadDe(120, 100)).toBe('intensa');
  });

  it('sin pico no hay badge: antes que inventar intensidad, no se enseña', () => {
    expect(intensidadDe(80, null)).toBeNull();
    expect(intensidadDe(80, 0)).toBeNull();
  });

  it('sin peso tecleado tampoco', () => {
    expect(intensidadDe(0, 180)).toBeNull();
  });
});

function sesion(parcial: Partial<HistorySession>): HistorySession {
  return {
    date: '2026-08-01',
    grupo: 'GRUPO 1 - Piernas + Glúteos',
    ejercicios: [],
    volumenTotal: 0,
    volumenPorGrupo: {},
    ...parcial,
  } as HistorySession;
}

const EJ = (nombre: string, sets: number, reps: number, peso: number, volumen: number) => ({
  nombre,
  esMancuerna: false,
  grupoMuscular: 'Piernas' as const,
  sets,
  reps,
  peso,
  volumen,
  completado: true,
});

describe('ultimaVezDe', () => {
  const historial = [
    sesion({ ejercicios: [EJ('Prensa de Piernas', 3, 10, 130, 3900)] }),
    sesion({ ejercicios: [EJ('Prensa de Piernas', 4, 12, 120, 5760)] }),
  ];

  it('toma la primera aparicion, que es la mas reciente', () => {
    expect(ultimaVezDe('Prensa de Piernas', historial)).toEqual({ sets: 3, reps: 10, peso: 130 });
  });

  it('salta las sesiones de cardio, que no tienen ejercicios de pesas', () => {
    const conCardio = [sesion({ type: 'cardio', ejercicios: [] }), ...historial];
    expect(ultimaVezDe('Prensa de Piernas', conCardio)).toEqual({ sets: 3, reps: 10, peso: 130 });
  });

  it('ignora las apariciones con volumen 0: estaban en la lista, no se hicieron', () => {
    const conVacio = [sesion({ ejercicios: [EJ('Prensa de Piernas', 0, 0, 0, 0)] }), ...historial];
    expect(ultimaVezDe('Prensa de Piernas', conVacio)).toEqual({ sets: 3, reps: 10, peso: 130 });
  });

  it('devuelve null si nunca se hizo', () => {
    expect(ultimaVezDe('Hip Thrust', historial)).toBeNull();
  });
});

describe('ultimoVolumenDelGrupo', () => {
  const historial = [
    sesion({ grupo: 'GRUPO 2 - Pecho', volumenTotal: 5000 }),
    sesion({ grupo: 'GRUPO 1 - Piernas + Glúteos', volumenTotal: 2800 }),
    sesion({ grupo: 'GRUPO 1 - Piernas + Glúteos', volumenTotal: 9999 }),
  ];

  it('es el de la ultima sesion de ESE grupo, no el de la ultima sesion', () => {
    expect(ultimoVolumenDelGrupo('GRUPO 1 - Piernas + Glúteos', historial)).toBe(2800);
  });

  it('null cuando el grupo no tiene historial: la nota no se pinta', () => {
    expect(ultimoVolumenDelGrupo('GRUPO 3 - Espalda', historial)).toBeNull();
  });

  it('una sesion del grupo con volumen 0 no cuenta', () => {
    expect(ultimoVolumenDelGrupo('GRUPO 4', [sesion({ grupo: 'GRUPO 4', volumenTotal: 0 })])).toBeNull();
  });
});

describe('slider de RPE (W-02)', () => {
  it('la bola nunca se pasa de los extremos', () => {
    expect(posicionDeRPE(RPE_MIN)).toBe(0);
    expect(posicionDeRPE(RPE_MAX)).toBe(1);
    expect(posicionDeRPE(5)).toBeCloseTo(4 / 9, 5);
  });

  it('toma la parada del gradiente mas cercana (verde 0, ambar .55, roja 1)', () => {
    // t < .275 -> verde: valores 1, 2, 3 (t = 0, .111, .222)
    expect(zonaDeRPE(1)).toBe('verde');
    expect(zonaDeRPE(3)).toBe('verde');
    // .275 <= t < .775 -> ambar: 4..7 (t = .333 .. .667)
    expect(zonaDeRPE(4)).toBe('ambar');
    expect(zonaDeRPE(7)).toBe('ambar');
    // t >= .775 -> roja: 8, 9, 10 (t = .778, .889, 1)
    expect(zonaDeRPE(8)).toBe('roja');
    expect(zonaDeRPE(10)).toBe('roja');
  });
});

describe('filasDeXP (W-03)', () => {
  const base: SessionXPSummary = {
    baseXP: 50,
    volumeXP: 24,
    prXP: [{ exercise: 'Prensa de Piernas', amount: 250, type: 'weight' }],
    streakXP: 0,
    achievementXP: [{ name: 'Primer PR', amount: 75 }],
    rankUpXP: [{ muscle: 'piernas', amount: 150 }],
    totalXP: 549,
    rankUps: [{ muscle: 'piernas', from: 'Plata', to: 'Oro' }],
    newLevel: 3,
    oldLevel: 2,
    leveledUp: true,
    titleInfo: { full: 'Principiante I' } as SessionXPSummary['titleInfo'],
    levelProgress: { current: 116, max: 466, percentage: 24.9 },
  };

  it('lista solo los conceptos que sumaron', () => {
    const filas = filasDeXP(base);
    expect(filas.map((f) => f.concepto)).toEqual([
      'Sesión completada',
      'Volumen levantado',
      'PR · Prensa de Piernas',
      'Logro · Primer PR',
      'Ascenso · Piernas',
    ]);
  });

  it('omite la racha cuando vale 0: una fila "+0" no dice nada', () => {
    expect(filasDeXP(base).some((f) => f.concepto === 'Racha')).toBe(false);
    expect(filasDeXP({ ...base, streakXP: 40 }).some((f) => f.concepto === 'Racha')).toBe(true);
  });

  it('la suma de las filas cuadra con el total', () => {
    const suma = filasDeXP(base).reduce((t, f) => t + f.valor, 0);
    expect(suma).toBe(base.totalXP);
  });

  it('traduce el musculo del ascenso al nombre en español', () => {
    const filas = filasDeXP({ ...base, rankUpXP: [{ muscle: 'gluteos', amount: 100 }] });
    expect(filas.at(-1)?.concepto).toBe('Ascenso · Glúteos');
  });
});
