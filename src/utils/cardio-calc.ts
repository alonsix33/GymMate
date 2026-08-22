/**
 * Aritmetica de cardio — la parte que decide las cifras que el usuario lee.
 *
 * Sin DOM: se prueba sola.
 */
import type { CardioConfig, CardioMode, HistorySession } from '@/types';

/** Niveles de la piramide del mockup: 7 niveles, pico 75s. [REF Pantallas:463] */
export const PIRAMIDE_MEDIA = [30, 45, 60, 75, 60, 45, 30];
/** Descanso entre niveles, literal del mockup. */
export const DESCANSO_PIRAMIDE = 15;
export const NIVELES_PIRAMIDE = 7;

/**
 * Presets de la piramide.
 *
 * El README los nombra (CORTA/MEDIA/LARGA/INTENSA/EXTENDIDA/RESET) y el
 * mockup solo dibuja MEDIA. Los demas se derivan de esa por el mismo
 * mecanismo que el README define para escalar: proporcion sobre los 7
 * niveles. INTENSA es la excepcion — mismo orden de total que MEDIA pero con
 * una subida mas empinada, que es lo que su nombre promete.
 * PREGUNTA ABIERTA: los valores exactos de los cinco presets que el mockup no
 * dibuja no estan en el handoff.
 */
export const PRESETS_PIRAMIDE: Record<string, number[]> = {
  corta: escalar(PIRAMIDE_MEDIA, 0.6),
  media: [...PIRAMIDE_MEDIA],
  larga: escalar(PIRAMIDE_MEDIA, 1.4),
  intensa: [25, 40, 65, 100, 65, 40, 25],
  extendida: escalar(PIRAMIDE_MEDIA, 1.8),
  reset: [...PIRAMIDE_MEDIA],
};

/**
 * Redondeo a 5s: es el paso con el que se piensa un intervalo.
 *
 * Sin piso: `Math.max(5, ...)` era inalcanzable desde la UI (con factor 0.8 el
 * punto fijo es 10s y el preset mas bajo da 20), o sea codigo muerto que
 * ademas neutralizaba su propio mutante. El piso real vive en `escalarDesde`,
 * que es quien conoce la piramide base.
 */
export function escalar(niveles: number[], factor: number): number[] {
  return niveles.map((n) => Math.round((n * factor) / 5) * 5);
}

/** Factor minimo y maximo del escalado. Debajo de 0.4 la montaña se aplana:
 *  el redondeo a 5 iguala los niveles y deja de haber pico, que es justo lo
 *  que la nota de C-05 promete que no pasa. */
export const FACTOR_MIN = 0.4;
export const FACTOR_MAX = 2;
export const PASO_FACTOR = 1.25;

/**
 * Escala SIEMPRE desde la piramide base, no desde la ya escalada.
 *
 * Encadenar `escalar` pierde informacion en cada redondeo: bajar y volver a
 * subir devolvia [30,45,65,75,65,45,30] en vez de la MEDIA original, o sea que
 * deshacer no deshacia. Con un factor acumulado sobre la base, ↓ seguido de ↑
 * vuelve exactamente al punto de partida.
 */
export function escalarDesde(base: number[], factor: number): number[] {
  return escalar(base, acotarFactor(factor));
}

export function acotarFactor(factor: number): number {
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, factor));
}

/** Segundos de trabajo + descansos entre niveles. */
export function duracionPiramide(niveles: number[], descanso = DESCANSO_PIRAMIDE): number {
  if (niveles.length === 0) return 0;
  return niveles.reduce((t, n) => t + n, 0) + (niveles.length - 1) * descanso;
}

/**
 * Duracion total estimada de una sesion, por modo. Es la cifra del pie de las
 * pantallas de configuracion.
 */
export function duracionTotal(mode: CardioMode, config: CardioConfig): number {
  const rondas = config.rounds ?? 0;
  switch (mode) {
    case 'tabata':
    case 'custom':
      // Ciclos completos: el Tabata canonico es 8x(20+10) = 4:00, y es lo que
      // el mockup escribe en el pie. El motor toca el ultimo descanso.
      return rondas * ((config.work ?? 0) + (config.rest ?? 0));
    case 'emom':
      return rondas * (config.interval ?? 60);
    case 'amrap':
      return config.duration ?? 0;
    case 'pyramid':
      return duracionPiramide(config.levels ?? PIRAMIDE_MEDIA, config.rest ?? DESCANSO_PIRAMIDE);
    case 'circuit': {
      const estaciones = (config.exercises ?? []).length;
      // Sin estaciones no hay circuito: anunciar los descansos entre rondas de
      // un recorrido vacio daba "~2:00 min" de una sesion que no existe.
      if (estaciones === 0) return 0;
      const porRonda = estaciones * ((config.work ?? 0) + (config.rest ?? 0));
      return rondas * porRonda + Math.max(0, rondas - 1) * (config.roundRest ?? 0);
    }
    default:
      return 0;
  }
}

