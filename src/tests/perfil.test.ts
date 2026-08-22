/**
 * CA-01, CA-02, P-01…P-03: la aritmetica de calculadoras, perfil y medidas.
 *
 * Los valores esperados salen del mockup (`calInputs`, `medidas`, `perimetros`
 * y las cifras dibujadas en CA-01/CA-02/P-03), no de volver a llamar a la
 * funcion que se esta probando.
 */
import { describe, it, expect } from 'vitest';
import {
  GRASA_ESCALA_MAX,
  GRASA_VERDE_HASTA,
  anchoDeCambio,
  cambioDePerimetros,
  cuantasMedidas,
  etiquetaDeExtremo,
  grasaNavy,
  hayMedicionDeHoy,
  ordenadas,
  pieDePerimetros,
  polilineaDe,
  posicionGrasa,
  resumenDeMediciones,
  serieDeMedidas,
  ultimaMedida,
  zonaDeGrasa,
} from '@/utils/perfil-calc';
import { calculate1RM, calculateCalories, calculateProgressive } from '@/utils/calculations';
import type { BodyMeasurement } from '@/types';

const dia = (iso: string, extra: Partial<BodyMeasurement> = {}): BodyMeasurement =>
  ({ date: iso, ...extra }) as BodyMeasurement;

describe('CA-02 · calorias (Mifflin-St Jeor)', () => {
  // El mockup: 28 años, masculino, 75 kg, 176 cm, actividad moderada (1.55).
  it('reproduce las cuatro cifras que dibuja CA-02', () => {
    const r = calculateCalories(28, 'male', 75, 176, 1.55);
    expect(r.bmr).toBe(1715);
    expect(r.tdee).toBe(2658);
    // 2,126, NO 2,127: sale del TDEE ya redondeado, que es la cifra de arriba.
    expect(r.deficit).toBe(2126);
    expect(r.surplus).toBe(3190);
  });

  it('el deficit y el superavit son coherentes con el TDEE que se enseña', () => {
    // La propiedad, no el caso: el usuario tiene que poder rehacer la cuenta
    // con la cifra que tiene delante.
    for (const [edad, peso, altura, act] of [
      [22, 60, 165, 1.2],
      [35, 92, 183, 1.725],
      [48, 71, 158, 1.9],
    ] as const) {
      const r = calculateCalories(edad, 'female', peso, altura, act);
      expect(r.deficit).toBe(Math.round(r.tdee * 0.8));
      expect(r.surplus).toBe(Math.round(r.tdee * 1.2));
    }
  });
});

