import { confirmarDestructivo, preguntar } from '@/ui/feedback';
import type { ExerciseData, Exercise, RPEData, PRData, HistorySession } from '@/types';
import { getTrainingGroup } from '@/data/training-groups';
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
} from '@/state/session';
import { renderExercise, refreshIcons } from '@/ui/components';
import { icon } from '@/utils/icons';
import {
  updateCoachOnSessionLoad,
  updateCoachOnExerciseUpdate,
  updateCoachOnExerciseComplete,
} from '@/features/coach';
import { getPRs } from '@/utils/storage';
import { processCompletedSession } from '@/features/gamification';
import { showSessionSummary } from '@/ui/gamification';

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
  }

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
// RENDERIZAR UI DE WORKOUT
// ==========================================

function renderWorkoutUI(
  groupName: string,
  ejercicios: ExerciseData[],
  obligatoriosCount: number
): void {
  // Mostrar info del entrenamiento
  const trainingInfo = document.getElementById('trainingInfo');
  if (trainingInfo) {
    trainingInfo.classList.remove('hidden');
  }

  const currentTraining = document.getElementById('currentTraining');
  if (currentTraining) {
    currentTraining.textContent = groupName;
  }

  const currentDate = document.getElementById('currentDate');
  if (currentDate) {
    currentDate.textContent = new Date().toLocaleDateString('es-ES');
  }

  // Renderizar ejercicios obligatorios
  const ejerciciosList = document.getElementById('ejerciciosList');
  if (ejerciciosList) {
    let html = '';
    for (let i = 0; i < obligatoriosCount; i++) {
      html += renderExercise(ejercicios[i], i, false);
    }
    ejerciciosList.innerHTML = html;
  }

  // Renderizar ejercicios opcionales
  const opcionalesList = document.getElementById('opcionalesList');
  if (opcionalesList) {
    let html = '';
    if (ejercicios.length > obligatoriosCount) {
      html = `
        <div class="mb-3 flex items-center gap-2">
          ${icon('bookmark', 'md', 'text-status-warning')}
          <span class="text-sm font-semibold text-status-warning">Ejercicios Opcionales</span>
        </div>
      `;
      for (let i = obligatoriosCount; i < ejercicios.length; i++) {
        html += renderExercise(ejercicios[i], i, true);
      }
    }
    opcionalesList.innerHTML = html;
  }

  // Mostrar secciones
  const containers = [
    'ejerciciosContainer',
    'volumeSummary',
    'saveSection',
    'quickStats',
  ];
  containers.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });

  // Actualizar displays
  updateVolumeDisplay();
  updateQuickStats();
  updateSaveButtonState();

  // Refrescar iconos
  refreshIcons();

  // Initialize coach
  updateCoachOnSessionLoad(groupName, ejercicios);
}

// ==========================================
// RENDERIZAR DESDE DRAFT (SESIÓN RESTAURADA)
// ==========================================

export function renderFromDraft(): void {
  // sessionData ya debe estar restaurado por restoreFromDraft
  if (sessionData.ejercicios.length === 0) return;

  // Renderizar UI usando todos los ejercicios como obligatorios
  // (ya que no tenemos la info original del grupo)
  renderWorkoutUI(sessionData.grupo, sessionData.ejercicios, sessionData.ejercicios.length);
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

  // Actualizar estado
  updateExerciseState(index, sets, reps, peso);

  // Actualizar UI de volumen
  const volumenEl = document.getElementById(`volumen-${index}`);
  if (volumenEl) {
    volumenEl.textContent = `${sessionData.ejercicios[index].volumen.toLocaleString()} kg`;
  }

  // Actualizar displays
  updateVolumeDisplay();
  updateQuickStats();
  updateSaveButtonState();
  updateUnsavedIndicator();

  // Update coach with exercise data
  const ejercicio = sessionData.ejercicios[index];
  if (ejercicio && ejercicio.peso > 0) {
    updateCoachOnExerciseUpdate(ejercicio, index, sessionData.ejercicios);
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
    input.classList.add('animate-shake');
    setTimeout(() => input.classList.remove('animate-shake'), 300);
  }
  return true;
}

