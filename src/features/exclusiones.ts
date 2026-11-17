/**
 * Excluir series de la bitacora, SIN borrarlas.
 *
 * Dos casos con el mismo mecanismo:
 *   - un outlier ("el Hip Thrust de 450 kg no cuenta"), y
 *   - "eso no lo hice" (el coach tenia en el registro algo que el usuario dice
 *     que no hizo).
 *
 * Hasta ahora la exclusion vivia en el texto del coach ("con el 450 ya
 * descartado") y no en los calculos: el pico, el volumen y el estado seguian
 * usando el 450. Aqui la serie se MARCA (`excluido`) y todos los calculos la
 * saltan; el dato sigue en el historial y se puede restaurar.
 *
 * Regla del encargo: nada se cambia sin ensenarle antes al usuario QUE se va a
 * cambiar. Por eso hay `buscarSeries` (solo lee) y `excluirSeries` (escribe),
 * y quien llame a la segunda tiene que haber pintado la primera.
 */
import { getHistory, saveHistory, getPRs, savePRs } from '@/utils/storage';
import { claveDiaDeSesion, etiquetaDia } from '@/utils/fecha';
import { prsDescartados } from '@/features/coach-estado';
import { calculateVolumenPorGrupo } from '@/utils/calculations';
import type { HistorySession } from '@/types';

export interface CriterioDeSerie {
  ejercicio: string;
  /** 'YYYY-MM-DD'. Sin fecha, todas las del ejercicio que cumplan el peso. */
  fecha?: string;
  peso?: number;
}

export interface SerieEncontrada {
  fecha: string;
  etiqueta: string;
  grupo: string;
  ejercicio: string;
  sets: number;
  reps: number;
  peso: number;
  excluida: boolean;
}

function coincide(
  s: HistorySession,
  e: { nombre: string; peso: number },
  c: CriterioDeSerie
): boolean {
  if (e.nombre !== c.ejercicio) return false;
  if (c.peso !== undefined && e.peso !== c.peso) return false;
  if (c.fecha !== undefined && claveDiaDeSesion(s) !== c.fecha) return false;
  return true;
}

/** Solo lee: lo que cambiaria una exclusion. */
export function buscarSeries(
  criterio: CriterioDeSerie,
  historial: HistorySession[] = getHistory()
): SerieEncontrada[] {
  const salida: SerieEncontrada[] = [];
  for (const s of historial) {
    if (s.type === 'cardio') continue;
    for (const e of s.ejercicios ?? []) {
      if (!(e.volumen > 0) || !coincide(s, e, criterio)) continue;
      const fecha = claveDiaDeSesion(s) ?? '';
      salida.push({
        fecha,
        etiqueta: fecha ? etiquetaDia(fecha, new Date().getFullYear()) : 'sin fecha',
        grupo: s.grupo,
        ejercicio: e.nombre,
        sets: e.sets,
        reps: e.reps,
        peso: e.peso,
        excluida: e.excluido === true,
      });
    }
  }
  return salida;
}

/**
 * Tras excluir, el record guardado no puede seguir apuntando a un peso que ya
 * no cuenta: pasa a la mejor serie que SI cuenta, o desaparece si no queda
 * ninguna. Solo se toca si el record era justo uno de los pesos excluidos.
 */
function recalcularPR(nombre: string, historial: HistorySession[]): void {
  const prs = getPRs();
  const pr = prs[nombre];
  if (!pr) return;
  let hayExcluidaConEsePeso = false;
  let hayValidaConEsePeso = false;
  let mejor: { peso: number; sets: number; reps: number; volumen: number; fecha: string } | null = null;
  for (const s of historial) {
    if (s.type === 'cardio') continue;
    for (const e of s.ejercicios ?? []) {
      if (e.nombre !== nombre || !(e.volumen > 0)) continue;
      if (e.excluido) {
        if (e.peso === pr.peso) hayExcluidaConEsePeso = true;
        continue;
      }
      if (e.peso === pr.peso) hayValidaConEsePeso = true;
      if (!mejor || e.peso > mejor.peso || (e.peso === mejor.peso && e.reps > mejor.reps)) {
        mejor = { peso: e.peso, sets: e.sets, reps: e.reps, volumen: e.volumen, fecha: s.savedAt || s.date };
      }
    }
  }
  if (!hayExcluidaConEsePeso || hayValidaConEsePeso) return;
  if (mejor) prs[nombre] = { peso: mejor.peso, sets: mejor.sets, reps: mejor.reps, volumen: mejor.volumen, date: mejor.fecha };
  else delete prs[nombre];
  savePRs(prs);
}

function marcar(
  criterio: CriterioDeSerie,
  excluir: boolean,
  motivo: 'no_hecho' | 'outlier'
): number {
  const historial = getHistory();
  const tocadas = new Set<HistorySession>();
  let cuantas = 0;
  for (const s of historial) {
    if (s.type === 'cardio') continue;
    for (const e of s.ejercicios ?? []) {
      if (!(e.volumen > 0) || !coincide(s, e, criterio)) continue;
      if ((e.excluido === true) === excluir) continue;
      tocadas.add(s);
      if (excluir) {
        e.excluido = true;
        e.motivoExclusion = motivo;
      } else {
        delete e.excluido;
        delete e.motivoExclusion;
      }
      cuantas++;
    }
  }
  if (cuantas > 0) {
    // El volumen de las sesiones TOCADAS, y solo de esas: una serie excluida
    // no suma, y las demas no se reescriben.
    for (const s of tocadas) {
      const validas = (s.ejercicios ?? []).filter((e) => !e.excluido);
      s.volumenTotal = validas.reduce((t, e) => t + (e.volumen || 0), 0);
      s.volumenPorGrupo = calculateVolumenPorGrupo(validas);
    }
    saveHistory(historial);
    if (excluir) recalcularPR(criterio.ejercicio, historial);
  }
  return cuantas;
}

