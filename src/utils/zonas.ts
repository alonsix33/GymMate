/**
 * Barra de zonas y agregados del historial — la logica pura de las pantallas
 * Hueso (HI-01, HI-02, PR-01, G-01).
 *
 * Reglas (README, "Interactions & Behavior" 5):
 *   - Segmentos: roja 0-70%, ambar 70-95%, verde 95%+ del pico historico del
 *     ejercicio.
 *   - "Actual" = mejor set de las ULTIMAS 3 SESIONES en las que aparece ese
 *     ejercicio (no los ultimos 3 dias de calendario).
 *   - El marcador es una barra vertical que se coloca en el porcentaje.
 *
 * Sin DOM: se puede probar sola.
 */
import type { ExerciseData, HistorySession } from '@/types';

/** Fronteras de los segmentos, en fraccion del pico. */
export const ZONA_ROJA_HASTA = 0.7;
export const ZONA_AMBAR_HASTA = 0.95;
/** Sesiones que miran hacia atras para decidir el "actual". */
export const SESIONES_ACTUAL = 3;
/** A partir de aqui, el ejercicio se declara estancado. */
export const SESIONES_ESTANCADO = 3;

export type Zona = 'roja' | 'ambar' | 'verde';

export function zonaDe(ratio: number): Zona {
  if (ratio >= ZONA_AMBAR_HASTA) return 'verde';
  if (ratio >= ZONA_ROJA_HASTA) return 'ambar';
  return 'roja';
}

/**
 * Posicion del marcador, en % del ancho de la pista.
 *
 * La pista son tres segmentos de 63% / 23% / resto con 2px de hueco entre
 * ellos, asi que un ratio del 100% NO cae al final: el 100% del pico es el
 * limite superior de la escala que el mockup dibuja, y por encima del pico se
 * satura en el borde derecho. Se acota a [0, 100] para que el marcador nunca
 * se salga de la barra.
 */
export function posicionEnZonas(ratio: number): number {
  return Math.max(0, Math.min(100, ratio * 100));
}

/** Sesiones de pesas que contienen ese ejercicio, de la mas reciente atras. */
export function sesionesCon(nombre: string, historial: HistorySession[]): Array<{
  sesion: HistorySession;
  ejercicio: ExerciseData;
}> {
  const encontradas: Array<{ sesion: HistorySession; ejercicio: ExerciseData }> = [];
  for (const sesion of historial) {
    if (sesion.type === 'cardio') continue;
    const ejercicio = (sesion.ejercicios ?? []).find((e) => e.nombre === nombre && e.volumen > 0);
    if (ejercicio) encontradas.push({ sesion, ejercicio });
  }
  return encontradas;
}

/** Mejor peso de las ultimas SESIONES_ACTUAL sesiones con ese ejercicio. */
export function pesoActual(nombre: string, historial: HistorySession[]): number | null {
  const recientes = sesionesCon(nombre, historial).slice(0, SESIONES_ACTUAL);
  if (recientes.length === 0) return null;
  return Math.max(...recientes.map((r) => r.ejercicio.peso));
}

/** Mejor peso de TODO el historial. */
export function picoDe(nombre: string, historial: HistorySession[]): number | null {
  const todas = sesionesCon(nombre, historial);
  if (todas.length === 0) return null;
  return Math.max(...todas.map((r) => r.ejercicio.peso));
}

/**
 * Sesiones consecutivas, desde la mas reciente hacia atras, POR DEBAJO del
 * pico. Es lo que el mockup llama "ESTANCADO N SESIONES", y va emparejado con
 * un "−19% vs pico": estancarse es no volver a tu mejor marca, no repetir
 * peso. Contando "sesiones que no superan a la anterior" salia el absurdo de
 * 120 → 100 → 100 → 100 = "estancado 4", incluyendo la sesion del pico.
 */
export function sesionesSinSubir(
  nombre: string,
  historial: HistorySession[],
  picoExterno?: number | null
): number {
  const pesos = sesionesCon(nombre, historial).map((r) => r.ejercicio.peso);
  if (pesos.length === 0) return 0;
  // Sin guarda de pico 0: el propio bucle corta en la primera vuelta cuando
  // el pico es 0 (peso corporal), asi que la guarda era una rama muerta.
  const pico = picoExterno ?? Math.max(...pesos);
  let cuenta = 0;
  for (const peso of pesos) {
    if (peso >= pico) break;
    cuenta++;
  }
  return cuenta;
}

