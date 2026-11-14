import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  construirEstado, fusionarDias, volumenSemanal, sugerirGrupoDeHoy, gruposMusculares,
  pesoSospechoso, detectarOutliers, prsVigentes, idDe, type PlantillaDeGrupo,
} from '@/features/coach-estado';
import {
  buscarSeries, excluirSeries, restaurarSeries, parsearMarcaDeExclusion, resolverFecha,
} from '@/features/exclusiones';
import { etiquetaDia, claveDiaDeSesion, claveDiaLima, ahoraLimaTexto, diasEntre } from '@/utils/fecha';
import { markdownBasico } from '@/utils/markdown';
import { saveHistory, getHistory, savePRs, getPRs } from '@/utils/storage';
import { saveDraftNow, restoreFromDraft, setSessionExercises, setSessionGroup, sessionId, saveCurrentSession, resetSession } from '@/state/session';
import { getDraft } from '@/utils/storage';
import type { HistorySession } from '@/types';

const AHORA = new Date('2026-11-13T22:14:00-05:00'); // vie 13 nov 2026, 22:14 Lima

interface EjTest {
  nombre: string; sets: number; reps: number; peso: number; volumen: number; completado: boolean;
  esMancuerna: boolean; grupoMuscular: string; excluido?: boolean;
}
function ej(nombre: string, sets: number, reps: number, peso: number, musculo = 'Espalda', extra: Partial<EjTest> = {}): EjTest {
  return { nombre, sets, reps, peso, volumen: sets * reps * peso, completado: sets > 0, esMancuerna: false, grupoMuscular: musculo, ...extra };
}
function ses(fecha: string, grupo: string, ejercicios: EjTest[], id = `s_${fecha}_${grupo}`, hora = '19:00:00'): HistorySession {
  const vol = ejercicios.reduce((t, e) => t + (e.excluido ? 0 : e.volumen), 0);
  return {
    sessionId: id, date: fecha, savedAt: new Date(`${fecha}T${hora}-05:00`).toISOString(), grupo, type: 'weights',
    volumenTotal: vol, volumenPorGrupo: { Espalda: vol }, ejercicios,
  } as unknown as HistorySession;
}

beforeEach(() => { localStorage.clear(); resetSession(); });
afterEach(() => { vi.useRealTimers(); });

describe('fechas · America/Lima', () => {
  it('el 12-nov-2026 se muestra como "jue 12 nov" (y NO como miercoles)', () => {
    expect(etiquetaDia('2026-11-12')).toBe('jue 12 nov');
    expect(etiquetaDia('2026-11-13')).toBe('vie 13 nov');
  });
  it('con año solo cuando no es el actual', () => {
    expect(etiquetaDia('2025-10-04', 2026)).toBe('sáb 4 oct 2025');
    expect(etiquetaDia('2026-10-04', 2026)).toBe('dom 4 oct');
  });
  it('22:30 de Lima es del mismo dia aunque en UTC ya sea el siguiente', () => {
    expect(claveDiaLima(new Date('2026-11-14T03:30:00.000Z'))).toBe('2026-11-13');
    expect(claveDiaDeSesion({ savedAt: '2026-11-14T03:30:00.000Z' })).toBe('2026-11-13');
  });
  it('un YYYY-MM-DD pelado es ya una fecha civil: no se corre un dia', () => {
    expect(claveDiaDeSesion({ date: '2026-11-13' })).toBe('2026-11-13');
  });
  it('"datos al" lleva dia, fecha, hora y zona', () => {
    expect(ahoraLimaTexto(AHORA)).toBe('vie 13 nov 2026 22:14 (America/Lima)');
  });
  it('los dias entre dos fechas los cuenta el codigo', () => {
    expect(diasEntre('2026-10-25', '2026-11-13')).toBe(19);
  });
});

describe('fusionarDias · una entrada por fecha', () => {
  it('fusiona los guardados del mismo dia y se queda con la MEJOR serie, no la suma', () => {
    const dias = fusionarDias([
      ses('2026-11-13', 'Espalda', [ej('Jalón Agarre Cerrado', 4, 10, 60)]),
      ses('2026-11-13', 'GRUPO 4', [ej('Jalón al Pecho', 4, 10, 55), ej('Jalón Agarre Cerrado', 4, 10, 60)]),
    ]);
    expect(dias).toHaveLength(1);
    expect(dias[0].series.map((s) => s.nombre).sort()).toEqual(['Jalón Agarre Cerrado', 'Jalón al Pecho']);
    expect(dias[0].volumen).toBe(4 * 10 * 60 + 4 * 10 * 55);
    expect(dias[0].grupos).toEqual(['Espalda', 'GRUPO 4']);
  });
  it('una serie excluida o sin volumen no entra', () => {
    const dias = fusionarDias([
      ses('2026-11-13', 'G4', [ej('Jalón al Pecho', 4, 10, 55), ej('Abdominales en Máquina', 4, 15, 63, 'Core', { excluido: true }), ej('Remo', 0, 0, 0)]),
    ]);
    expect(dias[0].series.map((s) => s.nombre)).toEqual(['Jalón al Pecho']);
  });
});