describe('CA-01 · las dos calculadoras no pueden discrepar', () => {
  it('el progresivo cae al historial cuando no hay tabla de PRs', () => {
    // Pasa de verdad con un CSV importado: trae las sesiones y no reescribe
    // los PRs. `calculate1RM` daba su cifra y el progresivo decia "todavia no
    // tiene récord" del MISMO ejercicio, en la misma pantalla.
    const hist = [
      {
        sessionId: 'w1',
        date: '2026-08-10T12:00:00',
        savedAt: '2026-08-10T12:00:00',
        grupo: 'Pecho',
        type: 'weights',
        volumenTotal: 1920,
        volumenPorGrupo: { Pecho: 1920 },
        ejercicios: [
          {
            nombre: 'Press Banca',
            sets: 4,
            reps: 8,
            peso: 60,
            volumen: 1920,
            completado: true,
            esMancuerna: false,
            grupoMuscular: 'Pecho',
          },
        ],
      },
    ];
    localStorage.setItem('gymmate_history', JSON.stringify(hist));
    localStorage.removeItem('gymmate_prs');

    expect(calculate1RM('Press Banca')).not.toBeNull();
    const prog = calculateProgressive('Press Banca');
    expect(prog).not.toBeNull();
    expect(prog?.current).toBe(60);
    // Tren superior: 60 x1.025 / x1.05 / x1.075, techo a multiplos de 2.5.
    // Moderado y Agresivo caian los dos en 65: tres rotulos distintos con la
    // misma cifra. Los porcentajes son internos; lo que el usuario lee es
    // "Conservador / Moderado / Agresivo", y tienen que ser tres pesos.
    expect(prog?.conservative).toBe('62.5');
    expect(prog?.moderate).toBe('65.0');
    expect(prog?.aggressive).toBe('67.5');
    expect(prog?.exerciseType).toBe('Tren Superior');
    localStorage.clear();
  });

  it('las tres opciones son SIEMPRE tres pesos distintos y crecientes', () => {
    // Con PR bajo el redondeo a 2.5 las colapsaba: "Curl con Barra PR 20" daba
    // 22.5 / 22.5 / 22.5 bajo tres rotulos distintos.
    for (const pr of Array.from({ length: 160 }, (_, i) => (i + 1) * 2.5)) {
      for (const grupo of ['Pecho', 'Piernas'] as const) {
        localStorage.setItem(
          'gymmate_prs',
          JSON.stringify({ X: { peso: pr, sets: 3, reps: 8, volumen: pr * 24, date: '2026-08-10' } })
        );
        localStorage.setItem(
          'gymmate_history',
          JSON.stringify([
            {
              sessionId: 'w', date: '2026-08-10T12:00:00', savedAt: '2026-08-10T12:00:00',
              grupo, type: 'weights', volumenTotal: 0, volumenPorGrupo: {},
              ejercicios: [{ nombre: 'X', sets: 3, reps: 8, peso: pr, volumen: pr * 24,
                completado: true, esMancuerna: false, grupoMuscular: grupo }],
            },
          ])
        );
        const r = calculateProgressive('X');
        const [c, m, a] = [r!.conservative, r!.moderate, r!.aggressive].map(Number);
        expect(c).toBeLessThan(m);
        expect(m).toBeLessThan(a);
        // Y ninguna se sale del multiplo de 2.5 por basura binaria.
        for (const v of [c, m, a]) expect(Math.abs(v / 2.5 - Math.round(v / 2.5))).toBeLessThan(1e-9);
      }
    }
    localStorage.clear();
  });

  it('el +10% de tren inferior no salta un escalon por coma flotante', () => {
    // `100 x 1.1` da 110.00000000000001 en doble y `Math.ceil` a 2.5 lo subia a
    // 112.5, o sea +12.5% bajo un rotulo que dice +10%.
    localStorage.setItem(
      'gymmate_prs',
      JSON.stringify({ Sentadilla: { peso: 100, sets: 3, reps: 8, volumen: 2400, date: '2026-08-10' } })
    );
    localStorage.setItem('gymmate_history', JSON.stringify([]));
    expect(calculateProgressive('Sentadilla')?.aggressive).toBe('110.0');
    localStorage.clear();
  });

  it('clasifica por grupo muscular real, no por keywords del nombre', () => {
    // "RDL / Peso Muerto Rumano" no lleva ninguna palabra de pierna y es tren
    // inferior; con keywords caia en tren superior.
    const hist = [
      {
        sessionId: 'w1',
        date: '2026-08-10T12:00:00',
        savedAt: '2026-08-10T12:00:00',
        grupo: 'Piernas',
        type: 'weights',
        volumenTotal: 2100,
        volumenPorGrupo: { Glúteos: 2100 },
        ejercicios: [
          {
            nombre: 'RDL / Peso Muerto Rumano',
            sets: 3,
            reps: 10,
            peso: 70,
            volumen: 2100,
            completado: true,
            esMancuerna: false,
            grupoMuscular: 'Glúteos',
          },
        ],
      },
    ];
    localStorage.setItem('gymmate_history', JSON.stringify(hist));
    localStorage.removeItem('gymmate_prs');
    expect(calculateProgressive('RDL / Peso Muerto Rumano')?.exerciseType).toBe('Tren Inferior');
    localStorage.clear();
  });
});

