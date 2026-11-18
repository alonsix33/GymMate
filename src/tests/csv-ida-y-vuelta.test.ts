import { describe, it, expect, beforeEach } from 'vitest';
import { construirCSV, importFromCSV } from '@/features/history';
import { saveHistory, getHistory } from '@/utils/storage';
import type { HistorySession } from '@/types';

function ej(nombre: string, peso: number, extra: Record<string, unknown> = {}) {
  return { nombre, sets: 4, reps: 10, peso, volumen: 40 * peso, completado: true, esMancuerna: false, grupoMuscular: 'Piernas', ...extra };
}
const SESIONES = [
  {
    sessionId: 'session_A', date: '2026-11-13', savedAt: '2026-11-13T22:14:05.000Z', grupo: 'GRUPO 4 - Espalda + Bíceps', type: 'weights',
    volumenTotal: 2200, volumenPorGrupo: { Piernas: 2200 }, rpe: { value: 8, label: 'Muy exigente' },
    ejercicios: [ej('Jalón al Pecho', 55, { rpe: 7 }), ej('Hip Thrust', 450, { excluido: true, motivoExclusion: 'outlier' })],
  },
  {
    // Mismo dia y mismo grupo que A: dos sesiones distintas.
    sessionId: 'session_B', date: '2026-11-13', savedAt: '2026-11-13T15:00:00.000Z', grupo: 'GRUPO 4 - Espalda + Bíceps', type: 'weights',
    volumenTotal: 800, volumenPorGrupo: { Piernas: 800 }, ejercicios: [ej('=HYPERLINK("http://x","Press")', 20)],
  },
] as unknown as HistorySession[];

function comoArchivo(texto: string): File {
  return new File(['﻿' + texto], 'x.csv', { type: 'text/csv' });
}

beforeEach(() => localStorage.clear());

describe('CSV de ida y vuelta', () => {
  it('conserva id, hora, RPE, exclusion y las dos sesiones del mismo dia', async () => {
    saveHistory(SESIONES);
    const csv = construirCSV()!;
    localStorage.clear();
    const r = await importFromCSV(comoArchivo(csv));
    expect(r.imported).toBe(2);
    const h = getHistory();
    const a = h.find((s) => s.sessionId === 'session_A')!;
    expect(a).toBeTruthy();
    expect(a.savedAt).toBe('2026-11-13T22:14:05.000Z');
    expect(a.rpe?.value).toBe(8);
    expect(a.ejercicios[0].rpe).toBe(7);
    const hip = a.ejercicios.find((e) => e.nombre === 'Hip Thrust')!;
    expect(hip.excluido).toBe(true);
    expect(hip.motivoExclusion).toBe('outlier');
    expect(a.volumenTotal).toBe(2200); // el 450 excluido no suma
    expect(h.find((s) => s.sessionId === 'session_B')).toBeTruthy();
  });

  it('importar el mismo archivo otra vez no duplica nada', async () => {
    saveHistory(SESIONES);
    const csv = construirCSV()!;
    const r = await importFromCSV(comoArchivo(csv));
    expect(r.imported).toBe(0);
    expect(r.duplicates).toBe(2);
    expect(getHistory()).toHaveLength(2);
  });

  it('una formula en el nombre sale como texto y vuelve igual', async () => {
    saveHistory(SESIONES);
    const csv = construirCSV()!;
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.split('\n').some((l) => /(^|,)=HYPERLINK/.test(l))).toBe(false);
    localStorage.clear();
    await importFromCSV(comoArchivo(csv));
    const b = getHistory().find((s) => s.sessionId === 'session_B')!;
    expect(b.ejercicios[0].nombre).toBe('=HYPERLINK("http://x","Press")');
  });

  it('la conversacion del coach con saltos de linea no se trunca', async () => {
    saveHistory(SESIONES);
    const largo = 'Primera linea\n\n- punto uno\n- punto dos, con coma y "comillas"\n\nFin';
    localStorage.setItem('gymmate_coach_conversacion', JSON.stringify([
      { id: 't1', autor: 'usuario', fecha: '2026-11-13T10:00:00Z', texto: 'hola' },
      { id: 't2', autor: 'coach', fecha: '2026-11-13T10:00:05Z', texto: largo },
      { id: 't3', autor: 'coach', fecha: '2026-11-13T10:01:00Z', texto: '=1+1' },
    ]));
    const csv = construirCSV()!;
    localStorage.clear();
    await importFromCSV(comoArchivo(csv));
    const t = JSON.parse(localStorage.getItem('gymmate_coach_conversacion')!);
    expect(t).toHaveLength(3);
    expect(t.find((x: { id: string }) => x.id === 't2').texto).toBe(largo);
    expect(t.find((x: { id: string }) => x.id === 't3').texto).toBe('=1+1');
  });

  it('un CSV antiguo (11 columnas) se sigue leyendo', async () => {
    const viejo = [
      '=== ENTRENAMIENTOS DE PESAS ===',
      'Fecha,Grupo,Ejercicio,Sets,Reps,Peso (kg),Es Mancuerna,Grupo Muscular,Volumen,Completado,Volumen Total Sesión',
      '13/11/2026,Espalda,Jalón al Pecho,4,10,55,No,Espalda,2200,Sí,2200',
    ].join('\n');
    const r = await importFromCSV(comoArchivo(viejo));
    expect(r.imported).toBe(1);
    const s = getHistory()[0];
    expect(s.ejercicios[0].nombre).toBe('Jalón al Pecho');
    expect(s.ejercicios[0].excluido).toBeUndefined();
  });
});