describe('volumen semanal comparable', () => {
  const base = (): HistorySession[] => [
    ses('2026-10-01', 'G', [ej('Jalón al Pecho', 4, 10, 50)]), // cubre el periodo anterior
    ses('2026-11-03', 'G', [ej('Jalón al Pecho', 4, 10, 50)]), // anterior (hasta 6-nov... ventana 14d)
    ses('2026-11-10', 'G', [ej('Jalón al Pecho', 4, 10, 50)]),
  ];
  it('"no comparable" cuando el registro no cubre el periodo anterior', () => {
    const dias = fusionarDias([ses('2026-11-10', 'G', [ej('Prensa', 4, 10, 100)])]);
    const v = volumenSemanal(dias, '2026-11-13');
    expect(v.comparable).toBe(false);
    expect(v.cambioPct).toBeNull();
    expect(v.motivo).toMatch(/no esta cubierto/);
  });
  it('"no comparable" sin volumen en el periodo anterior', () => {
    const dias = fusionarDias([ses('2026-09-01', 'G', [ej('Prensa', 4, 10, 100)]), ses('2026-11-12', 'G', [ej('Prensa', 4, 10, 100)])]);
    expect(volumenSemanal(dias, '2026-11-13').comparable).toBe(false);
  });
  it('7 dias contra los 7 anteriores, terminando AYER si hoy aun no hay sesion', () => {
    const v = volumenSemanal(fusionarDias(base()), '2026-11-13');
    expect(v.actual).toEqual({ desde: '2026-11-06', hasta: '2026-11-12' });
    expect(v.anterior).toEqual({ desde: '2026-10-30', hasta: '2026-11-05' });
    expect(v.comparable).toBe(true);
    expect(v.cambioPct).toBe(0);
  });
  it('si hoy YA hay sesion, la ventana termina hoy', () => {
    const v = volumenSemanal(fusionarDias([...base(), ses('2026-11-13', 'G', [ej('Jalón al Pecho', 4, 10, 50)])]), '2026-11-13');
    expect(v.actual?.hasta).toBe('2026-11-13');
  });
  it('el mismo dato da el mismo resultado a las 15:00 que a las 22:00', () => {
    const dias = fusionarDias(base());
    expect(volumenSemanal(dias, '2026-11-13')).toEqual(volumenSemanal(dias, '2026-11-13'));
  });
});

describe('peso sospechoso y outliers', () => {
  const h = [ses('2026-11-12', 'P', [ej('Hip Thrust', 2, 10, 55, 'Glúteos')])];
  it('un peso mayor a 3 veces el mejor anterior pide confirmacion', () => {
    expect(pesoSospechoso('Hip Thrust', 450, h).sospechoso).toBe(true);
    expect(pesoSospechoso('Hip Thrust', 165, h).sospechoso).toBe(false); // justo 3x
    expect(pesoSospechoso('Hip Thrust', 166, h).sospechoso).toBe(true);
  });
  it('el primer registro de un ejercicio no puede ser "outlier"', () => {
    expect(pesoSospechoso('Ejercicio Nuevo', 450, h).sospechoso).toBe(false);
  });
  it('un registro excluido no cuenta como "mejor anterior"', () => {
    const conExcluido = [...h, ses('2026-10-20', 'P', [ej('Hip Thrust', 4, 10, 450, 'Glúteos', { excluido: true })])];
    expect(pesoSospechoso('Hip Thrust', 450, conExcluido).mejorAnterior).toBe(55);
  });
  it('detecta el 450 ya guardado', () => {
    const o = detectarOutliers([...h, ses('2026-10-20', 'P', [ej('Hip Thrust', 4, 10, 450, 'Glúteos')])], 2026);
    expect(o).toEqual([expect.objectContaining({ ejercicio: 'Hip Thrust', peso: 450, mejorOtro: 55, etiqueta: 'mar 20 oct' })]);
  });
  it('un PR cuya unica serie esta excluida deja de valer', () => {
    const hist = [ses('2026-10-20', 'P', [ej('Hip Thrust', 4, 10, 450, 'Glúteos', { excluido: true })]), ...h];
    const prs = { 'Hip Thrust': { peso: 450, sets: 4, reps: 10, volumen: 18000, date: 'x' }, Prensa: { peso: 180, sets: 4, reps: 10, volumen: 7200, date: 'x' } };
    expect(Object.keys(prsVigentes(prs, hist))).toEqual(['Prensa']);
  });
});

