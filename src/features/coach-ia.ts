/**
 * Coach IA — CO-01, CO-02, CO-03. La CAPA DE DATOS.
 *
 * Regla del handoff, literal: "La aritmética nunca la genera el modelo: 1RM,
 * estancamiento y próximo peso llegan del backend determinista y se insertan
 * como componente — el LLM solo los explica."
 *
 * Asi que aqui hay dos cosas separadas a proposito:
 *
 *   1. `datosDelEjercicio()` — la aritmetica, calculada en el dispositivo con
 *      las mismas funciones que ya usan PR-01 y G-01. No pasa por ninguna red
 *      y no cambia aunque el modelo se equivoque.
 *   2. `AdaptadorCoach` — el texto, que SI viene de fuera. Mientras no haya
 *      backend, el adaptador por defecto es local y lo dice.
 *
 * La conversacion se guarda en localStorage (README, State Management:
 * "conversación del coach (persistente local)"), y las preguntas que no se
 * pudieron enviar quedan en cola.
 */
import { getHistory, getPRs, getBodyMeasurements } from '@/utils/storage';
import {
  pesoActual, picoDe, sesionesSinSubir, posicionEnZonas, zonaDe, fechaDe, distribucionMuscular,
} from '@/utils/zonas';
import { estimateOneRM, getStreakInfo } from '@/features/gamification';
import { unaRepMaxPromedio } from '@/utils/calculations';
import type { HistorySession } from '@/types';

export interface DatoDeEjercicio {
  ejercicio: string;
  unaRepMax: number;
  /** false cuando las reps caen fuera del dominio de las formulas (>15) y la
   *  cifra de arriba es un relleno que NO debe enseñarse. */
  estimable: boolean;
  pico: number;
  actual: number;
  /** Posicion en la barra de zonas, 0-100. */
  posicion: number;
  zona: 'roja' | 'ambar' | 'verde';
  sesionesEstancado: number;
}

export interface TurnoCoach {
  id: string;
  autor: 'coach' | 'usuario';
  texto: string;
  fecha: string;
  /** El componente de datos que acompaña al turno del coach, si lo hay. */
  dato?: DatoDeEjercicio;
  /** Un turno que no se pudo enviar y espera red. */
  pendiente?: boolean;
  error?: boolean;
}

const CLAVE_CONVERSACION = 'gymmate_coach_conversacion';
const CLAVE_COLA = 'gymmate_coach_cola';
const MAX_TURNOS = 100;

/** Un turno que se puede pintar. `Array.isArray` no basta: `[1,2,3]` pasaba el
 *  guard y la pantalla salia con tres tarjetas "COACH · INVALID DATE" que el
 *  usuario no podia borrar desde ningun sitio. */
function esTurno(t: unknown): t is TurnoCoach {
  if (!t || typeof t !== 'object') return false;
  const c = t as Partial<TurnoCoach>;
  return (
    typeof c.texto === 'string' &&
    (c.autor === 'coach' || c.autor === 'usuario') &&
    typeof c.fecha === 'string' &&
    !Number.isNaN(Date.parse(c.fecha))
  );
}

export function leerConversacion(): TurnoCoach[] {
  try {
    const bruto = localStorage.getItem(CLAVE_CONVERSACION);
    const datos = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(datos) ? datos.filter(esTurno) : [];
  } catch {
    return [];
  }
}

export function guardarConversacion(turnos: TurnoCoach[]): void {
  try {
    localStorage.setItem(CLAVE_CONVERSACION, JSON.stringify(turnos.slice(-MAX_TURNOS)));
  } catch {
    // Cuota llena: la conversacion es lo primero que se puede perder sin
    // romper nada. No se avisa por cada tecla.
  }
}

export function leerCola(): string[] {
  try {
    const bruto = localStorage.getItem(CLAVE_COLA);
    const datos = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(datos) ? datos.filter((p): p is string => typeof p === 'string' && p.trim() !== '') : [];
  } catch {
    return [];
  }
}

/**
 * Devuelve si de verdad se guardo.
 *
 * Tragar el `QuotaExceededError` en silencio mientras la tarjeta de error dice
 * "Tu pregunta quedó guardada" es la peor combinacion posible: la pregunta se
 * pierde Y la pantalla afirma lo contrario. Con 100 turnos, historial y PRs,
 * la cuota llena es el escenario normal de una PWA de uso diario.
 */
