/**
 * Coach · gráficos que dibuja LA APP, no el modelo.
 *
 * El modelo no tiene gráficos y no hace falta que "sepa llamarlos": cuando el
 * usuario pide uno ("muéstrame el gráfico", "evolución del jalón"), la app lo
 * reconoce, elige el ejercicio con una regla y lo dibuja con los datos de la
 * bitácora. Así el gráfico aparece siempre igual, no depende del humor del
 * modelo y no se puede inventar un punto: cada cifra sale del historial.
 *
 * Puro: sin DOM ni almacenamiento (el historial entra por parámetro).
 */
import type { HistorySession } from '@/types';
import { claveDiaLima, diasEntre, etiquetaDia, sumarDias } from '@/utils/fecha';
import { fusionarDias, gruposMusculares, volumenSemanal } from '@/features/coach-estado';
import { unaRepMaxPromedio } from '@/utils/calculations';
import { repartirCien } from '@/utils/zonas';
import { cifra, cifraDecimal, escapar } from '@/utils/formato';

export interface PuntoDeEjercicio {
  fecha: string; // 'YYYY-MM-DD'
  etiqueta: string; // 'jue 12 nov'
  peso: number;
  reps: number;
  sets: number;
}

/** Una entrada por DÍA (la mejor serie), de la más antigua a la más reciente.
 *  Las series excluidas y las sin volumen no entran (lo hace `fusionarDias`). */
export function serieDeEjercicio(
  nombre: string,
  historial: HistorySession[],
  ahora: Date,
  meses = 6
): PuntoDeEjercicio[] {
  const hoy = claveDiaLima(ahora);
  const anio = Number(hoy.slice(0, 4));
  const limite = meses * 31;
  return fusionarDias(historial, anio)
    .filter((d) => diasEntre(d.fecha, hoy) <= limite)
    .flatMap((d) => {
      const s = d.series.find((x) => x.nombre === nombre);
      return s ? [{ fecha: d.fecha, etiqueta: d.etiqueta, peso: s.peso, reps: s.reps, sets: s.sets }] : [];
    })
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

/** El pie del gráfico, escrito con cifras que salen de los puntos. */
export function resumenDeSerie(nombre: string, puntos: PuntoDeEjercicio[], meses = 6): string {
  if (puntos.length === 0) return `No tengo sesiones de ${nombre} en los últimos ${meses} meses para dibujar.`;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const pico = Math.max(...puntos.map((p) => p.peso));
  const sesiones = `${puntos.length} ${puntos.length === 1 ? 'sesión' : 'sesiones'}`;
  if (puntos.length === 1) {
    return `${nombre}: una sola sesión en ${meses} meses, ${cifraDecimal(ultimo.peso)} kg (${ultimo.etiqueta}).`;
  }
  return (
    `${nombre} · últimos ${meses} meses: de ${cifraDecimal(primero.peso)} kg (${primero.etiqueta}) ` +
    `a ${cifraDecimal(ultimo.peso)} kg (${ultimo.etiqueta}). Pico ${cifraDecimal(pico)} kg · ${sesiones}.`
  );
}

// ==========================================
// RECONOCER EL PEDIDO
// ==========================================

/** "gráfico", "gráfica", "evolución", "curva". Sin tildes también. */
const PIDE_GRAFICO = /gr[aá]fic[oa]s?|evoluci[oó]n|curva de/i;

export function pideGrafico(texto: string): boolean {
  return PIDE_GRAFICO.test(texto);
}

const sinTildes = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Palabras demasiado comunes para identificar un ejercicio ("press" está en
 *  media docena y "maquina" en otra media). */
const COMUNES = new Set(['maquina', 'polea', 'mancuerna', 'mancuernas', 'barra', 'press', 'curl', 'para', 'con', 'del', 'los', 'las']);

function palabrasClave(nombre: string): string[] {
  return sinTildes(nombre)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !COMUNES.has(w));
}

/** Los gráficos que sabe dibujar la app. */
export type TipoDeGrafico =
  | 'peso' // peso de un ejercicio, sesión a sesión
  | '1rm' // 1RM estimado de un ejercicio
  | 'semanas' // últimos 7 días contra los 7 anteriores
  | 'volumen_semanal' // volumen de las últimas semanas
  | 'sin_tocar' // días sin tocar cada grupo muscular
  | 'reparto' // volumen por grupo, últimos 30 días
  | 'hoy_vs_ultima'; // la última sesión contra la vez anterior

/** Lo que un turno guarda para volver a dibujar: el tipo y, si hace falta, el
 *  ejercicio. Los puntos se recalculan al pintar. */
export interface GraficoDelTurno {
  tipo: TipoDeGrafico;
  ejercicio?: string;
}

/** Un botón: lo que se ve y la frase que se manda al tocarlo. La frase es
 *  siempre una que `detectarPedidoDeGrafico` entiende sin ambigüedad. */