describe('exclusiones: se ve QUE cambia, se marca y se puede deshacer', () => {
  beforeEach(() => {
    saveHistory([
      ses('2026-11-12', 'P', [ej('Hip Thrust', 2, 10, 55, 'Glúteos')]),
      ses('2026-10-20', 'P', [ej('Hip Thrust', 4, 10, 450, 'Glúteos'), ej('Prensa', 4, 10, 180, 'Piernas')]),
    ]);
    savePRs({ 'Hip Thrust': { peso: 450, sets: 4, reps: 10, volumen: 18000, date: '2026-10-20T00:00:00.000Z' } });
  });
  it('buscarSeries SOLO LEE', () => {
    const antes = JSON.stringify(getHistory());
    const r = buscarSeries({ ejercicio: 'Hip Thrust', peso: 450 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ peso: 450, etiqueta: 'mar 20 oct', excluida: false });
    expect(JSON.stringify(getHistory())).toBe(antes);
  });
  it('excluir marca la serie, NO la borra, y recalcula volumen y PR', () => {
    expect(excluirSeries({ ejercicio: 'Hip Thrust', peso: 450 }, 'outlier')).toBe(1);
    const h = getHistory();
    const s = h.find((x) => x.date === '2026-10-20')!;
    const e = s.ejercicios.find((x) => x.nombre === 'Hip Thrust')!;
    expect(e.excluido).toBe(true);
    expect(e.peso).toBe(450); // sigue ahi
    expect(s.volumenTotal).toBe(4 * 10 * 180); // solo la Prensa
    expect(getPRs()['Hip Thrust'].peso).toBe(55);
    // No toco las demas sesiones.
    expect(h.find((x) => x.date === '2026-11-12')!.volumenTotal).toBe(2 * 10 * 55);
  });
  it('restaurar deja la serie como estaba', () => {
    excluirSeries({ ejercicio: 'Hip Thrust', peso: 450 }, 'outlier');
    expect(restaurarSeries({ ejercicio: 'Hip Thrust', peso: 450 })).toBe(1);
    const e = getHistory().find((x) => x.date === '2026-10-20')!.ejercicios[0];
    expect(e.excluido).toBeUndefined();
  });
  it('excluir dos veces no cuenta dos veces', () => {
    excluirSeries({ ejercicio: 'Hip Thrust', peso: 450 }, 'outlier');
    expect(excluirSeries({ ejercicio: 'Hip Thrust', peso: 450 }, 'outlier')).toBe(0);
  });
  it('el estado del coach ve la serie excluida y ya no la cuenta', () => {
    excluirSeries({ ejercicio: 'Hip Thrust', peso: 450 }, 'outlier');
    const e = construirEstado(getHistory(), { ahora: AHORA });
    expect(e.outliersExcluidos).toEqual([expect.objectContaining({ ejercicio: 'Hip Thrust', peso: 450, motivo: 'outlier' })]);
    expect(e.outliersSospechosos).toEqual([]);
  });
});

describe('la marca [[excluir|...]] del coach', () => {
  beforeEach(() => saveHistory([ses('2026-11-13', 'G4', [ej('Abdominales en Máquina', 4, 15, 63, 'Core'), ej('Jalón al Pecho', 4, 10, 55)])]));
  it('se oculta del texto y resuelve "vie 13 nov" contra el registro', () => {
    const r = parsearMarcaDeExclusion('Entendido, ¿lo marco como no hecho?\n[[excluir|Abdominales en Máquina|vie 13 nov]]');
    expect(r.limpio).toBe('Entendido, ¿lo marco como no hecho?');
    expect(r.criterio).toEqual({ ejercicio: 'Abdominales en Máquina', fecha: '2026-11-13' });
  });
  it('si no coincide con nada del registro, NO hay boton (el modelo no inventa)', () => {
    expect(parsearMarcaDeExclusion('x [[excluir|Prensa|vie 13 nov]]').criterio).toBeNull();
    expect(parsearMarcaDeExclusion('x [[excluir|Abdominales en Máquina|lun 1 ene]]').criterio).toBeNull();
  });
  it('una marca a medio escribir (streaming) no se ve', () => {
    expect(parsearMarcaDeExclusion('¿Lo marco? [[excl').limpio).toBe('¿Lo marco?');
  });
  it('tras confirmar, la marca ya no ofrece boton', () => {
    excluirSeries({ ejercicio: 'Abdominales en Máquina', fecha: '2026-11-13' }, 'no_hecho');
    expect(parsearMarcaDeExclusion('[[excluir|Abdominales en Máquina|vie 13 nov]]').criterio).toBeNull();
  });
  it('resolverFecha acepta ISO y etiqueta, y rechaza dias que no existen', () => {
    expect(resolverFecha('2026-11-13')).toBe('2026-11-13');
    expect(resolverFecha('vie 13 nov')).toBe('2026-11-13');
    expect(resolverFecha('jue 12 nov')).toBeNull();
  });
});