/** "7:15" · "0:45" · "1:02:40". */
export function formatearTiempo(segundos: number): string {
  if (!Number.isFinite(segundos)) return '0:00';
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(seg)}` : `${m}:${dos(seg)}`;
}

/** true cuando `formatearTiempo` devolveria h:mm:ss. El pie de las pantallas
 *  de configuracion escribe "min" detras de la cifra, y "1:12:00 min" no es
 *  una duracion en minutos. */
export function llevaHoras(segundos: number): boolean {
  return Number.isFinite(segundos) && Math.max(0, Math.round(segundos)) >= 3600;
}

/** Circunferencia del anillo del mockup: r=104 -> 653.45. */
export function circunferencia(radio: number): number {
  return 2 * Math.PI * radio;
}

/**
 * `stroke-dashoffset` para que el arco cubra la fraccion ya consumida.
 * restante/total = 1 -> arco lleno (offset 0); 0 -> arco vacio.
 */
export function offsetDelAnillo(restante: number, total: number, radio: number): number {
  // El mismo valor que se pinta en `stroke-dasharray`. Con la circunferencia
  // sin redondear (653.45) sobre un dasharray de 653, el patron se repetia
  // cada 1306 y quedaba una astilla de arco visible con el anillo vacio.
  const c = dasharrayDelAnillo(radio);
  if (!Number.isFinite(restante) || !Number.isFinite(total) || total <= 0) return c;
  const fraccion = Math.max(0, Math.min(1, restante / total));
  return c * (1 - fraccion);
}

/** El `stroke-dasharray` que se pinta en el SVG. Entero: el arco no necesita
 *  mas precision y asi coincide con el offset. */
export function dasharrayDelAnillo(radio: number): number {
  return Math.round(circunferencia(radio));
}

/**
 * Segundos de TRABAJO estimados dentro de cada minuto de EMOM, a partir del
 * ritmo de la ultima sesion EMOM. Sin sesion previa no se estima nada: el
 * mockup dice "estimado con tu ritmo de la última sesión EMOM", y sin ritmo
 * no hay estimacion que dar.
 */
export function ritmoEmom(historial: HistorySession[]): number | null {
  for (const sesion of historial) {
    if (sesion.type !== 'cardio' || sesion.mode !== 'emom') continue;
    const stats = sesion.stats;
    const rondas = stats?.roundsCompleted ?? 0;
    const trabajo = stats?.workTime ?? 0;
    if (rondas <= 0 || trabajo <= 0) continue;
    const intervalo = sesion.config?.interval ?? 60;
    const ritmo = Math.round(trabajo / rondas);
    // Si el ritmo es el minuto entero, no se midio nada: el motor cuenta todo
    // el intervalo como trabajo porque la app no tiene un gesto de "termine".
    // Devolver 60 seria inventar un dato y ademas contradecir la propia barra,
    // que promete enseñar lo que sobra para respirar.
    if (ritmo >= intervalo) return null;
    return Math.max(1, Math.min(intervalo, ritmo));
  }
  return null;
}

/** Estado visual de cada nivel de la piramide durante el timer. */
export type EstadoNivel = 'hecho' | 'activo' | 'proximo';

export function estadoDeNivel(indice: number, actual: number): EstadoNivel {
  if (indice < actual) return 'hecho';
  if (indice === actual) return 'activo';
  return 'proximo';
}

/**
 * Altura de cada barra de la montaña, en % del pico.
 *
 * `pyrBars` del mockup da 40/60/80/100 para 30/45/60/75 sobre un pico de 75:
 * proporcion directa, sin piso. El `Math.max(4, ...)` que habia era otro
 * mutante inmortal (el caso mas extremo alcanzable, 5s sobre pico 135, ya da 4
 * por redondeo). El techo si hace falta: sin el, un pico mal pasado dibuja una
 * barra del 133% fuera de su grafico.
 */
export function alturaDeNivel(segundos: number, pico: number): number {
  if (!Number.isFinite(segundos) || !Number.isFinite(pico) || pico <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((segundos / pico) * 100)));
}

/** Tramo de intensidad de un nivel (1..4) para elegir su color en la rampa de
 *  la montaña. `pyrBars` del mockup pinta cuatro pasos, no uno. */
export function tramoDeNivel(segundos: number, pico: number): 1 | 2 | 3 | 4 {
  const alto = alturaDeNivel(segundos, pico);
  if (alto >= 100) return 4;
  if (alto >= 75) return 3;
  if (alto >= 50) return 2;
  return 1;
}