export interface Opcion {
  etiqueta: string;
  frase: string;
  grupo?: string;
}

export type PedidoDeGrafico =
  | { tipo: 'grafico'; grafico: GraficoDelTurno }
  | { tipo: 'elegir'; pregunta: string; opciones: Opcion[] };

const MAX_OPCIONES = 6;

/** Las frases canónicas de cada gráfico: las de los botones. */
export const FRASE_DE: Record<Exclude<TipoDeGrafico, 'peso' | '1rm'>, string> = {
  semanas: 'Comparar semanas',
  volumen_semanal: 'Volumen por semana',
  sin_tocar: 'Días sin tocar por grupo',
  reparto: 'Reparto de volumen por grupo',
  hoy_vs_ultima: 'Hoy contra la última vez',
};

/** Los ejercicios que el texto nombra: el nombre entero, o una palabra clave
 *  ("jalón", "banca"). Devuelve todos los que encajan. */
export function ejerciciosNombrados(texto: string, nombres: string[]): string[] {
  const t = sinTildes(texto);
  const completos = nombres.filter((n) => t.includes(sinTildes(n)));
  // El nombre entero manda: "Press Banca Inclinado" no es tambien "Press Banca".
  if (completos.length > 0) {
    return completos.filter((n) => !completos.some((o) => o !== n && sinTildes(o).includes(sinTildes(n))));
  }
  const palabras = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
  return nombres.filter((n) => palabrasClave(n).some((w) => palabras.has(w)));
}

/** ¿Es una petición y no un comentario? "llevo 3 semanas sin tocar piernas" no
 *  pide ningún gráfico; "¿qué grupo tengo descuidado?" sí. */
const ES_PETICION = /\?|muestra|muestrame|ensename|dime|dame|pasame|compara|\bver\b|cual|cuanto|que grupo|como (voy|me fue|estuve|salio)|\bcontra\b|\bvs\b|versus/;

/** Quien cuenta algo de si mismo no esta pidiendo nada: "llevo 3 semanas sin
 *  tocar piernas". */
const NARRACION = /\b(llevo|llevaba|hice|hizo|fui|estuve|entrene|tuve|he )\b/;

/** Qué tipo de gráfico pide el texto, por frases fuertes. */
function tipoPedido(texto: string, pide: boolean): TipoDeGrafico | 'volumen_ambiguo' | null {
  const t = sinTildes(texto);
  // Un mensaje CORTO con el nombre de un gráfico es un pedido aunque no lleve
  // verbo: es lo que mandan los botones ("Volumen por semana").
  const corto = t.trim().split(/\s+/).length <= 6 && !NARRACION.test(t);
  const peticion = pide || ES_PETICION.test(t) || corto;
  if (!peticion) return null;
  if (/sin tocar|descuidad|abandonad|que grupo (me )?falta|dias sin/.test(t)) return 'sin_tocar';
  if (/\bhoy\b.*(contra|vs\b|versus|frente|comparad)|compara\w*.*(ultima|anterior) vez|como (me fue|estuve|salio) hoy|ultima vez.*(contra|vs\b)/.test(t)) return 'hoy_vs_ultima';
  if (/\b1 ?rm\b|una repeticion maxima|maximo estimado|fuerza estimada/.test(t)) return '1rm';
  if (/reparto|distribucion|volumen (por|de cada) grupo|por grupo muscular/.test(t)) return 'reparto';
  if (/volumen (por|de las|de cada) semanas?|tendencia (del )?volumen|ultimas (\d+ )?semanas|semana por semana/.test(t)) return 'volumen_semanal';
  if (/compar\w* (las )?semanas|(esta|ultima) semana (contra|vs\b|versus|frente)|semana (contra|vs\b|versus) (la )?(semana )?(pasada|anterior)/.test(t)) return 'semanas';
  if (pide && /volumen/.test(t)) return 'volumen_ambiguo';
  return null;
}

const OTROS: Array<{ etiqueta: string; frase: string }> = [
  { etiqueta: 'Comparar semanas', frase: FRASE_DE.semanas },
  { etiqueta: 'Volumen por semana', frase: FRASE_DE.volumen_semanal },
  { etiqueta: 'Días sin tocar', frase: FRASE_DE.sin_tocar },
  { etiqueta: 'Reparto por grupo', frase: FRASE_DE.reparto },
  { etiqueta: 'Hoy vs la última vez', frase: FRASE_DE.hoy_vs_ultima },
  { etiqueta: '1RM estimado', frase: '1RM estimado' },
];

const DOS = (t: TipoDeGrafico | 'volumen_ambiguo'): PedidoDeGrafico | null => (t === 'volumen_ambiguo' ? null : { tipo: 'grafico', grafico: { tipo: t } });

