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
    // 16 literal, NO `SEMANAS_VISIBLES`: comparar contra la constante que genera
    // el dato es una asercion que no puede fallar. Cambiarla de 16 a 12 dejaba
    // los 156 tests en verde.
    expect(h.semanas).toHaveLength(16);
    expect(SEMANAS_VISIBLES).toBe(16);
    for (const semana of h.semanas) expect(semana).toHaveLength(DIAS_POR_SEMANA);
  });

  it('un dia sin sesion es cuartil 0, no Q1', () => {
    const h = construirHeatmap([], HOY);
    const todas = h.semanas.flat();
    expect(todas.every((c) => c.cuartil === 0)).toBe(true);
    expect(h.entrenos).toBe(0);
  });

  it('un dia de solo cardio no compite en kg aunque la sesion traiga volumen', () => {
    // Con volumenTotal 0 esta prueba no podia fallar: sumar 0 no cambia nada.
    // Una sesion de cardio con volumen la obliga a discriminar de verdad.
    const h = construirHeatmap([sesion(haceDias(3), 5000, 'cardio')], HOY);
    const celda = h.semanas.flat().find((c) => c.fecha === haceDias(3));
    expect(celda?.soloCardio).toBe(true);
    expect(celda?.volumen).toBe(0);
    expect(celda?.cuartil).toBe(0);
  });

  it('cuenta como entrenos los dias con cualquier sesion, cardio incluido', () => {
    // La rejilla marca el dia de cardio con su anillo: contar solo pesas
    // dejaba al usuario viendo N marcas y leyendo un numero menor.
    const h = construirHeatmap(
      [sesion(haceDias(1), 1000), sesion(haceDias(2), 0, 'cardio')],
      HOY
    );
    expect(h.entrenos).toBe(2);
  });

  it('reparte los cuatro cuartiles sin colapsar dos en uno', () => {
    // Mutante que sobrevivia: pintar Q2 como Q3 y viceversa.
    const dias = Array.from({ length: 40 }, (_, i) => sesion(haceDias(i + 1), (i + 1) * 100));
    const h = construirHeatmap(dias, HOY);
    const cuenta = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<number, number>;
    for (const c of h.semanas.flat()) if (c.cuartil > 0) cuenta[c.cuartil]++;
    expect(cuenta[1]).toBe(10);
    expect(cuenta[2]).toBe(10);
    expect(cuenta[3]).toBe(10);
    expect(cuenta[4]).toBe(10);
  });

  it('la ventana de referencia es de 6 meses, no menos', () => {
    // Mutante que sobrevivia: MESES_DE_REFERENCIA 6 -> 1.
    // Un dia flojo de hace 5 meses SI entra en la distribucion y empuja el
    // dia de hoy hacia arriba; si la ventana fuera de 1 mes, no.
    const cinco = Array.from({ length: 20 }, (_, i) => sesion(haceDias(140 + i), 100));
    const q = (hist: HistorySession[]) =>
      construirHeatmap(hist, HOY).semanas.flat().find((c) => c.fecha === haceDias(1))?.cuartil;
    // Solo, el unico dia no es ni el mejor ni el peor: rango medio -> Q3.
    expect(q([sesion(haceDias(1), 9000)])).toBe(3);
    // Con 20 dias flojos de hace ~5 meses DENTRO de la ventana, hoy es Q4.
    // Con una ventana de 1 mes esos dias no contarian y seguiria en Q3.
    expect(q([...cinco, sesion(haceDias(1), 9000)])).toBe(4);
  });

  it('el umbral del hueco es exactamente 14 dias', () => {
    // Mutante que sobrevivia: DIAS_HUECO 14 -> 7 o -> 21.
    const con13 = construirHeatmap([sesion(haceDias(13), 1000), sesion(haceDias(0), 1000)], HOY);
    expect(con13.huecoMayor).toBeNull();
    const con14 = construirHeatmap([sesion(haceDias(15), 1000), sesion(haceDias(0), 1000)], HOY);
    expect(con14.huecoMayor?.dias).toBe(14);
    const con20 = construirHeatmap([sesion(haceDias(21), 1000), sesion(haceDias(0), 1000)], HOY);
    expect(con20.huecoMayor?.dias).toBe(20);
  });

  it('con dos huecos devuelve el MAYOR, no el primero ni el menor', () => {
    const h = construirHeatmap(
      [
        sesion(haceDias(100), 1000),
        sesion(haceDias(60), 1000), // hueco de 39
        sesion(haceDias(45), 1000), // hueco de 14
        sesion(haceDias(0), 1000), // hueco de 44
      ],
      HOY
    );
    expect(h.huecoMayor?.dias).toBe(44);
  });

  it('el hueco que viene de antes de la ventana cuenta los dias REALES', () => {
    // Recortarlo a las 112 celdas hacia que volver tras 10 meses se leyera
    // como "109 dias sin entrenar".
    const h = construirHeatmap([sesion(haceDias(300), 1000), sesion(haceDias(0), 1000)], HOY);
    // De hace 300 dias a hoy hay 299 dias sin entrenar, no 300.
    expect(h.huecoMayor?.dias).toBe(299);
    // Y sin la extension se habria recortado a la ventana visible (112).
    expect(h.huecoMayor!.dias).toBeGreaterThan(112);
  });

  it('la rejilla termina en la semana de hoy cualquiera que sea el dia', () => {
    // Mutante que sobrevivia: desplazamiento = 0.
    for (let d = 0; d < 7; d++) {
      const dia = new Date(2026, 7, 17 + d, 12, 0, 0); // lunes 17 a domingo 23
      const h = construirHeatmap([], dia);
      const celdas = h.semanas.flat();
      const ultima = new Date(`${celdas[celdas.length - 1].fecha}T00:00:00`);
      expect(ultima.getDay()).toBe(0); // siempre cierra en domingo
      expect(celdas.some((c) => c.esHoy)).toBe(true);
    }
  });

  it('la fecha de la sesion se interpreta en dia LOCAL, no UTC', () => {
    // Una sesion guardada a las 20:00 en UTC-5 lleva fecha UTC del dia
    // siguiente. Debe pintarse en el dia local en que se entreno.
    const local = new Date(2026, 7, 20, 20, 0, 0);
    const conHora = {
      date: local.toISOString(),
      volumenTotal: 3000,
      grupo: 'X',
      ejercicios: [],
      volumenPorGrupo: {},
      type: 'weights',
    } as unknown as HistorySession;
    const h = construirHeatmap([conHora], HOY);
    const celda = h.semanas.flat().find((c) => c.fecha === claveDia(local));
    expect(celda?.volumen).toBe(3000);
  });

  it('no duplica ni pierde dias al cruzar un cambio de horario', () => {
    // Aritmetica de calendario: restar 86.400.000 ms desplazaba la hora local
    // y saltaba de dia a las 23:30.
    const nocheTrasDST = new Date(2026, 10, 1, 23, 30, 0); // 1-nov 23:30
    const h = construirHeatmap([], nocheTrasDST);
    const fechas = h.semanas.flat().map((c) => c.fecha);
    expect(new Set(fechas).size).toBe(fechas.length);
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
    // Lo unico que puede contar es el tramo desde la ultima sesion hasta hoy
    // (19 dias, hoy incluido), nunca los 92 anteriores a la primera.
    expect(h.huecoMayor?.dias).toBe(19);
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
    // La version anterior metia su unica asercion sustantiva dentro de un if
    // que nunca se cumplia: pasaba por vacio. Aqui se fuerza un hueco real
    // que llega hasta hoy y se comprueba que NO se extiende al futuro.
    const h = construirHeatmap(
      [sesion(haceDias(40), 1000), sesion(haceDias(0), 1000)],
      new Date(2026, 7, 19, 12, 0, 0) // miercoles: quedan 4 dias futuros
    );
    const celdas = h.semanas.flat();
    const futuras = celdas.filter((c) => c.futuro);
    expect(futuras.length).toBe(4);
    expect(h.huecoMayor).not.toBeNull();
    const ultimaNoFutura = celdas.map((c, i) => (c.futuro ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
    expect(h.huecoMayor!.hasta).toBeLessThanOrEqual(ultimaNoFutura);
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
