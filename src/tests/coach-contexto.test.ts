import { describe, it, expect, beforeEach } from 'vitest';
import { contextoCompleto, MESES_DE_CONTEXTO } from '@/features/coach-ia';
import { calculate1RM } from '@/utils/calculations';
import { initGamification, getStreakInfo } from '@/features/gamification';
import { saveHistory, savePRs } from '@/utils/storage';
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

/** Una sesion en una fecha EXACTA, sin contar dias hacia atras. */
function sesionEn(fecha: Date): HistorySession {
  return {
    sessionId: `s_${fecha.getTime()}`,
    date: fecha.toISOString(),
    savedAt: fecha.toISOString(),
    grupo: 'Pecho',
    type: 'weights',
    volumenTotal: 2400,
    volumenPorGrupo: { Pecho: 2400 },
    ejercicios: [
      {
        nombre: 'Press Banca', sets: 3, reps: 8, peso: 100, volumen: 2400,
        completado: true, esMancuerna: false, grupoMuscular: 'Pecho',
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
    // Antes usaba 360 y 372, o sea toleraba SEIS dias de corrimiento del
    // corte sin protestar.
    //
    // Y contar dias con `Math.round((hoy - corte) / 86400000)` era inestable:
    // da 365 por la mañana y 366 por la tarde, asi que el test pasaba o
    // fallaba segun la hora a la que se corriera la puerta. Aqui las fechas se
    // construyen desde el corte, sin contar dias.
    const hoy = new Date();
    const corte = new Date(hoy.getFullYear(), hoy.getMonth() - 12, hoy.getDate());
    const enFecha = (d: Date) => sesionEn(new Date(d));

    const dentro = new Date(corte);
    dentro.setHours(0, 1, 0, 0);
    expect(contextoCompleto([enFecha(dentro)])?.resumen.sesiones).toBe(1);

    const fuera = new Date(corte);
    fuera.setHours(-1, 0, 0, 0); // las 23:00 del dia anterior al corte
    expect(contextoCompleto([enFecha(fuera)])).toBeNull();
  });

  it('el dia del limite entra ENTERO, tambien lo entrenado por la mañana', () => {
    // Con el corte a mediodia, lo de la mañana del dia limite quedaba fuera y
    // lo de la tarde dentro. Y `parseSpanishDate` guarda toda sesion
    // importada de CSV a las 07:00 de Lima, asi que toda sesion importada que
    // cayera ese dia desaparecia del contexto, siempre.
    const hoy = new Date();
    const corte = new Date(hoy.getFullYear(), hoy.getMonth() - 12, hoy.getDate());
    const manana = new Date(corte.getFullYear(), corte.getMonth(), corte.getDate(), 9, 0);
    expect(contextoCompleto([sesionEn(manana)])?.resumen.sesiones).toBe(1);
  });

  it('la ventana es la declarada, no otra', () => {
    expect(MESES_DE_CONTEXTO).toBe(12);
  });
});

