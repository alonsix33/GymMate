/**
 * HI-01…G-01: la aritmetica de las pantallas Hueso.
 *
 * Cada caso es una cifra que el usuario lee. Si cambia, la pantalla miente.
 */
import { describe, it, expect } from 'vitest';
import {
  zonaDe,
  posicionEnZonas,
  sesionesCon,
  pesoActual,
  picoDe,
  sesionesSinSubir,
  estadoDeZona,
  distribucionMuscular,
  mediaMovil,
  polilinea,
  serieDeVolumen,
  tituloDeMes,
  claveDeMes,
  ZONA_ROJA_HASTA,
  ZONA_AMBAR_HASTA,
  SESIONES_ACTUAL,
} from '@/utils/zonas';
import type { HistorySession } from '@/types';

const EJ = (nombre: string, peso: number, sets = 4, reps = 12) => ({
  nombre,
  esMancuerna: false,
  grupoMuscular: 'Piernas' as const,
  sets,
  reps,
  peso,
  volumen: sets * reps * peso,
  completado: true,
});

function sesion(dias: number, ejercicios: ReturnType<typeof EJ>[], extra: Partial<HistorySession> = {}): HistorySession {
  const hoy = new Date();
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias, 19, 0);
  const volumenTotal = ejercicios.reduce((t, e) => t + e.volumen, 0);
  return {
    date: d.toISOString(),
    savedAt: d.toISOString(),
    grupo: 'GRUPO 1 - Piernas + Glúteos',
    ejercicios,
    volumenTotal,
    volumenPorGrupo: { Piernas: volumenTotal },
    ...extra,
  } as HistorySession;
}

describe('zonaDe', () => {
  it('las fronteras son las del README, no las que diga el codigo', () => {
    // Escritas a mano a proposito: comparar contra las propias constantes
    // hacia que cambiarlas no rompiera nada, y el chequeo no podia fallar.
    expect(ZONA_ROJA_HASTA).toBe(0.7);
    expect(ZONA_AMBAR_HASTA).toBe(0.95);
  });

  it('parte donde manda el README: <70 roja, 70-95 ambar, 95+ verde', () => {
    expect(zonaDe(0)).toBe('roja');
    expect(zonaDe(0.699)).toBe('roja');
    expect(zonaDe(0.7)).toBe('ambar');
    expect(zonaDe(0.949)).toBe('ambar');
    expect(zonaDe(0.95)).toBe('verde');
    expect(zonaDe(1.4)).toBe('verde');
  });
});

describe('posicionEnZonas', () => {
  it('el marcador nunca se sale de la barra', () => {
    expect(posicionEnZonas(-0.5)).toBe(0);
    expect(posicionEnZonas(0)).toBe(0);
    expect(posicionEnZonas(0.8)).toBeCloseTo(80, 5);
    expect(posicionEnZonas(1)).toBe(100);
    // Superar el pico satura en el borde, no lo desborda.
    expect(posicionEnZonas(1.6)).toBe(100);
  });
});

describe('pesoActual y picoDe', () => {
  const historial = [
    sesion(1, [EJ('Prensa', 120)]),
    sesion(4, [EJ('Prensa', 115)]),
    sesion(8, [EJ('Prensa', 110)]),
    sesion(30, [EJ('Prensa', 150)]), // el pico, fuera de las 3 ultimas
  ];

  it('el actual mira solo las ultimas 3 sesiones CON ese ejercicio', () => {
    expect(SESIONES_ACTUAL).toBe(3);
    expect(pesoActual('Prensa', historial)).toBe(120);
  });

  it('el pico mira todo el historial', () => {
    expect(picoDe('Prensa', historial)).toBe(150);
  });

  it('"3 sesiones" son sesiones con el ejercicio, no dias de calendario', () => {
    const conHuecos = [
      sesion(1, [EJ('Otro', 50)]),
      sesion(2, [EJ('Otro', 50)]),
      sesion(3, [EJ('Prensa', 100)]),
      sesion(4, [EJ('Prensa', 90)]),
      sesion(5, [EJ('Prensa', 80)]),
      sesion(6, [EJ('Prensa', 200)]),
    ];
    // Las tres con Prensa son 100, 90 y 80: la de 200 queda fuera.
    expect(pesoActual('Prensa', conHuecos)).toBe(100);
  });

  it('null cuando el ejercicio no aparece', () => {
    expect(pesoActual('Hip Thrust', historial)).toBeNull();
    expect(picoDe('Hip Thrust', historial)).toBeNull();
  });

  it('una aparicion con volumen 0 no cuenta: estaba en la lista, no se hizo', () => {
    const conVacia = [sesion(0, [EJ('Prensa', 300, 0, 0)]), ...historial];
    expect(pesoActual('Prensa', conVacia)).toBe(120);
  });

  it('el cardio no aporta ejercicios de pesas', () => {
    const conCardio = [sesion(0, [], { type: 'cardio' }), ...historial];
    expect(sesionesCon('Prensa', conCardio).length).toBe(4);
  });
});

