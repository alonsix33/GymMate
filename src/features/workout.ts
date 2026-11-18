import { confirmarDestructivo, preguntar, mostrarToast } from '@/ui/feedback';
import { cifra } from '@/utils/formato';
import type { ExerciseData, Exercise, RPEData, PRData, HistorySession } from '@/types';
import { getTrainingGroup, getTrainingGroupPorNombre } from '@/data/training-groups';
import {
  sessionData,
  setSessionGroup,
  setSessionExercises,
  updateExercise as updateExerciseState,
  toggleExerciseCompleted,
  saveCurrentSession,
  endSession,
  hasUnsavedData,
  hasUnsavedChanges,
  setOnDraftSavedCallback,
  resetSession,
} from '@/state/session';
import {
  ultimaVezDe,
  renderSesion,
  fijarObligatorios,
  activarOpcional,
  reiniciarOpcionales,
  segundosDeSesion,
  refrescarIntensidad,
  reloj,
} from '@/ui/workout-view';
import {
  mostrarGuiaEjercicio,
  preguntarRPEDeSesion,
  mostrarResumenXP,
} from '@/ui/session-screens';
import {
  updateCoachOnSessionLoad,
  updateCoachOnExerciseUpdate,
  updateCoachOnExerciseComplete,
} from '@/features/coach';
import { getPRs, getHistory, getDraft } from '@/utils/storage';
import { setExerciseRPE, sessionId, registrarPRConfirmado } from '@/state/session';
import { pesoSospechoso } from '@/features/coach-estado';
import { processCompletedSession } from '@/features/gamification';

// ==========================================
// CARGAR GRUPO DE ENTRENAMIENTO
// ==========================================

/** Devuelve true si la rutina llego a cargarse. Los llamantes NO deben navegar
 *  al tab de entrenamiento si devuelve false: el usuario pidio quedarse. */
export async function loadTrainingGroup(grupoId: string): Promise<boolean> {
  const grupo = getTrainingGroup(grupoId);
  if (!grupo) {
    console.error(`Training group not found: ${grupoId}`);
    return false;
  }

  // Confirmar cambio si hay datos sin guardar
  if (hasUnsavedData()) {
    // Destructivo de verdad: solo hay UN slot de borrador, y el primer
    // autoguardado de la rutina nueva pisa el de la actual. Lo registrado
    // aqui no queda en ninguna parte.
    const cambiar = await confirmarDestructivo({
      titulo: '¿Cambiar de rutina?',
      cuerpo: `Lo registrado en ${sessionData.grupo || 'esta rutina'} se pierde: solo se guarda un borrador a la vez.`,
      cancelar: 'Seguir en esta',
      confirmar: 'Cambiar',
    });
    if (!cambiar) return false;
  } else {
    // Tras reiniciar la app `hasUnsavedData()` mira solo la memoria y es
    // false, pero el borrador SIGUE en el almacenamiento y el primer
    // autoguardado de esta rutina lo pisaria (solo hay un slot).
    const borrador = getDraft();
    if (borrador && (borrador.volumenTotal ?? 0) > 0) {
      const cuantos = borrador.ejercicios.filter((e) => e.volumen > 0).length;
      const empezar = await confirmarDestructivo({
        titulo: '¿Empezar otra rutina?',
        cuerpo:
          `Tienes ${borrador.grupo || 'un entrenamiento'} sin terminar (${cuantos} ` +
          `${cuantos === 1 ? 'ejercicio' : 'ejercicios'} con series). ` +
          'Si empiezas otra, se pierde: solo se guarda un borrador a la vez.',
        cancelar: 'Volver',
        confirmar: 'Empezar otra',
      });
      if (!empezar) return false;
    }
  }

  // Una rutina nueva es una sesion NUEVA. `sessionId`, `sessionSaved` y
  // `lastSavedData` solo se reiniciaban al terminar: guardar la rutina A,
  // volver al inicio y elegir la B reutilizaba el id de A, y al guardar B
  // `addToHistory` sustituia la sesion A por la B (una sola sesion en el
  // historial, y la otra perdida sin aviso).
  resetSession();

  // Establecer grupo en sesión
  setSessionGroup(grupo.nombre);

  // Crear ejercicios con datos iniciales
  const ejercicios: ExerciseData[] = [];

  grupo.ejercicios.forEach((ej: Exercise) => {
    ejercicios.push({
      ...ej,
      sets: 0,
      reps: 0,
      peso: 0,
      volumen: 0,
      completado: false,
    });
  });

  grupo.opcionales.forEach((ej: Exercise) => {
    ejercicios.push({
      ...ej,
      sets: 0,
      reps: 0,
      peso: 0,
      volumen: 0,
      completado: false,
    });
  });

  setSessionExercises(ejercicios);

  // Capture current PRs for comparison at session end
  captureSessionStartPRs();

  // Renderizar UI
  renderWorkoutUI(grupo.nombre, ejercicios, grupo.ejercicios.length);
  return true;
}

