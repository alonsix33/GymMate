import { claveDia } from '@/utils/heatmap';
import { FACTOR_SOSPECHOSO } from '@/features/coach-estado';
import type { SessionData, ExerciseData, CardioState, RPEData } from '@/types';
import { DRAFT_SAVE_DELAY, DRAFT_MAX_AGE } from '@/constants';
import {
  saveDraft,
  clearDraft,
  getDraft,
  addToHistory,
  updatePR,
  getPR,
} from '@/utils/storage';
import { calculateVolume, calculateVolumenPorGrupo } from '@/utils/calculations';

// ==========================================
// ESTADO GLOBAL DE LA SESIÓN
// ==========================================

export let sessionData: SessionData = {
  date: claveDia(new Date()),
  grupo: '',
  ejercicios: [],
  volumenTotal: 0,
  volumenPorGrupo: {},
};

export let currentGroup: string | null = null;
export let hasUnsavedChanges = false;
export let sessionSaved = false;
export let lastSavedData: ExerciseData[] | null = null;
export let sessionId: string | null = null;

let draftSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let onDraftSavedCallback: (() => void) | null = null;
let onDraftFailedCallback: (() => void) | null = null;

export function setOnDraftSavedCallback(callback: () => void): void {
  onDraftSavedCallback = callback;
}

/** Se llama cuando el borrador NO se pudo escribir (almacenamiento lleno). */
export function setOnDraftFailedCallback(callback: () => void): void {
  onDraftFailedCallback = callback;
}

// ==========================================
// FUNCIONES DE ESTADO DE SESIÓN
// ==========================================

export function resetSession(): void {
  sessionData = {
    date: claveDia(new Date()),
    grupo: '',
    ejercicios: [],
    volumenTotal: 0,
    volumenPorGrupo: {},
  };
  currentGroup = null;
  hasUnsavedChanges = false;
  sessionSaved = false;
  lastSavedData = null;
  sessionId = null;
}

export function setSessionGroup(groupName: string): void {
  sessionData.grupo = groupName;
  sessionData.date = claveDia(new Date());
  sessionData.startedAt = new Date().toISOString();
}

/**
 * RPE por ejercicio (README 3): chips 5-9 al marcar ✓, o `null` para omitir.
 * Se guarda en el borrador al instante: es un dato que se pierde si la app se
 * cierra entre series.
 */
export function setExerciseRPE(index: number, valor: number | null): void {
  const ejercicio = sessionData.ejercicios[index];
  if (!ejercicio) return;
  if (valor === null) delete ejercicio.rpe;
  else ejercicio.rpe = valor;
  saveDraftNow();
}

export function setSessionExercises(ejercicios: ExerciseData[]): void {
  sessionData.ejercicios = ejercicios;
  updateSessionVolume();
}

export function updateSessionVolume(): void {
  sessionData.volumenTotal = sessionData.ejercicios.reduce(
    (total, ej) => total + ej.volumen,
    0
  );
  sessionData.volumenPorGrupo = calculateVolumenPorGrupo(sessionData.ejercicios);
}

export function updateExercise(
  index: number,
  sets: number,
  reps: number,
  peso: number
): void {
  const ejercicio = sessionData.ejercicios[index];
  if (!ejercicio) return;

  ejercicio.sets = sets;
  ejercicio.reps = reps;
  ejercicio.peso = peso;
  ejercicio.volumen = calculateVolume(sets, reps, peso, ejercicio.esMancuerna);

  updateSessionVolume();
  markAsChanged();

  // Check for PR
  checkAndUpdatePR(ejercicio);
}

export function toggleExerciseCompleted(index: number, completed: boolean): void {
  const ejercicio = sessionData.ejercicios[index];
  if (!ejercicio) return;

  ejercicio.completado = completed;

  // Guardar draft inmediatamente al marcar checkbox
  saveDraftNow();
}

// ==========================================
// DETECCIÓN DE CAMBIOS
// ==========================================

