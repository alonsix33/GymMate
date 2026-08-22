import { SIN_FECHA, fechaLegible } from '@/utils/fecha';
/**
 * Aritmetica de perfil y medidas — CA-01, CA-02, P-01, P-02, P-03.
 *
 * Sin DOM: se prueba sola. Cada cifra de aqui la lee el usuario junto a otra,
 * asi que lo que importa es que sean coherentes entre si.
 */
import type { BodyMeasurement } from '@/types';
import { claveDiaDe } from './fecha';

// ==========================================
// % GRASA (NAVY)
// ==========================================

/**
 * Escala de la barra de % graso, rederivada del mockup.
 *
 * P-01 dibuja los tramos al 40% / 30% / resto y pone el marcador en `left:52%`
 * para un 18.4%. 18.4 / 0.52 = 35.4, y con una escala de 0-35 el corte
 * verde/ambar cae en 14.0 exactos — que es el borde inferior del pie de P-03,
 * "ZONA SALUDABLE 14-20%". Las dos cifras del handoff cierran sobre la misma
 * escala, asi que la escala es 0-35.  [REF Pantallas P-01/P-03]
 */
export const GRASA_ESCALA_MAX = 35;
export const GRASA_VERDE_HASTA = 14;
export const GRASA_AMBAR_HASTA = 24.5;

export type ZonaGrasa = 'verde' | 'ambar' | 'roja';

export function zonaDeGrasa(pct: number): ZonaGrasa {
  if (pct < GRASA_VERDE_HASTA) return 'verde';
  if (pct < GRASA_AMBAR_HASTA) return 'ambar';
  return 'roja';
}

/** Posicion del marcador en la barra, en % y acotada a la pista. */
export function posicionGrasa(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, (pct / GRASA_ESCALA_MAX) * 100));
}

/**
 * % graso por el metodo Navy.
 *
 * DEFECTO PREEXISTENTE CORREGIDO. La app usaba la forma logaritmica lineal
 * (`86.010·log10(cintura-cuello) - 70.041·log10(altura) + 36.76` y su gemela
 * femenina), que es una aproximacion publicada que se desvia mucho de la
 * formula real. Para una mujer de 165 cm con cintura 70 y cadera 96 devolvia
 * **52.2 %**, un valor imposible que ademas colaba por debajo del tope de 60
 * que el propio codigo ponia; para un hombre de 178/92/38 daba 28.1 donde las
 * calculadoras Navy dan ~22.6.
 *
 * Esta es la formula del US Navy, la que devuelve cualquier calculadora que se
 * anuncie como tal — y "Navy" es justo lo que el rotulo de P-03 promete al
 * usuario.
 *
 * AVISO: los `bodyFat` ya guardados en el historial se calcularon con la
 * aproximacion vieja, asi que las mediciones antiguas y las nuevas no son
 * comparables entre si hasta que se recalculen.
 */
export function grasaNavy(
  m: Pick<BodyMeasurement, 'waist' | 'neck' | 'hips'>,
  altura: number,
  genero: 'male' | 'female'
): number | null {
  const cintura = m.waist ?? 0;
  const cuello = m.neck ?? 0;
  const cadera = m.hips ?? 0;
  if (!(cintura > 0 && cuello > 0 && altura > 0)) return null;

  let pct: number;
  if (genero === 'male') {
    if (cintura <= cuello) return null;
    pct =
      495 /
        (1.0324 - 0.19077 * Math.log10(cintura - cuello) + 0.15456 * Math.log10(altura)) -
      450;
  } else {
    if (!(cadera > 0) || cintura + cadera <= cuello) return null;
    pct =
      495 /
        (1.29579 - 0.35004 * Math.log10(cintura + cadera - cuello) + 0.221 * Math.log10(altura)) -
      450;
  }
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 60) return null;
  return Math.round(pct * 10) / 10;
}

// ==========================================
// MEDIDAS: ORDEN, SERIES Y TENDENCIA
// ==========================================

/** De la mas reciente a la mas antigua. El orden de insercion no basta: un CSV
 *  importado puede llegar desordenado. */