// ==========================================
// PINTAR W-01
// ==========================================

/** El cronometro corre aparte: repintar la pantalla entera cada segundo le
 *  quitaria el foco al usuario a mitad de escribir un peso. */
let latido: ReturnType<typeof setInterval> | null = null;

function contenedorSesion(): HTMLElement | null {
  return document.getElementById('fierroWorkout');
}

function refrescarCrono(): void {
  const el = document.getElementById('fierroCrono');
  if (!el) return;
  el.textContent = reloj(segundosDeSesion());
}

function arrancarCrono(): void {
  if (latido) clearInterval(latido);
  latido = setInterval(refrescarCrono, 1000);
}

export function pararCrono(): void {
  if (latido) clearInterval(latido);
  latido = null;
}

/** Repinta W-01 entera. Solo para cambios estructurales. */
export function pintarSesion(): void {
  const contenedor = contenedorSesion();
  if (!contenedor) return;
  renderSesion(contenedor);
  if (sessionData.ejercicios.length > 0) arrancarCrono();
  else pararCrono();
  actualizarAutosave();
  // El hueco de DESCANSO se reimprime vacio en cada repintado; si hay un
  // descanso corriendo hay que volver a dibujarlo, o el reloj sigue sonando
  // sin nada en pantalla.
  void import('@/features/timer').then(({ repintarDescanso }) => repintarDescanso());
}

function renderWorkoutUI(
  _groupName: string,
  _ejercicios: ExerciseData[],
  obligatoriosCount: number
): void {
  fijarObligatorios(obligatoriosCount);
  reiniciarOpcionales();
  pintarSesion();
  updateCoachOnSessionLoad(sessionData.grupo, sessionData.ejercicios);
}

// ==========================================
// RENDERIZAR DESDE DRAFT (SESIÓN RESTAURADA)
// ==========================================

export function renderFromDraft(): void {
  if (sessionData.ejercicios.length === 0) return;
  // El borrador guarda la lista ya fusionada y no marca cuales eran
  // opcionales. Se recupera del grupo original por su NOMBRE, que es lo unico
  // que el borrador conserva: buscandolo por id la busqueda fallaba siempre y
  // los opcionales aparecian como obligatorios al reanudar.
  const grupo = getTrainingGroupPorNombre(sessionData.grupo);
  fijarObligatorios(grupo ? grupo.ejercicios.length : sessionData.ejercicios.length);
  reiniciarOpcionales();
  // Los opcionales que el borrador YA trae con datos siguen en juego.
  sessionData.ejercicios.forEach((ejercicio, i) => {
    if (ejercicio.volumen > 0 || ejercicio.completado) activarOpcional(i);
  });
  // Sin esto, `sessionStartPRs` queda vacio y TODO record historico cuenta
  // como PR nuevo: reanudar un borrador regalaba cientos de XP falsos.
  captureSessionStartPRs();
  pintarSesion();
  updateCoachOnSessionLoad(sessionData.grupo, sessionData.ejercicios);
}

