/**
 * Formato de cifras FIERRO.
 *
 * El mockup agrupa los miles con COMA en todas sus cifras — "8,325 kg",
 * "2,800 kg", "1,480 XP", "125,100" — pese a estar en espanol. Es una
 * decision del diseno aprobado, asi que se reproduce tal cual y no se deja al
 * criterio de toLocaleString('es'), que ademas no agrupa numeros de 4 digitos.
 */

const AGRUPADOR = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const AGRUPADOR_DECIMAL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** Entero con separador de miles: 8160 -> "8,160". */
export function cifra(valor: number): string {
  return AGRUPADOR.format(Math.round(valor || 0));
}

/** Igual, pero conserva un decimal si lo tiene: 47.5 -> "47.5". */
export function cifraDecimal(valor: number): string {
  return AGRUPADOR_DECIMAL.format(valor || 0);
}
