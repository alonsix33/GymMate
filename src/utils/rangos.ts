/**
 * Subniveles de rango y la escalera de GM-02.
 *
 * README §6: "Cada rango se divide en subniveles I–III en tercios iguales de
 * su franja; Simétrico no tiene subniveles." El mockup lo confirma: la columna
 * de la escalera dice `I·II·III` en los ocho rangos y `ÚNICO` en Simétrico.
 *
 * Sin DOM: se prueba solo.
 */
import { RANK_THRESHOLDS, RANK_ORDER } from '@/features/gamification/constants';
import type { StrengthRank } from '@/types/gamification';

export type Subnivel = 'I' | 'II' | 'III' | '';

/** Los tres tercios se cuentan de ABAJO a arriba: I es el primero. */
export const SUBNIVELES: Subnivel[] = ['I', 'II', 'III'];

export function franjaDe(rango: StrengthRank): { min: number; max: number } | null {
  const t = RANK_THRESHOLDS.find((x) => x.rank === rango);
  return t ? { min: t.minRatio, max: t.maxRatio } : null;
}

/**
 * Subnivel dentro de la franja del rango. Simétrico no tiene: su franja es
 * abierta por arriba, asi que no hay tercios que repartir.
 */
export function subnivelDe(rango: StrengthRank, ratio: number): Subnivel {
  if (rango === 'Simetrico') return '';
  const f = franjaDe(rango);
  if (!f || !Number.isFinite(ratio) || !Number.isFinite(f.max)) return '';
  const ancho = f.max - f.min;
  if (ancho <= 0) return '';
  // La MISMA tolerancia que `siguienteEscalon`. Se corrigio alli y no aqui, y
  // las dos funciones se contradecian en los cortes redondos: con ratio 1.4
  // exacto (Diamante, franja 1.3–1.6) la escalera decia "TÚ · I" y el consejo
  // de debajo "A 0.10x de Diamante III" — un subnivel saltado. Barriendo
  // ratios plausibles, 414 de 48.261 caian mal.
  const t = (ratio - f.min) / ancho + 1e-9;
  if (t < 1 / 3) return 'I';
  if (t < 2 / 3) return 'II';
  return 'III';
}

/** "Oro III" · "Simétrico". El nombre que ve el usuario. */
export function nombreDeRango(rango: StrengthRank, ratio: number): string {
  const bonito = rango === 'Campeon' ? 'Campeón' : rango === 'Simetrico' ? 'Simétrico' : rango;
  const sub = subnivelDe(rango, ratio);
  return sub ? `${bonito} ${sub}` : bonito;
}

export function rangoSiguiente(rango: StrengthRank): StrengthRank | null {
  const i = RANK_ORDER.indexOf(rango);
  return i >= 0 && i < RANK_ORDER.length - 1 ? RANK_ORDER[i + 1] : null;
}

/**
 * Lo que falta para el siguiente escalon: el siguiente SUBNIVEL si queda
 * alguno dentro del rango, y si no, el primero del rango de arriba.
 *
 * Devuelve null en Simétrico, que es el final del juego: prometer un siguiente
 * escalon que no existe seria un rotulo que miente.
 */
export function siguienteEscalon(
  rango: StrengthRank,
  ratio: number
): { nombre: string; ratioObjetivo: number; falta: number } | null {
  const f = franjaDe(rango);
  if (!f || rango === 'Simetrico' || !Number.isFinite(f.max)) return null;

  const ancho = f.max - f.min;
  const cortes = [f.min + ancho / 3, f.min + (2 * ancho) / 3, f.max];
  const i = cortes.findIndex((c) => c > ratio + 1e-9);
  if (i === -1) return null;

  // El nombre se toma del INDICE, no de volver a clasificar el ratio objetivo:
  // el objetivo cae justo en la frontera y ahi el redondeo binario decide de
  // que lado esta. `subnivelDe(0.7666...)` devolvia 'I' en vez de 'II' por un
  // error en el bit 53.
  const esCambioDeRango = i === 2;
  const siguiente = esCambioDeRango ? rangoSiguiente(rango) : rango;
  if (!siguiente) return null;

  const bonito = (r: StrengthRank) =>
    r === 'Campeon' ? 'Campeón' : r === 'Simetrico' ? 'Simétrico' : r;
  const nombre = esCambioDeRango
    ? siguiente === 'Simetrico'
      ? 'Simétrico'
      : `${bonito(siguiente)} I`
    : `${bonito(rango)} ${SUBNIVELES[i + 1]}`;

  const objetivo = cortes[i];
  return {
    nombre,
    ratioObjetivo: Math.round(objetivo * 1000) / 1000,
    falta: Math.round((objetivo - ratio) * 1000) / 1000,
  };
}

/**
 * El 1RM que hace falta para llegar al siguiente escalon.
 *
 * El ratio que decide el rango esta AJUSTADO POR EJERCICIO:
 * `adjustedRatio = (1RM / peso corporal) / multiplicador`, y el multiplicador
 * de la Prensa de Piernas es 2.0. Asi que despejar el 1RM exige devolver el
 * multiplicador a la cuenta, o la cifra sale a la mitad.
 *
 * Sin el, GM-02 decia "sube tu 1RM a 83 kg y asciendes" a alguien que ya
 * levantaba 120 — y la cabecera de esa misma pantalla promete "ajustado por
 * ejercicio". El rotulo anunciaba un ajuste que la cifra no hacia.
 */
export function pesoParaElSiguiente(
  ratioObjetivo: number,
  pesoCorporal: number,
  multiplicador = 1
): number | null {
  if (!(pesoCorporal > 0) || !Number.isFinite(ratioObjetivo)) return null;
  const m = Number.isFinite(multiplicador) && multiplicador > 0 ? multiplicador : 1;
  return Math.ceil(ratioObjetivo * pesoCorporal * m);
}