export function markAsChanged(): void {
  hasUnsavedChanges = true;
  scheduleDraftSave();
}

export function markAsSaved(): void {
  hasUnsavedChanges = false;
  sessionSaved = true;
  lastSavedData = JSON.parse(JSON.stringify(sessionData.ejercicios));

  if (draftSaveTimeout) {
    clearTimeout(draftSaveTimeout);
    draftSaveTimeout = null;
  }
}

export function hasUnsavedData(): boolean {
  // Si no hay ejercicios, no hay datos sin guardar
  if (sessionData.ejercicios.length === 0) {
    return false;
  }

  // Si hay cambios sin guardar
  if (hasUnsavedChanges) {
    return true;
  }

  // Si la sesión nunca ha sido guardada y tiene datos
  if (!sessionSaved && sessionData.volumenTotal > 0) {
    return true;
  }

  // Si hay diferencia entre los datos actuales y los últimos guardados
  if (lastSavedData) {
    const currentData = JSON.stringify(sessionData.ejercicios);
    const savedData = JSON.stringify(lastSavedData);
    return currentData !== savedData;
  }

  return false;
}

export function hasChangesToSave(): boolean {
  if (!sessionSaved) {
    return sessionData.ejercicios.some((ej) => ej.volumen > 0);
  }

  if (!lastSavedData) return false;

  const currentData = JSON.stringify(sessionData.ejercicios);
  const savedData = JSON.stringify(lastSavedData);
  return currentData !== savedData;
}

// ==========================================
// AUTO-GUARDADO (DRAFT)
// ==========================================

export function scheduleDraftSave(): void {
  if (draftSaveTimeout) {
    clearTimeout(draftSaveTimeout);
  }

  draftSaveTimeout = setTimeout(() => {
    saveDraftNow();
  }, DRAFT_SAVE_DELAY);
}

export function saveDraftNow(): void {
  if (sessionData.ejercicios.length > 0) {
    // Con el sessionId: sin el, reanudar el borrador y guardar creaba una
    // sesion nueva al lado de la ya guardada.
    const ok = saveDraft({ ...sessionData, sessionId: sessionId ?? sessionData.sessionId });
    if (!ok) {
      // Sigue habiendo cambios sin guardar, y la pantalla NO puede decir
      // "CAMBIOS GUARDADOS": no lo estan.
      if (onDraftFailedCallback) onDraftFailedCallback();
      return;
    }
    hasUnsavedChanges = false;
    // Notify UI to update indicator
    if (onDraftSavedCallback) {
      onDraftSavedCallback();
    }
  }
}

/**
 * Vuelca el borrador YA, si hay algo que perder. Se llama al ocultar la app:
 * el autoguardado espera 15 s tras cada cambio, y iOS suspende la PWA al
 * bloquear la pantalla, asi que lo tecleado en esos segundos se perdia.
 * Sin datos reales no escribe nada: una plantilla en 0 no es un borrador.
 */
export function guardarBorradorSiHayCambios(): void {
  if (sessionData.ejercicios.length === 0) return;
  if (hasUnsavedChanges || sessionData.volumenTotal > 0) {
    if (draftSaveTimeout) {
      clearTimeout(draftSaveTimeout);
      draftSaveTimeout = null;
    }
    saveDraftNow();
  }
}

export function checkForExistingDraft(): {
  hasDraft: boolean;
  draft: ReturnType<typeof getDraft>;
  isStale: boolean;
} {
  const draft = getDraft();

  if (!draft) {
    return { hasDraft: false, draft: null, isStale: false };
  }

  const draftAge = Date.now() - draft.draftTimestamp;
  const isStale = draftAge > DRAFT_MAX_AGE;

  return { hasDraft: true, draft, isStale };
}

export function restoreFromDraft(draft: SessionData): void {
  sessionData = { ...draft };
  hasUnsavedChanges = false;
  sessionSaved = false;
  lastSavedData = null;
  sessionId = draft.sessionId ?? null;
}