describe('sesionesSinSubir', () => {
  it('cuenta las sesiones seguidas POR DEBAJO del pico', () => {
    // Pico 120 hace cuatro sesiones; las tres ultimas van a 100.
    const h = [
      sesion(1, [EJ('Prensa', 100)]),
      sesion(3, [EJ('Prensa', 100)]),
      sesion(5, [EJ('Prensa', 100)]),
      sesion(7, [EJ('Prensa', 120)]),
    ];
    expect(sesionesSinSubir('Prensa', h)).toBe(3);
  });

  it('no cuenta la sesion del pico: no se esta estancado EN el pico', () => {
    const h = [sesion(1, [EJ('Prensa', 100)]), sesion(3, [EJ('Prensa', 90)])];
    expect(sesionesSinSubir('Prensa', h)).toBe(0);
  });

  it('repetir peso estando en el pico no es estancarse', () => {
    const h = [
      sesion(1, [EJ('Prensa', 100)]),
      sesion(3, [EJ('Prensa', 100)]),
      sesion(5, [EJ('Prensa', 90)]),
    ];
    expect(sesionesSinSubir('Prensa', h)).toBe(0);
  });

  it('con una sola sesion no hay racha que contar', () => {
    expect(sesionesSinSubir('Prensa', [sesion(1, [EJ('Prensa', 100)])])).toBe(0);
  });

  it('un pico externo mas alto convierte el pico local en estancamiento', () => {
    const h = [sesion(1, [EJ('Prensa', 100)]), sesion(3, [EJ('Prensa', 100)])];
    expect(sesionesSinSubir('Prensa', h)).toBe(0);
    expect(sesionesSinSubir('Prensa', h, 150)).toBe(2);
  });
});

describe('estadoDeZona', () => {
  it('en el pico lo dice', () => {
    const h = [sesion(1, [EJ('Prensa', 100)]), sesion(3, [EJ('Prensa', 90)])];
    expect(estadoDeZona('Prensa', h)).toBe('EN TU PICO');
  });

  it('estancado a partir de 3 sesiones sin subir', () => {
    const h = [
      sesion(1, [EJ('Prensa', 100)]),
      sesion(3, [EJ('Prensa', 100)]),
      sesion(5, [EJ('Prensa', 100)]),
      sesion(7, [EJ('Prensa', 120)]),
    ];
    expect(estadoDeZona('Prensa', h)).toBe('ESTANCADO 3 SESIONES');
  });

  it('un pico externo manda sobre el del historial', () => {
    const h = [sesion(1, [EJ('Prensa', 100)])];
    expect(estadoDeZona('Prensa', h)).toBe('EN TU PICO');
    expect(estadoDeZona('Prensa', h, 150)).toBe('POR DEBAJO DEL PICO');
  });

  it('sin datos no inventa un estado', () => {
    expect(estadoDeZona('Hip Thrust', [])).toBe('SIN DATOS');
  });
});