/**
 * Qué gráfico dibujar, o qué preguntar.
 *
 *   - Una frase clara de tipo ("compara las semanas", "días sin tocar") → ese.
 *   - Un ejercicio + gráfico/1RM → el de peso o el de 1RM de ese ejercicio.
 *   - Poco claro → se PREGUNTA con botones, nunca se adivina:
 *       · "gráfico del volumen" → semanas / por semana / por grupo;
 *       · un ejercicio ambiguo ("jalón") → cuál de los dos;
 *       · "muéstrame el gráfico" a secas → los ejercicios de los que se hablaba
 *         y los demás tipos de gráfico.
 *
 * Ejercicio, en este orden: el del mensaje del usuario; los que nombró el
 * último mensaje del coach (por nombre ENTERO); los más entrenados en 90 días.
 */
export function detectarPedidoDeGrafico(
  texto: string,
  historial: HistorySession[],
  turnos: Array<{ autor: 'coach' | 'usuario'; texto: string }>,
  ahora: Date
): PedidoDeGrafico | null {
  const pide = pideGrafico(texto);
  const tipo = tipoPedido(texto, pide);
  if (tipo === null && !pide) return null;

  if (tipo === 'volumen_ambiguo') {
    return {
      tipo: 'elegir',
      pregunta: '¿Qué gráfico de volumen quieres?',
      opciones: [
        { etiqueta: 'Comparar semanas', frase: FRASE_DE.semanas },
        { etiqueta: 'Volumen por semana', frase: FRASE_DE.volumen_semanal },
        { etiqueta: 'Reparto por grupo', frase: FRASE_DE.reparto },
      ],
    };
  }
  if (tipo && tipo !== 'peso' && tipo !== '1rm') return DOS(tipo);

  const nombres = [...new Set(historial.flatMap((s) => (s.ejercicios ?? []).filter((e) => e.volumen > 0 && !e.excluido).map((e) => e.nombre)))];
  if (nombres.length === 0) return null;

  const metrica: 'peso' | '1rm' = tipo === '1rm' ? '1rm' : 'peso';
  const frase = (n: string) => (metrica === '1rm' ? `1RM estimado de ${n}` : `Gráfico de ${n}`);
  const decidir = (lista: string[], pregunta: string): PedidoDeGrafico | null =>
    lista.length === 1
      ? { tipo: 'grafico', grafico: { tipo: metrica, ejercicio: lista[0] } }
      : lista.length > 1
        ? { tipo: 'elegir', pregunta, opciones: lista.slice(0, MAX_OPCIONES).map((n) => ({ etiqueta: n, frase: frase(n), grupo: 'Ejercicios' })) }
        : null;

  const delUsuario = decidir(ejerciciosNombrados(texto, nombres), '¿De cuál ejercicio?');
  if (delUsuario) return delUsuario;

  const ultimoCoach = [...turnos].reverse().find((t) => t.autor === 'coach');
  const t = ultimoCoach ? sinTildes(ultimoCoach.texto) : '';
  const delCoach = ultimoCoach ? ejerciciosNombrados(ultimoCoach.texto, nombres).filter((n) => t.includes(sinTildes(n))) : [];

  // "1RM" sin ejercicio: hace falta uno. Se pregunta (o se usa el del coach si
  // es uno solo).
  if (metrica === '1rm') return decidir(delCoach, '¿El 1RM de cuál ejercicio?') ?? decidir(topEntrenados(historial, ahora, nombres), '¿El 1RM de cuál ejercicio?');

  // Un gráfico a secas: si el coach hablaba de UN ejercicio, ese; si no, se
  // pregunta con los ejercicios de los que se hablaba y los demás gráficos.
  if (delCoach.length === 1) return { tipo: 'grafico', grafico: { tipo: 'peso', ejercicio: delCoach[0] } };
  const ejercicios = (delCoach.length > 1 ? delCoach : topEntrenados(historial, ahora, nombres)).slice(0, MAX_OPCIONES);
  return {
    tipo: 'elegir',
    pregunta: '¿Qué gráfico quieres?',
    opciones: [
      ...ejercicios.map((n) => ({ etiqueta: n, frase: `Gráfico de ${n}`, grupo: 'Peso de un ejercicio' })),
      ...OTROS.map((o) => ({ ...o, grupo: 'Otros gráficos' })),
    ],
  };
}

function topEntrenados(historial: HistorySession[], ahora: Date, nombres: string[]): string[] {
  const hoy = claveDiaLima(ahora);
  const cuenta = new Map<string, number>();
  for (const d of fusionarDias(historial)) {
    if (diasEntre(d.fecha, hoy) > 90) continue;
    for (const s of d.series) cuenta.set(s.nombre, (cuenta.get(s.nombre) ?? 0) + 1);
  }
  const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
  return top.length > 0 ? top : nombres;
}

