import { describe, it, expect, beforeEach } from 'vitest';
import { contextoCompleto, MESES_DE_CONTEXTO } from '@/features/coach-ia';
import { unaRepMaxPromedio } from '@/utils/calculations';
import type { HistorySession } from '@/types';

/**
 * El contexto completo que viaja al coach.
 *
 * Reemplaza a la seleccion de UN ejercicio por pregunta, que fallaba en todo
 * lo que no nombrara literalmente un ejercicio del historial: "¿como voy en
 * banca?" no encontraba "Press Banca", y "¿como va mi mes?" no encontraba
 * nada. El modelo respondia que no tenia datos con un año de datos al lado.
 *
 * Lo que se comprueba aqui es lo que puede mentir sin dar ninguna señal: los
 * bordes de la ventana de 12 meses, y que el 1RM del panorama sea EL MISMO que
 * el de PR-01 y CA-01. Con Epley a secas el coach decia 168 kg donde la
 * pantalla decia 165.
 */

function sesion(
  nombre: string,
  peso: number,
  reps: number,
  diasAtras: number,
  grupo = 'Pecho'
): HistorySession {
  const hoy = new Date();
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - diasAtras, 19, 0);
  return {
    sessionId: `s_${nombre}_${diasAtras}`,
    date: d.toISOString(),
    savedAt: d.toISOString(),
    grupo,
    type: 'weights',
    volumenTotal: peso * reps * 3,
    volumenPorGrupo: { [grupo]: peso * reps * 3 },
    ejercicios: [
      {
        nombre, sets: 3, reps, peso, volumen: peso * reps * 3, completado: true,
        esMancuerna: false, grupoMuscular: grupo,
      },
    ],
  } as unknown as HistorySession;
}

beforeEach(() => localStorage.clear());

describe('contextoCompleto · la ventana de 12 meses', () => {
  it('sin ninguna sesion devuelve null, no un contexto de ceros', () => {
    expect(contextoCompleto([])).toBeNull();
  });

  it('deja fuera lo anterior a la ventana', () => {
    const c = contextoCompleto([
      sesion('Press Banca', 100, 8, 10),
      sesion('Press Banca', 60, 8, 400), // mas de un año
    ]);
    expect(c?.resumen.sesiones).toBe(1);
    expect(c?.bitacora).not.toContain('@60');
  });

  it('la sesion de HOY entra', () => {
    // La mas reciente es la que mas importa y es la que un corte mal puesto
    // dejaria fuera. (Probado: cambiar el mediodia por medianoche NO rompe
    // esto, asi que este caso no cubre esa variante — lo cubre el limite de
    // abajo. Decirlo evita que alguien lo lea como una garantia que no da.)
    const c = contextoCompleto([sesion('Press Banca', 100, 8, 0)]);
    expect(c?.resumen.sesiones).toBe(1);
  });

  it('la del limite justo por dentro entra y la de justo fuera no', () => {
    const dentro = contextoCompleto([sesion('Press Banca', 100, 8, 360)]);
    expect(dentro?.resumen.sesiones).toBe(1);
    const fuera = contextoCompleto([sesion('Press Banca', 100, 8, 372)]);
    expect(fuera).toBeNull();
  });

  it('la ventana es la declarada, no otra', () => {
    expect(MESES_DE_CONTEXTO).toBe(12);
  });
});