// ==========================================
// TOGGLE COMPLETADO
// ==========================================

export function toggleCompletado(index: number): void {
  const button = document.getElementById(`completado-${index}`) as HTMLButtonElement;
  const nombreEl = document.getElementById(`nombre-${index}`) as HTMLElement;

  if (!button) return;

  // Get current state and toggle it
  const currentState = sessionData.ejercicios[index]?.completado || false;
  const newState = !currentState;

  // Update state
  toggleExerciseCompleted(index, newState);

  // Update button visual
  const checkIcon = button.querySelector('i');

  if (newState) {
    // Completed state - green filled circle with white check
    button.classList.remove('bg-transparent', 'border-slate-500', 'hover:border-emerald-400', 'scale-90');
    button.classList.add('bg-emerald-500', 'border-emerald-500', 'scale-100');
    if (checkIcon) {
      checkIcon.classList.remove('text-slate-600');
      checkIcon.classList.add('text-white');
    }
    // Exercise name - green with strikethrough
    if (nombreEl) {
      nombreEl.classList.remove('text-white');
      nombreEl.classList.add('text-emerald-400', 'line-through', 'decoration-emerald-400', 'decoration-2');
    }
  } else {
    // Uncompleted state - transparent circle with gray check
    button.classList.remove('bg-emerald-500', 'border-emerald-500', 'scale-100');
    button.classList.add('bg-transparent', 'border-slate-500', 'hover:border-emerald-400', 'scale-90');
    if (checkIcon) {
      checkIcon.classList.remove('text-white');
      checkIcon.classList.add('text-slate-600');
    }
    // Exercise name - white without strikethrough
    if (nombreEl) {
      nombreEl.classList.remove('text-emerald-400', 'line-through', 'decoration-emerald-400', 'decoration-2');
      nombreEl.classList.add('text-white');
    }
  }

  updateQuickStats();
  updateSaveButtonState();

  // Update coach on completion
  if (newState) {
    const ejercicio = sessionData.ejercicios[index];
    const completedCount = sessionData.ejercicios.filter(e => e.completado).length;
    const totalCount = sessionData.ejercicios.length;
    updateCoachOnExerciseComplete(ejercicio, completedCount, totalCount);
  }
}

// ==========================================
// ACTUALIZAR DISPLAYS
// ==========================================

export function updateVolumeDisplay(): void {
  const volumeBars = document.getElementById('volumeBars');
  if (!volumeBars) return;

  const volumenPorGrupo = sessionData.volumenPorGrupo;
  const grupos = Object.keys(volumenPorGrupo);

  if (grupos.length === 0) {
    volumeBars.innerHTML = `
      <p class="text-text-secondary text-center py-4">
        Ingresa datos para ver el resumen de volumen
      </p>
    `;
    return;
  }

  const totalVolumen = sessionData.volumenTotal;

  let html = '';
  grupos.forEach((grupo) => {
    const volumen = volumenPorGrupo[grupo];
    const percentage = totalVolumen > 0 ? (volumen / totalVolumen) * 100 : 0;

    html += `
      <div class="mb-3">
        <div class="flex justify-between text-sm mb-1">
          <span class="text-text-secondary">${grupo}</span>
          <span class="text-accent font-semibold">${volumen.toLocaleString()} kg</span>
        </div>
        <div class="h-2 bg-dark-bg rounded-full overflow-hidden">
          <div
            class="h-full bg-accent rounded-full transition-all duration-300"
            style="width: ${percentage}%"
          ></div>
        </div>
      </div>
    `;
  });

  // Total
  html += `
    <div class="mt-4 pt-3 border-t border-dark-border">
      <div class="flex justify-between items-center">
        <span class="text-text-primary font-semibold">Volumen Total</span>
        <span class="text-xl font-bold text-accent">${sessionData.volumenTotal.toLocaleString()} kg</span>
      </div>
    </div>
  `;

  volumeBars.innerHTML = html;
}

