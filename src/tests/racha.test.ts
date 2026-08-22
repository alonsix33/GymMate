import { describe, it, expect } from 'vitest';
import { calculateCurrentStreak } from '@/features/gamification/xp';
import { claveDiaLocal } from '@/utils/fecha';
import type { HistorySession } from '@/types';

/**
 * `calculateCurrentStreak` no tenia NI UNA prueba, y llevaba dos defectos del
 * mismo dia UTC:
 *
 *  1. las claves de dia se derivaban con `toISOString()` (arreglado antes);
 *  2. la clave se volvia a LEER con `new Date('YYYY-MM-DD')`, que la norma
 *     manda parsear en UTC. En Lima eso devuelve el dia anterior, asi que el
 *     bucle comparaba contra el antepenultimo dia y cortaba en el primer paso:
 *     cuatro dias seguidos daban racha 1.
 *
 * La suite corre con `TZ=America/Lima` (ver el script `verificar` de
 * package.json). Estas pruebas SOLO fallan en una zona con desfase negativo,
 * asi que la zona no es decorado: es la condicion del experimento.
 */

function sesionEl(dia: Date, hora: number): HistorySession {
  const f = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hora, 30);
  return {
    sessionId: `s_${f.getTime()}`,
    date: f.toISOString(),
    savedAt: f.toISOString(),
    grupo: 'Pecho',
    type: 'weights',
    volumenTotal: 1000,
    volumenPorGrupo: {},
    ejercicios: [],
  } as HistorySession;
}

const HOY = new Date(2026, 7, 22, 21, 0); // sabado 22 de agosto, 21:00 local
const hace = (n: number) => new Date(2026, 7, 22 - n);

describe('calculateCurrentStreak · el dia es el dia LOCAL', () => {
  it('la zona de la suite tiene desfase negativo (si no, estas pruebas no prueban nada)', () => {
    expect(new Date(2026, 7, 22, 21, 0).getTimezoneOffset()).toBeGreaterThan(0);
  });

  it('cuatro dias seguidos de noche son racha 4, no 1', () => {
    const sesiones = [0, 1, 2, 3].map((n) => sesionEl(hace(n), 21));
    expect(calculateCurrentStreak(sesiones, HOY.toISOString())).toBe(4);
  });

  it('da igual la hora: manana, tarde y noche alternadas siguen siendo dias seguidos', () => {
    const horas = [7, 14, 21, 23, 6];
    const sesiones = horas.map((h, n) => sesionEl(hace(n), h));
    expect(calculateCurrentStreak(sesiones, HOY.toISOString())).toBe(5);
  });

  it('dos sesiones del MISMO dia local cuentan una vez', () => {
    const sesiones = [sesionEl(hace(0), 7), sesionEl(hace(0), 21), sesionEl(hace(1), 20)];
    expect(calculateCurrentStreak(sesiones, HOY.toISOString())).toBe(2);
  });

  it('un hueco corta la racha en el hueco', () => {
    const sesiones = [0, 1, 3, 4].map((n) => sesionEl(hace(n), 21));
    expect(calculateCurrentStreak(sesiones, HOY.toISOString())).toBe(2);
  });

  it('si la ultima sesion fue anteayer, la racha es 0', () => {
    const sesiones = [2, 3, 4].map((n) => sesionEl(hace(n), 21));
    expect(calculateCurrentStreak(sesiones, HOY.toISOString())).toBe(0);
  });

  it('entrenar solo ayer deja racha viva de 1', () => {
    expect(calculateCurrentStreak([sesionEl(hace(1), 21)], HOY.toISOString())).toBe(1);
  });

  it('sin sesiones, racha 0', () => {
    expect(calculateCurrentStreak([], HOY.toISOString())).toBe(0);
  });

  it('la racha nunca supera los dias distintos que hay en el historial', () => {
    // Barrido: cualquier subconjunto de los ultimos 12 dias, a cualquier hora.
    for (let mascara = 0; mascara < 4096; mascara++) {
      const dias = [...Array(12).keys()].filter((n) => mascara & (1 << n));
      const sesiones = dias.map((n) => sesionEl(hace(n), (n * 5) % 24));
      const racha = calculateCurrentStreak(sesiones, HOY.toISOString());
      const distintos = new Set(sesiones.map((s) => claveDiaLocal(new Date(s.date)))).size;
      expect(racha).toBeLessThanOrEqual(distintos);
      // Y coincide con contar a mano desde hoy o ayer hacia atras.
      let esperada = 0;
      if (dias.includes(0) || dias.includes(1)) {
        const inicio = dias.includes(0) ? 0 : 1;
        for (let n = inicio; dias.includes(n); n++) esperada++;
      }
      expect(racha).toBe(esperada);
    }
  });
});