export function guardarCola(preguntas: string[]): boolean {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(preguntas.slice(-20)));
    return true;
  } catch {
    return false;
  }
}

/**
 * La aritmetica del ejercicio, determinista y local.
 *
 * Devuelve null cuando no hay con que calcularla: sin sesiones no hay pico, y
 * un componente de datos con ceros se leeria como "tu 1RM es 0".
 */
export function datosDelEjercicio(nombre: string, historial: HistorySession[] = getHistory()): DatoDeEjercicio | null {
  const pico = Math.max(picoDe(nombre, historial) ?? 0, getPRs()[nombre]?.peso ?? 0);
  const actual = pesoActual(nombre, historial) ?? 0;
  if (pico <= 0 || actual <= 0) return null;

  // Las repeticiones de la MISMA serie de la que sale `actual`.
  //
  // Antes se tomaban las del pico historico y se multiplicaban por el peso
  // actual: con un pico de 120×2 en julio y 100×12 en las ultimas sesiones, el
  // bloque rotulado "1RM EST." mostraba 107 kg cuando la estimacion correcta
  // (Epley sobre 100×12) es 140. El handoff promete que esa aritmetica es
  // determinista; estaba 33 kg baja.
  const reps = repsDeLaSerieActual(nombre, historial, actual);
  const ratio = actual / pico;
  // Fuera del dominio de las formulas (mas de 15 reps) CA-01 devuelve null y
  // NO enseña cifra. Aqui se caia en `estimateOneRM`, que es Epley a secas:
  // 20 reps daban 33 kg donde la calculadora se niega a estimar. Series de 20
  // son normales en gemelos y abdominales.
  const promedio = unaRepMaxPromedio(actual, reps);
  return {
    ejercicio: nombre,
    // El PROMEDIO de las tres formulas, igual que PR-01 y CA-01. Con Epley a
    // secas, el mismo ejercicio salia 168 kg aqui y 165 alli.
    unaRepMax: Math.round(promedio ?? estimateOneRM(actual, reps)),
    estimable: promedio !== null,
    pico,
    actual,
    posicion: posicionEnZonas(ratio),
    zona: zonaDe(ratio),
    sesionesEstancado: sesionesSinSubir(nombre, historial, pico),
  };
}

/** Las repeticiones de la serie que marco `peso`, mirando de la mas reciente
 *  hacia atras: es la serie que el usuario reconoce como "la de ahora". */
function repsDeLaSerieActual(nombre: string, historial: HistorySession[], peso: number): number {
  for (const sesion of historial) {
    for (const ej of sesion.ejercicios ?? []) {
      if (ej.nombre === nombre && ej.peso === peso) return ej.reps || 1;
    }
  }
  return 1;
}

// ==========================================
// EL CONTEXTO COMPLETO
// ==========================================

/**
 * Todo lo que el coach necesita saber, sin elegir nada.
 *
 * Antes se mandaba UN ejercicio, y solo si la pregunta contenia su nombre
 * literal completo. "¿como voy en banca?" no encontraba "Press Banca", y
 * "¿como va mi progreso este mes?" no encontraba nada: el modelo respondia
 * que no tenia datos, con doce meses de datos al lado.
 *
 * Ahora viaja el año entero. Medido sobre 208 sesiones: la bitacora en texto
 * compacto pesa ~7.500 tokens frente a ~57.000 del mismo historial en JSON,
 * porque el JSON repite las claves en cada serie. Con eso, mandarlo todo en
 * cada pregunta cuesta centimos, y con el bloque cacheado, decimas de centimo.
 *
 * Van DOS piezas, y la separacion es deliberada:
 *
 *   - `panorama` — la aritmetica, ya calculada aqui con las mismas funciones
 *     que pintan PR-01 y G-01. Es la unica verdad para cualquier cifra.
 *   - `bitacora` — el registro crudo, para preguntas de memoria ("¿que hice
 *     el 3 de marzo?"). El modelo NO debe calcular sobre ella: si lo hace,
 *     saca 1RM por Epley y contradice a la pantalla, que promedia tres
 *     formulas. Ese defecto ya ocurrio con 168 kg contra 165.
 */