/** Etiqueta de estado del mockup, a la izquierda del pie de la barra. */
export function estadoDeZona(
  nombre: string,
  historial: HistorySession[],
  picoExterno?: number | null
): string {
  const actual = pesoActual(nombre, historial);
  // El pico puede venir de fuera (el record guardado) cuando el historial no
  // tiene la sesion que lo marco: un CSV importado guarda el PR y no la
  // sesion. Si los dos lados no usan el MISMO pico, la etiqueta dice "EN TU
  // PICO" con el marcador al 80%.
  const pico = picoExterno ?? picoDe(nombre, historial);
  if (actual === null || pico === null || pico <= 0) return 'SIN DATOS';
  if (actual >= pico) return 'EN TU PICO';
  const estancado = sesionesSinSubir(nombre, historial, pico);
  if (estancado >= SESIONES_ESTANCADO) return `ESTANCADO ${estancado} SESIONES`;
  return zonaDe(actual / pico) === 'verde' ? 'CERCA DEL PICO' : 'POR DEBAJO DEL PICO';
}

/**
 * Redondea una lista de porcentajes a enteros que suman EXACTAMENTE 100
 * (reparto por resto mayor). Redondeando cada uno por su cuenta, tres grupos
 * al 33.33% se enseñaban como "33% 33% 33%" = 99.
 */