describe('hoy, ayer y el grupo que toca', () => {
  const PL: PlantillaDeGrupo[] = [
    { nombre: 'GRUPO 1 - Piernas', ejercicios: ['Prensa', 'Extensión', 'Hip Thrust'] },
    { nombre: 'GRUPO 4 - Espalda + Bíceps', ejercicios: ['Jalón al Pecho', 'Remo en Máquina', 'Curl Martillo'] },
  ];
  const hist = (conHoy: boolean) => [
    ...(conHoy ? [ses('2026-11-13', 'GRUPO 4 - Espalda + Bíceps', [ej('Jalón al Pecho', 4, 10, 55), ej('Remo en Máquina', 4, 10, 60)])] : []),
    ses('2026-11-12', 'GRUPO 1 - Piernas', [ej('Prensa', 4, 10, 180, 'Piernas'), ej('Extensión', 4, 10, 48, 'Piernas')]),
    ses('2026-11-10', 'GRUPO 4 - Espalda + Bíceps', [ej('Jalón al Pecho', 4, 10, 55)]),
  ];

  it('"¿qué hice ayer?" trae la sesion del jue 12 nov con los pesos de la bitacora', () => {
    const e = construirEstado(hist(false), { ahora: new Date('2026-11-13T15:00:00-05:00'), plantillas: PL });
    expect(e.ayer.etiqueta).toBe('jue 12 nov');
    expect(e.ayer.sesion?.series).toEqual([
      { nombre: 'Prensa', sets: 4, reps: 10, peso: 180 },
      { nombre: 'Extensión', sets: 4, reps: 10, peso: 48 },
    ]);
  });
  it('a las 15:00, sin sesion de hoy: entrenado NO, y da un grupo', () => {
    const e = construirEstado(hist(false), { ahora: new Date('2026-11-13T15:00:00-05:00'), plantillas: PL });
    expect(e.hoy.entrenado).toBe(false);
    expect(e.sugerenciaDeHoy?.grupo).toBe('GRUPO 4 - Espalda + Bíceps'); // el 10, mas antiguo que el 12
    expect(e.sugerenciaDeHoy?.motivo).toContain('mar 10 nov');
  });
  it('repetir "¿hoy?" da SIEMPRE el mismo grupo', () => {
    const opts = { ahora: new Date('2026-11-13T15:00:00-05:00'), plantillas: PL };
    const g = Array.from({ length: 5 }, () => construirEstado(hist(false), opts).sugerenciaDeHoy?.grupo);
    expect(new Set(g).size).toBe(1);
  });
  it('a las 22:14, con sesion de hoy: entrenado SI, sin plan', () => {
    const e = construirEstado(hist(true), { ahora: AHORA, plantillas: PL });
    expect(e.hoy.entrenado).toBe(true);
    expect(e.sugerenciaDeHoy).toBeNull();
    expect(e.hoy.grupos).toEqual(['GRUPO 4 - Espalda + Bíceps']);
  });
  it('una sola sesion de hoy aunque se guardara en dos registros', () => {
    const e = construirEstado([
      ses('2026-11-13', 'Espalda', [ej('Jalón Agarre Cerrado', 4, 10, 60)]),
      ses('2026-11-13', 'GRUPO 4 - Espalda + Bíceps', [ej('Jalón al Pecho', 4, 10, 55)]),
    ], { ahora: AHORA, plantillas: PL });
    expect(e.hoy.sesion?.series).toHaveLength(2);
    expect(e.ultimosDias.filter((d) => d.fecha === '2026-11-13')).toHaveLength(1);
  });
  it('la rutina propia "Espalda" cuenta como GRUPO 4 si se hizo la mitad de sus ejercicios', () => {
    const d = fusionarDias([ses('2026-11-12', 'Espalda', [ej('Jalón al Pecho', 4, 10, 55), ej('Remo en Máquina', 4, 10, 60)])]);
    expect(sugerirGrupoDeHoy(d, '2026-11-13', PL, 2026)?.grupo).toBe('GRUPO 1 - Piernas'); // G4 acaba de hacerse
  });
  it('sin la sesion de AYER cargada lo dice, no la inventa', () => {
    const e = construirEstado([ses('2026-11-10', 'G', [ej('Prensa', 4, 10, 100, 'Piernas')])], { ahora: AHORA });
    expect(e.ayer.sesion).toBeNull();
    expect(e.ultimaSesion).toEqual({ fecha: '2026-11-10', etiqueta: 'mar 10 nov', diasDesde: 3 });
  });
  it('los dias sin tocar cada grupo los cuenta el codigo (Core: 19)', () => {
    const d = fusionarDias([
      ses('2026-10-25', 'G', [ej('Abdominales en Máquina', 4, 15, 63, 'Core')]),
      ses('2026-11-13', 'G', [ej('Jalón al Pecho', 4, 10, 55)]),
    ]);
    const g = gruposMusculares(d, '2026-11-13');
    expect(g.find((x) => x.grupo === 'Core')).toMatchObject({ diasSinTocar: 19, ultimaEtiqueta: 'dom 25 oct' });
  });
});