/** Escribe. Devuelve cuantas series se marcaron. */
export function excluirSeries(criterio: CriterioDeSerie, motivo: 'no_hecho' | 'outlier'): number {
  return marcar(criterio, true, motivo);
}

/** Deshace una exclusion. Devuelve cuantas series volvieron a contar. */
export function restaurarSeries(criterio: CriterioDeSerie): number {
  return marcar(criterio, false, 'outlier');
}

/**
 * "jue 12 nov", "jue 12 nov 2025" o "2026-11-12" -> 'YYYY-MM-DD', buscando
 * entre los dias que SI estan en el registro (el mas reciente primero). Una
 * fecha que no existe en la bitacora no se resuelve: no se inventa un dia.
 */
export function resolverFecha(texto: string, historial: HistorySession[] = getHistory()): string | null {
  const t = texto.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const claves = [...new Set(historial.map((s) => claveDiaDeSesion(s)).filter((c): c is string => !!c))]
    .sort()
    .reverse();
  for (const clave of claves) {
    if (etiquetaDia(clave).toLowerCase() === t || etiquetaDia(clave, -1).toLowerCase() === t) return clave;
  }
  return null;
}

/**
 * Lo que el coach pide con `[[excluir|Ejercicio|vie 13 nov|peso]]` (el peso es
 * opcional). Devuelve el texto SIN la marca y el criterio, o criterio null si
 * la marca no es valida o no coincide con ninguna serie real: el modelo no
 * puede ofrecerle al usuario un boton para algo que no esta en el registro.
 * Tambien oculta una marca a medio escribir (streaming).
 */
export function parsearMarcaDeExclusion(
  texto: string,
  historial: HistorySession[] = getHistory()
): { limpio: string; criterio: CriterioDeSerie | null } {
  const limpio = texto
    .replace(/\[\[excluir\|[^\]]*\]\]/g, '')
    .replace(/\[\[[^\]]*$/, '')
    .trimEnd();
  const m = texto.match(/\[\[excluir\|([^|\]]+)\|([^|\]]+)(?:\|([\d.]*))?\]\]/);
  if (!m) return { limpio, criterio: null };
  const fecha = resolverFecha(m[2], historial);
  if (!fecha) return { limpio, criterio: null };
  const criterio: CriterioDeSerie = { ejercicio: m[1].trim(), fecha };
  if (m[3]) criterio.peso = Number(m[3]);
  return { limpio, criterio: buscarSeries(criterio, historial).some((x) => !x.excluida) ? criterio : null };
}

// ==========================================
// RECORDS QUE SON UN ERROR (sin ninguna serie detras)
// ==========================================

export interface CorreccionDeRecord {
  ejercicio: string;
  actual: { peso: number; sets: number; reps: number };
  /** La mejor serie real, o null si no queda ninguna (el record se quita). */
  nuevo: { peso: number; sets: number; reps: number; volumen: number; fecha: string } | null;
}

/**
 * Solo LEE: que cambiaria corregir el record de un ejercicio. Devuelve null si
 * ese record no es sospechoso (no pasa 3x la mejor serie real): esta accion no
 * sirve para reescribir records buenos.
 */
export function previsualizarRecord(nombre: string): CorreccionDeRecord | null {
  const prs = getPRs();
  const historial = getHistory();
  if (!prs[nombre] || !prsDescartados({ [nombre]: prs[nombre] }, historial).length) return null;
  let mejor: CorreccionDeRecord['nuevo'] = null;
  for (const s of historial) {
    if (s.type === 'cardio') continue;
    for (const e of s.ejercicios ?? []) {
      if (e.nombre !== nombre || !(e.volumen > 0) || e.excluido) continue;
      // Mas peso; a igual peso, mas repeticiones; a igual, mas volumen (4x10
      // antes que 2x10).
      if (
        !mejor ||
        e.peso > mejor.peso ||
        (e.peso === mejor.peso && (e.reps > mejor.reps || (e.reps === mejor.reps && e.volumen > mejor.volumen)))
      ) {
        mejor = { peso: e.peso, sets: e.sets, reps: e.reps, volumen: e.volumen, fecha: s.savedAt || s.date };
      }
    }
  }
  return {
    ejercicio: nombre,
    actual: { peso: prs[nombre].peso, sets: prs[nombre].sets, reps: prs[nombre].reps },
    nuevo: mejor,
  };
}

/** Escribe: el record pasa a la mejor serie real. Las sesiones NO se tocan. */
export function corregirRecord(nombre: string): boolean {
  const c = previsualizarRecord(nombre);
  if (!c) return false;
  const prs = getPRs();
  if (c.nuevo) {
    prs[nombre] = { peso: c.nuevo.peso, sets: c.nuevo.sets, reps: c.nuevo.reps, volumen: c.nuevo.volumen, date: c.nuevo.fecha };
  } else {
    delete prs[nombre];
  }
  savePRs(prs);
  return true;
}