describe('% grasa Navy', () => {
  it('aplica la formula del US Navy, rederivada a mano', () => {
    // 495/(1.0324 - 0.19077·log10(82-38) + 0.15456·log10(176)) - 450 = 14.38
    expect(grasaNavy({ waist: 82, neck: 38 }, 176, 'male')).toBeCloseTo(14.4, 1);
  });

  it('la formula femenina usa la cadera y da un numero POSIBLE', () => {
    // La aproximacion lineal que habia antes devolvia 52.2 % para esta mujer.
    expect(grasaNavy({ waist: 70, neck: 32, hips: 96 }, 165, 'female')).toBeCloseTo(25.4, 1);
    expect(grasaNavy({ waist: 80, neck: 34, hips: 100 }, 170, 'female')).toBeCloseTo(30.1, 1);
  });

  it('ninguna combinacion razonable devuelve un porcentaje imposible', () => {
    // Barrido: el defecto viejo solo aparecia al cruzar varias dimensiones.
    for (const altura of [150, 165, 180, 195]) {
      for (const cuello of [30, 34, 40, 45]) {
        for (const cintura of [60, 75, 90, 110]) {
          for (const cadera of [85, 95, 110]) {
            for (const genero of ['male', 'female'] as const) {
              const v = grasaNavy({ waist: cintura, neck: cuello, hips: cadera }, altura, genero);
              if (v !== null) {
                expect(v).toBeGreaterThan(0);
                expect(v).toBeLessThan(60);
              }
            }
          }
        }
      }
    }
  });

  it('media medicion no da media respuesta', () => {
    expect(grasaNavy({ waist: 82 }, 176, 'male')).toBeNull();
    expect(grasaNavy({ neck: 38 }, 176, 'male')).toBeNull();
    expect(grasaNavy({ waist: 82, neck: 38 }, 0, 'male')).toBeNull();
    // Cintura menor que el cuello: log10 de un negativo.
    expect(grasaNavy({ waist: 30, neck: 38 }, 176, 'male')).toBeNull();
    // Mujer sin cadera: la formula la necesita.
    expect(grasaNavy({ waist: 70, neck: 32 }, 165, 'female')).toBeNull();
  });

  it('no devuelve un porcentaje imposible', () => {
    expect(grasaNavy({ waist: 200, neck: 20 }, 140, 'male')).toBeNull();
  });
});

describe('la barra de % grasa', () => {
  it('sitúa el 18.4% donde el mockup pone el marcador', () => {
    // El mockup: left:52%. 18.4 / 35 = 52.57%.
    expect(posicionGrasa(18.4)).toBeCloseTo(52.57, 1);
  });

  it('el corte verde/ambar es el 14 del pie de P-03', () => {
    expect(GRASA_VERDE_HASTA).toBe(14);
    expect(GRASA_ESCALA_MAX).toBe(35);
    expect(zonaDeGrasa(13.9)).toBe('verde');
    expect(zonaDeGrasa(14)).toBe('ambar');
    expect(zonaDeGrasa(18.4)).toBe('ambar');
    expect(zonaDeGrasa(24.4)).toBe('ambar');
    expect(zonaDeGrasa(24.5)).toBe('roja');
  });

  it('se acota a la pista: nada se sale por los extremos', () => {
    expect(posicionGrasa(0)).toBe(0);
    expect(posicionGrasa(90)).toBe(100);
    expect(posicionGrasa(-5)).toBe(0);
    expect(posicionGrasa(NaN)).toBe(0);
  });
});