export function ordenadas(medidas: BodyMeasurement[]): BodyMeasurement[] {
  return [...medidas].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function ultimaMedida(medidas: BodyMeasurement[]): BodyMeasurement | null {
  return ordenadas(medidas)[0] ?? null;
}

/** Los cuatro perimetros de P-03, con su clave en el modelo. [REF perimetros] */
export const PERIMETROS: Array<{ clave: keyof BodyMeasurement; nombre: string; creceEsBueno: boolean }> = [
  { clave: 'chest', nombre: 'Pecho', creceEsBueno: true },
  { clave: 'waist', nombre: 'Cintura', creceEsBueno: false },
  { clave: 'armRight', nombre: 'Brazo', creceEsBueno: true },
  { clave: 'thighRight', nombre: 'Muslo', creceEsBueno: true },
];

export interface CambioPerimetro {
  nombre: string;
  valor: number;
  delta: number;
  /** true cuando el cambio va en la direccion que el usuario quiere. */
  deseable: boolean;
  /** Ancho de la barra en %, y hacia que lado crece desde el centro. */
  ancho: number;
  hacia: 'derecha' | 'izquierda';
}

/**
 * Ancho de la barra divergente de P-03.
 *
 * DESVIACION DECLARADA. Las cuatro filas del mockup no comparten geometria:
 * Pecho (+2, w22%, ml:0) queda CENTRADO sobre el 50%, mientras Cintura (-3,
 * w30%, ml:-31.5%) queda a la IZQUIERDA. No hay una sola lectura que explique
 * las cuatro, asi que se adopta la que su propio pie sostiene ("Brazo y muslo
 * creciendo, cintura bajando"): barra divergente desde una linea central.
 * El ancho `6 + 8·|Δ|` reproduce exacto Pecho (22), Cintura (30) y Muslo (26);
 * Brazo da 18 donde el mockup dibuja 16.
 * PREGUNTA ABIERTA para el handoff.
 */
export function anchoDeCambio(delta: number): number {
  if (!Number.isFinite(delta) || delta === 0) return 0;
  return Math.min(46, 6 + 8 * Math.abs(delta));
}

/**
 * Cambio de cada perimetro entre la medicion mas antigua de la ventana y la
 * mas reciente. Sin dos mediciones no hay cambio que enseñar: devuelve lista
 * vacia en vez de una fila de ceros, que se leeria como "no has cambiado".
 */
export function cambioDePerimetros(medidas: BodyMeasurement[]): CambioPerimetro[] {
  const orden = ordenadas(medidas);
  if (orden.length < 2) return [];
  const reciente = orden[0];
  const antigua = orden[orden.length - 1];

  const salida: CambioPerimetro[] = [];
  for (const { clave, nombre, creceEsBueno } of PERIMETROS) {
    const ahora = reciente[clave];
    const antes = antigua[clave];
    if (typeof ahora !== 'number' || typeof antes !== 'number') continue;
    const delta = Math.round((ahora - antes) * 10) / 10;
    salida.push({
      nombre,
      valor: ahora,
      delta,
      deseable: delta === 0 ? true : creceEsBueno === delta > 0,
      ancho: anchoDeCambio(delta),
      hacia: delta >= 0 ? 'derecha' : 'izquierda',
    });
  }
  return salida;
}

/**
 * El pie del bloque de perimetros. El mockup escribe "Brazo y muslo creciendo,
 * cintura bajando — el par que quieres ver junto", que es una AFIRMACION sobre
 * los datos: fijarla la convertiria en mentira en cuanto los datos cambien.
 * Se genera, y cuando no hay nada que afirmar no se escribe nada.
 */
export function pieDePerimetros(cambios: CambioPerimetro[]): string {
  // Solo EXTREMIDADES: el mockup escribe "Brazo y muslo creciendo" con unos
  // datos en los que el pecho tambien crece, asi que la frase no enumera todo
  // lo que sube — señala el par que interesa mirar junto a la cintura.
  const EXTREMIDADES = new Set(['Brazo', 'Muslo']);
  const creciendo = cambios
    .filter((c) => c.delta > 0 && EXTREMIDADES.has(c.nombre))
    .map((c) => c.nombre.toLowerCase());
  const cintura = cambios.find((c) => c.nombre === 'Cintura');

  const lista = (xs: string[]) =>
    xs.length === 2 ? `${xs[0]} y ${xs[1]}` : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
  const enMayuscula = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;

  // Sin dato de cintura no se afirma nada SOBRE la cintura. La version
  // anterior caia en "la cintura se mantiene" siempre que no bajara —
  // incluidos "sube 10 cm" y "no hay dato", que es el rotulo mintiendo justo
  // encima de la fila que dice +10.
  if (!cintura) {
    if (creciendo.length === 0) return '';
    return `${enMayuscula(lista(creciendo))} ${creciendo.length === 1 ? 'creciendo' : 'creciendo'}.`;
  }

  if (cintura.delta < 0) {
    if (creciendo.length >= 2) {
      return `${enMayuscula(lista(creciendo))} creciendo, cintura bajando — el par que quieres ver junto.`;
    }
    if (creciendo.length === 1) {
      return `${enMayuscula(creciendo[0])} creciendo y cintura bajando — el par que quieres ver junto.`;
    }
    return 'La cintura baja. Es la mitad del par que quieres ver.';
  }

  if (cintura.delta > 0) {
    if (creciendo.length >= 1) {
      return `${enMayuscula(lista(creciendo.concat('cintura')))} creciendo: sube todo, no solo lo que quieres.`;
    }
    return 'La cintura sube.';
  }

  // Cintura exactamente igual.
  if (creciendo.length >= 1) {
    return `${enMayuscula(lista(creciendo))} creciendo y la cintura se mantiene.`;
  }
  return '';
}

// ==========================================
// SERIES PARA LAS GRAFICAS DE P-03
// ==========================================

export interface PuntoSerie {
  x: number;
  y: number;
  valor: number;
  /** La fecha del PROPIO punto. Sin ella, el rotulo del eje tomaba el mes de
   *  la medicion mas antigua del historial y el valor del primer punto de la
   *  serie ya filtrada: dos mitades de fechas distintas en cuanto la mas
   *  antigua no tenia con que calcular su %. */
  fecha: string;
}

/**
 * Polilinea de una serie dentro de un viewBox, con el mismo encuadre que el
 * mockup: margen de 10 a la izquierda y 300 de recorrido util.
 */
export function serieDeMedidas(
  medidas: BodyMeasurement[],
  leer: (m: BodyMeasurement) => number | null | undefined,
  alto: number,
  margen = 10
): PuntoSerie[] {
  const orden = ordenadas(medidas).reverse(); // de vieja a nueva, como el eje
  const valores: Array<{ i: number; v: number }> = [];
  orden.forEach((m, i) => {
    const v = leer(m);
    if (typeof v === 'number' && Number.isFinite(v)) valores.push({ i, v });
  });
  if (valores.length === 0) return [];

  const nums = valores.map((p) => p.v);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  // Una serie plana no puede dividir por cero: se dibuja en el centro.
  const rango = max - min || 1;
  const paso = valores.length > 1 ? 300 / (valores.length - 1) : 0;

  return valores.map((p, k) => ({
    x: Math.round(margen + k * paso),
    y: max === min ? Math.round(alto / 2) : Math.round(alto - ((p.v - min) / rango) * alto),
    valor: p.v,
    fecha: orden[p.i].date,
  }));
}

export function polilineaDe(puntos: PuntoSerie[]): string {
  return puntos.map((p) => `${p.x},${p.y}`).join(' ');
}

/** "FEB · 77.4" — la etiqueta de los extremos del eje. */
export function etiquetaDeExtremo(
  fecha: string | undefined,
  valor: number | null,
  decimales = 1
): string {
  if (!fecha || valor === null) return '';
  const d = fechaLegible(fecha);
  if (!d) return `${SIN_FECHA} · ${valor.toFixed(decimales)}`;
  const mes = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toUpperCase();
  return `${mes} · ${valor.toFixed(decimales)}`;
}

/** "12 mediciones · desde feb". Sin mediciones no se escribe un cero. */
export function resumenDeMediciones(medidas: BodyMeasurement[]): string {
  if (medidas.length === 0) return '';
  const orden = ordenadas(medidas);
  const primera = fechaLegible(orden[orden.length - 1].date);
  const desde = primera
    ? primera.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
    : SIN_FECHA;
  return `${medidas.length} ${medidas.length === 1 ? 'medición' : 'mediciones'} · desde ${desde}`;
}

/** Cuantas medidas trae un registro, sin contar la fecha ni el % graso. */
export function cuantasMedidas(m: BodyMeasurement): number {
  return PERIMETROS.length === 0
    ? 0
    : (['weight', 'neck', 'chest', 'waist', 'hips', 'armLeft', 'armRight', 'thighLeft', 'thighRight'] as const)
        .filter((c) => typeof m[c] === 'number')
        .length;
}

/** true si ya hay una medicion de HOY (dia local). */
export function hayMedicionDeHoy(medidas: BodyMeasurement[]): boolean {
  const hoy = claveDiaDe(new Date().toISOString());
  return medidas.some((m) => claveDiaDe(m.date) === hoy);
}