// ==========================================
// ACTUALIZAR EJERCICIO
// ==========================================

export function updateEjercicio(index: number): void {
  const setsInput = document.getElementById(`sets-${index}`) as HTMLInputElement;
  const repsInput = document.getElementById(`reps-${index}`) as HTMLInputElement;
  const pesoInput = document.getElementById(`peso-${index}`) as HTMLInputElement;

  if (!setsInput || !repsInput || !pesoInput) return;

  // Validar entrada decimal (bloquear comas)
  if (!validateDecimalInput(pesoInput)) return;

  const sets = parseFloat(setsInput.value) || 0;
  const reps = parseFloat(repsInput.value) || 0;
  const peso = parseFloat(pesoInput.value) || 0;

  updateExerciseState(index, sets, reps, peso);

  // Parcheo quirurgico: el usuario esta escribiendo dentro de esta card.
  const volumenEl = document.getElementById(`volumen-${index}`);
  const ejercicio = sessionData.ejercicios[index];
  if (volumenEl && ejercicio) {
    volumenEl.textContent = ejercicio.volumen > 0 ? `${cifra(ejercicio.volumen)} kg` : '—';
  }
  if (ejercicio) refrescarIntensidad(index, ejercicio);
  // El ancho minimo del campo sigue al numero que tiene dentro.
  for (const input of [setsInput, repsInput, pesoInput]) {
    input.style.minWidth = `${Math.max(1, input.value.length)}ch`;
  }

  updateVolumeDisplay();
  updateQuickStats();
  updateSaveButtonState();
  updateUnsavedIndicator();

  if (ejercicio && ejercicio.peso > 0) {
    // El pico de ANTES de la sesion: el estado ya subio el PR con lo que se
    // acaba de teclear.
    updateCoachOnExerciseUpdate(
      ejercicio,
      index,
      sessionData.ejercicios,
      sessionStartPRs[ejercicio.nombre]?.peso ?? null
    );
  }
}

// ==========================================
// HELPERS DE INPUT
// ==========================================

export function incrementInput(inputId: string): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (input) {
    input.value = String((parseFloat(input.value) || 0) + 1);
    input.dispatchEvent(new Event('change'));
  }
}

export function decrementInput(inputId: string): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (input) {
    const newValue = Math.max(0, (parseFloat(input.value) || 0) - 1);
    input.value = String(newValue);
    input.dispatchEvent(new Event('change'));
  }
}

function validateDecimalInput(input: HTMLInputElement): boolean {
  if (input.value.includes(',')) {
    input.value = input.value.replace(',', '.');
  }
  return true;
}

// ==========================================
// TOGGLE COMPLETADO
// ==========================================

/**
 * Lo que se hizo la ultima vez en este ejercicio, o null si nunca.
 *
 * Es una SUGERENCIA derivada del historial: no se guarda en la sesion. Se ve
 * atenuada en cada campo y solo se vuelve dato cuando el usuario la acepta (✓)
 * o empieza a ajustarla (+/−). Precargarla como dato habria guardado como
 * "hechos" ejercicios que el usuario no toco, que es el defecto que ya se
 * corrigio en el historial.
 */
export function sugeridoDe(index: number): { sets: number; reps: number; peso: number } | null {
  const ejercicio = sessionData.ejercicios[index];
  if (!ejercicio) return null;
  return ultimaVezDe(ejercicio.nombre, getHistory());
}

/** Paso del peso: 2.5 kg en barra y maquina; 1 kg en mancuerna, donde los
 *  discos son de 6, 7, 10, 12... (Elevacion Lateral 6 kg, Frontal 7 kg). */
