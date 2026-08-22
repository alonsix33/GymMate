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
