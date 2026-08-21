import { describe, it, expect } from 'vitest';
import {
  construirHeatmap,
  cuartilDe,
  agruparPorDia,
  claveDia,
  SEMANAS_VISIBLES,
  DIAS_POR_SEMANA,
} from '@/utils/heatmap';
import type { HistorySession } from '@/types';

const sesion = (date: string, volumenTotal: number, type: 'weights' | 'cardio' = 'weights'): HistorySession =>
  ({ date, volumenTotal, grupo: 'X', ejercicios: [], volumenPorGrupo: {}, type }) as HistorySession;

/** Fecha fija: sin esto los tests dependerian del dia en que se corren. */
const HOY = new Date('2026-08-21T12:00:00');
const haceDias = (n: number) => claveDia(new Date(HOY.getTime() - n * 86400000));

describe('cuartilDe', () => {
  it('reparte una distribucion pareja en los cuatro cuartiles', () => {
    const d = [10, 20, 30, 40];
    expect(cuartilDe(10, d)).toBe(1);
    expect(cuartilDe(20, d)).toBe(2);
    expect(cuartilDe(30, d)).toBe(3);
    expect(cuartilDe(40, d)).toBe(4);
  });

  it('con todos los dias iguales no llama a ninguno flojo ni el mejor', () => {
    const d = [1000, 1000, 1000, 1000, 1000];
    expect(cuartilDe(1000, d)).toBe(3);
  });

  it('el maximo siempre es Q4 y el minimo siempre Q1', () => {
    const d = [1, 5, 5, 5, 5, 5, 900];
    expect(cuartilDe(900, d)).toBe(4);
    expect(cuartilDe(1, d)).toBe(1);
  });

  it('un valor por encima de todo lo visto es Q4', () => {
    expect(cuartilDe(5000, [100, 200, 300])).toBe(4);
  });

  it('no revienta con la distribucion vacia', () => {
    expect(cuartilDe(100, [])).toBe(1);
  });
});

describe('agruparPorDia', () => {
  it('suma el volumen de todas las sesiones de pesas del mismo dia', () => {
    const dias = agruparPorDia([sesion('2026-08-20', 1000), sesion('2026-08-20', 500)]);
    expect(dias.get('2026-08-20')?.pesas).toBe(1500);
  });

  it('el cardio no suma kg pero deja marcado el dia', () => {
    const dias = agruparPorDia([sesion('2026-08-20', 0, 'cardio')]);
    expect(dias.get('2026-08-20')).toEqual({ pesas: 0, cardio: true });
  });

  it('acepta fechas en ISO completo', () => {
    const dias = agruparPorDia([sesion('2026-08-20T18:30:00.000Z', 800)]);
    expect(dias.get('2026-08-20')?.pesas).toBe(800);
  });
});

