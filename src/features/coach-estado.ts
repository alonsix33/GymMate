/**
 * Coach IA — el ESTADO que se calcula en codigo.
 *
 * La regla del 13-nov-2026: el modelo fallo siete veces en una tarde porque
 * hacia de calendario, de contador y de arbitro. Dijo "miercoles 12-11" (fue
 * jueves), sumo 22 y luego 23 sesiones el mismo dia, y decidio el grupo de hoy
 * leyendo el humor del ultimo mensaje. Aqui se calcula TODO lo que sea fecha,
 * cuenta o regla; al modelo le llega escrito y solo lo explica.
 *
 * Puro: sin DOM, sin localStorage, sin reloj propio (`ahora` entra por
 * parametro). Todas las fechas son de America/Lima.
 */
import type { ExerciseData, HistorySession, PRData } from '@/types';
import {
  ahoraLimaTexto,
  claveDiaDeSesion,
  claveDiaLima,
  diasEntre,
  etiquetaDia,
  sumarDias,
} from '@/utils/fecha';

// ==========================================
// DIAS ENTRENADOS (una entrada por fecha)
// ==========================================

export interface SerieDelDia {
  nombre: string;
  grupoMuscular: string;
  sets: number;
  reps: number;
  peso: number;
  volumen: number;
}

export interface DiaEntrenado {
  fecha: string; // 'YYYY-MM-DD', Lima
  etiqueta: string; // 'jue 12 nov'
  grupos: string[];
  series: SerieDelDia[];
  volumen: number;
  cardio: boolean;
  /** "libre 32 min", por cada cardio del dia. */
  cardioDetalle: string[];
  /** Cuantos guardados se fusionaron en este dia. */
  guardados: number;
}

function mejorSerie(a: SerieDelDia, b: SerieDelDia): SerieDelDia {
  if (b.peso > a.peso) return b;
  if (b.peso === a.peso && b.reps > a.reps) return b;
  return a;
}

/**
 * Una entrada POR FECHA LOCAL, de la mas reciente a la mas vieja.
 *
 * Dos guardados el mismo dia (un borrador reanudado, o "Espalda" y "GRUPO 4")
 * son un dia: antes el coach veia dos sesiones, contaba "tres seguidas a 55
 * (09, 13 y hoy)" y sumaba el volumen dos veces. Si el mismo ejercicio sale en
 * los dos, se queda su mejor serie, no la suma. Solo entran series con
 * volumen real y no excluidas: un ejercicio de plantilla que quedo en 0x0@0
 * no es un ejercicio que se hizo.
 */