export function updateQuickStats(): void {
  const ejercicios = sessionData.ejercicios;
  const completados = ejercicios.filter((ej) => ej.completado).length;
  const conDatos = ejercicios.filter((ej) => ej.volumen > 0).length;

  // Volumen
  const volumenStat = document.getElementById('statVolumen');
  if (volumenStat) {
    volumenStat.textContent = sessionData.volumenTotal.toLocaleString();
  }

  // Ejercicios
  const ejerciciosStat = document.getElementById('statEjercicios');
  if (ejerciciosStat) {
    ejerciciosStat.textContent = String(conDatos);
  }

  // Completados
  const completadosStat = document.getElementById('statCompletados');
  if (completadosStat) {
    completadosStat.textContent = `${completados}/${ejercicios.length}`;
  }

  // Sets totales
  const setsStat = document.getElementById('statSets');
  if (setsStat) {
    const totalSets = ejercicios.reduce((sum, ej) => sum + ej.sets, 0);
    setsStat.textContent = String(totalSets);
  }
}

export function updateSaveButtonState(): void {
  const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
  if (!saveButton) return;

  const hasData = sessionData.ejercicios.some((ej) => ej.volumen > 0);
  saveButton.disabled = !hasData;

  if (hasData) {
    saveButton.classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
    saveButton.classList.add('opacity-50', 'cursor-not-allowed');
  }
}

let savedIndicatorTimeout: ReturnType<typeof setTimeout> | null = null;

export function updateUnsavedIndicator(): void {
  const indicator = document.getElementById('unsavedIndicator');
  if (!indicator) return;

  // Only show indicator when there are actual pending changes (before auto-save)
  // hasUnsavedChanges is false after draft auto-save, so indicator hides
  if (hasUnsavedChanges) {
    // Clear any pending "saved" timeout
    if (savedIndicatorTimeout) {
      clearTimeout(savedIndicatorTimeout);
      savedIndicatorTimeout = null;
    }
    indicator.textContent = 'Cambios sin guardar';
    indicator.classList.remove('hidden', 'saved');
    indicator.classList.add('animate-slide-down');
  } else {
    indicator.classList.add('hidden');
    indicator.classList.remove('animate-slide-down', 'saved');
  }
}

export function showSavedIndicator(): void {
  const indicator = document.getElementById('unsavedIndicator');
  if (!indicator) return;

  // Clear any pending timeout
  if (savedIndicatorTimeout) {
    clearTimeout(savedIndicatorTimeout);
  }

  // Show green "saved" indicator
  indicator.textContent = 'Cambios guardados';
  indicator.classList.remove('hidden');
  indicator.classList.add('saved', 'animate-slide-down');

  // Hide after 3 seconds
  savedIndicatorTimeout = setTimeout(() => {
    indicator.classList.add('hidden');
    indicator.classList.remove('animate-slide-down', 'saved');
    savedIndicatorTimeout = null;
  }, 3000);
}

// ==========================================
// GUARDAR SESIÓN
// ==========================================

export function saveWorkout(): void {
  const result = saveCurrentSession();

  const saveMessage = document.getElementById('saveMessage');
  if (saveMessage) {
    saveMessage.textContent =
      result === 'updated'
        ? 'Entrenamiento actualizado correctamente'
        : 'Entrenamiento guardado correctamente';
    saveMessage.classList.remove('hidden');

    setTimeout(() => {
      saveMessage.classList.add('hidden');
    }, 3000);
  }

  updateUnsavedIndicator();
  updateSaveButtonState();
}

// ==========================================
// RPE STATE
// ==========================================

let selectedRPE: number | null = null;
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
  8: 'Muy difícil',
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
    pendingSaveBeforeRPE = true;
  }

  // Show RPE modal
  showRPEModal();
}

