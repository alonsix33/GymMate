import { describe, it, expect } from 'vitest';
import { esSaludo, saludoDe, turnosDeHoy, ATAJOS } from '@/features/coach-saludo';
import { construirEstado } from '@/features/coach-estado';
import type { HistorySession } from '@/types';
import type { TurnoCoach } from '@/features/coach-ia';

const AHORA = new Date('2026-11-13T22:14:00-05:00');

describe('esSaludo', () => {
  it.each(['Hola', 'hola!', 'Buenas', 'hey', 'Buenos días', 'qué tal', 'Hola coach'])('%s es saludo', (t) => {
    expect(esSaludo(t)).toBe(true);
  });
  it.each(['hola, ¿cómo voy en press banca?', 'qué toca hoy', 'gráfico de peso', 'hola cuánto levanté ayer'])('%s NO es solo un saludo', (t) => {
    expect(esSaludo(t)).toBe(false);
  });
});

describe('saludoDe', () => {
  const ses: HistorySession = {
    sessionId: 's', date: '2026-11-13', savedAt: '2026-11-13T19:00:00-05:00', grupo: 'G4', type: 'weights',
    volumenTotal: 100, volumenPorGrupo: {},
    ejercicios: [{ nombre: 'Jalón', sets: 4, reps: 10, peso: 55, volumen: 2200, completado: true, esMancuerna: false, grupoMuscular: 'Espalda' }],
  } as unknown as HistorySession;
  it('es corto, con la fecha de hoy calculada y sin auditoria', () => {
    const t = saludoDe(construirEstado([ses], { ahora: AHORA }));
    expect(t).toContain('vie 13 nov');
    expect(t.split('\n').length).toBeLessThanOrEqual(3);
    expect(t.length).toBeLessThan(260);
    expect(t).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it('dice si hoy ya entreno y si no', () => {
    expect(saludoDe(construirEstado([ses], { ahora: AHORA }))).toMatch(/ya entrenaste/i);
    expect(saludoDe(construirEstado([], { ahora: AHORA }))).not.toMatch(/ya entrenaste/i);
  });
});

describe('turnosDeHoy', () => {
  const t = (id: string, fecha: string, autor: 'coach' | 'usuario' = 'usuario'): TurnoCoach => ({ id, autor, texto: id, fecha });
  it('solo los de hoy (dia de Lima) y como mucho 6', () => {
    const turnos = [
      t('ayer', '2026-11-12T20:00:00-05:00'),
      ...Array.from({ length: 8 }, (_, i) => t(`h${i}`, `2026-11-13T1${i}:00:00-05:00`)),
      t('tarde-noche-utc', '2026-11-14T03:30:00Z'), // 22:30 del 13 en Lima
    ];
    const r = turnosDeHoy(turnos, AHORA);
    expect(r.enviados).toHaveLength(6);
    expect(r.enviados.map((x) => x.id)).toEqual(['h3', 'h4', 'h5', 'h6', 'h7', 'tarde-noche-utc']);
    expect(r.omitidos).toBe(4); // ayer + h0,h1,h2
  });
});

it('hay tres atajos con frases que el coach entiende', () => {
  expect(ATAJOS.map((a) => a.etiqueta)).toEqual(['¿Qué toca hoy?', 'Revisar mi sesión', '¿Cómo voy esta semana?']);
});
