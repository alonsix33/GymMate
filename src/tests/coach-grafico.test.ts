import { describe, it, expect } from 'vitest';
import {
  detectarPedidoDeGrafico, ejerciciosNombrados, graficoSVG, pideGrafico, resumenDeSerie, serieDeEjercicio,
} from '@/features/coach-grafico';
import type { HistorySession } from '@/types';

const AHORA = new Date('2026-11-18T20:30:00-05:00');

const ej = (nombre: string, peso: number, extra: object = {}) => ({
  nombre, sets: 4, reps: 10, peso, volumen: 4 * 10 * peso, completado: true, esMancuerna: false, grupoMuscular: 'X', ...extra,
});
const ses = (fecha: string, ejercicios: ReturnType<typeof ej>[]): HistorySession =>
  ({ sessionId: `s_${fecha}`, date: fecha, savedAt: `${fecha}T17:00:00.000Z`, grupo: 'G', type: 'weights', volumenTotal: 1, volumenPorGrupo: {}, ejercicios }) as unknown as HistorySession;

const HIST = [
  ses('2026-11-10', [ej('Press Militar', 40), ej('Press Banca', 50), ej('Press Inclinado', 40), ej('Fondos en Máquina', 100)]),
  ses('2026-11-05', [ej('Press Militar', 40), ej('Press Banca', 50)]),
  ses('2026-10-20', [ej('Press Banca', 47.5), ej('Jalón al Pecho', 55), ej('Jalón Agarre Cerrado', 60)]),
  ses('2026-09-01', [ej('Press Banca', 45)]),
  ses('2025-01-01', [ej('Press Banca', 30)]), // fuera de los 6 meses
];

describe('reconocer que piden un gráfico', () => {
  it('con y sin tilde, y "evolución"', () => {
    for (const t of ['Muéstrame el gráfico', 'muestrame el grafico', 'la gráfica del jalón', 'evolución del press']) {
      expect(pideGrafico(t)).toBe(true);
    }
  });
  it('una pregunta normal no es un pedido de gráfico', () => {
    for (const t of ['¿Qué me toca hoy?', 'Pásame el plan', 'cómo voy esta semana']) expect(pideGrafico(t)).toBe(false);
  });
});

describe('qué ejercicio dibujar', () => {
  const nombres = ['Press Banca', 'Press Banca Inclinado', 'Jalón al Pecho', 'Jalón Agarre Cerrado', 'Press Militar'];
  it('el nombre entero, y el más largo manda ("Banca Inclinado" no es también "Banca")', () => {
    expect(ejerciciosNombrados('gráfico del press banca inclinado', nombres)).toEqual(['Press Banca Inclinado']);
  });
  it('una palabra clave: "banca" → Press Banca (y el inclinado también la tiene)', () => {
    expect(ejerciciosNombrados('gráfico de banca', nombres).sort()).toEqual(['Press Banca', 'Press Banca Inclinado']);
  });
  it('"jalón" a secas es ambiguo: los dos jalones', () => {
    expect(ejerciciosNombrados('el gráfico del jalón', nombres).sort()).toEqual(['Jalón Agarre Cerrado', 'Jalón al Pecho']);
  });
  it('"press" solo no identifica ninguno (es de media docena)', () => {
    expect(ejerciciosNombrados('el gráfico del press', nombres)).toEqual([]);
  });
  it('1 candidato → se dibuja; varios → se pregunta con botones', () => {
    expect(detectarPedidoDeGrafico('gráfico de fondos', HIST, [], AHORA)).toEqual({ tipo: 'ejercicio', ejercicio: 'Fondos en Máquina' });
    const r = detectarPedidoDeGrafico('el gráfico del jalón', HIST, [], AHORA);
    expect(r).toMatchObject({ tipo: 'elegir' });
  });
  it('EL CASO DE LA CAPTURA: "Muéstrame el gráfico" tras el plan → opciones = los ejercicios del plan', () => {
    const plan = 'Upper Push, hoy: **Press Militar** — 4x10 con 40 kg **Press Banca** — 4x10 con 50 kg **Fondos en Máquina** — 4x10 con 100 kg';
    const r = detectarPedidoDeGrafico('Muéstrame el gráfico', HIST, [{ autor: 'coach', texto: plan }], AHORA);
    expect(r).toEqual({ tipo: 'elegir', opciones: expect.arrayContaining(['Press Militar', 'Press Banca', 'Fondos en Máquina']) });
    expect((r as { opciones: string[] }).opciones).not.toContain('Jalón al Pecho');
  });
  it('si el último mensaje del coach habla de UN ejercicio, se dibuja ese', () => {
    const r = detectarPedidoDeGrafico('muéstrame el gráfico', HIST, [{ autor: 'coach', texto: 'Tu Press Banca va bien.' }], AHORA);
    expect(r).toEqual({ tipo: 'ejercicio', ejercicio: 'Press Banca' });
  });
  it('del mensaje del coach solo cuenta el nombre ENTERO: "tu jalón va bien" no es el tema', () => {
    // Con la palabra suelta, las opciones serian solo los dos jalones.
    const r = detectarPedidoDeGrafico('muéstrame el gráfico', HIST, [{ autor: 'coach', texto: 'Tu jalón va bien.' }], AHORA);
    expect(r?.tipo).toBe('elegir');
    expect((r as { opciones: string[] }).opciones).toContain('Press Banca');
  });
  it('lo que nombra el usuario manda sobre lo que dijo el coach', () => {
    const r = detectarPedidoDeGrafico('gráfico de fondos', HIST, [{ autor: 'coach', texto: 'Tu Press Banca va bien.' }], AHORA);
    expect(r).toEqual({ tipo: 'ejercicio', ejercicio: 'Fondos en Máquina' });
  });
  it('sin pista, ofrece los más entrenados de los últimos 90 días', () => {
    const r = detectarPedidoDeGrafico('muéstrame el gráfico', HIST, [], AHORA);
    expect(r?.tipo).toBe('elegir');
    expect((r as { opciones: string[] }).opciones[0]).toBe('Press Banca'); // 4 sesiones recientes... la mas repetida
  });
  it('sin historial no hay nada que dibujar', () => {
    expect(detectarPedidoDeGrafico('gráfico', [], [], AHORA)).toBeNull();
  });
});