function showRPEModal(): void {
  const modal = document.getElementById('rpeModal');
  if (modal) {
    // Reset state
    selectedRPE = null;
    updateRPEDisplay();
    resetRPEButtons();

    // Show modal
    modal.classList.add('active');

    // Refresh icons
    import('@/utils/icons').then(({ refreshIcons }) => refreshIcons());
  }
}

function closeRPEModal(): void {
  const modal = document.getElementById('rpeModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function resetRPEButtons(): void {
  const buttons = document.querySelectorAll('.rpe-btn');
  buttons.forEach((btn) => {
    btn.classList.remove('ring-2', 'ring-white', 'scale-110');
  });

  const confirmBtn = document.getElementById('confirmRPEBtn') as HTMLButtonElement;
  if (confirmBtn) {
    confirmBtn.disabled = true;
  }
}

function updateRPEDisplay(): void {
  const valueEl = document.getElementById('rpeValue');
  const labelEl = document.getElementById('rpeLabel');

  if (valueEl && labelEl) {
    if (selectedRPE !== null) {
      valueEl.textContent = String(selectedRPE);
      labelEl.textContent = RPE_LABELS[selectedRPE] || '';

      // Update color based on RPE
      valueEl.className = 'text-4xl font-bold mb-1 ';
      if (selectedRPE <= 3) {
        valueEl.classList.add('text-emerald-400');
      } else if (selectedRPE <= 5) {
        valueEl.classList.add('text-yellow-400');
      } else if (selectedRPE <= 8) {
        valueEl.classList.add('text-orange-400');
      } else {
        valueEl.classList.add('text-red-400');
      }
    } else {
      valueEl.textContent = '-';
      valueEl.className = 'text-4xl font-bold text-white mb-1';
      labelEl.textContent = 'Selecciona un nivel';
    }
  }
}

export function selectRPE(value: number): void {
  selectedRPE = value;

  // Update button styles
  const buttons = document.querySelectorAll('.rpe-btn');
  buttons.forEach((btn) => {
    const btnValue = parseInt(btn.getAttribute('data-rpe') || '0');
    if (btnValue === value) {
      btn.classList.add('ring-2', 'ring-white', 'scale-110');
    } else {
      btn.classList.remove('ring-2', 'ring-white', 'scale-110');
    }
  });

  // Enable confirm button
  const confirmBtn = document.getElementById('confirmRPEBtn') as HTMLButtonElement;
  if (confirmBtn) {
    confirmBtn.disabled = false;
  }

  // Update display
  updateRPEDisplay();
}

export async function confirmRPE(): Promise<void> {
  if (selectedRPE === null) return;

  const rpeData: RPEData = {
    value: selectedRPE,
    label: RPE_LABELS[selectedRPE] || '',
  };

  // Save session with RPE if there are pending changes
  if (pendingSaveBeforeRPE) {
    saveCurrentSession(rpeData);
  }

  // Process gamification if session has data (always process even if already saved)
  if (hasSessionData) {
    await processAndShowGamification(rpeData);
  }

  // Close modal and finish
  closeRPEModal();
  pendingSaveBeforeRPE = false;
  hasSessionData = false;
  selectedRPE = null;
  endSession();
  window.location.reload();
}

export async function skipRPE(): Promise<void> {
  // Save session without RPE if there are pending changes
  if (pendingSaveBeforeRPE) {
    saveCurrentSession();
  }

  // Process gamification if session has data (always process even if already saved)
  if (hasSessionData) {
    await processAndShowGamification();
  }

  // Close modal and finish
  closeRPEModal();
  pendingSaveBeforeRPE = false;
  hasSessionData = false;
  selectedRPE = null;
  endSession();
  window.location.reload();
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

    // Show XP summary popup and wait for user to close it
    await showSessionSummary(summary);
  } catch (error) {
    console.error('Error processing gamification:', error);
    // Continue even if gamification fails
  }
}

// Register callback to update indicator when draft is auto-saved
setOnDraftSavedCallback(() => {
  showSavedIndicator();
});
