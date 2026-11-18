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
  pesoActual, picoDe, sesionesSinSubir, posicionEnZonas, zonaDe, fechaDe,
} from '@/utils/zonas';
import { estimateOneRM, getStreakInfo } from '@/features/gamification';
import { unaRepMaxPromedio } from '@/utils/calculations';
import { esSerieValida } from '@/utils/series';
import { trainingGroups } from '@/data/training-groups';
import {
  claveDiaDeSesion,
  claveDiaLima,
  diasEntre,
  etiquetaDia,
} from '@/utils/fecha';
import {
  construirEstado,
  fusionarDias,
  idDe,
  prsVigentes,
  type DiaEntrenado,
  type EstadoCoach,
  type PlantillaDeGrupo,
} from '@/features/coach-estado';
import type { HistorySession, PRData } from '@/types';
import type { GraficoDelTurno, Opcion } from '@/features/coach-grafico';

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
  /** Gráfico que dibuja la app (no el modelo): solo el tipo y el ejercicio; los
   *  puntos se recalculan al pintar, así que nunca quedan viejos ni inventados.
   *  Los turnos guardados con la primera versión traen solo `{ ejercicio }`. */
  grafico?: GraficoDelTurno | { ejercicio: string };
  /** Botones para elegir qué gráfico dibujar. Una cadena es un ejercicio (primera versión). */
  opciones?: Array<string | Opcion>;
  /** 'app' = tarjeta que mostro la APP (la de Home), no algo que dijo el modelo.
   *  El modelo la recibe como AVISO DE LA APP, con sus cifras. */
  origen?: 'app';
  /** Las cifras de las que salio el aviso (p. ej. "41,2k vs 36,5k kg"). */
  cifras?: string;
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

/**
 * Empieza de cero.
 *
 * Hacia falta y no existia: la conversacion se acumulaba hasta 100 turnos y no
 * habia forma de vaciarla. El motivo NO es el coste ni la cache —eso se
 * explica abajo— sino la RELEVANCIA: un consejo de hace cuatro meses, cuando
 * entrenabas otra cosa, sigue en los ultimos turnos y arrastra la respuesta de
 * hoy.
 *
 * Sobre la cache, para que nadie repita mi propia intuicion equivocada:
 * borrar NO la libera. El prefijo cacheado es sistema + contexto + acuse, y va
 * ANTES del historial; la conversacion se añade detras y lo extiende. Vaciarla
 * devuelve la cache a su prefijo mas corto, no la suelta.
 *
 * Se lleva tambien la cola: preguntas que nunca salieron y que, tras un
 * borron, no tienen hilo al que volver.
 */
export function borrarConversacion(): void {
  try {
    localStorage.removeItem(CLAVE_CONVERSACION);
    localStorage.removeItem(CLAVE_COLA);
  } catch {
    // Si ni siquiera se puede borrar, la pantalla se encarga de decirlo.
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
export function datosDelEjercicio(
  nombre: string,
  historial: HistorySession[] = getHistory(),
  prs: Record<string, PRData> = prsVigentes(getPRs(), historial)
): DatoDeEjercicio | null {
  // El record guardado SOLO si sigue valiendo: un PR de 450 kg cuya unica serie
  // esta excluida no puede seguir siendo el pico.
  const pico = Math.max(picoDe(nombre, historial) ?? 0, prs[nombre]?.peso ?? 0);
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
      if (ej.nombre === nombre && ej.peso === peso && esSerieValida(ej)) return ej.reps || 1;
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
  /** Un id por maquina: "Aductora" y "Abductora" son dos ejercicios. */
  id: string;
  /** Dias desde la ultima vez, calculados aqui. */
  diasSinTocar: number;
  /** Fecha de la ultima sesion en que aparece, ya escrita: "jue 12 nov". */
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
  /** Todo lo que es fecha, cuenta o regla, calculado en codigo. */
  estado: EstadoCoach;
}

/** Cuantos meses de historial viajan. Un año: mas atras el dato ya no dice
 *  nada de la forma actual, y la bitacora crece sin darle nada al modelo. */
export const MESES_DE_CONTEXTO = 12;

/** El dia (Lima) a partir del cual entra el historial: hoy menos N meses. El
 *  dia limite entra ENTERO, sea la hora que sea, y se calcula sobre claves de
 *  dia, nunca desde una cadena 'YYYY-MM-DD' parseada como UTC. */
function corteDeMeses(hoy: string, meses: number): string {
  const [a, m, d] = hoy.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1 - meses, d));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}

function plantillasDeGrupo(): PlantillaDeGrupo[] {
  return Object.values(trainingGroups).map((g) => ({
    nombre: g.nombre,
    ejercicios: g.ejercicios.map((e) => e.nombre),
  }));
}

/**
 * El contexto entero, calculado en el dispositivo y RECONSTRUIDO en cada
 * mensaje (nunca cacheado): lo que el coach ve es lo que hay en la bitacora en
 * ese instante.
 *
 * Devuelve null si no hay ni una sesion en la ventana: un contexto de ceros
 * se leeria como "tu 1RM es 0" y es peor que no mandar nada.
 */