describe('distribucionMuscular', () => {
  it('suma el volumen por grupo y da porcentajes que suman 100', () => {
    const h = [
      sesion(1, [], { volumenPorGrupo: { Piernas: 700, Glúteos: 300 }, volumenTotal: 1000 }),
      sesion(3, [], { volumenPorGrupo: { Piernas: 300 }, volumenTotal: 300 }),
    ];
    const d = distribucionMuscular(h);
    expect(d.map((x) => x.musculo)).toEqual(['Piernas', 'Glúteos']);
    expect(d[0].volumen).toBe(1000);
    expect(d[1].volumen).toBe(300);
    expect(d.reduce((t, x) => t + x.porcentaje, 0)).toBeCloseTo(100, 5);
  });

  it('el cardio no entra en la distribucion de kg', () => {
    const h = [sesion(1, [], { type: 'cardio', volumenPorGrupo: { Piernas: 9999 } })];
    expect(distribucionMuscular(h)).toEqual([]);
  });

  it('sin volumen devuelve lista vacia, no una fila de 0%', () => {
    expect(distribucionMuscular([])).toEqual([]);
  });
});

describe('mediaMovil', () => {
  it('los primeros puntos sin ventana completa quedan en null', () => {
    expect(mediaMovil([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('con menos puntos que ventana no hay media', () => {
    expect(mediaMovil([1, 2], 5)).toEqual([null, null]);
  });
});

describe('polilinea', () => {
  it('el maximo toca el aire de arriba y el 0 el de abajo', () => {
    const p = polilinea([0, 100], 100, 320, 110, 5);
    expect(p).toBe('0.0,105.0 320.0,5.0');
  });

  it('salta los null de la media movil sin dejar huecos en la cadena', () => {
    const p = polilinea([null, 50, 100], 100, 200, 100, 0);
    expect(p).toBe('100.0,50.0 200.0,0.0');
  });

  it('un solo punto va al centro, no al borde', () => {
    expect(polilinea([50], 100, 320, 110, 5)).toBe('160.0,55.0');
  });

  it('sin maximo no dibuja nada en vez de dividir por cero', () => {
    expect(polilinea([0, 0], 0)).toBe('');
  });
});

describe('serieDeVolumen', () => {
  const h = [
    sesion(1, [EJ('Prensa', 100)]), // hoy-1
    sesion(2, [EJ('Prensa', 100)]),
    sesion(40, [EJ('Prensa', 100)]),
  ];

  it('va de la mas antigua a la mas reciente: el grafico avanza a la derecha', () => {
    // Volumenes distintos para poder afirmar el ORDEN, no solo que difieran:
    // con tres sesiones iguales el chequeo pasaba con la serie al reves.
    const escalera = [
      sesion(1, [EJ('Prensa', 120)]), // la mas reciente, la de mas volumen
      sesion(5, [EJ('Prensa', 110)]),
      sesion(9, [EJ('Prensa', 100)]),
    ];
    const s = serieDeVolumen(escalera, 'dia');
    expect(s.length).toBe(3);
    expect(s.map((p) => p.volumen)).toEqual([4 * 12 * 100, 4 * 12 * 110, 4 * 12 * 120]);
  });

  it('agrupar por mes junta las sesiones del mismo mes', () => {
    const s = serieDeVolumen(h, 'mes');
    expect(s.length).toBeLessThan(3);
    expect(s.reduce((t, p) => t + p.volumen, 0)).toBe(3 * 4 * 12 * 100);
  });

  it('las sesiones sin volumen no son puntos del grafico', () => {
    expect(serieDeVolumen([sesion(1, [], { volumenTotal: 0 })], 'dia')).toEqual([]);
  });

  it('el cardio no entra', () => {
    expect(serieDeVolumen([sesion(1, [], { type: 'cardio', volumenTotal: 500 })], 'dia')).toEqual([]);
  });
});

describe('agrupacion por mes del historial', () => {
  it('la clave ordena y el titulo se lee', () => {
    const f = new Date(2026, 3, 17);
    expect(claveDeMes(f)).toBe('2026-04');
    expect(tituloDeMes(f)).toBe('ABRIL 2026');
  });

  it('dos meses distintos del mismo año no comparten clave', () => {
    expect(claveDeMes(new Date(2026, 0, 31))).not.toBe(claveDeMes(new Date(2026, 1, 1)));
  });

  it('el mismo mes de dos años distintos tampoco', () => {
    expect(claveDeMes(new Date(2025, 3, 1))).not.toBe(claveDeMes(new Date(2026, 3, 1)));
  });
});