export function pasoDePeso(index: number): number {
  return sessionData.ejercicios[index]?.esMancuerna ? 1 : 2.5;
}

/**
 * Rellena con lo de la ultima vez los campos que estan VACIOS (nunca pisa lo
 * que el usuario ya puso) y lo registra. Devuelve true si cambio algo.
 */
export function aplicarSugerido(index: number, soloSiIntacto = false): boolean {
  const sug = sugeridoDe(index);
  if (!sug) return false;
  // Para los botones +/−: solo si el ejercicio esta INTACTO. Si el usuario ya
  // puso algo (o bajo las reps hasta 0 a proposito), un 0 es su decision y no
  // se vuelve a rellenar.
  if (soloSiIntacto) {
    const tocado = (['sets', 'reps', 'peso'] as const).some((c) => {
      const el = document.getElementById(`${c}-${index}`) as HTMLInputElement | null;
      return !!el && parseFloat(el.value) > 0;
    });
    if (tocado) return false;
  }
  let cambio = false;
  for (const campo of ['sets', 'reps', 'peso'] as const) {
    const input = document.getElementById(`${campo}-${index}`) as HTMLInputElement | null;
    if (input && !(parseFloat(input.value) > 0) && sug[campo] > 0) {
      input.value = String(sug[campo]);
      cambio = true;
    }
  }
  if (cambio) updateEjercicio(index);
  return cambio;
}

/**
 * Un toque en + o − de un campo.
 *
 * El primer toque sobre un ejercicio vacio parte de lo de la ultima vez (en los
 * tres campos). Rellenar repinta la tarjeta, asi que el <input> se busca
 * DESPUES: el de antes ya no esta en el documento y el toque se perdia (el
 * primer "+" solo rellenaba: 55 → 55 → 57.5).
 */
export function ajustarCampo(index: number, campo: 'sets' | 'reps' | 'peso', sentido: 'mas' | 'menos'): void {
  aplicarSugerido(index, true);
  const input = document.getElementById(`${campo}-${index}`) as HTMLInputElement | null;
  if (!input) return;
  const paso = campo === 'peso' ? pasoDePeso(index) : 1;
  const actual = parseFloat(input.value) || 0;
  const siguiente = sentido === 'mas' ? actual + paso : actual - paso;
  // Redondeo a 2 decimales: 57.5 - 2.5 no debe dejar 54.99999.
  input.value = String(Math.max(0, Math.round(siguiente * 100) / 100));
  updateEjercicio(index);
}

export function toggleCompletado(index: number): void {
  const ejercicio = sessionData.ejercicios[index];
  if (!ejercicio) return;

  // ✓ sobre un ejercicio vacio = "lo mismo que la ultima vez" (un solo toque).
  if (!ejercicio.completado && (!ejercicio.sets || !ejercicio.reps)) aplicarSugerido(index);

  const nuevoEstado = !ejercicio.completado;
  // Marcar ✓ sin datos dejaba la fila en "0×0 · 0 kg · 0 kg" y sumaba en
  // COMPLETADOS: un ejercicio que no se hizo contado como hecho. El peso SI
  // puede ser 0 (peso corporal); sets y reps no.
  if (nuevoEstado && (!ejercicio.sets || !ejercicio.reps)) {
    mostrarToast({
      tipo: 'aviso',
      titulo: 'Faltan sets y reps',
      detalle: `Registra las series de ${ejercicio.nombre} antes de marcarlo.`,
    });
    return;
  }
  toggleExerciseCompleted(index, nuevoEstado);
  // Al desmarcar, el RPE que se contesto deja de tener sujeto.
  if (!nuevoEstado && ejercicio.rpe !== undefined) setExerciseRPE(index, null);

  // La card cambia de forma (activa <-> completada con su fila de RPE):
  // esto si es un cambio estructural.
  pintarSesion();

  if (nuevoEstado) {
    const completados = sessionData.ejercicios.filter((e) => e.completado).length;
    updateCoachOnExerciseComplete(ejercicio, completados, sessionData.ejercicios.length);
  }
}

