/**
 * C-01…C-08: la aritmetica de cardio. Cada cifra de aqui la lee el usuario en
 * el pie de una pantalla de configuracion o dentro de un timer corriendo.
 */
import { describe, it, expect } from 'vitest';
import {
  PIRAMIDE_MEDIA,
  DESCANSO_PIRAMIDE,
  PRESETS_PIRAMIDE,
  escalar,
  duracionPiramide,
  duracionTotal,
  formatearTiempo,
  circunferencia,
  offsetDelAnillo,
  ritmoEmom,
  estadoDeNivel,
  alturaDeNivel,
  acotarFactor,
  escalarDesde,
  dasharrayDelAnillo,
  tramoDeNivel,
  FACTOR_MIN,
  FACTOR_MAX,
} from '@/utils/cardio-calc';
import type { HistorySession } from '@/types';

describe('la piramide del mockup', () => {
  it('son 7 niveles con pico 75s y 15s de descanso', () => {
    expect(PIRAMIDE_MEDIA).toHaveLength(7);
    expect(Math.max(...PIRAMIDE_MEDIA)).toBe(75);
    expect(DESCANSO_PIRAMIDE).toBe(15);
  });

  it('el total es el 7:15 que escribe el mockup', () => {
    expect(duracionPiramide(PIRAMIDE_MEDIA)).toBe(435);
    expect(formatearTiempo(435)).toBe('7:15');
  });

  it('es simetrica: sube y baja igual', () => {
    expect(PIRAMIDE_MEDIA).toEqual([...PIRAMIDE_MEDIA].reverse());
  });

  it('todos los presets tienen los mismos 7 niveles', () => {
    for (const [nombre, niveles] of Object.entries(PRESETS_PIRAMIDE)) {
      expect(niveles, nombre).toHaveLength(7);
    }
  });

  it('RESET devuelve exactamente MEDIA', () => {
    expect(PRESETS_PIRAMIDE.reset).toEqual(PIRAMIDE_MEDIA);
  });

  it('los presets van de menor a mayor total', () => {
    const total = (k: string) => duracionPiramide(PRESETS_PIRAMIDE[k]);
    expect(total('corta')).toBeLessThan(total('media'));
    expect(total('media')).toBeLessThan(total('larga'));
    expect(total('larga')).toBeLessThan(total('extendida'));
  });

  it('INTENSA tiene el pico mas alto que MEDIA sin doblar su total', () => {
    expect(Math.max(...PRESETS_PIRAMIDE.intensa)).toBeGreaterThan(Math.max(...PIRAMIDE_MEDIA));
    expect(duracionPiramide(PRESETS_PIRAMIDE.intensa)).toBeLessThan(
      duracionPiramide(PIRAMIDE_MEDIA) * 2
    );
  });
});

describe('escalar', () => {
  it('mantiene la proporcion y redondea a 5s', () => {
    expect(escalar([20, 40, 60], 1.25)).toEqual([25, 50, 75]);
  });

  it('escalar no pone piso: el piso vive donde se puede alcanzar', () => {
    // El `Math.max(5, ...)` que habia aqui era inalcanzable desde la UI (con
    // factor 0.8 el punto fijo es 10s), o sea codigo muerto que ademas hacia
    // inmortal a su propio mutante. El limite real es `acotarFactor`.
    expect(escalar([5, 10], 0.1)).toEqual([0, 0]);
    expect(acotarFactor(0.1)).toBe(FACTOR_MIN);
    expect(acotarFactor(99)).toBe(FACTOR_MAX);
  });

  it('escalar ↓ y luego ↑ devuelve la piramide original', () => {
    // Encadenar `escalar` perdia informacion en cada redondeo: bajar y subir
    // daba [30,45,65,75,65,45,30] y deshacer no deshacia.
    const bajada = escalarDesde(PIRAMIDE_MEDIA, 1 / 1.25);
    const vuelta = escalarDesde(PIRAMIDE_MEDIA, (1 / 1.25) * 1.25);
    expect(vuelta).toEqual(PIRAMIDE_MEDIA);
    expect(bajada).not.toEqual(PIRAMIDE_MEDIA);
  });

  it('todo lo que sale es multiplo de 5: es el paso con el que se piensa un intervalo', () => {
    // Con `Math.round(n * factor)` a secas el test de ida y vuelta seguia
    // pasando, asi que la propiedad hay que afirmarla directamente.
    const escalados = escalar(PIRAMIDE_MEDIA, 1.25);
    expect(escalados).toEqual([40, 55, 75, 95, 75, 55, 40]);
    for (const n of escalados) expect(n % 5, String(n)).toBe(0);
    expect(escalar([22, 33, 47], 1)).toEqual([20, 35, 45]);
  });

  it('escalar arriba y abajo NO tiene por que devolver el original', () => {
    // El redondeo a 5s no es reversible; el test existe para que nadie
    // "arregle" eso en el futuro creyendo que si lo es.
    const ida = escalar(PIRAMIDE_MEDIA, 1.25);
    const vuelta = escalar(ida, 0.8);
    expect(vuelta).toEqual([30, 45, 60, 75, 60, 45, 30]);
  });
});