describe('construirHeatmap', () => {
  it('devuelve exactamente 16 semanas de 7 dias', () => {
    const h = construirHeatmap([], HOY);
    expect(h.semanas).toHaveLength(SEMANAS_VISIBLES);
    for (const semana of h.semanas) expect(semana).toHaveLength(DIAS_POR_SEMANA);
  });

  it('un dia sin sesion es cuartil 0, no Q1', () => {
    const h = construirHeatmap([], HOY);
    const todas = h.semanas.flat();
    expect(todas.every((c) => c.cuartil === 0)).toBe(true);
    expect(h.entrenos).toBe(0);
  });

  it('un dia de solo cardio no entra en los cuartiles y queda marcado', () => {
    const h = construirHeatmap([sesion(haceDias(3), 0, 'cardio')], HOY);
    const celda = h.semanas.flat().find((c) => c.fecha === haceDias(3));
    expect(celda?.soloCardio).toBe(true);
    expect(celda?.cuartil).toBe(0);
    expect(h.entrenos).toBe(0); // no compite en kg
  });

  it('un dia con pesas Y cardio cuenta como dia de pesas', () => {
    const h = construirHeatmap(
      [sesion(haceDias(3), 2000), sesion(haceDias(3), 0, 'cardio')],
      HOY
    );
    const celda = h.semanas.flat().find((c) => c.fecha === haceDias(3));
    expect(celda?.soloCardio).toBe(false);
    expect(celda?.volumen).toBe(2000);
  });

  it('los cuartiles son relativos al propio historial, no a una escala fija', () => {
    const flojo = construirHeatmap(
      [sesion(haceDias(1), 100), sesion(haceDias(2), 200), sesion(haceDias(3), 300), sesion(haceDias(4), 400)],
      HOY
    );
    const fuerte = construirHeatmap(
      [
        sesion(haceDias(1), 10000),
        sesion(haceDias(2), 20000),
        sesion(haceDias(3), 30000),
        sesion(haceDias(4), 40000),
      ],
      HOY
    );
    const q = (h: ReturnType<typeof construirHeatmap>, dia: string) =>
      h.semanas.flat().find((c) => c.fecha === dia)?.cuartil;
    // El mejor dia de cada quien es Q4, valga 400 kg o 40,000.
    expect(q(flojo, haceDias(1))).toBe(1);
    expect(q(flojo, haceDias(4))).toBe(4);
    expect(q(fuerte, haceDias(1))).toBe(1);
    expect(q(fuerte, haceDias(4))).toBe(4);
  });

  it('las sesiones de hace mas de 6 meses no distorsionan la escala actual', () => {
    const conAntiguas = construirHeatmap(
      [
        sesion(haceDias(1), 1000),
        sesion(haceDias(2), 2000),
        // Una barbaridad de hace 10 meses: fuera de la ventana de referencia.
        sesion(haceDias(300), 999999),
      ],
      HOY
    );
    const q = conAntiguas.semanas.flat().find((c) => c.fecha === haceDias(2))?.cuartil;
    expect(q).toBe(4);
  });

  it('cuenta como entrenos solo los dias de pesas dentro de la ventana visible', () => {
    const h = construirHeatmap(
      [sesion(haceDias(1), 1000), sesion(haceDias(2), 1000), sesion(haceDias(300), 1000)],
      HOY
    );
    expect(h.entrenos).toBe(2);
  });

  it('detecta un hueco de 14 dias o mas entre dos entrenamientos', () => {
    const h = construirHeatmap([sesion(haceDias(0), 1000), sesion(haceDias(30), 1000)], HOY);
    expect(h.huecoMayor).not.toBeNull();
    expect(h.huecoMayor?.dias).toBe(29);
  });

  it('el vacio ANTERIOR a la primera sesion no es un hueco', () => {
    // Alguien que empezo hace 20 dias no lleva "89 dias sin entrenar".
    const h = construirHeatmap([sesion(haceDias(20), 1000), sesion(haceDias(19), 1000)], HOY);
    // Solo cuenta el tramo desde la ultima sesion hasta hoy: 19 dias, bajo umbral.
    expect(h.huecoMayor?.dias ?? 0).toBeLessThan(20);
  });

  it('si ya entrenaba antes de la ventana visible, el vacio inicial SI cuenta', () => {
    const h = construirHeatmap([sesion(haceDias(200), 1000), sesion(haceDias(0), 1000)], HOY);
    expect(h.huecoMayor).not.toBeNull();
    expect(h.huecoMayor!.dias).toBeGreaterThan(100);
  });

  it('no senala huecos por debajo del umbral', () => {
    const dias = [0, 5, 10, 15, 20].map((d) => sesion(haceDias(d), 1000));
    const h = construirHeatmap(dias, HOY);
    expect(h.huecoMayor).toBeNull();
  });

  it('los dias futuros de la semana en curso no cuentan como hueco', () => {
    // Entrenando HOY, el resto de la semana esta por venir: no es un hueco.
    const h = construirHeatmap([sesion(haceDias(0), 1000)], HOY);
    const futuras = h.semanas.flat().filter((c) => c.futuro);
    expect(futuras.every((c) => c.cuartil === 0)).toBe(true);
    // El hueco previo a hoy si existe (no hay nada antes), pero no incluye futuro.
    if (h.huecoMayor) expect(h.huecoMayor.hasta).toBeLessThan(SEMANAS_VISIBLES * DIAS_POR_SEMANA - 1);
  });

  it('marca la celda de hoy', () => {
    const h = construirHeatmap([], HOY);
    const hoy = h.semanas.flat().filter((c) => c.esHoy);
    expect(hoy).toHaveLength(1);
    expect(hoy[0].fecha).toBe(claveDia(HOY));
  });

  it('claveDia usa la fecha local, no UTC', () => {
    // 23:30 local del 21 debe seguir siendo el 21, no el 22.
    expect(claveDia(new Date(2026, 7, 21, 23, 30))).toBe('2026-08-21');
  });
});
