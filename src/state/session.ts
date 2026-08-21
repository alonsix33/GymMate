import { claveDia } from '@/utils/heatmap';
import type { SessionData, ExerciseData, CardioState, RPEData } from '@/types';
import { DRAFT_SAVE_DELAY, DRAFT_MAX_AGE } from '@/constants';
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

export function setOnDraftSavedCallback(callback: () => void): void {
  onDraftSavedCallback = callback;
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

  const draftAge = Date.now() - draft.draftTimestamp;
  const isStale = draftAge > DRAFT_MAX_AGE;

  return { hasDraft: true, draft, isStale };
}

export function restoreFromDraft(draft: SessionData): void {
  sessionData = { ...draft };
  hasUnsavedChanges = false;
  sessionSaved = false;
  lastSavedData = null;
  sessionId = null;
}

// ==========================================
// GUARDAR SESIÓN
// ==========================================

export function saveCurrentSession(rpe?: RPEData): 'new' | 'updated' {
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
  addToHistory(sessionCopy);
  saveSession(sessionCopy);

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