// ==========================================
// DIBUJAR
// ==========================================

const W = 320;
const H = 150;
const MIZQ = 36;
const MDER = 10;
const MARR = 12;
const MABA = 24;

/** El gráfico como SVG. Cada cifra sale de `puntos`; los textos se escapan. */
export function graficoSVG(
  nombre: string,
  puntos: PuntoDeEjercicio[],
  titulo: (p: PuntoDeEjercicio) => string = (p) => `${p.etiqueta}: ${p.sets}×${p.reps} · ${cifraDecimal(p.peso)} kg`
): string {
  if (puntos.length === 0) return '';
  const pesos = puntos.map((p) => p.peso);
  const min = Math.min(...pesos);
  const max = Math.max(...pesos);
  // Margen del 8 % arriba y abajo, y un rango minimo para que una linea plana
  // no se pegue al borde.
  const rango = Math.max(max - min, max * 0.1, 1);
  const bajo = min - rango * 0.08;
  const alto = max + rango * 0.08;
  const yDe = (v: number) => MARR + (1 - (v - bajo) / (alto - bajo)) * (H - MARR - MABA);

  const t0 = Date.parse(`${puntos[0].fecha}T12:00:00Z`);
  const t1 = Date.parse(`${puntos[puntos.length - 1].fecha}T12:00:00Z`);
  const xDe = (f: string) =>
    puntos.length === 1 || t1 === t0
      ? MIZQ + (W - MIZQ - MDER) / 2
      : MIZQ + ((Date.parse(`${f}T12:00:00Z`) - t0) / (t1 - t0)) * (W - MIZQ - MDER);

  const coords = puntos.map((p) => `${xDe(p.fecha).toFixed(1)},${yDe(p.peso).toFixed(1)}`);
  const corto = (p: PuntoDeEjercicio) => escapar(p.etiqueta.replace(/^\S+\s/, ''));
  const ultimo = puntos[puntos.length - 1];
  const idxPico = pesos.indexOf(max);

  return `
    <svg class="f-coach__grafico-svg" viewBox="0 0 ${W} ${H}" role="img"
         aria-label="${escapar(`Gráfico de ${nombre}: ${puntos.length} sesiones, de ${puntos[0].peso} a ${ultimo.peso} kg`)}">
      <line class="f-coach__grafico-eje" x1="${MIZQ}" y1="${yDe(max).toFixed(1)}" x2="${W - MDER}" y2="${yDe(max).toFixed(1)}" />
      <line class="f-coach__grafico-eje" x1="${MIZQ}" y1="${yDe(min).toFixed(1)}" x2="${W - MDER}" y2="${yDe(min).toFixed(1)}" />
      <text class="f-coach__grafico-txt" x="${MIZQ - 6}" y="${(yDe(max) + 4).toFixed(1)}" text-anchor="end">${escapar(cifraDecimal(max))}</text>
      ${max === min ? '' : `<text class="f-coach__grafico-txt" x="${MIZQ - 6}" y="${(yDe(min) + 4).toFixed(1)}" text-anchor="end">${escapar(cifraDecimal(min))}</text>`}
      ${puntos.length > 1 ? `<polyline class="f-coach__grafico-linea" points="${coords.join(' ')}" />` : ''}
      ${puntos
        .map((p, i) => {
          const [x, y] = coords[i].split(',');
          const marca = i === puntos.length - 1 ? ' f-coach__grafico-punto--ultimo' : i === idxPico ? ' f-coach__grafico-punto--pico' : '';
          return `<circle class="f-coach__grafico-punto${marca}" cx="${x}" cy="${y}" r="${i === puntos.length - 1 ? 4 : 3}"><title>${escapar(titulo(p))}</title></circle>`;
        })
        .join('')}
      <text class="f-coach__grafico-txt" x="${MIZQ}" y="${H - 6}" text-anchor="start">${corto(puntos[0])}</text>
      ${puntos.length > 1 ? `<text class="f-coach__grafico-txt" x="${W - MDER}" y="${H - 6}" text-anchor="end">${corto(ultimo)}</text>` : ''}
    </svg>
  `;
}

// ==========================================
// LOS DEMÁS GRÁFICOS: DATOS
// ==========================================

const anioDe = (ahora: Date) => Number(claveDiaLima(ahora).slice(0, 4));
/** "6 nov" (sin el día de la semana). */
const corta = (etiqueta: string) => etiqueta.replace(/^\S+\s/, '');

export interface SemanaDeVolumen {
  desde: string;
  hasta: string;
  etiqueta: string; // "6 nov"
  kg: number;
}

/** El volumen de las últimas `n` semanas de 7 días, terminando en el último día
 *  COMPLETO (hoy si ya hay sesión de hoy, ayer si no): las mismas ventanas que
 *  la tarjeta "Tu volumen subió X%". Una semana que empieza antes del primer
 *  registro no se dibuja: su barra baja sería falsa. */