describe('P-03 · perimetros', () => {
  const seis = [
    dia('2026-02-11T12:00:00', { chest: 96, waist: 85, armRight: 34.5, thighRight: 55.5 }),
    dia('2026-08-10T12:00:00', { chest: 98, waist: 82, armRight: 36, thighRight: 58 }),
  ];

  it('el ancho reproduce tres de las cuatro filas del mockup', () => {
    // pyrBars analogo: +2 -> 22%, -3 -> 30%, +2.5 -> 26%.
    expect(anchoDeCambio(2)).toBe(22);
    expect(anchoDeCambio(-3)).toBe(30);
    expect(anchoDeCambio(2.5)).toBe(26);
  });

  it('sin cambio no hay barra, y el ancho esta acotado', () => {
    expect(anchoDeCambio(0)).toBe(0);
    expect(anchoDeCambio(100)).toBe(46);
    expect(anchoDeCambio(NaN)).toBe(0);
  });

  it('calcula el cambio entre la primera y la ultima medicion', () => {
    const c = cambioDePerimetros(seis);
    expect(c.map((x) => x.nombre)).toEqual(['Pecho', 'Cintura', 'Brazo', 'Muslo']);
    expect(c.map((x) => x.delta)).toEqual([2, -3, 1.5, 2.5]);
  });

  it('bajar de cintura es deseable; subir, no', () => {
    const c = cambioDePerimetros(seis);
    expect(c.find((x) => x.nombre === 'Cintura')?.deseable).toBe(true);
    expect(c.find((x) => x.nombre === 'Cintura')?.hacia).toBe('izquierda');
    expect(c.find((x) => x.nombre === 'Pecho')?.deseable).toBe(true);
    expect(c.find((x) => x.nombre === 'Pecho')?.hacia).toBe('derecha');

    const alReves = cambioDePerimetros([
      dia('2026-02-11T12:00:00', { waist: 80 }),
      dia('2026-08-10T12:00:00', { waist: 88 }),
    ]);
    expect(alReves[0].deseable).toBe(false);
  });

  it('con una sola medicion no inventa un cambio de cero', () => {
    expect(cambioDePerimetros([seis[0]])).toEqual([]);
    expect(cambioDePerimetros([])).toEqual([]);
  });

  it('el pie es una afirmacion generada, no una cadena fija', () => {
    // Con los datos del mockup dice lo que el mockup dice: nombra las
    // EXTREMIDADES, no el pecho, aunque el pecho tambien crezca.
    expect(pieDePerimetros(cambioDePerimetros(seis))).toBe(
      'Brazo y muslo creciendo, cintura bajando — el par que quieres ver junto.'
    );
    // Y con datos que NO lo sostienen, no lo dice.
    const subiendo = cambioDePerimetros([
      dia('2026-02-11T12:00:00', { chest: 96, waist: 80, armRight: 34, thighRight: 55 }),
      dia('2026-08-10T12:00:00', { chest: 96, waist: 88, armRight: 34, thighRight: 55 }),
    ]);
    expect(pieDePerimetros(subiendo)).not.toContain('cintura bajando');
  });

  it('con la cintura SUBIENDO no dice que se mantiene', () => {
    // El caso anterior no tocaba esta rama: al no crecer ni brazo ni muslo la
    // funcion devolvia '' y la asercion pasaba sin comprobar nada. Con la
    // cintura +10 el pie decia "la cintura se mantiene" justo encima de la
    // fila que dice +10.
    const pie = pieDePerimetros(
      cambioDePerimetros([
        dia('2026-02-11T12:00:00', { waist: 80, armRight: 35, thighRight: 56 }),
        dia('2026-08-10T12:00:00', { waist: 90, armRight: 37, thighRight: 58 }),
      ])
    );
    expect(pie).not.toContain('se mantiene');
    expect(pie).not.toContain('bajando');
    expect(pie).toContain('cintura');
  });

  it('sin dato de cintura no afirma nada SOBRE la cintura', () => {
    const pie = pieDePerimetros(
      cambioDePerimetros([
        dia('2026-02-11T12:00:00', { armRight: 35, thighRight: 56 }),
        dia('2026-08-10T12:00:00', { armRight: 37, thighRight: 58 }),
      ])
    );
    expect(pie).not.toContain('cintura');
  });
});