describe('duracionTotal', () => {
  it('Tabata son ciclos completos: 8 x (20 + 10) = 4:00', () => {
    expect(duracionTotal('tabata', { rounds: 8, work: 20, rest: 10 })).toBe(240);
    expect(formatearTiempo(240)).toBe('4:00');
  });

  it('EMOM son minutos por intervalo', () => {
    expect(duracionTotal('emom', { rounds: 10, interval: 60 })).toBe(600);
  });

  it('AMRAP es su duracion, tal cual', () => {
    expect(duracionTotal('amrap', { duration: 720 })).toBe(720);
  });

  it('el circuito suma estaciones, rondas y descanso entre rondas', () => {
    const config = {
      rounds: 3,
      work: 40,
      rest: 20,
      roundRest: 60,
      exercises: [
        { name: 'A', target: 40, type: 'time' as const },
        { name: 'B', target: 40, type: 'time' as const },
      ],
    };
    // 2 estaciones x (40+20) = 120 por ronda; 3 rondas = 360; 2 descansos = 120.
    expect(duracionTotal('circuit', config)).toBe(480);
  });

  it('un circuito sin estaciones dura 0, no dos minutos de descansos', () => {
    // El nombre de este test decia 0 y la asercion decia 120: la app anunciaba
    // "~2:00 min" de descansos entre rondas de un recorrido inexistente.
    expect(duracionTotal('circuit', { rounds: 3, work: 40, rest: 20, roundRest: 60 })).toBe(0);
  });

  it('la piramide usa su propio descanso', () => {
    expect(duracionTotal('pyramid', { levels: [10, 20, 10], rest: 5 })).toBe(50);
  });
});

describe('formatearTiempo', () => {
  it('m:ss sin rellenar el minuto', () => {
    expect(formatearTiempo(0)).toBe('0:00');
    expect(formatearTiempo(5)).toBe('0:05');
    expect(formatearTiempo(435)).toBe('7:15');
  });

  it('pasa a h:mm:ss al cruzar la hora', () => {
    expect(formatearTiempo(3600)).toBe('1:00:00');
    expect(formatearTiempo(3725)).toBe('1:02:05');
  });

  it('no da negativos', () => {
    expect(formatearTiempo(-10)).toBe('0:00');
  });
});