export function volumenPorSemana(historial: HistorySession[], ahora: Date, n = 8): SemanaDeVolumen[] {
  const hoy = claveDiaLima(ahora);
  const dias = fusionarDias(historial, anioDe(ahora)).filter((d) => d.volumen > 0);
  if (dias.length === 0) return [];
  const fin = dias.some((d) => d.fecha === hoy) ? hoy : sumarDias(hoy, -1);
  const primero = dias.reduce((m, d) => (d.fecha < m ? d.fecha : m), dias[0].fecha);
  const semanas: SemanaDeVolumen[] = [];
  for (let i = 0; i < n; i++) {
    const hasta = sumarDias(fin, -7 * i);
    const desde = sumarDias(hasta, -6);
    if (desde < primero) break;
    const kg = dias.filter((d) => d.fecha >= desde && d.fecha <= hasta).reduce((t, d) => t + d.volumen, 0);
    semanas.unshift({ desde, hasta, etiqueta: corta(etiquetaDia(desde)), kg: Math.round(kg) });
  }
  return semanas;
}

export interface GrupoDeVolumen {
  grupo: string;
  kg: number;
  porcentaje: number;
}

/** El volumen por grupo muscular de los últimos 30 días, con porcentajes
 *  enteros que suman 100. */
export function repartoPorGrupo(historial: HistorySession[], ahora: Date, dias = 30): GrupoDeVolumen[] {
  const hoy = claveDiaLima(ahora);
  const kg = new Map<string, number>();
  for (const d of fusionarDias(historial, anioDe(ahora))) {
    if (diasEntre(d.fecha, hoy) >= dias) continue;
    for (const x of d.series) {
      const g = x.grupoMuscular || 'Sin grupo';
      kg.set(g, (kg.get(g) ?? 0) + x.volumen);
    }
  }
  const total = [...kg.values()].reduce((t, v) => t + v, 0);
  if (total <= 0) return [];
  const filas = [...kg.entries()].sort((a, b) => b[1] - a[1]);
  const pct = repartirCien(filas.map(([, v]) => (v / total) * 100));
  return filas.map(([grupo, v], i) => ({ grupo, kg: Math.round(v), porcentaje: pct[i] }));
}

export interface ComparacionDeEjercicio {
  ejercicio: string;
  actual: number;
  anterior: number | null;
  sentido: 'subio' | 'igual' | 'bajo' | 'nuevo';
}

export interface HoyVsUltima {
  fecha: string;
  etiqueta: string;
  esHoy: boolean;
  items: ComparacionDeEjercicio[];
}

/** La sesión más reciente (hoy, o la última que hubo) contra la vez anterior
 *  de cada uno de sus ejercicios. Compara el peso; a igual peso, el volumen. */
export function hoyContraUltima(historial: HistorySession[], ahora: Date): HoyVsUltima | null {
  const hoy = claveDiaLima(ahora);
  const dias = fusionarDias(historial, anioDe(ahora));
  const ultimo = dias.find((d) => d.series.length > 0);
  if (!ultimo) return null;
  const items = ultimo.series.map((s) => {
    const previo = dias.find((d) => d.fecha < ultimo.fecha && d.series.some((x) => x.nombre === s.nombre));
    const a = previo?.series.find((x) => x.nombre === s.nombre);
    let sentido: ComparacionDeEjercicio['sentido'] = 'nuevo';
    if (a) {
      const d = s.peso - a.peso || s.volumen - a.volumen;
      sentido = d > 0 ? 'subio' : d < 0 ? 'bajo' : 'igual';
    }
    return { ejercicio: s.nombre, actual: s.peso, anterior: a ? a.peso : null, sentido };
  });
  return { fecha: ultimo.fecha, etiqueta: ultimo.etiqueta, esHoy: ultimo.fecha === hoy, items };
}

/** El 1RM estimado (promedio de las tres fórmulas, igual que Récords) de cada
 *  sesión. Las series de más de 15 reps no se estiman y no entran. */
export function unaRepMaxPorSesion(nombre: string, historial: HistorySession[], ahora: Date): PuntoDeEjercicio[] {
  return serieDeEjercicio(nombre, historial, ahora).flatMap((p) => {
    const rm = unaRepMaxPromedio(p.peso, p.reps);
    return rm === null ? [] : [{ ...p, peso: Math.round(rm) }];
  });
}

// ==========================================
// LOS DEMÁS GRÁFICOS: DIBUJO
// ==========================================

const compacto = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(v)));

interface BarraV {
  etiqueta: string;
  valor: number;
  destacada?: boolean;
}