export interface PanoramaEjercicio extends DatoDeEjercicio {
  /** Fecha de la ultima sesion en que aparece, para saber si esta vigente. */
  ultimaVez: string;
  sesiones: number;
  /**
   * El 1RM sobre la MEJOR serie de siempre, que es el que enseña PR-01.
   *
   * `unaRepMax` se estima sobre la serie ACTUAL, que es de lo que el coach
   * habla. Las dos son legitimas y las dos son "el promedio de tres
   * formulas", pero son cuentas distintas: con un pico de 120x2 y 100x12
   * ahora, PR-01 dice 127 y la actual dice 137. La tarjeta del chat ya lo
   * desambigua escribiendo "1RM EST. ACTUAL"; el texto que va al modelo no lo
   * hacia, y el prompt le ordena copiar la cifra literalmente. Van las dos, y
   * rotuladas.
   */
  unaRepMaxHistorico: number | null;
}

export interface ContextoCoach {
  panorama: PanoramaEjercicio[];
  resumen: {
    /**
     * Que dia es HOY, en local.
     *
     * Faltaba, y el modelo lo dedujo de la ultima fecha del registro: dijo
     * "Hoy es 2026-04-18" cuando era 22 de agosto, y razono cuatro meses de
     * conclusiones sobre esa base. No es prudencia, es inventar. Un contexto
     * sin fecha obliga a adivinarla.
     */
    hoy: string;
    sesiones: number;
    desde: string | null;
    hasta: string | null;
    /**
     * Las cuentas de calendario, hechas AQUI.
     *
     * "¿Cuanto llevo sin entrenar?" y "¿cuantas sesiones este mes?" son
     * preguntas legitimas y la respuesta es determinista. El modelo tenia
     * prohibido calcular y ninguna de las dos venia dada, asi que se negaba a
     * responder algo que si sabe. La salida no es dejarle contar dias: es
     * darle el numero, como con todo lo demas.
     */
    diasDesdeUltima: number | null;
    sesionesUltimos7: number;
    sesionesUltimos30: number;
    sesionesEsteMes: number;
    racha: number;
    mejorRacha: number;
    volumenPorGrupo: Record<string, number>;
    volumenUltimos30: number;
    pesoCorporal: number | null;
    grasaCorporal: number | null;
  };
  bitacora: string;
}

/** Cuantos meses de historial viajan. Un año: mas atras el dato ya no dice
 *  nada de la forma actual, y la bitacora crece sin darle nada al modelo. */
export const MESES_DE_CONTEXTO = 12;

function desdeHaceMeses(meses: number): Date {
  // Se construye por componentes locales, nunca desde una cadena: en Lima
  // (UTC-5) `new Date('2026-08-22')` se interpreta como UTC y cae en el dia
  // anterior.
  //
  // A las 00:00, no a mediodia. Con el corte a mediodia, en el dia limite lo
  // entrenado por la mañana quedaba FUERA y lo de la tarde dentro. Y no era
  // teorico: `parseSpanishDate` guarda toda sesion importada de CSV como
  // `T12:00:00.000Z`, que en Lima son las 07:00, asi que toda sesion
  // importada que cayera en el dia limite desaparecia del contexto, siempre.
  // El dia limite entra entero o no entra.
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() - meses, hoy.getDate(), 0, 0, 0, 0);
}

/**
 * El contexto entero, calculado en el dispositivo.
 *
 * Devuelve null si no hay ni una sesion en la ventana: un contexto de ceros
 * se leeria como "tu 1RM es 0" y es peor que no mandar nada.
 */