export function fusionarDias(historial: HistorySession[], anioActual?: number): DiaEntrenado[] {
  const dias = new Map<string, DiaEntrenado & { mapa: Map<string, SerieDelDia> }>();
  for (const s of historial) {
    const fecha = claveDiaDeSesion(s);
    if (!fecha) continue;
    let dia = dias.get(fecha);
    if (!dia) {
      dia = {
        fecha,
        etiqueta: etiquetaDia(fecha, anioActual),
        grupos: [],
        series: [],
        volumen: 0,
        cardio: false,
        cardioDetalle: [],
        guardados: 0,
        mapa: new Map(),
      };
      dias.set(fecha, dia);
    }
    dia.guardados++;
    if (s.type === 'cardio') {
      dia.cardio = true;
      if (!dia.grupos.includes('Cardio')) dia.grupos.push('Cardio');
      // `totalTime` esta en SEGUNDOS.
      const cs = s as HistorySession & { mode?: string; stats?: { totalTime?: number } };
      const min = cs.stats?.totalTime ? Math.round(cs.stats.totalTime / 60) : null;
      dia.cardioDetalle.push(`${cs.mode ? cs.mode + ' ' : ''}${min ? `${min} min` : ''}`.trim());
      continue;
    }
    for (const e of (s.ejercicios ?? []) as ExerciseData[]) {
      if (!e.nombre || !(e.volumen > 0) || e.excluido) continue;
      const serie: SerieDelDia = {
        nombre: e.nombre,
        grupoMuscular: String(e.grupoMuscular ?? ''),
        sets: e.sets,
        reps: e.reps,
        peso: e.peso,
        volumen: e.volumen,
      };
      const previa = dia.mapa.get(e.nombre);
      dia.mapa.set(e.nombre, previa ? mejorSerie(previa, serie) : serie);
    }
    const grupo = (s.grupo || '').trim();
    // Un guardado sin ninguna serie real no deja rastro del grupo: no se hizo.
    const aporta = (s.ejercicios ?? []).some((e) => e.volumen > 0 && !e.excluido);
    if (grupo && aporta && !dia.grupos.includes(grupo)) dia.grupos.push(grupo);
  }
  return [...dias.values()]
    .map(({ mapa, ...dia }) => {
      const series = [...mapa.values()];
      return { ...dia, series, volumen: series.reduce((t, x) => t + x.volumen, 0) };
    })
    .filter((d) => d.series.length > 0 || d.cardio)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

// ==========================================
// PRs, OUTLIERS, EXCLUIDOS
// ==========================================

/**
 * Los PRs que siguen valiendo.
 *
 * El record guardado vive aparte del historial: excluir el Hip Thrust de 450
 * kg de la bitacora y dejar el PR de 450 dejaba el pico en 450 para todos los
 * calculos. Un PR cuyo peso solo existe en series excluidas deja de valer.
 */
export function prsVigentes(
  prs: Record<string, PRData>,
  historial: HistorySession[]
): Record<string, PRData> {
  const excluidos = new Set<string>();
  const validos = new Set<string>();
  for (const s of historial) {
    for (const e of s.ejercicios ?? []) {
      (e.excluido ? excluidos : validos).add(`${e.nombre}|${e.peso}`);
    }
  }
  const vigentes: Record<string, PRData> = {};
  for (const [nombre, pr] of Object.entries(prs)) {
    const k = `${nombre}|${pr.peso}`;
    if (excluidos.has(k) && !validos.has(k)) continue;
    vigentes[nombre] = pr;
  }
  return vigentes;
}

/** Factor a partir del cual un peso nuevo pide confirmacion. */
export const FACTOR_SOSPECHOSO = 3;

/**
 * Un peso mayor a 3 veces el mejor anterior del mismo ejercicio. Sin historial
 * previo no hay con que comparar, asi que no es sospechoso: el primer registro
 * de un ejercicio no puede ser un "outlier".
 */
export function pesoSospechoso(
  nombre: string,
  peso: number,
  historial: HistorySession[]
): { sospechoso: boolean; mejorAnterior: number } {
  let mejor = 0;
  for (const s of historial) {
    if (s.type === 'cardio') continue;
    for (const e of s.ejercicios ?? []) {
      if (e.nombre === nombre && e.volumen > 0 && !e.excluido) mejor = Math.max(mejor, e.peso);
    }
  }
  return { sospechoso: mejor > 0 && peso > mejor * FACTOR_SOSPECHOSO, mejorAnterior: mejor };
}

export interface OutlierDetectado {
  ejercicio: string;
  fecha: string;
  etiqueta: string;
  peso: number;
  mejorOtro: number;
}

/** Series ya guardadas que pasan 3x el mejor de TODAS las demas del ejercicio. */
export function detectarOutliers(historial: HistorySession[], anioActual?: number): OutlierDetectado[] {
  const filas: Array<{ nombre: string; peso: number; fecha: string }> = [];
  for (const s of historial) {
    if (s.type === 'cardio') continue;
    const fecha = claveDiaDeSesion(s);
    if (!fecha) continue;
    for (const e of s.ejercicios ?? []) {
      if (e.nombre && e.volumen > 0 && !e.excluido) filas.push({ nombre: e.nombre, peso: e.peso, fecha });
    }
  }
  const salida: OutlierDetectado[] = [];
  const vistos = new Set<string>();
  for (const f of filas) {
    const otros = filas.filter((o) => o.nombre === f.nombre && o !== f).map((o) => o.peso);
    const mejorOtro = otros.length ? Math.max(...otros) : 0;
    const k = `${f.nombre}|${f.fecha}|${f.peso}`;
    if (mejorOtro > 0 && f.peso > mejorOtro * FACTOR_SOSPECHOSO && !vistos.has(k)) {
      vistos.add(k);
      salida.push({
        ejercicio: f.nombre,
        fecha: f.fecha,
        etiqueta: etiquetaDia(f.fecha, anioActual),
        peso: f.peso,
        mejorOtro,
      });
    }
  }
  return salida.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

export interface SerieExcluida {
  ejercicio: string;
  fecha: string;
  etiqueta: string;
  peso: number;
  motivo: 'no_hecho' | 'outlier';
}

export function seriesExcluidas(historial: HistorySession[], anioActual?: number): SerieExcluida[] {
  const salida: SerieExcluida[] = [];
  for (const s of historial) {
    const fecha = claveDiaDeSesion(s);
    if (!fecha) continue;
    for (const e of s.ejercicios ?? []) {
      if (!e.excluido) continue;
      salida.push({
        ejercicio: e.nombre,
        fecha,
        etiqueta: etiquetaDia(fecha, anioActual),
        peso: e.peso,
        motivo: e.motivoExclusion ?? 'outlier',
      });
    }
  }
  return salida.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

// ==========================================
// VOLUMEN COMPARABLE
// ==========================================

export interface VolumenSemana {
  comparable: boolean;
  actualKg: number | null;
  anteriorKg: number | null;
  cambioPct: number | null;
  /** Por que no es comparable, para que nadie lo adivine. */
  motivo: string | null;
  actual: { desde: string; hasta: string } | null;
  anterior: { desde: string; hasta: string } | null;
}

/**
 * 7 dias moviles contra los 7 anteriores, en DIAS COMPLETOS.
 *
 * La tarjeta "Tu volumen bajo 23% esta semana" salia a las 15:21, antes de que
 * se hubiera entrenado ese dia y con la sesion del 12 aun sin verse: comparaba
 * una ventana en curso (instantes, no dias) contra una completa. Ahora la
 * ventana termina en el ultimo dia COMPLETO: hoy si ya hay sesion de hoy, y
 * ayer si no. Y se niega a comparar cuando el periodo anterior no esta cubierto
 * (primer registro posterior a su inicio) o no tiene volumen.
 */
export function volumenSemanal(dias: DiaEntrenado[], hoy: string): VolumenSemana {
  const sin = (motivo: string): VolumenSemana => ({
    comparable: false, actualKg: null, anteriorKg: null, cambioPct: null, motivo, actual: null, anterior: null,
  });
  const conPesas = dias.filter((d) => d.volumen > 0);
  if (conPesas.length === 0) return sin('sin sesiones de pesas');

  const hoyEntrenado = conPesas.some((d) => d.fecha === hoy);
  const fin = hoyEntrenado ? hoy : sumarDias(hoy, -1);
  const actual = { desde: sumarDias(fin, -6), hasta: fin };
  const anterior = { desde: sumarDias(fin, -13), hasta: sumarDias(fin, -7) };

  const primero = dias.reduce((m, d) => (d.fecha < m ? d.fecha : m), dias[0].fecha);
  if (primero > anterior.desde) {
    return { ...sin('el periodo anterior no esta cubierto por el registro'), actual, anterior };
  }
  const suma = (r: { desde: string; hasta: string }) =>
    conPesas.filter((d) => d.fecha >= r.desde && d.fecha <= r.hasta).reduce((t, d) => t + d.volumen, 0);
  const a = Math.round(suma(actual));
  const b = Math.round(suma(anterior));
  if (b <= 0) return { ...sin('no hay volumen en el periodo anterior'), actual, anterior };
  return {
    comparable: true,
    actualKg: a,
    anteriorKg: b,
    cambioPct: Math.round(((a - b) / b) * 100),
    motivo: null,
    actual,
    anterior,
  };
}

// ==========================================
// GRUPOS MUSCULARES, AYER, HOY
// ==========================================

export interface GrupoMuscularEstado {
  grupo: string;
  ultimaFecha: string;
  ultimaEtiqueta: string;
  diasSinTocar: number;
}

/** Dias desde que se toco cada grupo muscular, hechos AQUI: "19 dias" y "dos
 *  semanas" en el mismo mensaje salieron de dejar que el modelo los contara. */
export function gruposMusculares(dias: DiaEntrenado[], hoy: string, anioActual?: number): GrupoMuscularEstado[] {
  const ultimo = new Map<string, string>();
  for (const d of dias) {
    for (const s of d.series) {
      const g = s.grupoMuscular || 'sin grupo';
      const previo = ultimo.get(g);
      if (!previo || d.fecha > previo) ultimo.set(g, d.fecha);
    }
  }
  return [...ultimo.entries()]
    .map(([grupo, ultimaFecha]) => ({
      grupo,
      ultimaFecha,
      ultimaEtiqueta: etiquetaDia(ultimaFecha, anioActual),
      diasSinTocar: diasEntre(ultimaFecha, hoy),
    }))
    .sort((a, b) => b.diasSinTocar - a.diasSinTocar || a.grupo.localeCompare(b.grupo));
}

export interface PlantillaDeGrupo {
  nombre: string;
  /** Ejercicios obligatorios. */
  ejercicios: string[];
}

/**
 * El grupo que toca hoy. Una regla, no un criterio: el grupo de la lista cuya
 * ultima vez es la MAS ANTIGUA (los que nunca se hicieron, primero). Con los
 * mismos datos devuelve siempre lo mismo, asi que repetir "¿hoy?" no cambia la
 * respuesta; el modelo la explica pero no la reemplaza.
 *
 * Un dia "cuenta" para una plantilla si el grupo guardado se llama igual o si
 * se hicieron al menos la mitad de sus ejercicios: la sesion "Espalda" de una
 * rutina propia no se llama "GRUPO 4" y aun asi es GRUPO 4.
 */
export function sugerirGrupoDeHoy(
  dias: DiaEntrenado[],
  hoy: string,
  plantillas: PlantillaDeGrupo[],
  anioActual?: number
): { grupo: string; motivo: string } | null {
  if (dias.some((d) => d.fecha === hoy && (d.series.length > 0 || d.cardio))) return null;
  if (plantillas.length === 0) return null;

  const ultimaVez = (p: PlantillaDeGrupo): string | null => {
    const minimo = Math.max(1, Math.ceil(p.ejercicios.length / 2));
    for (const d of dias) {
      if (d.grupos.includes(p.nombre)) return d.fecha;
      const hechos = p.ejercicios.filter((n) => d.series.some((s) => s.nombre === n)).length;
      if (hechos >= minimo) return d.fecha;
    }
    return null;
  };

  let elegido: { p: PlantillaDeGrupo; fecha: string | null } | null = null;
  for (const p of plantillas) {
    const fecha = ultimaVez(p);
    if (!elegido) {
      elegido = { p, fecha };
    } else if (elegido.fecha !== null && (fecha === null || fecha < elegido.fecha)) {
      elegido = { p, fecha };
    }
  }
  if (!elegido) return null;
  return {
    grupo: elegido.p.nombre,
    motivo:
      elegido.fecha === null
        ? 'todavia no hay ninguna sesion de este grupo en el registro'
        : `su ultima sesion fue ${etiquetaDia(elegido.fecha, anioActual)}, hace ${diasEntre(elegido.fecha, hoy)} dias`,
  };
}

export interface ResumenDeDia {
  fecha: string;
  etiqueta: string;
  grupos: string[];
  series: Array<{ nombre: string; sets: number; reps: number; peso: number }>;
}

function resumir(d: DiaEntrenado): ResumenDeDia {
  return {
    fecha: d.fecha,
    etiqueta: d.etiqueta,
    grupos: d.grupos,
    series: d.series.map(({ nombre, sets, reps, peso }) => ({ nombre, sets, reps, peso })),
  };
}

// ==========================================
// EL ESTADO ENTERO
// ==========================================

export interface EstadoCoach {
  datosAl: string;
  hoy: { fecha: string; etiqueta: string; entrenado: boolean; grupos: string[]; sesion: ResumenDeDia | null };
  ayer: { fecha: string; etiqueta: string; sesion: ResumenDeDia | null };
  ultimaSesion: { fecha: string; etiqueta: string; diasDesde: number } | null;
  sugerenciaDeHoy: { grupo: string; motivo: string } | null;
  volumenSemana: VolumenSemana;
  gruposMusculares: GrupoMuscularEstado[];
  ultimosDias: ResumenDeDia[];
  outliersExcluidos: SerieExcluida[];
  outliersSospechosos: OutlierDetectado[];
}

/** Cuantos dias recientes viajan con su detalle, para "¿que hice ayer?". */
export const DIAS_CON_DETALLE = 14;

export function construirEstado(
  historial: HistorySession[],
  opciones: { ahora: Date; plantillas?: PlantillaDeGrupo[] }
): EstadoCoach {
  const hoy = claveDiaLima(opciones.ahora);
  const anio = Number(hoy.slice(0, 4));
  const dias = fusionarDias(historial, anio);
  const ayerClave = sumarDias(hoy, -1);
  const deHoy = dias.find((d) => d.fecha === hoy) ?? null;
  const deAyer = dias.find((d) => d.fecha === ayerClave) ?? null;
  const ultima = dias[0] ?? null;

  return {
    datosAl: ahoraLimaTexto(opciones.ahora),
    hoy: {
      fecha: hoy,
      etiqueta: etiquetaDia(hoy, anio),
      entrenado: deHoy !== null,
      grupos: deHoy?.grupos ?? [],
      sesion: deHoy ? resumir(deHoy) : null,
    },
    ayer: { fecha: ayerClave, etiqueta: etiquetaDia(ayerClave, anio), sesion: deAyer ? resumir(deAyer) : null },
    ultimaSesion: ultima
      ? { fecha: ultima.fecha, etiqueta: ultima.etiqueta, diasDesde: diasEntre(ultima.fecha, hoy) }
      : null,
    sugerenciaDeHoy: sugerirGrupoDeHoy(dias, hoy, opciones.plantillas ?? [], anio),
    volumenSemana: volumenSemanal(dias, hoy),
    gruposMusculares: gruposMusculares(dias, hoy, anio),
    ultimosDias: dias.filter((d) => diasEntre(d.fecha, hoy) < DIAS_CON_DETALLE).map(resumir),
    outliersExcluidos: seriesExcluidas(historial, anio),
    outliersSospechosos: detectarOutliers(historial, anio),
  };
}

/** Id estable de un ejercicio: una maquina, un id. "Aductora Maquina" y
 *  "Abductora Maquina" son dos ids, y eso se comprueba en un test. */
export function idDe(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