/** Barras verticales con el valor encima y la etiqueta debajo. */
export function barrasVerticalesSVG(titulo: string, barras: BarraV[]): string {
  if (barras.length === 0) return '';
  const max = Math.max(...barras.map((b) => b.valor), 1);
  const util = H - 26 - 22;
  const ancho = (W - 16) / barras.length;
  const grosor = Math.min(34, ancho * 0.62);
  return `
    <svg class="f-coach__grafico-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapar(titulo)}">
      <line class="f-coach__grafico-eje" x1="8" y1="${H - 22}" x2="${W - 8}" y2="${H - 22}" />
      ${barras
        .map((b, i) => {
          const alto = Math.max(2, (b.valor / max) * util);
          const x = 8 + ancho * i + (ancho - grosor) / 2;
          const y = H - 22 - alto;
          return `<rect class="f-coach__barra${b.destacada ? ' f-coach__barra--destacada' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${grosor.toFixed(1)}" height="${alto.toFixed(1)}" rx="3"><title>${escapar(`${b.etiqueta}: ${cifra(b.valor)} kg`)}</title></rect>
            <text class="f-coach__grafico-txt" x="${(x + grosor / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">${escapar(compacto(b.valor))}</text>
            <text class="f-coach__grafico-txt" x="${(x + grosor / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${escapar(b.etiqueta)}</text>`;
        })
        .join('')}
    </svg>
  `;
}

interface BarraH {
  etiqueta: string;
  valor: number;
  texto: string;
  destacada?: boolean;
}

const FILA = 26;

/** Barras horizontales: nombre a la izquierda, barra y texto a la derecha. */
export function barrasHorizontalesSVG(titulo: string, barras: BarraH[]): string {
  if (barras.length === 0) return '';
  const max = Math.max(...barras.map((b) => b.valor), 1);
  const alto = barras.length * FILA + 8;
  const x0 = 112;
  const util = W - x0 - 44;
  return `
    <svg class="f-coach__grafico-svg" viewBox="0 0 ${W} ${alto}" role="img" aria-label="${escapar(titulo)}">
      ${barras
        .map((b, i) => {
          const y = 4 + i * FILA;
          const largo = Math.max(2, (b.valor / max) * util);
          const nombre = b.etiqueta.length > 18 ? `${b.etiqueta.slice(0, 17)}…` : b.etiqueta;
          return `<text class="f-coach__grafico-txt" x="${x0 - 8}" y="${y + 14}" text-anchor="end">${escapar(nombre)}</text>
            <rect class="f-coach__barra${b.destacada ? ' f-coach__barra--destacada' : ''}" x="${x0}" y="${y + 3}" width="${largo.toFixed(1)}" height="14" rx="3"><title>${escapar(`${b.etiqueta}: ${b.texto}`)}</title></rect>
            <text class="f-coach__grafico-txt" x="${(x0 + largo + 6).toFixed(1)}" y="${y + 14}" text-anchor="start">${escapar(b.texto)}</text>`;
        })
        .join('')}
    </svg>
  `;
}

/** Dos barras por ejercicio: la vez anterior (gris) y la última (naranja). */
export function barrasParesSVG(titulo: string, items: ComparacionDeEjercicio[]): string {
  if (items.length === 0) return '';
  const max = Math.max(...items.flatMap((i) => [i.actual, i.anterior ?? 0]), 1);
  const FP = 34;
  const alto = items.length * FP + 22;
  const x0 = 112;
  const util = W - x0 - 44;
  return `
    <svg class="f-coach__grafico-svg" viewBox="0 0 ${W} ${alto}" role="img" aria-label="${escapar(titulo)}">
      ${items
        .map((it, i) => {
          const y = 4 + i * FP;
          const la = it.anterior === null ? 0 : Math.max(2, (it.anterior / max) * util);
          const lb = Math.max(2, (it.actual / max) * util);
          const nombre = it.ejercicio.length > 18 ? `${it.ejercicio.slice(0, 17)}…` : it.ejercicio;
          const flecha = it.sentido === 'subio' ? ' ↑' : it.sentido === 'bajo' ? ' ↓' : '';
          return `<text class="f-coach__grafico-txt" x="${x0 - 8}" y="${y + 19}" text-anchor="end">${escapar(nombre)}</text>
            ${it.anterior === null ? '' : `<rect class="f-coach__barra" x="${x0}" y="${y + 2}" width="${la.toFixed(1)}" height="11" rx="3"><title>${escapar(`Vez anterior: ${cifraDecimal(it.anterior)} kg`)}</title></rect>
            <text class="f-coach__grafico-txt" x="${(x0 + la + 6).toFixed(1)}" y="${y + 11}" text-anchor="start">${escapar(cifraDecimal(it.anterior))}</text>`}
            <rect class="f-coach__barra f-coach__barra--destacada" x="${x0}" y="${y + 16}" width="${lb.toFixed(1)}" height="11" rx="3"><title>${escapar(`Última: ${cifraDecimal(it.actual)} kg`)}</title></rect>
            <text class="f-coach__grafico-txt" x="${(x0 + lb + 6).toFixed(1)}" y="${y + 25}" text-anchor="start">${escapar(cifraDecimal(it.actual) + flecha)}</text>`;
        })
        .join('')}
      <text class="f-coach__grafico-txt" x="${x0}" y="${alto - 4}" text-anchor="start">gris: vez anterior · naranja: última</text>
    </svg>
  `;
}

// ==========================================
// DIBUJAR CUALQUIER GRÁFICO (pie + SVG)
// ==========================================

export interface GraficoDibujado {
  /** El pie, con cifras que salen de los datos. */
  texto: string;
  /** El SVG; vacío si no hay nada que dibujar. */
  svg: string;
}

/** El gráfico completo de un turno, con los datos de AHORA. Puro. */
export function dibujarGrafico(g: GraficoDelTurno, historial: HistorySession[], ahora: Date): GraficoDibujado {
  const hoy = claveDiaLima(ahora);
  switch (g.tipo) {
    case 'peso': {
      const nombre = g.ejercicio ?? '';
      const puntos = serieDeEjercicio(nombre, historial, ahora);
      return { texto: resumenDeSerie(nombre, puntos), svg: graficoSVG(nombre, puntos) };
    }
    case '1rm': {
      const nombre = g.ejercicio ?? '';
      const puntos = unaRepMaxPorSesion(nombre, historial, ahora);
      if (puntos.length === 0) {
        return { texto: `No puedo estimar el 1RM de ${nombre}: no hay series de 15 reps o menos en los últimos 6 meses.`, svg: '' };
      }
      const ult = puntos[puntos.length - 1];
      const texto =
        puntos.length === 1
          ? `${nombre} · 1RM estimado: ${cifraDecimal(ult.peso)} kg (${ult.etiqueta}). Una sola sesión.`
          : `${nombre} · 1RM estimado: de ${cifraDecimal(puntos[0].peso)} kg (${puntos[0].etiqueta}) a ${cifraDecimal(ult.peso)} kg (${ult.etiqueta}). Pico ${cifraDecimal(Math.max(...puntos.map((p) => p.peso)))} kg.`;
      return { texto, svg: graficoSVG(nombre, puntos, (p) => `${p.etiqueta}: 1RM ≈ ${cifraDecimal(p.peso)} kg (${p.sets}×${p.reps})`) };
    }
    case 'semanas': {
      const v = volumenSemanal(fusionarDias(historial, anioDe(ahora)), hoy);
      if (!v.comparable || !v.actual || !v.anterior || v.actualKg === null || v.anteriorKg === null) {
        return { texto: `No se pueden comparar las semanas: ${v.motivo ?? 'faltan datos'}.`, svg: '' };
      }
      const rango = (r: { desde: string; hasta: string }) => `${corta(etiquetaDia(r.desde))}–${corta(etiquetaDia(r.hasta))}`;
      const signo = (v.cambioPct ?? 0) > 0 ? '+' : '';
      return {
        texto:
          `Últimos 7 días (${rango(v.actual)}): ${cifra(v.actualKg)} kg · 7 días anteriores (${rango(v.anterior)}): ${cifra(v.anteriorKg)} kg · ${signo}${v.cambioPct} %.`,
        svg: barrasVerticalesSVG('Volumen de los últimos 7 días contra los 7 anteriores', [
          { etiqueta: rango(v.anterior), valor: v.anteriorKg },
          { etiqueta: rango(v.actual), valor: v.actualKg, destacada: true },
        ]),
      };
    }
    case 'volumen_semanal': {
      const sem = volumenPorSemana(historial, ahora);
      if (sem.length === 0) return { texto: 'Todavía no hay semanas completas de registro para dibujar.', svg: '' };
      const mejor = sem.reduce((m, s) => (s.kg > m.kg ? s : m), sem[0]);
      const ult = sem[sem.length - 1];
      return {
        texto:
          sem.length === 1
            ? `Una sola semana completa: ${cifra(ult.kg)} kg (desde el ${ult.etiqueta}).`
            : `Volumen por semana: de ${cifra(sem[0].kg)} kg (semana del ${sem[0].etiqueta}) a ${cifra(ult.kg)} kg (semana del ${ult.etiqueta}). La mejor: ${cifra(mejor.kg)} kg (semana del ${mejor.etiqueta}).`,
        svg: barrasVerticalesSVG(
          'Volumen por semana',
          sem.map((x) => ({ etiqueta: x.etiqueta, valor: x.kg, destacada: x === ult }))
        ),
      };
    }
    case 'sin_tocar': {
      const grupos = gruposMusculares(fusionarDias(historial, anioDe(ahora)), hoy, anioDe(ahora));
      if (grupos.length === 0) return { texto: 'Todavía no hay sesiones para ver qué grupo falta.', svg: '' };
      const top = grupos[0];
      return {
        texto: `El que más lleva sin tocarse: ${top.grupo}, ${top.diasSinTocar} ${top.diasSinTocar === 1 ? 'día' : 'días'} (última vez ${top.ultimaEtiqueta}).`,
        svg: barrasHorizontalesSVG(
          'Días sin tocar cada grupo muscular',
          grupos.map((x, i) => ({ etiqueta: x.grupo, valor: x.diasSinTocar, texto: `${x.diasSinTocar} d`, destacada: i === 0 }))
        ),
      };
    }
    case 'reparto': {
      const r = repartoPorGrupo(historial, ahora);
      if (r.length === 0) return { texto: 'No hay sesiones de los últimos 30 días para repartir.', svg: '' };
      const top = r.slice(0, 3).map((x) => `${x.grupo} ${x.porcentaje} %`).join(', ');
      return {
        texto: `Volumen de los últimos 30 días por grupo: ${top}${r.length > 3 ? ' y otros' : ''}.`,
        svg: barrasHorizontalesSVG(
          'Reparto de volumen por grupo, últimos 30 días',
          r.map((x, i) => ({ etiqueta: x.grupo, valor: x.kg, texto: `${x.porcentaje} %`, destacada: i === 0 }))
        ),
      };
    }
    case 'hoy_vs_ultima': {
      const h = hoyContraUltima(historial, ahora);
      if (!h) return { texto: 'Todavía no hay sesiones para comparar.', svg: '' };
      const cuenta = (s: ComparacionDeEjercicio['sentido']) => h.items.filter((i) => i.sentido === s).length;
      const partes = [
        cuenta('subio') ? `${cuenta('subio')} ${cuenta('subio') === 1 ? 'subió' : 'subieron'}` : '',
        cuenta('igual') ? `${cuenta('igual')} ${cuenta('igual') === 1 ? 'igual' : 'iguales'}` : '',
        cuenta('bajo') ? `${cuenta('bajo')} ${cuenta('bajo') === 1 ? 'bajó' : 'bajaron'}` : '',
        cuenta('nuevo') ? `${cuenta('nuevo')} sin vez anterior` : '',
      ].filter(Boolean);
      return {
        texto: `${h.esHoy ? `Hoy (${h.etiqueta})` : `Tu última sesión (${h.etiqueta})`} contra la vez anterior de cada ejercicio: ${partes.join(', ')}.`,
        svg: barrasParesSVG('Peso de la última sesión contra la vez anterior', h.items),
      };
    }
  }
}

// ==========================================
// MARCA DEL MODELO: [[grafico|tipo|ejercicio]]
// ==========================================

/** Plan B de "el modelo llama herramientas": sin llamadas con esquema, el modelo
 *  cierra con una marca y la APP la valida contra una lista cerrada (tipos +
 *  ejercicios que de verdad estan en el historial) y dibuja con los datos
 *  reales. El modelo nunca manda cifras ni puntos. */
const TIPOS_SIN_EJERCICIO: TipoDeGrafico[] = ['semanas', 'volumen_semanal', 'sin_tocar', 'reparto', 'hoy_vs_ultima'];

export function quitarMarcaDeGrafico(texto: string): string {
  return texto
    .replace(/\[\[grafico\|[^\]]*\]\]/g, '')
    .replace(/\[\[grafico[^\]]*$/, '')
    .replace(/\[\[g?r?a?f?i?c?o?$/, '')
    .trimEnd();
}

export function parsearMarcaDeGrafico(
  texto: string,
  historial: HistorySession[]
): { limpio: string; grafico: GraficoDelTurno | null } {
  const limpio = quitarMarcaDeGrafico(texto);
  const m = texto.match(/\[\[grafico\|([a-z0-9_]+)(?:\|([^\]|]*))?\]\]/);
  if (!m) return { limpio, grafico: null };
  const tipo = m[1] as TipoDeGrafico;
  if ((TIPOS_SIN_EJERCICIO as string[]).includes(tipo)) return { limpio, grafico: { tipo } };
  if (tipo !== 'peso' && tipo !== '1rm') return { limpio, grafico: null };
  const pedido = (m[2] ?? '').trim();
  if (!pedido) return { limpio, grafico: null };
  const existentes = new Set<string>();
  for (const s of historial) {
    if (s.type === 'cardio') continue;
    for (const e of s.ejercicios ?? []) if (e.volumen > 0 && !e.excluido && e.nombre) existentes.add(e.nombre);
  }
  const nombre = [...existentes].find((n) => n.toLowerCase() === pedido.toLowerCase());
  return { limpio, grafico: nombre ? { tipo, ejercicio: nombre } : null };
}
