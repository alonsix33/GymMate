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

// ==========================================
// America/Lima, SIEMPRE (coach)
// ==========================================

export const ZONA_USUARIO = 'America/Lima';

const FORMATO_DIA_LIMA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_USUARIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const FORMATO_HORA_LIMA = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_USUARIO,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 'YYYY-MM-DD' del dia en LIMA de un instante, da igual la zona del aparato. */
export function claveDiaLima(instante: Date): string {
  return FORMATO_DIA_LIMA.format(instante);
}

/** 'HH:MM' en Lima. */
export function horaLima(instante: Date): string {
  return FORMATO_HORA_LIMA.format(instante);
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Dia de la semana de una clave 'YYYY-MM-DD'. Sin zona horaria de por medio:
 *  una fecha civil tiene el mismo dia de la semana en todas partes. */
export function diaSemanaDe(clave: string): string {
  const [a, m, d] = clave.split('-').map(Number);
  return DIAS[new Date(Date.UTC(a, (m || 1) - 1, d || 1)).getUTCDay()];
}

/**
 * EL formato de fecha del coach: "jue 12 nov", y con año si no es el actual
 * ("jue 12 nov 2025"). Es el unico que se le entrega al modelo: 12-11 y 04-10
 * son ambiguos y fue con ellos que se invento "miercoles".
 */
export function etiquetaDia(clave: string, anioActual?: number): string {
  const [a, m, d] = clave.split('-').map(Number);
  const base = `${diaSemanaDe(clave)} ${d} ${MESES[(m || 1) - 1]}`;
  return anioActual !== undefined && a !== anioActual ? `${base} ${a}` : base;
}

/** Dias civiles entre dos claves (b - a). */
export function diasEntre(a: string, b: string): number {
  const f = (c: string) => {
    const [y, m, d] = c.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((f(b) - f(a)) / 86400000);
}

/** La clave de un dia desplazada n dias. */
export function sumarDias(clave: string, n: number): string {
  const [y, m, d] = clave.split('-').map(Number);
  const f = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}

/** "vie 13 nov 2026 22:14 (America/Lima)" */
export function ahoraLimaTexto(instante: Date): string {
  const clave = claveDiaLima(instante);
  return `${etiquetaDia(clave)} ${clave.slice(0, 4)} ${horaLima(instante)} (${ZONA_USUARIO})`;
}

/** Dia de una sesion del historial, en Lima. 'YYYY-MM-DD' pelado es ya una
 *  fecha civil (la que el usuario tenia al empezar); un ISO se pasa a Lima. */
export function claveDiaDeSesion(sesion: { date?: string; savedAt?: string }): string | null {
  const fecha = String(sesion.date ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  const bruta = String(sesion.savedAt || sesion.date || '').trim();
  if (!bruta) return null;
  const d = new Date(bruta);
  return Number.isNaN(d.getTime()) ? null : claveDiaLima(d);
}