describe('contextoCompleto · el panorama no contradice a la pantalla', () => {
  it('el 1RM es el PROMEDIO de las tres formulas, igual que PR-01 y CA-01', () => {
    // Con Epley a secas este numero salia distinto al de la pantalla. Dos
    // cifras para lo mismo destruyen la confianza en todas las demas.
    const c = contextoCompleto([sesion('Press Banca', 100, 12, 3)]);
    const fila = c?.panorama.find((e) => e.ejercicio === 'Press Banca');
    expect(fila?.unaRepMax).toBe(Math.round(unaRepMaxPromedio(100, 12) as number));
  });

  it('cubre TODOS los ejercicios, no solo el de la pregunta', () => {
    const c = contextoCompleto([
      sesion('Press Banca', 100, 8, 3),
      sesion('Sentadilla', 150, 5, 4, 'Pierna'),
      sesion('Peso Muerto', 180, 3, 5, 'Espalda'),
    ]);
    expect(c?.panorama.map((e) => e.ejercicio).sort()).toEqual([
      'Peso Muerto', 'Press Banca', 'Sentadilla',
    ]);
  });

  it('cuenta las sesiones de cada ejercicio y su ultima fecha', () => {
    const c = contextoCompleto([
      sesion('Press Banca', 100, 8, 2),
      sesion('Press Banca', 95, 8, 9),
      sesion('Sentadilla', 150, 5, 4, 'Pierna'),
    ]);
    const banca = c?.panorama.find((e) => e.ejercicio === 'Press Banca');
    expect(banca?.sesiones).toBe(2);
    const hoy = new Date();
    const esperada = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 2);
    const p = (n: number) => String(n).padStart(2, '0');
    expect(banca?.ultimaVez).toBe(
      `${esperada.getFullYear()}-${p(esperada.getMonth() + 1)}-${p(esperada.getDate())}`
    );
  });

  it('un ejercicio sin pico ni peso utilizable no entra con ceros', () => {
    const vacio = sesion('Fantasma', 0, 0, 3);
    const c = contextoCompleto([sesion('Press Banca', 100, 8, 3), vacio]);
    expect(c?.panorama.some((e) => e.ejercicio === 'Fantasma')).toBe(false);
  });

  it('el volumen por grupo suma el de todas las sesiones', () => {
    const c = contextoCompleto([
      sesion('Press Banca', 100, 8, 2),
      sesion('Sentadilla', 150, 5, 4, 'Pierna'),
    ]);
    expect(c?.resumen.volumenPorGrupo.Pecho).toBe(100 * 8 * 3);
    expect(c?.resumen.volumenPorGrupo.Pierna).toBe(150 * 5 * 3);
  });
});

describe('contextoCompleto · la bitacora', () => {
  it('va de la mas ANTIGUA a la mas reciente, que es como se lee una progresion', () => {
    const c = contextoCompleto([
      sesion('Press Banca', 105, 8, 1),
      sesion('Press Banca', 100, 8, 8),
    ]);
    const lineas = (c?.bitacora ?? '').split('\n');
    expect(lineas[0]).toContain('@100');
    expect(lineas[1]).toContain('@105');
  });

  it('una linea por sesion, con series por peso', () => {
    const c = contextoCompleto([sesion('Press Banca', 100, 8, 3)]);
    expect(c?.bitacora).toMatch(/^\d{4}-\d{2}-\d{2} Pecho · Press Banca 3x8@100$/);
  });

  it('el cardio sale con sus minutos, no con series inventadas', () => {
    const hoy = new Date();
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 2, 8, 0);
    const cardio = {
      sessionId: 'c1', date: d.toISOString(), savedAt: d.toISOString(),
      grupo: 'Cardio', type: 'cardio', mode: 'libre',
      volumenTotal: 0, volumenPorGrupo: {}, ejercicios: [],
      // `totalTime` esta en SEGUNDOS: 1920 s = 32 min.
      stats: { totalTime: 1920, workTime: 1920, restTime: 0, roundsCompleted: 1, calories: 300 },
    } as unknown as HistorySession;
    const c = contextoCompleto([cardio, sesion('Press Banca', 100, 8, 3)]);
    expect(c?.bitacora).toContain('cardio libre 32 min');
  });

  it('el cardio no aporta volumen a ningun grupo muscular', () => {
    const hoy = new Date();
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 2, 8, 0);
    const cardio = {
      sessionId: 'c2', date: d.toISOString(), savedAt: d.toISOString(),
      grupo: 'Cardio', type: 'cardio', mode: 'emom',
      volumenTotal: 0, volumenPorGrupo: { Pecho: 9999 }, ejercicios: [],
      stats: { totalTime: 600, workTime: 600, restTime: 0, roundsCompleted: 10, calories: 90 },
    } as unknown as HistorySession;
    const c = contextoCompleto([cardio, sesion('Press Banca', 100, 8, 3)]);
    expect(c?.resumen.volumenPorGrupo.Pecho).toBe(100 * 8 * 3);
  });

  it('pesa mucho menos que el mismo historial en JSON', () => {
    // La razon entera por la que se manda todo: medido sobre 208 sesiones el
    // texto pesa ~7.500 tokens y el JSON ~57.000, porque el JSON repite las
    // claves en cada serie. Si alguien lo cambiara a JSON, esto avisa.
    const sesiones = Array.from({ length: 60 }, (_, i) => sesion('Press Banca', 100 + i, 8, i * 5));
    const c = contextoCompleto(sesiones);
    const enJson = JSON.stringify(sesiones.filter((_, i) => i * 5 < 365));
    expect((c?.bitacora.length ?? 0) * 3).toBeLessThan(enJson.length);
  });
});
