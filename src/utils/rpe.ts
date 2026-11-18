/**
 * El esfuerzo de la sesion a partir del que ya se contesto por ejercicio.
 *
 * Habia DOS escalas: los chips 5-9 de cada ejercicio y la hoja del 1-10 al
 * cerrar. Si ya diste el esfuerzo de tus ejercicios, no se te vuelve a
 * preguntar: la sesion lleva el promedio. Si no contestaste ninguno, la hoja
 * se abre una sola vez.
 */
import { esSerieValida } from '@/utils/series';

export function rpeDeSesionDesdeEjercicios(
  ejercicios: ReadonlyArray<{ rpe?: number; volumen?: number; excluido?: boolean }>
): number | null {
  const valores = ejercicios.filter((e) => esSerieValida(e) && typeof e.rpe === 'number').map((e) => e.rpe as number);
  if (valores.length === 0) return null;
  const media = valores.reduce((t, v) => t + v, 0) / valores.length;
  return Math.min(10, Math.max(1, Math.round(media)));
}