describe('contextoCompleto · el panorama no contradice a la pantalla', () => {
  it('el 1RM historico es EL MISMO que enseña la pantalla RECORDS', () => {
    // Antes esto llamaba a `unaRepMaxPromedio(100, 12)` —la misma funcion con
    // los mismos argumentos que el codigo bajo prueba— asi que no podia
    // fallar aunque PR-01 dijera otra cosa. Y decia otra cosa: con el pico
    // fuera de las tres ultimas sesiones, 137 contra 127.
    const hist = [
      sesion('Press Banca', 100, 12, 3),
      sesion('Press Banca', 100, 12, 10),
      sesion('Press Banca', 100, 12, 17),
      sesion('Press Banca', 120, 2, 45),
    ];
    saveHistory(hist);
    const pantalla = calculate1RM('Press Banca');
    const fila = contextoCompleto(hist)?.panorama[0];
    expect(fila?.unaRepMaxHistorico).toBe(Math.round(Number(pantalla?.average)));
  });

  it('y la cifra "de ahora" es distinta a la de la pantalla, a proposito', () => {
    // Las dos son legitimas: la pantalla estima sobre la mejor serie de
    // siempre y el coach sobre lo que estas moviendo. Lo que no puede pasar
    // es que viajen las dos con la misma etiqueta.
    const hist = [
      sesion('Press Banca', 100, 12, 3),
      sesion('Press Banca', 100, 12, 10),
      sesion('Press Banca', 100, 12, 17),
      sesion('Press Banca', 120, 2, 45),
    ];
    saveHistory(hist);
    const fila = contextoCompleto(hist)?.panorama[0];
    expect(fila?.unaRepMax).toBe(137);
    expect(fila?.unaRepMaxHistorico).toBe(127);
  });

  it('usa las reps de la serie ACTUAL, no las del pico', () => {
    // Mutante que sobrevivia: tomar las reps del pico historico y
    // multiplicarlas por el peso actual. Con 120x2 y 100x12 daba 107 donde lo
    // correcto es 137.
    const hist = [
      sesion('Press Banca', 100, 12, 3),
      sesion('Press Banca', 100, 12, 10),
      sesion('Press Banca', 100, 12, 17),
      sesion('Press Banca', 120, 2, 45),
    ];
    const fila = contextoCompleto(hist)?.panorama[0];
    expect(fila?.unaRepMax).not.toBe(107);
    expect(fila?.actual).toBe(100);
  });

  it('el pico tiene en cuenta el record guardado, no solo el historial', () => {
    // Mutante que sobrevivia: ignorar `getPRs()`. Un PR importado de CSV sin
    // su sesion quedaba invisible y el ejercicio salia en zona verde.
    savePRs({ 'Press Banca': { peso: 200, reps: 1, fecha: '2026-01-01' } } as never);
    const fila = contextoCompleto([sesion('Press Banca', 100, 8, 3)])?.panorama[0];
    expect(fila?.pico).toBe(200);
  });

  it('cuenta las sesiones estancado, que es lo que el mockup enseña', () => {
    // Mutante que sobrevivia: devolver siempre 0.
    const hist = [
      sesion('Press Banca', 100, 8, 3),
      sesion('Press Banca', 100, 8, 10),
      sesion('Press Banca', 100, 8, 17),
      sesion('Press Banca', 120, 2, 45),
    ];
    expect(contextoCompleto(hist)?.panorama[0].sesionesEstancado).toBe(3);
  });

  it('la zona y la posicion salen del ratio, no de una constante', () => {
    // Dos mutantes que sobrevivian: zona siempre verde, posicion siempre 0.
    const bajo = contextoCompleto([
      sesion('Press Banca', 50, 8, 3), sesion('Press Banca', 50, 8, 10),
      sesion('Press Banca', 50, 8, 17), sesion('Press Banca', 120, 2, 45),
    ])?.panorama[0];
    const alto = contextoCompleto([sesion('Sentadilla', 120, 5, 3)])?.panorama[0];
    expect(bajo?.zona).toBe('roja');
    expect(alto?.zona).toBe('verde');
    expect(bajo?.posicion).toBeGreaterThan(0);
    expect(bajo?.posicion).toBeLessThan(alto?.posicion as number);
  });

  it('mas de 15 reps: no se estima, igual que hace CA-01', () => {
    // Caia en `estimateOneRM`, que es Epley a secas: 20 reps daban 33 kg
    // donde la calculadora se niega a estimar. Series de 20 son normales en
    // gemelos y abdominales.
    const fila = contextoCompleto([sesion('Gemelos', 20, 20, 3)])?.panorama[0];
    expect(fila?.estimable).toBe(false);
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

  it('la racha actual y la mejor no salen intercambiadas', () => {
    // Mutante que sobrevivia: cambiarlas de sitio. Nadie lo veia.
    // Con sesiones reales en dias consecutivos, no sembrando el estado a mano:
    // la racha se rederiva del historial y sembrarla suelto la pisa.
    const hist = [sesion('Press Banca', 100, 8, 0), sesion('Press Banca', 100, 8, 1),
                  sesion('Press Banca', 100, 8, 2)];
    localStorage.setItem('gymmate_history', JSON.stringify(hist));
    initGamification();
    const r = contextoCompleto(hist)?.resumen;
    // Mutante que sobrevivia: intercambiar las dos. Con valores distintos, no.
    expect(r?.racha).toBe(3);
    expect(r?.mejorRacha).toBeGreaterThanOrEqual(3);
    expect(r?.racha).toBe(getStreakInfo().current);
    expect(r?.mejorRacha).toBe(getStreakInfo().best);
  });

  it('desde y hasta no salen intercambiados', () => {
    // Mutante que sobrevivia: cambiarlos de sitio.
    const hist = [sesion('Press Banca', 100, 8, 5), sesion('Press Banca', 100, 8, 200)];
    const r = contextoCompleto(hist)?.resumen;
    expect(r!.desde! < r!.hasta!).toBe(true);
  });

  it('el panorama va del ejercicio mas frecuente al menos', () => {
    // Mutante que sobrevivia: invertir el orden. Con el año entero delante,
    // lo primero que lee el modelo tiene que ser lo que mas entrena.
    const hist = [
      sesion('Press Banca', 100, 8, 2), sesion('Press Banca', 100, 8, 9),
      sesion('Press Banca', 100, 8, 16), sesion('Curl', 20, 10, 4, 'Brazo'),
    ];
    expect(contextoCompleto(hist)?.panorama.map((e) => e.ejercicio)).toEqual(['Press Banca', 'Curl']);
  });

  it('el peso corporal viaja de verdad cuando esta registrado', () => {
    // Mutante que sobrevivia: mandar siempre null.
    localStorage.setItem('gymmate_body_measurements', JSON.stringify([
      { date: '2026-08-01', weight: 78.4, bodyFat: 14.42 },
    ]));
    const r = contextoCompleto([sesion('Press Banca', 100, 8, 3)])?.resumen;
    expect(r?.pesoCorporal).toBe(78.4);
    expect(r?.grasaCorporal).toBe(14.4);
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
