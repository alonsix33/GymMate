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
import { getHistory, getPRs } from '@/utils/storage';
import { pesoActual, picoDe, sesionesSinSubir, posicionEnZonas, zonaDe } from '@/utils/zonas';
import { estimateOneRM } from '@/features/gamification';
import { unaRepMaxPromedio } from '@/utils/calculations';
import type { HistorySession } from '@/types';

export interface DatoDeEjercicio {
  ejercicio: string;
  unaRepMax: number;
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
  return {
    ejercicio: nombre,
    // El PROMEDIO de las tres formulas, igual que PR-01 y CA-01. Con Epley a
    // secas, el mismo ejercicio salia 168 kg aqui y 165 alli.
    unaRepMax: Math.round(unaRepMaxPromedio(actual, reps) ?? estimateOneRM(actual, reps)),
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

let adaptador: AdaptadorCoach = new CoachLocal();

export function usarAdaptador(nuevo: AdaptadorCoach): void {
  adaptador = nuevo;
}

export function adaptadorActual(): AdaptadorCoach {
  return adaptador;
}