export function repartirCien(porcentajes: number[]): number[] {
  if (porcentajes.length === 0) return [];
  const bajos = porcentajes.map((p) => Math.floor(p));
  let resto = 100 - bajos.reduce((t, v) => t + v, 0);
  const orden = porcentajes
    .map((p, i) => ({ i, frac: p - Math.floor(p) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of orden) {
    if (resto <= 0) break;
    bajos[i]++;
    resto--;
  }
  return bajos;
}

/** Volumen total por grupo muscular en todo el historial de pesas. */
export function distribucionMuscular(historial: HistorySession[]): Array<{
  musculo: string;
  volumen: number;
  porcentaje: number;
}> {
  const total = new Map<string, number>();
  for (const sesion of historial) {
    if (sesion.type === 'cardio') continue;
    for (const [musculo, kg] of Object.entries(sesion.volumenPorGrupo ?? {})) {
      if (!kg) continue;
      total.set(musculo, (total.get(musculo) ?? 0) + kg);
    }
  }
  const suma = [...total.values()].reduce((t, v) => t + v, 0);
  if (suma <= 0) return [];
  return [...total.entries()]
    .map(([musculo, volumen]) => ({
      musculo,
      volumen,
      porcentaje: (volumen / suma) * 100,
    }))
    .sort((a, b) => b.volumen - a.volumen);
}

/**
 * Media movil de N puntos. Los primeros N-1 no tienen ventana completa y
 * quedan como null: dibujarlos con una ventana corta inventaria una
 * tendencia que el dato no respalda.
 */
export function mediaMovil(valores: number[], ventana: number): Array<number | null> {
  return valores.map((_, i) => {
    if (i < ventana - 1) return null;
    let suma = 0;
    for (let j = i - ventana + 1; j <= i; j++) suma += valores[j];
    return suma / ventana;
  });
}

/**
 * Serie de puntos para una polilinea SVG en el viewBox del mockup (320x110),
 * con 5px de aire arriba y abajo para que el trazo de 2.5px no se corte.
 */
export function polilinea(
  valores: Array<number | null>,
  maximo: number,
  ancho = 320,
  alto = 110,
  aire = 5
): string {
  const puntos: string[] = [];
  const n = valores.length;
  if (n === 0 || maximo <= 0) return '';
  const util = alto - aire * 2;
  valores.forEach((v, i) => {
    if (v === null) return;
    const x = n === 1 ? ancho / 2 : (i / (n - 1)) * ancho;
    const y = aire + util - (v / maximo) * util;
    puntos.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return puntos.join(' ');
}

export type Rango = 'dia' | 'semana' | 'mes' | 'todo';

/**
 * Agrupa el volumen de las sesiones de pesas segun el toggle temporal.
 * 'dia' = una sesion por punto (lo que el mockup llama "VOLUMEN POR SESIÓN").
 */
export function serieDeVolumen(
  historial: HistorySession[],
  rango: Rango
): Array<{ etiqueta: string; volumen: number }> {
  // El historial llega de la mas reciente a la mas antigua; el grafico va al
  // reves.
  const pesas = historial.filter((s) => s.type !== 'cardio' && (s.volumenTotal || 0) > 0).slice().reverse();
  if (pesas.length === 0) return [];

  // 'todo' es un punto por SESION en todo el historial; 'dia' agrupa las
  // sesiones del mismo dia. Antes los dos devolvian exactamente lo mismo, asi
  // que el toggle tenia cuatro botones y tres comportamientos.
  if (rango === 'todo') {
    return pesas.map((s) => ({
      etiqueta: etiquetaDeFecha(s),
      volumen: s.volumenTotal || 0,
    }));
  }

  const anios = new Set(pesas.map((s) => fechaDe(s).getFullYear()));
  const conAnio = anios.size > 1;
  const cubos = new Map<string, { etiqueta: string; volumen: number }>();
  for (const sesion of pesas) {
    const fecha = fechaDe(sesion);
    const clave =
      rango === 'dia'
        ? etiquetaDeFecha(sesion)
        : rango === 'semana'
          ? claveSemana(fecha)
          : claveMes(fecha, conAnio);
    const previo = cubos.get(clave);
    if (previo) previo.volumen += sesion.volumenTotal || 0;
    else cubos.set(clave, { etiqueta: clave, volumen: sesion.volumenTotal || 0 });
  }
  return [...cubos.values()];
}

/**
 * Instante de una sesion, en hora LOCAL.
 *
 * Un 'YYYY-MM-DD' pelado lo parsea el motor como medianoche UTC, asi que en
 * UTC-5 una sesion del 17 de abril se leia como el 16: el historial la
 * agrupaba en el mes equivocado en la frontera y el grafico la ponia un dia
 * antes. Con hora explicita se ancla al dia local.
 */
export function fechaDe(sesion: HistorySession): Date {
  const bruta = String(sesion.savedAt || sesion.date || '');
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(bruta);
  const d = new Date(soloFecha ? `${bruta}T00:00:00` : bruta);
  return Number.isNaN(d.getTime()) ? new Date(`${bruta.slice(0, 10)}T00:00:00`) : d;
}

/**
 * Quita el punto de la abreviatura del mes. Segun la version de ICU, es-ES
 * devuelve "ago" o "ago."; el mockup escribe siempre sin punto, y probarlo a
 * traves de toLocaleDateString depende del runtime.
 */
export function sinPunto(texto: string): string {
  return texto.replace(/\./g, '');
}

function etiquetaDeFecha(sesion: HistorySession): string {
  const d = fechaDe(sesion);
  return sinPunto(d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }));
}

/** Lunes de la semana ISO, en formato corto. */
function claveSemana(fecha: Date): string {
  const lunes = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dia = lunes.getDay() === 0 ? 7 : lunes.getDay();
  lunes.setDate(lunes.getDate() - (dia - 1));
  return sinPunto(lunes.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }));
}

/**
 * "ago" cuando toda la serie cabe en un año, "ago 26" cuando la cruza: el
 * mockup escribe solo el mes, pero con dos años en pantalla "ENE" y "ENE"
 * serian dos puntos distintos con la misma etiqueta.
 */
function claveMes(fecha: Date, conAnio: boolean): string {
  const opciones: Intl.DateTimeFormatOptions = conAnio
    ? { month: 'short', year: '2-digit' }
    : { month: 'short' };
  return sinPunto(fecha.toLocaleDateString('es-ES', opciones));
}

/** "ABRIL 2026" en mayusculas, para el separador de meses del historial. */
export function tituloDeMes(fecha: Date): string {
  return fecha
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(' de ', ' ')
    .toUpperCase();
}

/** Clave de agrupacion por mes, estable y ordenable. */
export function claveDeMes(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}
