import { describe, it, expect } from 'vitest';
import { rutinaQueToca, bloqueEmpezar, opcionesDelMas } from '@/ui/inicio-rapido';
import { trainingGroups } from '@/data/training-groups';
import type { HistorySession } from '@/types';

const AHORA = new Date('2026-11-14T10:00:00-05:00');
const ids = Object.keys(trainingGroups);

function sesionDe(id: string, fecha: string): HistorySession {
  const g = trainingGroups[id];
  return {
    sessionId: `s_${id}_${fecha}`, date: fecha, savedAt: `${fecha}T19:00:00-05:00`, grupo: g.nombre, type: 'weights',
    volumenTotal: 1000, volumenPorGrupo: {},
    ejercicios: g.ejercicios.map((e) => ({ nombre: e.nombre, sets: 4, reps: 10, peso: 50, volumen: 2000, completado: true, esMancuerna: false, grupoMuscular: e.grupoMuscular })),
  } as unknown as HistorySession;
}

describe('la rutina que toca hoy', () => {
  it('sin historial, la primera', () => {
    const r = rutinaQueToca([], AHORA)!;
    expect(r.id).toBe(ids[0]);
    expect(typeof r.motivo === 'string' || r.motivo === null).toBe(true);
  });
  it('rota: si hizo el primer grupo ayer, no repite el mismo', () => {
    const r = rutinaQueToca([sesionDe(ids[0], '2026-11-13')], AHORA)!;
    expect(r.id).not.toBe(ids[0]);
  });
  it('si hoy ya entreno, no hay nada que empezar', () => {
    expect(rutinaQueToca([sesionDe(ids[0], '2026-11-14')], AHORA)).toBeNull();
    expect(bloqueEmpezar([sesionDe(ids[0], '2026-11-14')], AHORA)).toBe('');
  });
});

describe('la tarjeta EMPEZAR', () => {
  it('trae el boton que carga ESA rutina', () => {
    const html = bloqueEmpezar([sesionDe(ids[0], '2026-11-13')], AHORA);
    const id = rutinaQueToca([sesionDe(ids[0], '2026-11-13')], AHORA)!.id;
    expect(html).toContain('EMPEZAR');
    expect(html).toContain(`data-grupo="${id}"`);
    expect(html).not.toMatch(/GRUPO \d/);
  });
});

describe('las opciones del "+"', () => {
  it('empezar primero y crear rutina al final', () => {
    const o = opcionesDelMas([], false, AHORA);
    expect(o.map((x) => x.accion)).toEqual(['empezar', 'elegir', 'nueva']);
  });
  it('con borrador, continuar va primero y no se ofrece empezar otra', () => {
    const o = opcionesDelMas([], true, AHORA);
    expect(o.map((x) => x.accion)).toEqual(['continuar', 'elegir', 'nueva']);
  });
  it('si hoy ya entreno, no ofrece empezar', () => {
    const o = opcionesDelMas([sesionDe(ids[0], '2026-11-14')], false, AHORA);
    expect(o.map((x) => x.accion)).toEqual(['elegir', 'nueva']);
  });
});