describe('falla 13 · Aductora y Abductora son dos maquinas', () => {
  it('tienen ids distintos', () => {
    expect(idDe('Aductora Máquina')).toBe('aductora_maquina');
    expect(idDe('Abductora Máquina')).toBe('abductora_maquina');
    expect(idDe('Aductora Máquina')).not.toBe(idDe('Abductora Máquina'));
  });
});

describe('falla 5 · el borrador reanudado conserva su sessionId', () => {
  it('guardar tras reanudar ACTUALIZA la sesion ya guardada, no crea otra', () => {
    setSessionGroup('GRUPO 4 - Espalda + Bíceps');
    setSessionExercises([ej('Jalón al Pecho', 4, 10, 55)] as never);
    saveCurrentSession();
    const idGuardado = sessionId;
    expect(getHistory()).toHaveLength(1);
    // Mas cambios, borrador, cierre de la app y reanudar.
    saveDraftNow();
    const draft = getDraft()!;
    expect(draft.sessionId).toBe(idGuardado);
    resetSession();
    restoreFromDraft(draft);
    // La causa, aislada: sin el sessionId, la fusion por dia tapaba el fallo.
    expect(sessionId).toBe(idGuardado);
    saveCurrentSession();
    expect(getHistory()).toHaveLength(1);
    expect(getHistory()[0].sessionId).toBe(idGuardado);
  });
});

describe('falla 14 · markdown basico', () => {
  it('la negrita no deja asteriscos', () => {
    expect(markdownBasico('**Hip Thrust a 60, cuatro series.**')).toBe('<p><strong>Hip Thrust a 60, cuatro series.</strong></p>');
  });
  it('las listas con guiones son una lista, no un parrafo pegado', () => {
    const h = markdownBasico('Hoy:\n- **Prensa a 185.** Sube.\n- **Extensión a 50.** Igual.');
    expect(h).toContain('<ul><li><strong>Prensa a 185.</strong> Sube.</li><li><strong>Extensión a 50.</strong> Igual.</li></ul>');
    expect(h).not.toContain('**');
  });
  it('la lista pegada en un solo parrafo (" - **...") tambien se separa', () => {
    const h = markdownBasico('Plan: - **Prensa a 185.** Sube. - **Extensión a 50.** Igual.');
    expect((h.match(/<li>/g) ?? []).length).toBe(2);
  });
  it('NO deja pasar HTML del modelo', () => {
    const h = markdownBasico('<img src=x onerror=roba()> **ok** <script>x</script>');
    expect(h).not.toContain('<img');
    expect(h).not.toContain('<script');
    expect(h).toContain('&lt;img');
  });
  it('una negrita sin cerrar (streaming) se queda como texto', () => {
    expect(markdownBasico('**Prensa a')).toBe('<p>**Prensa a</p>');
  });
  it('listas numeradas y parrafos separados', () => {
    expect(markdownBasico('1. uno\n2. dos\n\nfin')).toBe('<ol><li>uno</li><li>dos</li></ol><p>fin</p>');
  });
});
