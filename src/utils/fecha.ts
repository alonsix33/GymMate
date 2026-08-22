/**
 * Un solo sitio que decide QUE DIA ES.
 *
 * El bug: media app derivaba la clave de dia con `toISOString().split('T')[0]`,
 * que es UTC. En Lima (UTC-5) toda sesion posterior a las 19:00 cae en el dia
 * UTC siguiente, asi que entrenar cuatro dias seguidos alternando tarde y
 * noche daba racha 1, y la medicion corporal de la noche no sobrescribia la de
 * la mañana. El heatmap ya usaba dia local, o sea que dos partes de la app no
 * coincidian en que dia era hoy.
 *
 * No era un defecto: eran nueve, en cinco archivos. La regla que cubre la
 * familia entera esta en `scripts/verificar-tokens.mjs`, que falla si
 * `toISOString().split('T')[0]` reaparece en `src/`.
 */

/** 'YYYY-MM-DD' del dia LOCAL de una fecha. */
export function claveDiaLocal(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' del dia local de HOY. */
export function hoyLocal(): string {
  return claveDiaLocal(new Date());
}

/**
 * Dia local de un valor del historial, que llega en tres formatos: ISO
 * completo, 'YYYY-MM-DD' suelto, o vacio. Un 'YYYY-MM-DD' ya es una fecha
 * civil y se devuelve tal cual: reinterpretarlo como UTC lo correria un dia.
 */
export function claveDiaDe(valor: string | undefined | null): string | null {
  const bruto = String(valor ?? '').trim();
  if (!bruto) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return bruto;
  const d = new Date(bruto);
  return Number.isNaN(d.getTime()) ? null : claveDiaLocal(d);
}

/**
 * El camino de vuelta de `claveDiaLocal`: 'YYYY-MM-DD' -> mediodia LOCAL de
 * ese dia.
 *
 * `new Date('2026-08-22')` NO es equivalente: la norma manda parsear la forma
 * corta como UTC, asi que en Lima (UTC-5) devuelve el 21 a las 19:00. Ese era
 * el bug que quedaba vivo en `calculateCurrentStreak` despues de centralizar
 * el resto: la racha de cuatro dias seguidos salia 1. Se usa mediodia y no
 * medianoche para que sumar o restar dias no cruce un cambio de horario.
 */
export function fechaDeClaveLocal(clave: string): Date {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/**
 * La raya del handoff para "no hay dato". Una fecha ilegible en el historial
 * —una que entro por un CSV editado a mano, o una version anterior de la
 * app— se pintaba como "Invalid Date" y "hace NaN días" en HOME, HISTORIAL y
 * el detalle de sesion. Un rotulo que miente es peor que no tener rotulo.
 */
export const SIN_FECHA = '—';

/** La fecha si es legible; null si no. Nunca un `Date` invalido. */
export function fechaLegible(valor: string | number | Date | undefined | null): Date | null {
  if (valor === undefined || valor === null || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}
