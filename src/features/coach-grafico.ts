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
import { claveDiaLima, diasEntre } from '@/utils/fecha';
import { fusionarDias } from '@/features/coach-estado';
import { cifraDecimal, escapar } from '@/utils/formato';

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

export type PedidoDeGrafico =
  | { tipo: 'ejercicio'; ejercicio: string }
  | { tipo: 'elegir'; opciones: string[] };

const MAX_OPCIONES = 6;

/** Los ejercicios que el texto nombra: el nombre entero, o una palabra clave
 *  ("jalón", "banca"). Devuelve todos los que encajan. */
export function ejerciciosNombrados(texto: string, nombres: string[]): string[] {
  const t = sinTildes(texto);
  const completos = nombres.filter((n) => t.includes(sinTildes(n)));
  // El nombre entero manda: "Press Banca Inclinado" no es tambien "Press Banca".
  if (completos.length > 0) {
    const mas = completos.filter((n) => !completos.some((o) => o !== n && sinTildes(o).includes(sinTildes(n))));
    return mas;
  }
  const palabras = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
  return nombres.filter((n) => palabrasClave(n).some((w) => palabras.has(w)));
}

/**
 * Qué ejercicio dibujar. Reglas, en orden:
 *   1. el que nombra el mensaje del usuario;
 *   2. si no, los que nombró el último mensaje del coach (acaba de hablar de
 *      ellos: "pásame el plan" y luego "muéstrame el gráfico");
 *   3. si no, los más entrenados en los últimos 90 días.
 * Uno solo → se dibuja. Varios → se le pregunta con botones.
 */
export function detectarPedidoDeGrafico(
  texto: string,
  historial: HistorySession[],
  turnos: Array<{ autor: 'coach' | 'usuario'; texto: string }>,
  ahora: Date
): PedidoDeGrafico | null {
  if (!pideGrafico(texto)) return null;

  const nombres = [...new Set(historial.flatMap((s) => (s.ejercicios ?? []).filter((e) => e.volumen > 0 && !e.excluido).map((e) => e.nombre)))];
  if (nombres.length === 0) return null;

  const decidir = (lista: string[]): PedidoDeGrafico | null =>
    lista.length === 1 ? { tipo: 'ejercicio', ejercicio: lista[0] } : lista.length > 1 ? { tipo: 'elegir', opciones: lista.slice(0, MAX_OPCIONES) } : null;

  const delUsuario = decidir(ejerciciosNombrados(texto, nombres));
  if (delUsuario) return delUsuario;

  const ultimoCoach = [...turnos].reverse().find((t) => t.autor === 'coach');
  if (ultimoCoach) {
    const nombrados = ejerciciosNombrados(ultimoCoach.texto, nombres);
    // Del último mensaje del coach solo por nombre ENTERO: una palabra suelta
    // ("press") no es el tema de conversación.
    const t = sinTildes(ultimoCoach.texto);
    const enteros = nombrados.filter((n) => t.includes(sinTildes(n)));
    const delCoach = decidir(enteros);
    if (delCoach) return delCoach;
  }

  const hoy = claveDiaLima(ahora);
  const cuenta = new Map<string, number>();
  for (const d of fusionarDias(historial)) {
    if (diasEntre(d.fecha, hoy) > 90) continue;
    for (const s of d.series) cuenta.set(s.nombre, (cuenta.get(s.nombre) ?? 0) + 1);
  }
  const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
  return decidir(top) ?? { tipo: 'elegir', opciones: nombres.slice(0, MAX_OPCIONES) };
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
export function graficoSVG(nombre: string, puntos: PuntoDeEjercicio[]): string {
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
          return `<circle class="f-coach__grafico-punto${marca}" cx="${x}" cy="${y}" r="${i === puntos.length - 1 ? 4 : 3}"><title>${escapar(`${p.etiqueta}: ${p.sets}×${p.reps} · ${cifraDecimal(p.peso)} kg`)}</title></circle>`;
        })
        .join('')}
      <text class="f-coach__grafico-txt" x="${MIZQ}" y="${H - 6}" text-anchor="start">${corto(puntos[0])}</text>
      ${puntos.length > 1 ? `<text class="f-coach__grafico-txt" x="${W - MDER}" y="${H - 6}" text-anchor="end">${corto(ultimo)}</text>` : ''}
    </svg>
  `;
}