// ==========================================
// GUARDAR SESIÓN
// ==========================================

/**
 * 'error' = NO se pudo escribir en el historial (almacenamiento lleno). En ese
 * caso la sesion NO se da por guardada y el borrador se CONSERVA: es la unica
 * copia que queda.
 */
export function saveCurrentSession(rpe?: RPEData): 'new' | 'updated' | 'error' {
  // Generar sessionId único si no existe
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  const sessionCopy: SessionData & { rpe?: RPEData } = {
    ...JSON.parse(JSON.stringify(sessionData)),
    savedAt: new Date().toISOString(),
    sessionId,
  };

  // Add RPE if provided
  if (rpe) {
    sessionCopy.rpe = rpe;
  }

  // Guardar en history
  const isUpdate =
    sessionSaved && lastSavedData !== null && sessionId !== null;
  if (!addToHistory(sessionCopy)) return 'error';
  // `gymmate_session` duplicaba la sesion entera y NADIE la leia (getSession no
  // tiene llamadores): solo gastaba cuota. Se libera la copia que dejo la
  // version anterior.
  try {
    localStorage.removeItem('gymmate_session');
  } catch {
    // Sin acceso al almacenamiento no hay nada que liberar.
  }

  // Actualizar estado
  markAsSaved();

  // Limpiar draft después de guardar exitosamente
  clearDraft();

  return isUpdate ? 'updated' : 'new';
}

export function endSession(): void {
  clearDraft();
  resetSession();
}

// ==========================================
// PR TRACKING
// ==========================================

function checkAndUpdatePR(ejercicioData: ExerciseData): void {
  if (ejercicioData.volumen === 0) return;

  const currentPR = getPR(ejercicioData.nombre);

  // Un peso de mas de 3 veces el record NO entra como record mientras se
  // teclea: "450" escrito por "45" mas un cero se quedaba de PR para siempre.
  // Si el usuario lo confirma al guardar, `registrarPRConfirmado` lo anota.
  if (currentPR && ejercicioData.peso > currentPR.peso * FACTOR_SOSPECHOSO) return;

  if (!currentPR || ejercicioData.peso > currentPR.peso) {
    updatePR(ejercicioData.nombre, {
      peso: ejercicioData.peso,
      sets: ejercicioData.sets,
      reps: ejercicioData.reps,
      volumen: ejercicioData.volumen,
      date: new Date().toISOString(),
    });
  }
}

/** El record de un peso que el usuario confirmo tras el aviso de "3 veces el
 *  mejor anterior". */
export function registrarPRConfirmado(ejercicioData: ExerciseData): void {
  updatePR(ejercicioData.nombre, {
    peso: ejercicioData.peso,
    sets: ejercicioData.sets,
    reps: ejercicioData.reps,
    volumen: ejercicioData.volumen,
    date: new Date().toISOString(),
  });
}

// ==========================================
// ESTADO DE CARDIO
// ==========================================

export const cardioState: CardioState = {
  mode: null,
  config: {},
  timer: null,
  isPaused: false,
  currentPhase: 'work',
  currentRound: 1,
  currentExerciseIndex: 0,
  timeRemaining: 0,
  totalTimeElapsed: 0,
  workTimeTotal: 0,
  restTimeTotal: 0,
  startTime: null,
};

export function resetCardioState(): void {
  if (cardioState.timer) {
    clearInterval(cardioState.timer);
  }

  cardioState.mode = null;
  cardioState.config = {};
  cardioState.timer = null;
  cardioState.isPaused = false;
  cardioState.currentPhase = 'work';
  cardioState.currentRound = 1;
  cardioState.currentExerciseIndex = 0;
  cardioState.timeRemaining = 0;
  cardioState.totalTimeElapsed = 0;
  cardioState.workTimeTotal = 0;
  cardioState.restTimeTotal = 0;
  cardioState.startTime = null;
}