describe('los puntos salen de la bitácora', () => {
  it('uno por día, de antiguo a reciente, solo últimos 6 meses', () => {
    const p = serieDeEjercicio('Press Banca', HIST, AHORA);
    expect(p.map((x) => x.fecha)).toEqual(['2026-09-01', '2026-10-20', '2026-11-05', '2026-11-10']);
    expect(p.map((x) => x.peso)).toEqual([45, 47.5, 50, 50]);
  });
  it('una serie EXCLUIDA no se dibuja', () => {
    const h = [ses('2026-11-10', [ej('Hip Thrust', 450, { excluido: true })]), ses('2026-11-05', [ej('Hip Thrust', 55)])];
    expect(serieDeEjercicio('Hip Thrust', h, AHORA).map((x) => x.peso)).toEqual([55]);
  });
  it('dos guardados el mismo día son un punto', () => {
    const h = [ses('2026-11-10', [ej('Press Banca', 50)]), ses('2026-11-10', [ej('Press Banca', 52.5)])];
    expect(serieDeEjercicio('Press Banca', h, AHORA)).toHaveLength(1);
    expect(serieDeEjercicio('Press Banca', h, AHORA)[0].peso).toBe(52.5);
  });
  it('el pie del gráfico usa solo cifras de los puntos', () => {
    const p = serieDeEjercicio('Press Banca', HIST, AHORA);
    expect(resumenDeSerie('Press Banca', p)).toBe(
      'Press Banca · últimos 6 meses: de 45 kg (mar 1 sep) a 50 kg (mar 10 nov). Pico 50 kg · 4 sesiones.'
    );
  });
  it('sin sesiones lo dice, no inventa', () => {
    expect(resumenDeSerie('Remo', [])).toContain('No tengo sesiones de Remo');
  });
});

describe('el SVG', () => {
  const p = serieDeEjercicio('Press Banca', HIST, AHORA);
  it('dibuja un punto por sesión y una línea', () => {
    const s = graficoSVG('Press Banca', p);
    expect((s.match(/<circle/g) ?? []).length).toBe(4);
    expect(s).toContain('<polyline');
    expect(s).toContain('role="img"');
  });
  it('una sola sesión: un punto y sin línea', () => {
    const s = graficoSVG('X', p.slice(0, 1));
    expect((s.match(/<circle/g) ?? []).length).toBe(1);
    expect(s).not.toContain('<polyline');
  });
  it('un peso constante no revienta (rango cero)', () => {
    const s = graficoSVG('X', [p[2], p[3]]);
    expect(s).not.toContain('NaN');
    expect(s).not.toContain('Infinity');
  });
  it('escapa el nombre del ejercicio', () => {
    expect(graficoSVG('<img onerror=x>', p)).not.toContain('<img');
  });
  it('sin puntos no dibuja nada', () => {
    expect(graficoSVG('X', [])).toBe('');
  });
});