/** RPE por ejercicio (README 3). `null` = omitir. */
export function responderRPE(index: number, valor: number | null): void {
  setExerciseRPE(index, valor);
  pintarSesion();
}

/** Vuelve a abrir la fila de chips de un ejercicio ya contestado. */
export function reabrirRPE(index: number): void {
  setExerciseRPE(index, null);
  pintarSesion();
}

/** Saca un opcional de su lista y lo pone en juego con sus steppers. */
export function activarEjercicioOpcional(index: number): void {
  activarOpcional(index);
  pintarSesion();
}

export function abrirGuia(index: number): void {
  const ejercicio = sessionData.ejercicios[index];
  if (ejercicio) mostrarGuiaEjercicio(ejercicio.nombre);
}

// ==========================================
// ACTUALIZAR DISPLAYS
// ==========================================

/**
 * Volumen por musculo. Se parchean los anchos y las cifras en vez de repintar,
 * para no tocar la card en la que el usuario esta escribiendo. Si el conjunto
 * de musculos cambia (el primer set de un grupo nuevo), hay que repintar: eso
 * si es estructural.
 */
export function updateVolumeDisplay(): void {
  const bloque = document.querySelector('.f-volumen');
  const filas = Object.entries(sessionData.volumenPorGrupo ?? {})
    .filter(([, kg]) => kg > 0)
    .sort((a, b) => b[1] - a[1]);

  const pintadas = bloque ? bloque.querySelectorAll('.f-volumen__fila').length : 0;
  if (filas.length !== pintadas) {
    pintarSesion();
    return;
  }
  if (!bloque || filas.length === 0) return;

  // Parte del TOTAL, igual que al pintar: si aqui se dividiera por el mayor,
  // el parche y el render inicial dibujarian barras distintas.
  const total = filas.reduce((t, [, kg]) => t + kg, 0);
  const nombres = bloque.querySelectorAll<HTMLElement>('.f-volumen__musculo');
  const cifras = bloque.querySelectorAll<HTMLElement>('.f-volumen__kg');
  const rellenos = bloque.querySelectorAll<HTMLElement>('.f-volumen__relleno');
  filas.forEach(([musculo, kg], i) => {
    if (nombres[i]) nombres[i].textContent = musculo;
    if (cifras[i]) cifras[i].textContent = `${cifra(kg)} kg`;
    if (rellenos[i]) {
      rellenos[i].style.width = `${Math.floor((kg / total) * 100)}%`;
      rellenos[i].classList.toggle('f-volumen__relleno--mayor', i === 0);
    }
  });
}

export function updateQuickStats(): void {
  const ejercicios = sessionData.ejercicios;
  const total = document.getElementById('fierroVolumenTotal');
  if (total) {
    total.innerHTML = `${cifra(sessionData.volumenTotal)} <span class="f-metrica__unidad">kg</span>`;
  }
  const metricas = document.querySelectorAll<HTMLElement>('.f-sesion__metricas .f-metrica__cifra');
  // [0] es VOLUMEN, ya parcheado arriba.
  if (metricas[1]) {
    const completados = ejercicios.filter((ej) => ej.completado).length;
    metricas[1].innerHTML = `${completados}<span class="f-metrica__total">/${ejercicios.length}</span>`;
  }
  if (metricas[2]) {
    metricas[2].textContent = String(ejercicios.reduce((suma, ej) => suma + (ej.sets || 0), 0));
  }
}

export function updateSaveButtonState(): void {
  const boton = document.querySelector<HTMLButtonElement>('[data-sesion="guardar"]');
  if (!boton) return;
  boton.disabled = !sessionData.ejercicios.some((ej) => ej.volumen > 0);
}