describe('el anillo', () => {
  it('la circunferencia del mockup (r=104) es 653', () => {
    expect(Math.round(circunferencia(104))).toBe(653);
  });

  it('lleno al empezar, vacio al acabar', () => {
    const c = dasharrayDelAnillo(104);
    expect(offsetDelAnillo(20, 20, 104)).toBeCloseTo(0, 5);
    expect(offsetDelAnillo(0, 20, 104)).toBeCloseTo(c, 5);
    expect(offsetDelAnillo(10, 20, 104)).toBeCloseTo(c / 2, 5);
  });

  it('un total de 0 no divide por cero', () => {
    expect(offsetDelAnillo(5, 0, 104)).toBeCloseTo(dasharrayDelAnillo(104), 5);
  });

  it('el offset nunca supera el dasharray que se pinta', () => {
    // 653.45 sobre un dasharray de 653 dejaba una astilla de arco visible con
    // el anillo ya vacio: el patron se repite cada 2x653.
    const da = dasharrayDelAnillo(104);
    for (const restante of [0, 1, 5, 10, 20]) {
      expect(offsetDelAnillo(restante, 20, 104)).toBeLessThanOrEqual(da);
    }
  });

  it('NaN no atraviesa la aritmetica del anillo ni del reloj', () => {
    expect(offsetDelAnillo(NaN, 20, 104)).toBe(dasharrayDelAnillo(104));
    expect(formatearTiempo(NaN)).toBe('0:00');
  });

  it('se acota: un restante mayor que el total no da un offset negativo', () => {
    expect(offsetDelAnillo(50, 20, 104)).toBeCloseTo(0, 5);
  });
});

function sesionCardio(mode: string, rondas: number, trabajo: number): HistorySession {
  return {
    type: 'cardio',
    mode,
    date: new Date().toISOString(),
    grupo: 'Cardio',
    ejercicios: [],
    volumenTotal: 0,
    volumenPorGrupo: {},
    stats: { totalTime: 600, workTime: trabajo, restTime: 0, roundsCompleted: rondas, calories: 50 },
  } as unknown as HistorySession;
}

describe('ritmoEmom', () => {
  it('toma la ultima sesion EMOM, no la ultima de cardio', () => {
    const h = [sesionCardio('tabata', 8, 160), sesionCardio('emom', 10, 380)];
    expect(ritmoEmom(h)).toBe(38);
  });

  it('sin sesion EMOM previa no estima nada', () => {
    expect(ritmoEmom([sesionCardio('tabata', 8, 160)])).toBeNull();
    expect(ritmoEmom([])).toBeNull();
  });

  it('un ritmo igual o mayor que el intervalo no es un ritmo medido', () => {
    // El motor cuenta el minuto ENTERO como trabajo, asi que trabajo/rondas da
    // 60 por construccion. Devolver 60 seria inventar el dato y contradecir la
    // propia barra, que promete enseñar lo que sobra para respirar.
    expect(ritmoEmom([sesionCardio('emom', 1, 90)])).toBeNull();
    expect(ritmoEmom([sesionCardio('emom', 2, 120)])).toBeNull();
  });

  it('las sesiones de pesas no cuentan', () => {
    const pesas = { type: 'weights', mode: 'emom' } as unknown as HistorySession;
    expect(ritmoEmom([pesas])).toBeNull();
  });
});

describe('estado y altura de los niveles', () => {
  it('los anteriores estan hechos, el actual late, los siguientes esperan', () => {
    expect(estadoDeNivel(0, 2)).toBe('hecho');
    expect(estadoDeNivel(2, 2)).toBe('activo');
    expect(estadoDeNivel(3, 2)).toBe('proximo');
  });

  it('el pico ocupa el 100% y el resto en proporcion', () => {
    expect(alturaDeNivel(75, 75)).toBe(100);
    expect(alturaDeNivel(30, 75)).toBe(40);
  });

  it('la altura se acota arriba: ninguna barra se sale de su grafico', () => {
    expect(alturaDeNivel(100, 75)).toBe(100);
    expect(alturaDeNivel(0, 75)).toBe(0);
    expect(alturaDeNivel(NaN, 75)).toBe(0);
  });

  it('el tramo de color reproduce la rampa de cuatro pasos de pyrBars', () => {
    // 30/45/60/75 sobre pico 75 -> 40/60/80/100% -> tramos 1/2/3/4, que en el
    // mockup son #52290F, #8A3D0B, #C85510 y #FF6317.
    expect(PIRAMIDE_MEDIA.map((n) => tramoDeNivel(n, 75))).toEqual([1, 2, 3, 4, 3, 2, 1]);
  });
});
