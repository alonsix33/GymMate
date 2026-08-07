import type { SessionData, ExerciseData, CardioState, RPEData } from '@/types';
import {
  DRAFT_SAVE_DELAY,
  DRAFT_MAX_AGE,
  PR_CHECK_DEBOUNCE_DELAY,
  MAX_REASONABLE_PESO,
  MAX_REASONABLE_SETS,
  MAX_REASONABLE_REPS,
} from '@/constants';
import {
  saveDraft,
  clearDraft,
  getDraft,
  saveSession,
  addToHistory,
  updatePR,
  getPR,
} from '@/utils/storage';
import { calculateVolume, calculateVolumenPorGrupo } from '@/utils/calculations';

// ==========================================
// ESTADO GLOBAL DE LA SESIÓN
// ==========================================

export let sessionData: SessionData = {
  date: new Date().toISOString().split('T')[0],
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

export function setOnDraftSavedCallback(callback: () => void): void {
  onDraftSavedCallback = callback;
}

// ==========================================
// FUNCIONES DE ESTADO DE SESIÓN
// ==========================================

export function resetSession(): void {
  clearPendingPRChecks();
  sessionData = {
    date: new Date().toISOString().split('T')[0],
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
  sessionData.date = new Date().toISOString().split('T')[0];
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

  // Verificar PR solo cuando el usuario termina de editar esta fila
  // (no en cada onchange individual de sets/reps/peso mientras tabula entre campos)
  schedulePRCheck(index, ejercicio);
}

const prCheckTimeouts: Record<number, ReturnType<typeof setTimeout>> = {};

function schedulePRCheck(index: number, ejercicio: ExerciseData): void {
  if (prCheckTimeouts[index]) {
    clearTimeout(prCheckTimeouts[index]);
  }
  prCheckTimeouts[index] = setTimeout(() => {
    delete prCheckTimeouts[index];
    checkAndUpdatePR(ejercicio);
  }, PR_CHECK_DEBOUNCE_DELAY);
}

function clearPendingPRChecks(): void {
  Object.values(prCheckTimeouts).forEach((timeout) => clearTimeout(timeout));
  for (const key of Object.keys(prCheckTimeouts)) {
    delete prCheckTimeouts[Number(key)];
  }
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
    saveDraft(sessionData);
    hasUnsavedChanges = false;
    // Notify UI to update indicator
    if (onDraftSavedCallback) {
      onDraftSavedCallback();
    }
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

  // Validar forma mínima antes de ofrecerlo como recuperable (CORE-02): un
  // draftTimestamp faltante/corrupto da NaN, que nunca es "> DRAFT_MAX_AGE"
  // (el draft jamás expiraría), y un ejercicios faltante rompe
  // renderFromDraft() con un TypeError al pulsar "Continuar".
  const hasValidShape =
    typeof draft.draftTimestamp === 'number' &&
    Number.isFinite(draft.draftTimestamp) &&
    Array.isArray(draft.ejercicios);

  if (!hasValidShape) {
    clearDraft();
    return { hasDraft: false, draft: null, isStale: false };
  }

  const draftAge = Date.now() - draft.draftTimestamp;
  const isStale = draftAge > DRAFT_MAX_AGE;

  return { hasDraft: true, draft, isStale };
}

export function restoreFromDraft(draft: SessionData): void {
  clearPendingPRChecks();
  sessionData = { ...draft };
  hasUnsavedChanges = false;
  sessionSaved = false;
  lastSavedData = null;
  sessionId = null;
}

// ==========================================
// GUARDAR SESIÓN
// ==========================================

export function saveCurrentSession(rpe?: RPEData): 'new' | 'updated' | 'failed' {
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
  const historySaved = addToHistory(sessionCopy);
  const sessionPersisted = saveSession(sessionCopy);

  if (!historySaved || !sessionPersisted) {
    // El guardado falló (p.ej. localStorage lleno): no marcar como guardado
    // ni borrar el draft, para no perder los datos del usuario.
    return 'failed';
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

  // Validación básica de rango: descarta valores fuera de un rango humano
  // razonable antes de aceptarlos como PR real (evita fat-finger typos)
  if (
    ejercicioData.peso <= 0 ||
    ejercicioData.peso > MAX_REASONABLE_PESO ||
    ejercicioData.sets <= 0 ||
    ejercicioData.sets > MAX_REASONABLE_SETS ||
    ejercicioData.reps <= 0 ||
    ejercicioData.reps > MAX_REASONABLE_REPS
  ) {
    return;
  }

  const currentPR = getPR(ejercicioData.nombre);

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

// ==========================================
// ESTADO DE CARDIO
// ==========================================

export const cardioState: CardioState = {
  mode: null,
  config: {},
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
  cardioState.mode = null;
  cardioState.config = {};
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
