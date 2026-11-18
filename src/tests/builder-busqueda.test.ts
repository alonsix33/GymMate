import { describe, it, expect, beforeEach } from 'vitest';
import { abrirBuilder, ejerciciosMasUsados } from '@/ui/builder';
import { saveHistory } from '@/utils/storage';
import { allExercises } from '@/data/exercises';
import type { HistorySession } from '@/types';

const [A, B, C] = [allExercises[0].nombre, allExercises[5].nombre, allExercises[9].nombre];
function ses(fecha: string, nombres: string[], extra: Record<string, unknown> = {}): HistorySession {
  return {
    sessionId: `s_${fecha}`, date: fecha, savedAt: `${fecha}T19:00:00-05:00`, grupo: 'G', type: 'weights', volumenTotal: 1, volumenPorGrupo: {},
    ejercicios: nombres.map((n) => ({ nombre: n, sets: 4, reps: 10, peso: 50, volumen: 2000, completado: true, esMancuerna: false, grupoMuscular: 'Piernas', ...extra })),
  } as unknown as HistorySession;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('ejerciciosMasUsados', () => {
  it('de mas a menos veces, y sin contar series excluidas', () => {
    const h = [ses('2026-11-10', [A, B]), ses('2026-11-08', [A, C]), ses('2026-11-06', [A]), ses('2026-11-04', [C], { excluido: true })];
    expect(ejerciciosMasUsados(h)[0]).toBe(A);
    expect(ejerciciosMasUsados(h)).toContain(B);
    // C tuvo una serie valida y otra excluida: cuenta UNA vez, igual que B.
    expect(ejerciciosMasUsados(h).indexOf(C)).toBeGreaterThan(0);
  });
  it('respeta el limite', () => {
    const h = [ses('2026-11-10', allExercises.slice(0, 20).map((e) => e.nombre))];
    expect(ejerciciosMasUsados(h, 5)).toHaveLength(5);
  });
  it('sin historial, vacio', () => expect(ejerciciosMasUsados([])).toEqual([]));
});

describe('el builder: usados primero y buscador', () => {
  it('con historial, el primer grupo es TUS EJERCICIOS con los mas usados', () => {
    saveHistory([ses('2026-11-10', [A, B]), ses('2026-11-08', [A])]);
    abrirBuilder();
    const primero = document.querySelector('.f-builder__grupo')!;
    expect(primero.querySelector('.f-prog__label')!.textContent).toBe('TUS EJERCICIOS');
    expect(primero.querySelector('.f-fila-ej__nombre')!.textContent).toBe(A);
  });
  it('sin historial no hay grupo de usados', () => {
    abrirBuilder();
    expect(document.querySelector('.f-builder__lista')!.textContent).not.toContain('TUS EJERCICIOS');
  });
  it('el buscador filtra sin tildes ni mayusculas, y oculta los grupos vacios', () => {
    abrirBuilder();
    const caja = document.getElementById('builderBuscar') as HTMLInputElement;
    caja.value = 'EXTENSION';
    caja.dispatchEvent(new Event('input'));
    const visibles = [...document.querySelectorAll<HTMLElement>('.f-fila-ej')].filter((f) => !f.hidden);
    expect(visibles.length).toBeGreaterThan(0);
    visibles.forEach((f) => expect(f.textContent!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')).toContain('extension'));
    const gruposVisibles = [...document.querySelectorAll<HTMLElement>('.f-builder__grupo')].filter((g) => !g.hidden);
    gruposVisibles.forEach((g) => expect([...g.querySelectorAll<HTMLElement>('.f-fila-ej')].some((f) => !f.hidden)).toBe(true));
  });
  it('buscando, el grupo de usados se oculta para no repetir filas', () => {
    saveHistory([ses('2026-11-10', [A])]);
    abrirBuilder();
    const caja = document.getElementById('builderBuscar') as HTMLInputElement;
    caja.value = A.slice(0, 4);
    caja.dispatchEvent(new Event('input'));
    expect((document.querySelector('[data-usados]') as HTMLElement).hidden).toBe(true);
  });
  it('sin coincidencias lo dice', () => {
    abrirBuilder();
    const caja = document.getElementById('builderBuscar') as HTMLInputElement;
    caja.value = 'zzzzzz';
    caja.dispatchEvent(new Event('input'));
    expect(document.querySelector('.f-builder__sin-resultados')).not.toBeNull();
  });
  it('elegir un ejercicio no borra la busqueda', () => {
    abrirBuilder();
    const caja = document.getElementById('builderBuscar') as HTMLInputElement;
    caja.value = 'prensa';
    caja.dispatchEvent(new Event('input'));
    (document.querySelector('.f-fila-ej:not([hidden])') as HTMLElement).click();
    expect((document.getElementById('builderBuscar') as HTMLInputElement).value).toBe('prensa');
    const visibles = [...document.querySelectorAll<HTMLElement>('.f-fila-ej')].filter((f) => !f.hidden);
    visibles.forEach((f) => expect(f.textContent!.toLowerCase()).toContain('prensa'));
  });
});