export function updateUnsavedIndicator(): void {
  const indicator = document.getElementById('unsavedIndicator');
  if (!indicator) return;

  if (hasUnsavedChanges) {
    indicator.textContent = 'Cambios sin guardar';
    indicator.classList.remove('hidden', 'saved');
  } else {
    indicator.classList.add('hidden');
    indicator.classList.remove('saved');
  }
}

/** "CAMBIOS GUARDADOS · HH:MM" — el autosave visible del mockup. */
let horaDelAutosave: string | null = null;

function actualizarAutosave(): void {
  const el = document.getElementById('fierroAutosave');
  if (!el) return;
  el.textContent = horaDelAutosave ? `CAMBIOS GUARDADOS · ${horaDelAutosave}` : '';
}

export function showSavedIndicator(): void {
  const ahora = new Date();
  horaDelAutosave = `${String(ahora.getHours()).padStart(2, '0')}:${String(
    ahora.getMinutes()
  ).padStart(2, '0')}`;
  actualizarAutosave();
  updateUnsavedIndicator();
}

// ==========================================
// GUARDAR SESIÓN
// ==========================================

/**
 * Un peso mayor a 3 veces el mejor anterior pide confirmacion ANTES de
 * guardarse. Devuelve false si el usuario prefiere corregirlo: no se guarda
 * nada. El Hip Thrust de 450 kg entro a la bitacora sin que nadie preguntara.
 */
async function confirmarPesosSospechosos(): Promise<boolean> {
  // Sin la propia sesion: si ya se guardo antes, su version anterior no es "el
  // mejor anterior" contra el que comparar.
  const previo = getHistory().filter((s) => !sessionId || s.sessionId !== sessionId);
  const raros = sessionData.ejercicios
    .filter((e) => e.volumen > 0)
    .map((e) => ({ e, r: pesoSospechoso(e.nombre, e.peso, previo) }))
    .filter(({ r }) => r.sospechoso);
  if (raros.length === 0) return true;
  const respuesta = await preguntar({
    titulo: '¿Este peso está bien?',
    cuerpo:
      raros
        .map(({ e, r }) => `${e.nombre}: ${cifra(e.peso)} kg, y tu mejor marca es ${cifra(r.mejorAnterior)} kg.`)
        .join('\n') + '\n\nSi es un error de tecleo, corrígelo antes de guardar.',
    cancelar: 'Corregir',
    confirmar: 'Sí, es correcto',
  });
  if (respuesta !== 'confirmar') return false;
  raros.forEach(({ e }) => registrarPRConfirmado(e));
  return true;
}

export async function saveWorkout(): Promise<void> {
  if (!(await confirmarPesosSospechosos())) return;
  const result = saveCurrentSession();
  mostrarToast({
    tipo: 'exito',
    titulo: result === 'updated' ? 'Entrenamiento actualizado' : 'Entrenamiento guardado',
  });
  showSavedIndicator();
  updateSaveButtonState();
}

// ==========================================
// RPE STATE
// ==========================================

/** Punto de partida del slider: el centro de la escala 1-10. */
const RPE_INICIAL = 5;
let pendingSaveBeforeRPE = false;
let hasSessionData = false; // Track if session has data for gamification

// Track PRs at session start to detect new PRs
let sessionStartPRs: Record<string, PRData> = {};

/**
 * Capture PRs at the start of a session for comparison later
 */
export function captureSessionStartPRs(): void {
  sessionStartPRs = JSON.parse(JSON.stringify(getPRs()));
}

/**
 * Get PRs that were achieved during this session
 */