export function contextoCompleto(
  historial: HistorySession[] = getHistory(),
  meses = MESES_DE_CONTEXTO
): ContextoCoach | null {
  const corte = desdeHaceMeses(meses);
  const dentro = historial.filter((s) => {
    const f = new Date(fechaDe(s));
    return !Number.isNaN(f.getTime()) && f >= corte;
  });
  if (dentro.length === 0) return null;

  // Ordenadas de mas nueva a mas vieja: es lo que asumen `pesoActual` y
  // `repsDeLaSerieActual`, que leen "la primera que encuentran".
  const orden = [...dentro].sort((a, b) => fechaDe(b).getTime() - fechaDe(a).getTime());

  const nombres = new Set<string>();
  for (const s of orden) for (const e of s.ejercicios ?? []) if (e.nombre) nombres.add(e.nombre);

  const panorama: PanoramaEjercicio[] = [];
  for (const nombre of nombres) {
    const dato = datosDelEjercicio(nombre, orden);
    if (!dato) continue;
    const suyas = orden.filter((s) => (s.ejercicios ?? []).some((e) => e.nombre === nombre));
    panorama.push({
      ...dato,
      ejercicio: limpio(dato.ejercicio),
      sesiones: suyas.length,
      ultimaVez: suyas[0] ? diaDe(suyas[0]) : '',
      unaRepMaxHistorico: unaRepMaxDeLaMejorSerie(nombre, orden),
    });
  }
  panorama.sort((a, b) => b.sesiones - a.sesiones);

  const racha = getStreakInfo();
  const medidas = getBodyMeasurements()
    .filter((m) => typeof m.weight === 'number' || typeof m.bodyFat === 'number')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const ultima = medidas[0];

  const volumenPorGrupo: Record<string, number> = {};
  for (const { musculo, volumen } of distribucionMuscular(orden)) {
    // El grupo tambien lo escribe el usuario y tambien viaja, ademas como
    // CLAVE dentro del bloque que el prompt llama "ya calculado".
    volumenPorGrupo[limpio(musculo) || 'sin grupo'] = Math.round(volumen);
  }

  // Las cuentas de calendario, en dias LOCALES completos: comparar instantes
  // daria 0 dias para algo entrenado anoche a las 23:00.
  const hoyMedianoche = new Date();
  hoyMedianoche.setHours(0, 0, 0, 0);
  const diasHasta = (s: HistorySession): number => {
    const d = fechaDe(s);
    d.setHours(0, 0, 0, 0);
    return Math.round((hoyMedianoche.getTime() - d.getTime()) / 86400000);
  };
  const dentroDe = (n: number) => orden.filter((s) => diasHasta(s) < n).length;
  const mesActual = `${hoyMedianoche.getFullYear()}-${String(hoyMedianoche.getMonth() + 1).padStart(2, '0')}`;

  return {
    panorama,
    resumen: {
      hoy: diaLocalDe(hoyMedianoche),
      sesiones: orden.length,
      hasta: orden[0] ? diaDe(orden[0]) : null,
      desde: orden[orden.length - 1] ? diaDe(orden[orden.length - 1]) : null,
      diasDesdeUltima: orden[0] ? diasHasta(orden[0]) : null,
      sesionesUltimos7: dentroDe(7),
      sesionesUltimos30: dentroDe(30),
      sesionesEsteMes: orden.filter((s) => diaDe(s).startsWith(mesActual)).length,
      racha: racha.current,
      mejorRacha: racha.best,
      volumenPorGrupo,
      volumenUltimos30: Math.round(
        orden.filter((s) => diasHasta(s) < 30 && s.type !== 'cardio')
          .reduce((t, s) => t + (s.volumenTotal ?? 0), 0)
      ),
      pesoCorporal: typeof ultima?.weight === 'number' ? ultima.weight : null,
      grasaCorporal: typeof ultima?.bodyFat === 'number' ? Math.round(ultima.bodyFat * 10) / 10 : null,
    },
    bitacora: bitacoraDe(orden),
  };
}

/**
 * El 1RM sobre la mejor serie de siempre: el mismo criterio que `calculate1RM`
 * usa para PR-01 —mayor peso, y a igual peso mas repeticiones—, para que las
 * dos cifras no puedan divergir por el desempate.
 */
function unaRepMaxDeLaMejorSerie(nombre: string, historial: HistorySession[]): number | null {
  let mejorPeso = 0;
  let mejorReps = 0;
  for (const s of historial) {
    for (const e of s.ejercicios ?? []) {
      if (e.nombre !== nombre || !(e.peso > 0)) continue;
      if (e.peso > mejorPeso || (e.peso === mejorPeso && e.reps > mejorReps)) {
        mejorPeso = e.peso;
        mejorReps = e.reps;
      }
    }
  }
  if (mejorPeso <= 0) return null;
  const p = unaRepMaxPromedio(mejorPeso, mejorReps || 1);
  return p === null ? null : Math.round(p);
}

/** Una fecha en ISO corto, con los componentes LOCALES. `toISOString()` daria
 *  el dia anterior en Lima para cualquier hora antes de las 19:00. */
function diaLocalDe(f: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
}

/** El dia local de una sesion, en ISO corto. */
function diaDe(sesion: HistorySession): string {
  return diaLocalDe(fechaDe(sesion));
}