describe('orden y series de medidas', () => {
  const desordenadas = [
    dia('2026-03-01T12:00:00', { weight: 76 }),
    dia('2026-08-10T12:00:00', { weight: 75 }),
    dia('2026-02-11T12:00:00', { weight: 77.4 }),
  ];

  it('la ultima es la mas reciente por FECHA, no por posicion', () => {
    // Un CSV importado puede llegar en cualquier orden.
    expect(ultimaMedida(desordenadas)?.weight).toBe(75);
    expect(ordenadas(desordenadas).map((m) => m.weight)).toEqual([75, 76, 77.4]);
    expect(ultimaMedida([])).toBeNull();
  });

  it('la serie va de vieja a nueva y encaja en su viewBox', () => {
    const s = serieDeMedidas(desordenadas, (m) => m.weight, 80);
    expect(s.map((p) => p.valor)).toEqual([77.4, 76, 75]);
    expect(s[0].x).toBe(10);
    expect(s[s.length - 1].x).toBe(310);
    for (const p of s) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(80);
    }
    // El maximo arriba (y menor) y el minimo abajo.
    expect(s[0].y).toBe(0);
    expect(s[2].y).toBe(80);
  });

  it('una serie plana no divide por cero ni se pega al borde', () => {
    const plana = serieDeMedidas(
      [dia('2026-01-01T12:00:00', { weight: 70 }), dia('2026-02-01T12:00:00', { weight: 70 })],
      (m) => m.weight,
      80
    );
    expect(plana.every((p) => p.y === 40)).toBe(true);
  });

  it('sin datos no dibuja una linea en el suelo', () => {
    expect(serieDeMedidas([], (m) => m.weight, 80)).toEqual([]);
    expect(serieDeMedidas(desordenadas, () => null, 80)).toEqual([]);
    expect(polilineaDe([])).toBe('');
  });
});

describe('rotulos de P-03', () => {
  it('el extremo lleva mes y valor', () => {
    expect(etiquetaDeExtremo('2026-02-11T12:00:00', 77.4)).toBe('FEB · 77.4');
  });

  it('sin medicion no rotula nada', () => {
    expect(etiquetaDeExtremo(undefined, 77.4)).toBe('');
    expect(etiquetaDeExtremo('2026-02-11T12:00:00', null)).toBe('');
  });

  it('el mes y el valor salen del MISMO punto de la serie', () => {
    // La medicion mas antigua no tiene cuello, asi que no entra en la serie de
    // grasa. El rotulo tomaba el mes de esa (FEB) y el valor de la primera que
    // SI entra (may): dos mitades de fechas distintas.
    const conHueco = [
      dia('2026-02-11T12:00:00', { weight: 78, waist: 88 }),
      dia('2026-05-10T12:00:00', { weight: 76, waist: 84, neck: 38 }),
      dia('2026-08-10T12:00:00', { weight: 75, waist: 82, neck: 38 }),
    ];
    const serie = serieDeMedidas(
      conHueco,
      (m) => grasaNavy(m, 176, 'male'),
      54
    );
    expect(serie).toHaveLength(2);
    expect(etiquetaDeExtremo(serie[0].fecha, serie[0].valor)).toMatch(/^MAY · /);
  });

  it('el resumen no escribe un cero cuando no hay mediciones', () => {
    expect(resumenDeMediciones([])).toBe('');
    expect(resumenDeMediciones([dia('2026-02-11T12:00:00')])).toBe('1 medición · desde feb');
    expect(resumenDeMediciones([dia('2026-02-11T12:00:00'), dia('2026-08-10T12:00:00')])).toBe(
      '2 mediciones · desde feb'
    );
  });

  it('cuenta las medidas de un registro sin contar la fecha', () => {
    expect(cuantasMedidas(dia('2026-08-10T12:00:00', { weight: 75, chest: 98, waist: 82 }))).toBe(3);
    expect(cuantasMedidas(dia('2026-08-10T12:00:00'))).toBe(0);
  });
});

describe('una medicion por dia LOCAL', () => {
  it('reconoce la de hoy aunque sea de noche', () => {
    // 22:00 hora local: en UTC ya es el dia siguiente. El bug original hacia
    // que la medicion de la noche no sobrescribiera la de la mañana.
    const anoche = new Date();
    anoche.setHours(22, 0, 0, 0);
    expect(hayMedicionDeHoy([dia(anoche.toISOString())])).toBe(true);
  });

  it('y no confunde la de ayer con la de hoy', () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    ayer.setHours(12, 0, 0, 0);
    expect(hayMedicionDeHoy([dia(ayer.toISOString())])).toBe(false);
    expect(hayMedicionDeHoy([])).toBe(false);
  });
});