function getNewPRsInSession(): Array<{ exercise: string; oldWeight: number; newWeight: number }> {
  const currentPRs = getPRs();
  const newPRs: Array<{ exercise: string; oldWeight: number; newWeight: number }> = [];

  for (const [exercise, prData] of Object.entries(currentPRs)) {
    const oldPR = sessionStartPRs[exercise];
    if (!oldPR) {
      // Completely new PR (exercise never had a PR before)
      newPRs.push({ exercise, oldWeight: 0, newWeight: prData.peso });
    } else if (prData.peso > oldPR.peso) {
      // Improved existing PR
      newPRs.push({ exercise, oldWeight: oldPR.peso, newWeight: prData.peso });
    }
  }

  return newPRs;
}

const RPE_LABELS: Record<number, string> = {
  1: 'Muy fácil',
  2: 'Fácil',
  3: 'Fácil',
  4: 'Moderado',
  5: 'Moderado',
  6: 'Algo difícil',
  7: 'Difícil',
  8: 'Muy exigente', // literal del mockup [REF Pantallas:286]
  9: 'Máximo',
  10: 'Máximo absoluto',
};

export async function finishWorkout(): Promise<void> {
  // Check if there's any session data (for gamification)
  hasSessionData = sessionData.volumenTotal > 0;

  // Check if there's data to save
  if (hasUnsavedData()) {
    // Tres salidas, no dos. Un doble tap cae sobre el velo recien aparecido:
    // si eso significara "guardar y terminar", la sesion se cerraria por un
    // dedo nervioso. 'descartado' no hace nada.
    const respuesta = await preguntar({
      titulo: '¿Guardar antes de terminar?',
      cuerpo: 'Si sales sin guardar, lo registrado en esta sesión se pierde.',
      cancelar: 'Guardar',
      confirmar: 'Salir sin guardar',
    });
    if (respuesta === 'descartado') return;
    if (respuesta === 'confirmar') {
      endSession();
      window.location.reload();
      return;
    }
    // "Guardar": el mismo aviso de pesos raros que el boton de guardar.
    if (!(await confirmarPesosSospechosos())) return;
    pendingSaveBeforeRPE = true;
  }

  await preguntarRPEYCerrar();
}

/**
 * W-02 · RPE de la sesion. Hoja FIERRO con el slider de gradiente semantico —
 * el unico slider de RPE de la app.
 */
async function preguntarRPEYCerrar(): Promise<void> {
  const elegido = await preguntarRPEDeSesion({
    inicial: RPE_INICIAL,
    etiqueta: (v) => RPE_LABELS[v] ?? '',
  });
  const rpeData: RPEData | undefined =
    elegido === null ? undefined : { value: elegido, label: RPE_LABELS[elegido] ?? '' };

  if (pendingSaveBeforeRPE) {
    saveCurrentSession(rpeData);
  }
  if (hasSessionData) {
    await processAndShowGamification(rpeData);
  }

  pendingSaveBeforeRPE = false;
  hasSessionData = false;
  pararCrono();
  endSession();
  window.location.reload();
}

/** Compatibilidad: los globales antiguos siguen apuntando al flujo nuevo. */
export async function confirmRPE(): Promise<void> {
  await preguntarRPEYCerrar();
}

export async function skipRPE(): Promise<void> {
  await preguntarRPEYCerrar();
}


/**
 * Process gamification and show XP summary
 */
async function processAndShowGamification(rpe?: RPEData): Promise<void> {
  try {
    // Build session data for gamification
    const session: HistorySession = {
      ...sessionData,
      date: new Date().toISOString(),
      rpe,
    };

    // Get PRs achieved in this session
    const newPRs = getNewPRsInSession();

    // Process gamification
    const summary = processCompletedSession(session, newPRs);

    // W-03: pantalla completa con el desglose real, no un popup generico.
    await mostrarResumenXP(summary, {
      duracion: segundosDeSesion(),
      grupo: sessionData.grupo,
      volumen: sessionData.volumenTotal,
    });
  } catch (error) {
    console.error('Error processing gamification:', error);
    // Continue even if gamification fails
  }
}

// Register callback to update indicator when draft is auto-saved
setOnDraftSavedCallback(() => {
  showSavedIndicator();
});