export function contextoCompleto(
  historial: HistorySession[] = getHistory(),
  meses = MESES_DE_CONTEXTO,
  ahora: Date = new Date()
): ContextoCoach | null {
  const hoy = claveDiaLima(ahora);
  const anio = Number(hoy.slice(0, 4));
  const corte = corteDeMeses(hoy, meses);
  const dentro = historial.filter((s) => {
    const dia = claveDiaDeSesion(s);
    return dia !== null && dia >= corte;
  });
  if (dentro.length === 0) return null;

  // Ordenadas de mas nueva a mas vieja: es lo que asumen `pesoActual` y
  // `repsDeLaSerieActual`, que leen "la primera que encuentran".
  const orden = [...dentro].sort((a, b) =>
    (claveDiaDeSesion(b) ?? '') === (claveDiaDeSesion(a) ?? '')
      ? fechaDe(b).getTime() - fechaDe(a).getTime()
      : (claveDiaDeSesion(b) ?? '') > (claveDiaDeSesion(a) ?? '') ? 1 : -1
  );
  const dias = fusionarDias(orden, anio);
  const prs = prsVigentes(getPRs(), historial);

  const nombres = new Set<string>();
  for (const s of orden) for (const e of s.ejercicios ?? []) if (e.nombre && !e.excluido && e.volumen > 0) nombres.add(e.nombre);

  const panorama: PanoramaEjercicio[] = [];
  for (const nombre of nombres) {
    const dato = datosDelEjercicio(nombre, orden, prs);
    if (!dato) continue;
    const suyos = dias.filter((d) => d.series.some((x) => x.nombre === nombre));
    panorama.push({
      ...dato,
      ejercicio: limpio(dato.ejercicio),
      id: idDe(nombre),
      sesiones: suyos.length,
      ultimaVez: suyos[0] ? etiquetaDia(suyos[0].fecha, anio) : '',
      diasSinTocar: suyos[0] ? diasEntre(suyos[0].fecha, hoy) : 0,
      unaRepMaxHistorico: unaRepMaxDeLaMejorSerie(nombre, orden),
    });
  }
  panorama.sort((a, b) => b.sesiones - a.sesiones);

  const racha = getStreakInfo();
  const medidas = getBodyMeasurements()
    .filter((m) => typeof m.weight === 'number' || typeof m.bodyFat === 'number')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const ultima = medidas[0];

  // El volumen por grupo sale de los dias YA fusionados y sin series
  // excluidas: la suma por sesion contaba dos veces lo guardado dos veces.
  const volumenPorGrupo: Record<string, number> = {};
  for (const d of dias) {
    for (const x of d.series) {
      const g = limpio(x.grupoMuscular) || 'sin grupo';
      volumenPorGrupo[g] = (volumenPorGrupo[g] ?? 0) + Math.round(x.volumen);
    }
  }

  // Las cuentas de calendario, en dias de LIMA completos.
  const dentroDe = (n: number) => dias.filter((d) => diasEntre(d.fecha, hoy) < n).length;
  const mesActual = hoy.slice(0, 7);

  return {
    panorama,
    resumen: {
      hoy,
      sesiones: dias.length,
      hasta: dias[0] ? dias[0].fecha : null,
      desde: dias[dias.length - 1] ? dias[dias.length - 1].fecha : null,
      diasDesdeUltima: dias[0] ? diasEntre(dias[0].fecha, hoy) : null,
      sesionesUltimos7: dentroDe(7),
      sesionesUltimos30: dentroDe(30),
      sesionesEsteMes: dias.filter((d) => d.fecha.startsWith(mesActual)).length,
      racha: racha.current,
      mejorRacha: racha.best,
      volumenPorGrupo,
      volumenUltimos30: Math.round(
        dias.filter((d) => diasEntre(d.fecha, hoy) < 30).reduce((t, d) => t + d.volumen, 0)
      ),
      pesoCorporal: typeof ultima?.weight === 'number' ? ultima.weight : null,
      grasaCorporal: typeof ultima?.bodyFat === 'number' ? Math.round(ultima.bodyFat * 10) / 10 : null,
    },
    bitacora: bitacoraDe(dias),
    estado: construirEstado(historial, { ahora, plantillas: plantillasDeGrupo(), prs: getPRs() }),
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
      if (e.nombre !== nombre || !(e.peso > 0) || !esSerieValida(e)) continue;
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
 * El historial en texto, una linea por DIA, del mas RECIENTE al mas antiguo:
 *
 *   jue 12 nov · GRUPO 1 - Piernas + Glúteos · Prensa 4x10@180; Extensión 4x10@48
 *   mié 11 nov · cardio
 *
 * Antes iba del mas antiguo al mas reciente y con la fecha ISO pelada: el
 * modelo leia la ultima linea de ARRIBA, decia que la ultima sesion era la del
 * 10 y "el miercoles 12-11" (fue jueves). Ahora la primera linea es la mas
 * nueva, el dia de la semana ya viene escrito y no hay otro formato de fecha.
 * Solo salen series reales: ni las excluidas ni las de plantilla sin hacer.
 */
function bitacoraDe(dias: DiaEntrenado[]): string {
  const lineas: string[] = [];
  for (const d of dias) {
    const cardio = d.cardioDetalle.map((c) => `cardio${c ? ' ' + limpio(c) : ''}`).join(' + ');
    if (d.series.length > 0) {
      const grupos = d.grupos.filter((g) => g !== 'Cardio').map(limpio).filter(Boolean);
      const ejs = d.series.map((e) => `${limpio(e.nombre)} ${e.sets}x${e.reps}@${e.peso}`).join('; ');
      lineas.push(`${d.etiqueta} · ${grupos.join(' + ') || 'sesion'} · ${ejs}${cardio ? ` · ${cardio}` : ''}`);
    } else if (d.cardio) {
      lineas.push(`${d.etiqueta} · ${cardio}`);
    }
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
        historial: historial.slice(-12).map((t) => ({
          autor: t.autor,
          texto: t.texto,
          ...(t.origen ? { origen: t.origen, cifras: t.cifras } : {}),
        })),
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