/**
 * Limpia un texto que escribio el usuario antes de meterlo en la bitacora.
 *
 * `builder.ts` acepta cualquier cosa como nombre de ejercicio, y ese nombre
 * entra crudo en `NOMBRE SETSxREPS@PESO`. Comprobado: un nombre con `;`
 * fabrica un ejercicio que no existe, uno llamado `Press 4x8@100` deja al
 * modelo con dos series y ninguna forma de saber cual es la buena, y un salto
 * de linea inventa una SESION ENTERA con su fecha. No hace falta un atacante:
 * el unico que escribe esos nombres es el dueño, y se corrompe igual.
 */
function limpio(bruto: unknown): string {
  return String(bruto ?? '')
    .replace(/[\r\n;·|@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * El historial en texto, una linea por sesion.
 *
 *   2026-08-18 Pecho · Press Banca 4x8@100; Aperturas 3x12@22
 *   2026-08-16 cardio · carrera 32 min
 *
 * Este formato pesa 7,6 veces menos que el mismo historial en JSON y dice lo
 * mismo. Va de la sesion mas ANTIGUA a la mas reciente porque asi se lee una
 * progresion.
 */
function bitacoraDe(sesionesNuevaPrimero: HistorySession[]): string {
  const lineas: string[] = [];
  for (let i = sesionesNuevaPrimero.length - 1; i >= 0; i--) {
    const s = sesionesNuevaPrimero[i];
    if (s.type === 'cardio') {
      // `totalTime` esta en SEGUNDOS —lo confirma `hueso.ts:125`, que lo
      // llama `segundos` y lo pasa a `formatearTiempo`—.
      const min = s.stats?.totalTime ? Math.round(s.stats.totalTime / 60) : null;
      lineas.push(`${diaDe(s)} cardio${s.mode ? ' ' + limpio(s.mode) : ''}${min ? ` ${min} min` : ''}`);
      continue;
    }
    const ejs = (s.ejercicios ?? [])
      .filter((e) => e.nombre)
      .map((e) => `${limpio(e.nombre)} ${e.sets}x${e.reps}@${e.peso}`)
      .join('; ');
    if (!ejs) continue;
    lineas.push(`${diaDe(s)} ${limpio(s.grupo) || 'sesion'} · ${ejs}`);
  }
  return lineas.join('\n');
}

/** El ejercicio del que habla una pregunta, si nombra alguno del historial. */
export function ejercicioMencionado(pregunta: string, historial: HistorySession[] = getHistory()): string | null {
  const texto = pregunta.toLowerCase();
  const nombres = new Set<string>();
  for (const s of historial) for (const e of s.ejercicios ?? []) nombres.add(e.nombre);
  // El mas largo primero: "Press Banca Inclinado" antes que "Press Banca".
  const orden = [...nombres].sort((a, b) => b.length - a.length);
  return orden.find((n) => texto.includes(n.toLowerCase())) ?? null;
}

// ==========================================
// EL ADAPTADOR
// ==========================================

export interface RespuestaCoach {
  texto: string;
  dato?: DatoDeEjercicio;
}

export interface AdaptadorCoach {
  /** true cuando hay un backend de verdad detras. */
  readonly enLinea: boolean;
  /** Devuelve la respuesta en trozos, para poder pintarla en streaming. */
  responder(pregunta: string, historial: TurnoCoach[]): AsyncIterable<string>;
  /** El componente de datos que acompaña, calculado SIEMPRE en local. */
  datosPara(pregunta: string): DatoDeEjercicio | null;
}

/**
 * Adaptador local, el que corre hasta que exista backend.
 *
 * No inventa explicaciones: dice lo que los datos dicen y lo dice con la voz
 * del handoff (peso objetivo, nunca la diferencia; sin porras). Cuando la
 * pregunta no toca ningun dato que la app tenga, lo admite en vez de rellenar.
 */
export class CoachLocal implements AdaptadorCoach {
  readonly enLinea = false;

  datosPara(pregunta: string): DatoDeEjercicio | null {
    const ejercicio = ejercicioMencionado(pregunta);
    return ejercicio ? datosDelEjercicio(ejercicio) : null;
  }

  async *responder(pregunta: string): AsyncIterable<string> {
    const texto = this.componer(pregunta);
    // En trozos de palabra, como llegaria de un backend con streaming.
    for (const trozo of texto.split(/(\s+)/)) {
      yield trozo;
    }
  }

  private componer(pregunta: string): string {
    const dato = this.datosPara(pregunta);
    if (!dato) {
      return (
        'Pregúntame por un ejercicio que hayas registrado y te enseño su 1RM ' +
        'estimado, su pico y cuántas sesiones lleva sin subir.'
      );
    }
    const partes: string[] = [];
    if (dato.sesionesEstancado >= 3) {
      const caida = Math.round((1 - dato.actual / dato.pico) * 100);
      partes.push(
        `${dato.sesionesEstancado} sesiones seguidas en ${dato.actual} kg` +
          (caida > 0 ? `, ${caida}% bajo tu pico de ${dato.pico} kg.` : '.')
      );
    } else if (dato.zona === 'verde') {
      partes.push(`Estás en ${dato.actual} kg, en territorio de récord: tu pico es ${dato.pico} kg.`);
    } else {
      partes.push(`Vas por ${dato.actual} kg y tu pico son ${dato.pico} kg.`);
    }
    // La voz del handoff: el peso objetivo, nunca la diferencia.
    partes.push(`Levanta ${dato.pico + 2.5} kg en ${dato.ejercicio} y es PR nuevo.`);
    // Y se acaba ahi. "El resto de la explicación llega cuando conectes el
    // modelo" era una nota de implementacion con voz de producto: el usuario
    // no tiene ninguna pantalla donde conectar nada.
    return partes.join(' ');
  }
}

/**
 * El adaptador que habla con el servidor de Railway.
 *
 * La aritmetica NO viaja para que el modelo la rehaga: viaja ya calculada,
 * dentro de `datos`, y el servidor le dice al modelo que la use tal cual. Si
 * el modelo se equivoca en una cifra, la tarjeta que se pinta al lado sigue
 * diciendo la verdad porque sale de `datosPara`, que corre aqui.
 */
export class CoachRemoto implements AdaptadorCoach {
  readonly enLinea = true;

  constructor(
    private readonly url: string,
    private readonly token: string
  ) {}

  datosPara(pregunta: string): DatoDeEjercicio | null {
    const ejercicio = ejercicioMencionado(pregunta);
    return ejercicio ? datosDelEjercicio(ejercicio) : null;
  }

  async *responder(pregunta: string, historial: TurnoCoach[]): AsyncIterable<string> {
    // El contexto se calcula UNA vez y `datos` sale de dentro de el, no de
    // una llamada aparte. `contextoCompleto` filtra a 12 meses y `datosPara`
    // leia el historial ENTERO: para un ejercicio cuyo pico esta fuera de la
    // ventana, los dos bloques viajaban en el mismo mensaje con cifras
    // distintas —uno rotulado "la unica verdad" y el otro "los mismos que la
    // tarjeta de al lado"—. Ahora es literalmente el mismo objeto.
    const contexto = contextoCompleto();
    const nombre = ejercicioMencionado(pregunta);
    const datos = nombre
      ? (contexto?.panorama.find((e) => e.ejercicio === nombre) ?? null)
      : null;
    const r = await fetch(`${this.url}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({
        pregunta,
        historial: historial.slice(-12).map((t) => ({ autor: t.autor, texto: t.texto })),
        // El ejercicio de la pregunta, si lo hay: es el que se pinta como
        // tarjeta al lado de la respuesta.
        datos,
        // Y el año entero, sin elegir. Va en cada peticion porque la API no
        // guarda estado; el servidor lo marca como bloque cacheable, asi que
        // de la segunda pregunta en adelante se lee de cache a 0,1x.
        contexto,
      }),
    });
    if (!r.ok || !r.body) {
      // Se lanza a proposito: `coach-chat.ts` lo trata como caida de red,
      // guarda la pregunta en la cola y pinta CO-03. Es el comportamiento que
      // el handoff pide y ya esta comprobado.
      throw new Error(`el coach respondió ${r.status}`);
    }
    const lector = r.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      const trozo = dec.decode(value, { stream: true });
      if (trozo) yield trozo;
    }
  }
}

let adaptador: AdaptadorCoach = new CoachLocal();

export function usarAdaptador(nuevo: AdaptadorCoach): void {
  adaptador = nuevo;
}

export function adaptadorActual(): AdaptadorCoach {
  return adaptador;
}
