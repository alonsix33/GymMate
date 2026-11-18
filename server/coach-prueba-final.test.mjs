/**
 * PRUEBA FINAL de la auditoria: repetir la conversacion del 13-nov-2026.
 *
 * Que se verifica y que NO: aqui no se llama al modelo (no hay clave ni red).
 * Se verifica lo determinista, que es de donde salieron las siete fallas: el
 * TEXTO EXACTO que recibiria el modelo en cada punto de la conversacion,
 * construido con el codigo real (contextoCompleto + armarMensajes) sobre un
 * fixture que reproduce la bitacora de las capturas. Lo que el modelo haga con
 * ese texto lo cubre el prompt, y solo se comprueba con el modelo delante.
 *
 * El fixture es una RECONSTRUCCION desde las cifras del documento, no los datos
 * reales del usuario.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { contextoCompleto } from '../src/features/coach-ia.ts';
import { excluirSeries } from '../src/features/exclusiones.ts';
import { saveHistory, savePRs } from '../src/utils/storage.ts';
import { initGamification } from '../src/features/gamification/index.ts';
import { armarMensajes } from './coach.mjs';

const ej = (nombre, sets, reps, peso, grupoMuscular, extra = {}) =>
  ({ nombre, sets, reps, peso, volumen: sets * reps * peso, completado: true, esMancuerna: false, grupoMuscular, ...extra });
const ses = (fecha, grupo, ejercicios, id = `s_${fecha}_${grupo}`, hora = '19:00:00') => ({
  sessionId: id, date: fecha, savedAt: new Date(`${fecha}T${hora}-05:00`).toISOString(), grupo, type: 'weights',
  volumenTotal: ejercicios.reduce((t, e) => t + e.volumen, 0),
  volumenPorGrupo: Object.fromEntries(ejercicios.map((e) => [e.grupoMuscular, e.volumen])), ejercicios,
});

const G4 = 'GRUPO 4 - Espalda + Bíceps';
const G1 = 'GRUPO 1 - Piernas + Glúteos';
const bitacora = () => [
  // 13-nov: DOS guardados (como en la captura 9) y el fantasma de Abdominales.
  ses('2026-11-13', G4, [
    ej('Jalón al Pecho', 4, 10, 55, 'Espalda'), ej('Remo en Máquina', 4, 10, 60, 'Espalda'),
    ej('Curl Martillo', 4, 10, 10, 'Bíceps'), ej('Curl Martillo Cross-body', 4, 10, 10, 'Bíceps'),
    ej('Abdominales en Máquina', 4, 15, 63, 'Core'), // el registro fantasma
  ], 'g4_13', '21:30:00'),
  ses('2026-11-13', 'Espalda', [ej('Jalón Agarre Cerrado', 4, 10, 60, 'Espalda')], 'esp_13', '19:00:00'),
  ses('2026-11-12', G1, [
    ej('Prensa', 4, 10, 180, 'Piernas'), ej('Patada de Glúteo', 4, 10, 80, 'Glúteos'),
    ej('Extensión', 4, 10, 48, 'Piernas'), ej('Hip Thrust', 2, 10, 55, 'Glúteos'),
  ]),
  ses('2026-11-10', G4, [ej('Jalón al Pecho', 4, 10, 55, 'Espalda'), ej('Remo en Máquina', 4, 10, 60, 'Espalda')]),
  ses('2026-11-09', G4, [ej('Jalón al Pecho', 4, 10, 55, 'Espalda'), ej('Jalón Agarre Cerrado', 4, 10, 60, 'Espalda')]),
  ses('2026-11-03', G4, [ej('Jalón al Pecho', 4, 10, 55, 'Espalda'), ej('Jalón Agarre Cerrado', 4, 10, 60, 'Espalda')]),
  ses('2026-10-25', 'GRUPO 3', [ej('Abdominales en Máquina', 4, 15, 63, 'Core')]),
  ses('2026-10-20', G1, [ej('Hip Thrust', 4, 10, 450, 'Glúteos')]), // el outlier
  ses('2026-10-01', G4, [ej('Jalón al Pecho', 4, 10, 60, 'Espalda')]), // el pico: 60
];

const ctxTexto = (ahora) => {
  const c = contextoCompleto(undefined, 12, ahora);
  return { c, texto: armarMensajes({ pregunta: 'x', contexto: c })[1].content };
};
const A15 = new Date('2026-11-13T15:00:00-05:00');
const A2214 = new Date('2026-11-13T22:14:00-05:00');
const linea = (t, pref) => t.split('\n').find((l) => l.startsWith(pref)) ?? '';

beforeEach(() => {
  localStorage.clear(); initGamification();
  saveHistory(bitacora());
  savePRs({ 'Hip Thrust': { peso: 450, sets: 4, reps: 10, volumen: 18000, date: '2026-10-20T00:00:00.000Z' } });
  vi.useFakeTimers(); vi.setSystemTime(A2214);
});
afterEach(() => vi.useRealTimers());

describe('prueba final · repetir la conversacion del 13-nov', () => {
  it('1. "¿Que hice ayer?": el modelo recibe la sesion del jue 12 nov con los pesos de la bitacora', () => {
    const { texto } = ctxTexto(A15);
    const ayer = linea(texto, 'ayer (');
    expect(ayer).toContain('ayer (jue 12 nov)');
    // Los nombres son los de la app (el normalizador los completa al leer):
    // "Prensa" es la abreviatura del coach, no el nombre del ejercicio.
    for (const x of ['Prensa de Piernas 4x10@180', 'Patada De Glúteo 4x10@80', 'Extensión 4x10@48', 'Hip Thrust 2x10@55']) expect(ayer).toContain(x);
    expect(texto).not.toMatch(/miércoles|miercoles/i);
  });

  it('2. "¿Hoy?" a las 15:00 sin sesion de hoy: da un grupo y lo MANTIENE al repetir la pregunta', () => {
    // Hoy NO hay sesion: se quitan las del 13.
    saveHistory(bitacora().filter((s) => s.date !== '2026-11-13'));
    const dichos = Array.from({ length: 4 }, () => linea(ctxTexto(A15).texto, 'SUGERENCIA DE HOY'));
    expect(dichos[0]).toMatch(/^SUGERENCIA DE HOY: GRUPO/);
    expect(new Set(dichos).size).toBe(1);
    expect(ctxTexto(A15).texto).toContain('entrenado hoy: NO');
  });

  it('3. "Ya lo hice, mira bien": lo registrado hoy sale y NO hay plan', () => {
    const { texto } = ctxTexto(A2214);
    expect(texto).toContain('entrenado hoy: SI');
    expect(linea(texto, 'lo registrado hoy:')).toContain('Jalón al Pecho 4x10@55');
    expect(texto).toContain('NO propongas plan para hoy');
    expect(texto).not.toContain('SUGERENCIA DE HOY: GRUPO');
  });

  it('4. "Hoy no hice abdominales": mientras no se confirme, el registro manda; tras confirmar, Core sigue en 19 dias', () => {
    // Antes de confirmar: el registro dice que hoy se hizo Core.
    expect(linea(ctxTexto(A2214).texto, 'dias sin tocar cada grupo muscular')).toMatch(/Core 0 \(ultima vie 13 nov\)/);
    // El usuario confirma el boton "¿lo marco como no hecho?".
    expect(excluirSeries({ ejercicio: 'Abdominales en Máquina', fecha: '2026-11-13' }, 'no_hecho')).toBe(1);
    const dichos = Array.from({ length: 3 }, () => linea(ctxTexto(A2214).texto, 'dias sin tocar cada grupo muscular'));
    for (const d of dichos) expect(d).toContain('Core 19 (ultima dom 25 oct)');
    expect(ctxTexto(A2214).texto).toContain('series EXCLUIDAS (no cuentan para nada): Abdominales en Máquina 63 kg vie 13 nov (no hecho)');
    // Y el 25-oct, que SI se hizo, sigue ahi.
    expect(ctxTexto(A2214).texto).toContain('dom 25 oct · GRUPO 3 · Abdominales en Máquina 4x15@63');
  });

  it('5. "¿Puedes ver mi sesion de hoy?": UNA sola sesion, aunque haya dos guardados', () => {
    const { c, texto } = ctxTexto(A2214);
    expect(c.estado.hoy.sesion.grupos).toEqual([G4, 'Espalda']);
    expect(texto.split('\n').filter((l) => l.startsWith('vie 13 nov ·'))).toHaveLength(1);
    expect(c.estado.ultimosDias.filter((d) => d.fecha === '2026-11-13')).toHaveLength(1);
    // Y cada ejercicio aparece UNA vez en el dia, no una por guardado.
    const hoy = c.estado.hoy.sesion.series.map((s) => s.nombre);
    expect(new Set(hoy).size).toBe(hoy.length);
  });

  it('6. Jalon al Pecho: el MISMO numero de "sesiones sin subir" en seis preguntas seguidas, y a las 15:00 igual que a las 22:14', () => {
    const cuenta = (ahora) => linea(ctxTexto(ahora).texto, 'Jalón al Pecho |').match(/(\d+) sesiones sin subir/)[1];
    const seis = [A15, A2214, A15, A2214, A2214, A15].map(cuenta);
    expect(new Set(seis).size).toBe(1);
    // Dias distintos con Jalon al Pecho por debajo del pico (60, el 1-oct): 3-nov, 9-nov, 10-nov y 13-nov.
    expect(seis[0]).toBe('4');
  });

  it('el Hip Thrust de 450 no es el pico una vez excluido, y mientras no lo este se avisa como SOSPECHOSO', () => {
    expect(ctxTexto(A2214).texto).toMatch(/pesos SOSPECHOSOS aun contados.*Hip Thrust 450 kg mar 20 oct contra 55/);
    excluirSeries({ ejercicio: 'Hip Thrust', peso: 450 }, 'outlier');
    const t = ctxTexto(A2214).texto;
    expect(linea(t, 'Hip Thrust |')).toContain('pico 55');
    expect(t).not.toContain('SOSPECHOSOS');
  });

  it('el aviso de "volumen bajo 23%" no sale si no hay periodo comparable', () => {
    saveHistory(bitacora().filter((s) => s.date >= '2026-11-09'));
    const t = ctxTexto(A15).texto;
    expect(linea(t, 'volumen de la semana')).toMatch(/NO comparable/);
  });
});
