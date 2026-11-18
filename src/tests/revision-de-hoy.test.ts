import { describe, it, expect } from 'vitest';
import { construirEstado } from '@/features/coach-estado';
import type { HistorySession } from '@/types';

const AHORA = new Date('2026-11-13T22:14:00-05:00');
function ej(nombre: string, sets: number, reps: number, peso: number, extra: Record<string, unknown> = {}) {
  return { nombre, sets, reps, peso, volumen: sets * reps * peso, completado: true, esMancuerna: false, grupoMuscular: 'Espalda', ...extra };
}
function ses(fecha: string, grupo: string, ejercicios: ReturnType<typeof ej>[]): HistorySession {
  return {
    sessionId: `s_${fecha}`, date: fecha, savedAt: `${fecha}T19:00:00-05:00`, grupo, type: 'weights',
    volumenTotal: 0, volumenPorGrupo: {}, ejercicios,
  } as unknown as HistorySession;
}
const G4 = 'GRUPO 4 - Espalda + Bíceps';
const PLANTILLAS = [{ nombre: G4, ejercicios: ['Jalón al Pecho', 'Remo en Máquina', 'Curl Martillo'] }];

describe('REVISION DE HOY · ejercicio por ejercicio contra la vez anterior', () => {
  const historial = [
    ses('2026-11-13', G4, [ej('Jalón al Pecho', 4, 10, 57.5), ej('Remo en Máquina', 4, 10, 60), ej('Dominadas', 3, 8, 0.0001)]),
    ses('2026-11-05', G4, [ej('Jalón al Pecho', 4, 10, 55), ej('Remo en Máquina', 4, 10, 62.5), ej('Curl Martillo', 4, 10, 10)]),
    ses('2026-10-20', G4, [ej('Dominadas', 3, 8, 0.0001)]),
  ];
  const r = construirEstado(historial, { ahora: AHORA, plantillas: PLANTILLAS }).revisionDeHoy!;

  it('existe cuando se entreno hoy y no cuando no', () => {
    expect(r).toBeTruthy();
    expect(construirEstado(historial.slice(1), { ahora: AHORA, plantillas: PLANTILLAS }).revisionDeHoy).toBeNull();
  });
  it('sube / baja con la diferencia calculada por codigo', () => {
    const j = r.ejercicios.find((e) => e.ejercicio === 'Jalón al Pecho')!;
    expect(j.cambio).toBe('subió');
    expect(j.difKg).toBe(2.5);
    expect(j.antes?.peso).toBe(55);
    expect(j.antes?.etiqueta).toBe('jue 5 nov');
    const m = r.ejercicios.find((e) => e.ejercicio === 'Remo en Máquina')!;
    expect(m.cambio).toBe('bajó');
    expect(m.difKg).toBe(-2.5);
  });
  it('primera vez cuando no hay una vez anterior', () => {
    const n = construirEstado(
      [ses('2026-11-13', G4, [ej('Jalón al Pecho', 4, 10, 57.5)])], { ahora: AHORA, plantillas: PLANTILLAS }
    ).revisionDeHoy!;
    expect(n.ejercicios[0].cambio).toBe('primera vez');
    expect(n.ejercicios[0].antes).toBeNull();
  });
  it('lo que la rutina trae y hoy no se hizo, en faltan', () => {
    expect(r.faltan).toEqual(['Curl Martillo']);
  });
  it('igual cuando no cambia nada', () => {
    const i = construirEstado(
      [ses('2026-11-13', G4, [ej('Jalón al Pecho', 4, 10, 55)]), ses('2026-11-05', G4, [ej('Jalón al Pecho', 4, 10, 55)])],
      { ahora: AHORA, plantillas: PLANTILLAS }
    ).revisionDeHoy!;
    expect(i.ejercicios[0].cambio).toBe('igual');
  });
});
