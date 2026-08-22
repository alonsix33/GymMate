import { describe, it, expect, beforeEach } from 'vitest';
import {
  datosDelEjercicio,
  ejercicioMencionado,
  leerCola,
  guardarCola,
  leerConversacion,
  guardarConversacion,
  CoachLocal,
} from '@/features/coach-ia';
import { unaRepMaxPromedio } from '@/utils/calculations';
import type { HistorySession } from '@/types';

/**
 * `coach-ia.ts` no aparecia en ninguna puerta ni en ningun test: un mutante que
 * hiciera `datosDelEjercicio` devolver ceros —el defecto que su propio
 * docstring nombra— sobrevivia a las cuatro puertas en verde.
 */

function sesion(nombre: string, peso: number, reps: number, diasAtras: number): HistorySession {
  const hoy = new Date();
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - diasAtras, 19, 0);
  return {
    sessionId: `s_${diasAtras}`,
    date: d.toISOString(),
    savedAt: d.toISOString(),
    grupo: 'Pecho',
    type: 'weights',
    volumenTotal: peso * reps,
    volumenPorGrupo: {},
    ejercicios: [
      { nombre, sets: 3, reps, peso, volumen: peso * reps * 3, completado: true,
        esMancuerna: false, grupoMuscular: 'Pecho' },
    ],
  } as HistorySession;
}

beforeEach(() => localStorage.clear());

describe('datosDelEjercicio · sin datos NO devuelve ceros', () => {
  it('sin historial devuelve null, no un bloque de ceros', () => {
    expect(datosDelEjercicio('Press Banca', [])).toBeNull();
  });

  it('un ejercicio que no esta en el historial devuelve null', () => {
    expect(datosDelEjercicio('Peso Muerto', [sesion('Press Banca', 60, 8, 1)])).toBeNull();
  });

  it('con peso 0 registrado devuelve null: "tu 1RM es 0" no es una respuesta', () => {
    expect(datosDelEjercicio('Press Banca', [sesion('Press Banca', 0, 10, 1)])).toBeNull();
  });

  it('con datos devuelve el bloque, y ninguna cifra es cero', () => {
    const d = datosDelEjercicio('Press Banca', [sesion('Press Banca', 60, 8, 1)]);
    expect(d).not.toBeNull();
    expect(d!.pico).toBe(60);
    expect(d!.actual).toBe(60);
    expect(d!.unaRepMax).toBeGreaterThan(60);
  });
});

describe('datosDelEjercicio · la aritmetica es la MISMA que la del resto de la app', () => {
  it('el 1RM es el promedio de las tres formulas, no Epley a secas', () => {
    // El coach mostraba 168 kg donde PR-01 y CA-01 ponen 165 para la misma
    // serie: dos cifras distintas con el mismo rotulo "1RM est.".
    const d = datosDelEjercicio('Prensa de Piernas', [sesion('Prensa de Piernas', 120, 12, 1)]);
    expect(d!.unaRepMax).toBe(Math.round(unaRepMaxPromedio(120, 12)!));
    expect(d!.unaRepMax).not.toBe(Math.round(120 * (1 + 12 / 30)));
  });

  it('las repeticiones son las de la serie ACTUAL, no las del pico', () => {
    // Pico de 120x2 en julio, 100x12 en las ultimas tres sesiones (que es la
    // ventana de `pesoActual`): el bloque decia 107 kg cuando la estimacion
    // sobre la serie actual es ~140.
    const historial = [
      sesion('Sentadilla', 100, 12, 2),
      sesion('Sentadilla', 100, 12, 5),
      sesion('Sentadilla', 100, 12, 9),
      sesion('Sentadilla', 120, 2, 40),
    ];
    const d = datosDelEjercicio('Sentadilla', historial);
    expect(d!.actual).toBe(100);
    expect(d!.pico).toBe(120);
    expect(d!.unaRepMax).toBe(Math.round(unaRepMaxPromedio(100, 12)!));
  });
});

describe('ejercicioMencionado', () => {
  const h = [sesion('Press Banca', 60, 8, 1), sesion('Press Banca Inclinado', 40, 10, 3)];
  it('reconoce el ejercicio nombrado, sin importar mayusculas', () => {
    expect(ejercicioMencionado('¿cómo voy en PRESS BANCA?', h)).toBe('Press Banca');
  });
  it('prefiere el nombre mas largo', () => {
    expect(ejercicioMencionado('¿y el press banca inclinado?', h)).toBe('Press Banca Inclinado');
  });
  it('si no nombra ninguno, devuelve null', () => {
    expect(ejercicioMencionado('¿qué tal voy?', h)).toBeNull();
  });
});

describe('la cola de preguntas sobrevive a la cuota y a la basura', () => {
  it('lo guardado es lo que se lee', () => {
    expect(guardarCola(['a', 'b'])).toBe(true);
    expect(leerCola()).toEqual(['a', 'b']);
  });
  it('una cola corrupta se lee como vacia, no revienta', () => {
    localStorage.setItem('gymmate_coach_cola', '{no es json');
    expect(leerCola()).toEqual([]);
  });
  it('se filtran las entradas que no son texto', () => {
    localStorage.setItem('gymmate_coach_cola', JSON.stringify(['a', 3, null, '', '  ', 'b']));
    expect(leerCola()).toEqual(['a', 'b']);
  });
  it('la conversacion corrupta tampoco tumba la pantalla', () => {
    localStorage.setItem('gymmate_coach_conversacion', '[[[');
    expect(leerConversacion()).toEqual([]);
  });
  it('un turno sin la forma esperada se descarta', () => {
    localStorage.setItem(
      'gymmate_coach_conversacion',
      JSON.stringify([{ id: 'x', autor: 'coach', texto: 'ok', fecha: '2026-08-01T00:00:00.000Z' }, { roto: true }])
    );
    expect(leerConversacion()).toHaveLength(1);
  });
  it('guardar y leer da la vuelta completa', () => {
    const t = [{ id: 'u1', autor: 'usuario' as const, texto: 'hola', fecha: '2026-08-01T00:00:00.000Z' }];
    guardarConversacion(t);
    expect(leerConversacion()).toEqual(t);
  });
});

describe('CoachLocal · la voz del handoff', () => {
  it('dice el peso objetivo, nunca la diferencia', async () => {
    localStorage.setItem('gymmate_history', JSON.stringify([sesion('Press Banca', 60, 8, 1)]));
    const coach = new CoachLocal();
    let texto = '';
    for await (const t of coach.responder('¿cómo voy en press banca?')) texto += t;
    expect(texto).toMatch(/Levanta 62\.5 kg/);
    expect(texto).not.toMatch(/faltan/i);
    // Sin porras ni exclamaciones dobles.
    expect(texto).not.toMatch(/!!|¡¡/);
  });

  it('cuando la pregunta no toca ningun dato, lo admite en vez de rellenar', async () => {
    localStorage.setItem('gymmate_history', JSON.stringify([sesion('Press Banca', 60, 8, 1)]));
    const coach = new CoachLocal();
    let texto = '';
    for await (const t of coach.responder('¿qué como hoy?')) texto += t;
    expect(texto).toContain('Pregúntame por un ejercicio que hayas registrado');
  });

  it('no se declara en linea mientras no haya backend', () => {
    expect(new CoachLocal().enLinea).toBe(false);
  });
});
