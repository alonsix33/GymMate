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

/** Redondeo a 5s: es el paso con el que se piensa un intervalo. */
export function escalar(niveles: number[], factor: number): number[] {
  return niveles.map((n) => Math.max(5, Math.round((n * factor) / 5) * 5));
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
      const porRonda = estaciones * ((config.work ?? 0) + (config.rest ?? 0));
      return rondas * porRonda + Math.max(0, rondas - 1) * (config.roundRest ?? 0);
    }
    default:
      return 0;
  }
}

/** "7:15" · "0:45" · "1:02:40". */
export function formatearTiempo(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(seg)}` : `${m}:${dos(seg)}`;
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
  const c = circunferencia(radio);
  if (total <= 0) return c;
  const fraccion = Math.max(0, Math.min(1, restante / total));
  return c * (1 - fraccion);
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
    if (rondas > 0 && trabajo > 0) {
      // workTime del EMOM cuenta el minuto entero; lo util es el ritmo real
      // si la sesion lo guardo. Con el modelo actual solo hay minutos, asi
      // que se toma el tiempo medio por ronda acotado al minuto.
      return Math.max(1, Math.min(60, Math.round(trabajo / rondas)));
    }
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

/** Altura de cada barra de la montaña, en % del pico. */
export function alturaDeNivel(segundos: number, pico: number): number {
  if (pico <= 0) return 0;
  return Math.max(4, Math.round((segundos / pico) * 100));
}
