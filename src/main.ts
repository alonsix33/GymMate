import './styles/fonts.css';
import { registrarNavegacionDePerfil } from '@/ui/perfil';
import './styles/tokens.css';
import './styles/main.css';
// FIERRO va DESPUES del CSS legacy: durante la migracion tiene que ganar la
// cascada sin subir especificidad con !important.
import './styles/fierro.css';
import { initializeIcons, refreshIcons } from '@/utils/icons';
import {
  inicializarFeedback,
  mostrarToast,
  mostrarToastDeshacer,
  confirmarAccion,
  confirmarDestructivo,
} from '@/ui/feedback';
import { initializeNavigation, showHome, switchTab, resumeDraft, dismissDraft, renderizarHome } from '@/ui/navigation';
import { initializeModals } from '@/ui/modals';
import {
  initCoachSession,
  updateCoachOnSessionLoad,
  updateCoachOnExerciseUpdate,
  updateCoachOnExerciseComplete,
} from '@/features/coach';
import { mostrarGuiaEjercicio } from '@/ui/session-screens';
import { initializeTimerListeners, openRestTimerModal } from '@/features/timer';
import { initializeProfile, openMeasurementsModal, closeMeasurementsModal, showMeasurementsHistory, closeMeasurementsHistoryModal, deleteMeasurementEntry, updateMeasurementPreview } from '@/features/profile';
import { loadHistory, loadPRs, exportToExcel, deleteHistoryItem, triggerCSVImport } from '@/features/history';
import {
  loadTrainingGroup,
  updateEjercicio,
  incrementInput,
  decrementInput,
  toggleCompletado,
  saveWorkout,
  finishWorkout,
  activarEjercicioOpcional,
  abrirGuia,
  responderRPE,
  reabrirRPE,
  confirmRPE,
  skipRPE,
} from '@/features/workout';
import { initGamification, reinitGamification } from '@/features/gamification';
import { abrirProgreso, cerrarProgreso } from '@/ui/progreso';
import {
  showCardioSelector,
  selectCardioMode,
  showCardioConfig,
  adjustCardioConfig,
  setCardioExercise,
  adjustPyramidLevel,
  startCardioWorkout,
  toggleCardioPause,
  stopCardioWorkout,
  incrementAmrapRound,
} from '@/features/cardio';
import { trainingGroups } from '@/data/training-groups';
import { getAdditionalExercisesByMuscle, getExerciseInfo } from '@/data/exercises';
import {
  saveCustomWorkouts,
  getCustomWorkouts,
  deleteCustomWorkout,
  addCustomWorkout,
  CustomWorkout,
  getCustomExercises,
  addCustomExerciseToStorage,
  deleteCustomExercise,
  CustomExercise
} from '@/utils/storage';
import type { MuscleGroup } from '@/types';

// ==========================================
// WORKOUT BUILDER STATE
// ==========================================

const workoutBuilderState: {
  selectedExercises: Array<{ nombre: string; grupoMuscular: string }>;
} = {
  selectedExercises: [],
};

// ==========================================
// EXPONER FUNCIONES AL WINDOW (para onclick)
// ==========================================

declare global {
  interface Window {
    // Navigation
    showHome: typeof showHome;
    switchTab: typeof switchTab;
    resumeDraft: typeof resumeDraft;
    dismissDraft: typeof dismissDraft;

    // Workout
    loadTrainingGroup: typeof loadTrainingGroup;
    updateEjercicio: typeof updateEjercicio;
    incrementInput: typeof incrementInput;
    decrementInput: typeof decrementInput;
    toggleCompletado: typeof toggleCompletado;
    saveWorkout: typeof saveWorkout;
    finishWorkout: typeof finishWorkout;

    // RPE
    confirmRPE: typeof confirmRPE;
    skipRPE: typeof skipRPE;

    // Modals

    // Timer
    openRestTimerModal: typeof openRestTimerModal;

    // History
    deleteHistoryItem: typeof deleteHistoryItem;
    exportToExcel: typeof exportToExcel;
    importFromCSV: typeof triggerCSVImport;

    // Custom Workouts
    deleteCustomWorkout: typeof handleDeleteCustomWorkout;
    openWorkoutBuilder: typeof openWorkoutBuilder;
    closeWorkoutBuilder: typeof closeWorkoutBuilder;
    toggleExerciseSelection: typeof toggleExerciseSelection;
    saveCustomWorkout: typeof saveCustomWorkout;

    // Custom Exercises
    toggleCustomExerciseForm: typeof toggleCustomExerciseForm;
    addCustomExercise: typeof addCustomExercise;
    removeCustomExercise: typeof removeCustomExercise;

    // Cardio
    showCardioSelector: typeof showCardioSelector;
    selectCardioMode: typeof selectCardioMode;
    showCardioConfig: typeof showCardioConfig;
    adjustCardioConfig: typeof adjustCardioConfig;
    setCardioExercise: typeof setCardioExercise;
    adjustPyramidLevel: typeof adjustPyramidLevel;
    startCardioWorkout: typeof startCardioWorkout;
    toggleCardioPause: typeof toggleCardioPause;
    stopCardioWorkout: typeof stopCardioWorkout;
    incrementAmrapRound: typeof incrementAmrapRound;

    // Body Measurements
    openMeasurementsModal: typeof openMeasurementsModal;
    closeMeasurementsModal: typeof closeMeasurementsModal;
    showMeasurementsHistory: typeof showMeasurementsHistory;
    closeMeasurementsHistoryModal: typeof closeMeasurementsHistoryModal;
    deleteMeasurementEntry: typeof deleteMeasurementEntry;

    // Gamification
    showGamificationModal: typeof abrirProgreso;
    hideGamificationModal: typeof cerrarProgreso;
    recalculateXP: () => void;
  }
}

// ==========================================
// HANDLER PARA ELIMINAR RUTINAS PERSONALIZADAS
// ==========================================

function handleDeleteCustomWorkout(workoutId: string): void {
  // F-01: borrado reversible. La rutina desaparece de la vista al instante y
  // solo se borra de verdad cuando expira la cuenta atras.
  const rutinas = getCustomWorkouts();
  const posicion = rutinas.findIndex((w) => w.id === workoutId);
  if (posicion === -1) return;
  const rutina = rutinas[posicion];
  const restaurar = () => {
    // Vuelve a SU sitio: addCustomWorkout hace push y la rutina reaparecia al
    // final de la lista, que no es deshacer, es mover.
    const actuales = getCustomWorkouts();
    actuales.splice(Math.min(posicion, actuales.length), 0, rutina);
    saveCustomWorkouts(actuales);
    renderizarHome();
  };
  deleteCustomWorkout(workoutId);
  renderizarHome();
  mostrarToastDeshacer({
    titulo: `${rutina.nombre} eliminada`,
    alDeshacer: restaurar,
  });
}

window.showHome = showHome;
window.switchTab = switchTab;
window.resumeDraft = resumeDraft;
window.dismissDraft = dismissDraft;
window.loadTrainingGroup = loadTrainingGroup;
window.updateEjercicio = updateEjercicio;
window.incrementInput = incrementInput;
window.decrementInput = decrementInput;
window.toggleCompletado = toggleCompletado;
window.saveWorkout = saveWorkout;
window.finishWorkout = finishWorkout;
window.confirmRPE = confirmRPE;
window.skipRPE = skipRPE;
window.openRestTimerModal = openRestTimerModal;
window.deleteHistoryItem = deleteHistoryItem;
window.exportToExcel = exportToExcel;
window.importFromCSV = triggerCSVImport;
window.deleteCustomWorkout = handleDeleteCustomWorkout;
window.openWorkoutBuilder = openWorkoutBuilder;
window.closeWorkoutBuilder = closeWorkoutBuilder;
window.toggleExerciseSelection = toggleExerciseSelection;
window.saveCustomWorkout = saveCustomWorkout;
window.toggleCustomExerciseForm = toggleCustomExerciseForm;
window.addCustomExercise = addCustomExercise;
window.removeCustomExercise = removeCustomExercise;
window.showCardioSelector = showCardioSelector;
window.selectCardioMode = selectCardioMode;
window.showCardioConfig = showCardioConfig;
window.adjustCardioConfig = adjustCardioConfig;
window.setCardioExercise = setCardioExercise;
window.adjustPyramidLevel = adjustPyramidLevel;
window.startCardioWorkout = startCardioWorkout;
window.toggleCardioPause = toggleCardioPause;
window.stopCardioWorkout = stopCardioWorkout;
window.incrementAmrapRound = incrementAmrapRound;
window.openMeasurementsModal = openMeasurementsModal;
window.closeMeasurementsModal = closeMeasurementsModal;
window.showMeasurementsHistory = showMeasurementsHistory;
window.closeMeasurementsHistoryModal = closeMeasurementsHistoryModal;
window.deleteMeasurementEntry = deleteMeasurementEntry;
// GM-01 se abre desde PROGRESO en la tab bar. El nombre global se conserva
// porque index.html y navigation.ts lo llaman por ahi.
window.showGamificationModal = abrirProgreso;
window.hideGamificationModal = cerrarProgreso;

// Utility to recalculate all XP from history (for recovery)
window.recalculateXP = (): void => {
  void confirmarAccion({
    titulo: '¿Recalcular el XP?',
    cuerpo: 'Se reconstruye desde tu historial completo. No se pierde nada; la app se recarga al terminar.',
    cancelar: 'Ahora no',
    confirmar: 'Recalcular',
  }).then((recalcular) => {
    if (!recalcular) return;
    reinitGamification();
    mostrarToast({ tipo: 'exito', titulo: 'XP recalculado', detalle: 'Recargando…' });
    window.setTimeout(() => window.location.reload(), 900);
  });
};

// ==========================================
// WORKOUT BUILDER
// ==========================================

function openWorkoutBuilder(): void {
  // Reset state
  workoutBuilderState.selectedExercises = [];

  const modal = document.getElementById('workoutBuilderModal');
  if (!modal) return;

  // Render exercise groups and custom exercises
  renderExerciseGroups();
  renderCustomExercisesList();
  updateSelectedExercisesList();

  // Clear name input
  const nameInput = document.getElementById('customWorkoutName') as HTMLInputElement;
  if (nameInput) nameInput.value = '';

  // Reset custom exercise form
  const customExerciseForm = document.getElementById('customExerciseForm');
  const chevron = document.getElementById('customExerciseChevron');
  const newExerciseName = document.getElementById('newExerciseName') as HTMLInputElement;
  if (customExerciseForm) customExerciseForm.classList.add('hidden');
  if (chevron) chevron.style.transform = 'rotate(0deg)';
  if (newExerciseName) newExerciseName.value = '';

  // Show modal
  modal.classList.add('active');
  refreshIcons();
}

function closeWorkoutBuilder(): void {
  const modal = document.getElementById('workoutBuilderModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function renderExerciseGroups(): void {
  const container = document.getElementById('exerciseGroupsList');
  if (!container) return;

  const groupColors: Record<string, { bg: string; border: string; text: string }> = {
    grupo1: { bg: 'from-blue-500/10 to-blue-600/5', border: 'border-blue-500/30', text: 'text-blue-400' },
    grupo2: { bg: 'from-emerald-500/10 to-emerald-600/5', border: 'border-emerald-500/30', text: 'text-emerald-400' },
    grupo3: { bg: 'from-purple-500/10 to-purple-600/5', border: 'border-purple-500/30', text: 'text-purple-400' },
    grupo4: { bg: 'from-orange-500/10 to-orange-600/5', border: 'border-orange-500/30', text: 'text-orange-400' },
    grupo5: { bg: 'from-pink-500/10 to-pink-600/5', border: 'border-pink-500/30', text: 'text-pink-400' },
  };

  // Muscle group colors for additional exercises
  const muscleColors: Record<string, { bg: string; border: string; text: string }> = {
    'Piernas': { bg: 'from-cyan-500/10 to-cyan-600/5', border: 'border-cyan-500/30', text: 'text-cyan-400' },
    'Glúteos': { bg: 'from-rose-500/10 to-rose-600/5', border: 'border-rose-500/30', text: 'text-rose-400' },
    'Pecho': { bg: 'from-red-500/10 to-red-600/5', border: 'border-red-500/30', text: 'text-red-400' },
    'Espalda': { bg: 'from-amber-500/10 to-amber-600/5', border: 'border-amber-500/30', text: 'text-amber-400' },
    'Hombros': { bg: 'from-violet-500/10 to-violet-600/5', border: 'border-violet-500/30', text: 'text-violet-400' },
    'Bíceps': { bg: 'from-lime-500/10 to-lime-600/5', border: 'border-lime-500/30', text: 'text-lime-400' },
    'Tríceps': { bg: 'from-fuchsia-500/10 to-fuchsia-600/5', border: 'border-fuchsia-500/30', text: 'text-fuchsia-400' },
    'Core': { bg: 'from-teal-500/10 to-teal-600/5', border: 'border-teal-500/30', text: 'text-teal-400' },
  };

  let html = '';

  // Collect existing exercise names from default groups
  const existingExerciseNames: string[] = [];

  Object.entries(trainingGroups).forEach(([groupId, group]) => {
    const colors = groupColors[groupId] || groupColors.grupo1;
    const shortName = group.nombre.split(' - ')[1] || group.nombre;

    html += `
      <div class="bg-gradient-to-br ${colors.bg} border ${colors.border} rounded-xl overflow-hidden">
        <div class="p-3 border-b ${colors.border}">
          <h4 class="font-bold ${colors.text} text-sm">${shortName}</h4>
        </div>
        <div class="p-2 space-y-1">
    `;

    // Add main exercises
    group.ejercicios.forEach((ejercicio) => {
      existingExerciseNames.push(ejercicio.nombre);
      const isSelected = workoutBuilderState.selectedExercises.some(
        (e) => e.nombre === ejercicio.nombre
      );
      html += renderExerciseItem(ejercicio.nombre, ejercicio.grupoMuscular, isSelected);
    });

    // Add optional exercises
    if (group.opcionales) {
      group.opcionales.forEach((ejercicio) => {
        existingExerciseNames.push(ejercicio.nombre);
        const isSelected = workoutBuilderState.selectedExercises.some(
          (e) => e.nombre === ejercicio.nombre
        );
        html += renderExerciseItem(ejercicio.nombre, ejercicio.grupoMuscular, isSelected, true);
      });
    }

    html += '</div></div>';
  });

  // Add additional exercises section
  const additionalByMuscle = getAdditionalExercisesByMuscle(existingExerciseNames);
  const muscleOrder = ['Piernas', 'Glúteos', 'Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Core'];

  if (Object.keys(additionalByMuscle).length > 0) {
    html += `
      <div class="mt-4 pt-4 border-t border-dark-border">
        <p class="text-xs text-text-muted mb-3 flex items-center gap-2">
          <i data-lucide="plus-circle" class="w-4 h-4"></i>
          Más ejercicios disponibles
        </p>
      </div>
    `;

    muscleOrder.forEach(muscle => {
      const exercises = additionalByMuscle[muscle];
      if (!exercises || exercises.length === 0) return;

      const colors = muscleColors[muscle] || muscleColors['Core'];

      html += `
        <div class="bg-gradient-to-br ${colors.bg} border ${colors.border} rounded-xl overflow-hidden">
          <div class="p-3 border-b ${colors.border}">
            <h4 class="font-bold ${colors.text} text-sm">${muscle}</h4>
          </div>
          <div class="p-2 space-y-1">
      `;

      exercises.forEach((ejercicio) => {
        const isSelected = workoutBuilderState.selectedExercises.some(
          (e) => e.nombre === ejercicio.nombre
        );
        html += renderExerciseItem(ejercicio.nombre, ejercicio.grupoMuscular, isSelected);
      });

      html += '</div></div>';
    });
  }

  container.innerHTML = html;
}

function renderExerciseItem(nombre: string, grupoMuscular: string, isSelected: boolean, isOptional: boolean = false): string {
  const bgClass = isSelected
    ? 'bg-accent/20 border-accent/40'
    : 'bg-dark-bg/50 border-transparent hover:border-white/10';
  const checkClass = isSelected ? 'text-accent' : 'text-text-muted';
  const optionalTag = isOptional ? '<span class="text-[10px] text-orange-400 ml-1">(opt)</span>' : '';

  return `
    <button
      onclick="window.toggleExerciseSelection('${nombre}', '${grupoMuscular}')"
      class="w-full flex items-center gap-2 p-2 rounded-lg border ${bgClass} transition-all active:scale-[0.98]"
    >
      <i data-lucide="${isSelected ? 'check-circle' : 'circle'}" class="w-4 h-4 ${checkClass} flex-shrink-0"></i>
      <span class="text-sm text-text-primary text-left flex-1 truncate">${nombre}${optionalTag}</span>
      <span class="text-[10px] text-text-muted flex-shrink-0">${grupoMuscular}</span>
    </button>
  `;
}

function toggleExerciseSelection(nombre: string, grupoMuscular: string): void {
  const existingIndex = workoutBuilderState.selectedExercises.findIndex(
    (e) => e.nombre === nombre
  );

  if (existingIndex >= 0) {
    // Remove from selection
    workoutBuilderState.selectedExercises.splice(existingIndex, 1);
  } else {
    // Add to selection
    workoutBuilderState.selectedExercises.push({ nombre, grupoMuscular });
  }

  // Re-render
  renderExerciseGroups();
  updateSelectedExercisesList();
  suggestWorkoutName();
  refreshIcons();
}

function updateSelectedExercisesList(): void {
  const container = document.getElementById('selectedExercisesList');
  const countSpan = document.getElementById('selectedCount');

  if (!container) return;

  if (countSpan) {
    countSpan.textContent = String(workoutBuilderState.selectedExercises.length);
  }

  if (workoutBuilderState.selectedExercises.length === 0) {
    container.innerHTML = '<p class="text-text-muted text-sm text-center">Selecciona ejercicios de la lista</p>';
    return;
  }

  const html = workoutBuilderState.selectedExercises
    .map(
      (ex, i) => `
      <div class="flex items-center justify-between py-1.5 ${i > 0 ? 'border-t border-dark-border' : ''}">
        <span class="text-sm text-text-primary">${ex.nombre}</span>
        <button
          onclick="window.toggleExerciseSelection('${ex.nombre}', '${ex.grupoMuscular}')"
          class="p-1 text-status-error hover:text-status-error/70"
        >
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      </div>
    `
    )
    .join('');

  container.innerHTML = html;
  refreshIcons();
}

function suggestWorkoutName(): void {
  const nameInput = document.getElementById('customWorkoutName') as HTMLInputElement;
  if (!nameInput || nameInput.value.trim()) return; // Don't overwrite user input

  const muscleGroups = new Set(
    workoutBuilderState.selectedExercises.map((e) => e.grupoMuscular)
  );

  if (muscleGroups.size === 0) return;

  const groupArray = Array.from(muscleGroups);
  let suggestion = '';

  if (groupArray.length === 1) {
    suggestion = `Rutina de ${groupArray[0]}`;
  } else if (groupArray.length === 2) {
    suggestion = `${groupArray[0]} + ${groupArray[1]}`;
  } else {
    suggestion = `${groupArray.slice(0, 2).join(' + ')} y más`;
  }

  nameInput.placeholder = suggestion;
}

function saveCustomWorkout(): void {
  const nameInput = document.getElementById('customWorkoutName') as HTMLInputElement;
  const name = nameInput?.value.trim() || nameInput?.placeholder || 'Mi Rutina';

  if (workoutBuilderState.selectedExercises.length === 0) {
    mostrarToast({
      tipo: 'aviso',
      titulo: 'La rutina está vacía',
      detalle: 'Elige al menos un ejercicio para guardarla.',
    });
    return;
  }

  // Get custom exercises to check for esMancuerna property
  const customExercises = getCustomExercises();

  // Helper to find esMancuerna from various sources
  const getEsMancuerna = (nombre: string): boolean => {
    // 1. Check user's custom exercises
    const customEx = customExercises.find(ce => ce.nombre === nombre);
    if (customEx) return customEx.esMancuerna;

    // 2. Check exercise database
    const dbEx = getExerciseInfo(nombre);
    if (dbEx) return dbEx.esMancuerna;

    // 3. Check default training groups
    for (const group of Object.values(trainingGroups)) {
      const found = [...group.ejercicios, ...group.opcionales].find(e => e.nombre === nombre);
      if (found) return found.esMancuerna;
    }

    return false;
  };

  const workout: CustomWorkout = {
    id: `custom_${Date.now()}`,
    nombre: name,
    ejercicios: workoutBuilderState.selectedExercises.map((ex) => ({
      nombre: ex.nombre,
      esMancuerna: getEsMancuerna(ex.nombre),
      grupoMuscular: ex.grupoMuscular as MuscleGroup,
    })),
    opcionales: [],
    isCustom: true,
    createdAt: new Date().toISOString(),
  };

  addCustomWorkout(workout);
  closeWorkoutBuilder();
  renderizarHome();
  refreshIcons();
}

// ==========================================
// CUSTOM EXERCISES (User-created exercises)
// ==========================================

function toggleCustomExerciseForm(): void {
  const form = document.getElementById('customExerciseForm');
  const chevron = document.getElementById('customExerciseChevron');

  if (form && chevron) {
    const isHidden = form.classList.contains('hidden');
    form.classList.toggle('hidden');
    chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  }
}

function addCustomExercise(): void {
  const nameInput = document.getElementById('newExerciseName') as HTMLInputElement;
  const muscleSelect = document.getElementById('newExerciseMuscle') as HTMLSelectElement;
  const isDumbbellCheckbox = document.getElementById('newExerciseIsDumbbell') as HTMLInputElement;

  const name = nameInput?.value.trim();
  const muscle = muscleSelect?.value;
  const isDumbbell = isDumbbellCheckbox?.checked || false;

  if (!name) {
    nameInput?.focus();
    nameInput?.classList.add('border-red-500');
    setTimeout(() => nameInput?.classList.remove('border-red-500'), 2000);
    return;
  }

  // Check if exercise already exists
  const existingExercises = getCustomExercises();
  if (existingExercises.some(e => e.nombre.toLowerCase() === name.toLowerCase())) {
    mostrarToast({
      tipo: 'aviso',
      titulo: `Ya tienes un ejercicio llamado "${name}"`,
      detalle: 'Usa otro nombre para distinguirlos en el historial.',
    });
    return;
  }

  const exercise: CustomExercise = {
    id: `exercise_${Date.now()}`,
    nombre: name,
    grupoMuscular: muscle,
    esMancuerna: isDumbbell,
    createdAt: new Date().toISOString(),
  };

  addCustomExerciseToStorage(exercise);

  // Clear inputs
  nameInput.value = '';
  isDumbbellCheckbox.checked = false;

  // Auto-add to selected exercises
  workoutBuilderState.selectedExercises.push({
    nombre: exercise.nombre,
    grupoMuscular: exercise.grupoMuscular,
  });

  // Re-render lists
  renderCustomExercisesList();
  updateSelectedExercisesList();
  suggestWorkoutName();
  refreshIcons();
}

async function removeCustomExercise(exerciseId: string, exerciseName: string): Promise<void> {
  const eliminar = await confirmarDestructivo({
    titulo: `¿Eliminar "${exerciseName}"?`,
    cuerpo: 'Sale de tus ejercicios personalizados. Las sesiones ya guardadas con él no cambian.',
    cancelar: 'Conservar',
    confirmar: 'Eliminar',
  });
  if (eliminar) {
    deleteCustomExercise(exerciseId);

    // Also remove from selection if selected
    const idx = workoutBuilderState.selectedExercises.findIndex(
      e => e.nombre === exerciseName
    );
    if (idx >= 0) {
      workoutBuilderState.selectedExercises.splice(idx, 1);
      updateSelectedExercisesList();
    }

    renderCustomExercisesList();
    refreshIcons();
  }
}

function renderCustomExercisesList(): void {
  const section = document.getElementById('customExercisesSection');
  const container = document.getElementById('customExercisesList');
  if (!section || !container) return;

  const customExercises = getCustomExercises();

  if (customExercises.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  const html = customExercises.map(exercise => {
    const isSelected = workoutBuilderState.selectedExercises.some(
      e => e.nombre === exercise.nombre
    );
    const bgClass = isSelected
      ? 'bg-accent/20 border-accent/40'
      : 'bg-dark-bg/50 border-transparent hover:border-white/10';
    const checkClass = isSelected ? 'text-accent' : 'text-text-muted';
    const dumbbellTag = exercise.esMancuerna
      ? '<span class="text-[10px] text-purple-400 ml-1">(manc)</span>'
      : '';

    return `
      <div class="flex items-center gap-1">
        <button
          onclick="window.toggleExerciseSelection('${exercise.nombre}', '${exercise.grupoMuscular}')"
          class="flex-1 flex items-center gap-2 p-2 rounded-lg border ${bgClass} transition-all active:scale-[0.98]"
        >
          <i data-lucide="${isSelected ? 'check-circle' : 'circle'}" class="w-4 h-4 ${checkClass} flex-shrink-0"></i>
          <span class="text-sm text-text-primary text-left flex-1 truncate">${exercise.nombre}${dumbbellTag}</span>
          <span class="text-[10px] text-text-muted flex-shrink-0">${exercise.grupoMuscular}</span>
        </button>
        <button
          onclick="window.removeCustomExercise('${exercise.id}', '${exercise.nombre}')"
          class="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
          title="Eliminar ejercicio"
        >
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// ==========================================
// MANEJO DEL TECLADO VIRTUAL
// ==========================================

/**
 * Con el teclado virtual abierto, la tab bar taparia los campos de sets, reps
 * y peso: se oculta mientras el foco este en un campo numerico.
 *
 * No basta con escuchar `focusout` sobre inputs. Chrome NO desenfoca un
 * elemento que pasa a `opacity:0`, asi que al cerrar un modal con la tecla
 * "Listo" del teclado numerico el evento no llegaba nunca y el usuario se
 * quedaba sin barra inferior hasta tocar la pantalla. Aqui se decide siempre
 * desde el estado real: si el elemento con el foco es un campo numerico
 * VISIBLE, la barra se esconde; en cualquier otro caso, vuelve.
 */
function initializeKeyboardHandler(): void {
  const barra = document.querySelector('.f-tabbar') as HTMLElement | null;
  if (!barra) return;

  const esCampoNumericoVisible = (el: Element | null): boolean => {
    if (!(el instanceof HTMLInputElement)) return false;
    const tipo = el.getAttribute('type');
    const modo = el.getAttribute('inputmode');
    if (tipo !== 'number' && modo !== 'numeric' && modo !== 'decimal') return false;
    // offsetParent nulo = display:none o fuera del flujo; el modal cerrado se
    // queda con opacity 0 y pointer-events none, asi que tambien se comprueba.
    if (!el.offsetParent) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.opacity !== '0' && cs.pointerEvents !== 'none';
  };

  const sincronizar = () => {
    const ocultar = esCampoNumericoVisible(document.activeElement);
    barra.style.display = ocultar ? 'none' : '';
    // El body reserva el alto de la barra; ocultarla sin soltar la reserva
    // dejaba 81px muertos bajo el campo con el teclado abierto.
    document.body.classList.toggle('f-sin-tabbar', ocultar);
  };

  // `focusout` llega antes de que el foco cambie: se difiere un tick.
  const sincronizarDiferido = () => setTimeout(sincronizar, 0);

  document.addEventListener('focusin', sincronizar);
  document.addEventListener('focusout', sincronizarDiferido);
  // Redes de seguridad para los casos en que el foco NO se mueve: cerrar un
  // modal con Enter, o tocar fuera.
  document.addEventListener('click', sincronizarDiferido);
  document.addEventListener('submit', sincronizarDiferido);
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') sincronizarDiferido();
  });
}

// ==========================================
// EVENT DELEGATION
// ==========================================

function initializeEventDelegation(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // W-01: toda la pantalla de sesion pasa por aqui. Delegacion, no un
    // listener por boton: la pantalla se repinta entera en cada cambio
    // estructural y los listeners directos se perderian con ella.
    const accion = target.closest<HTMLElement>('[data-sesion]');
    if (accion) {
      manejarAccionDeSesion(accion);
      return;
    }
  });

  // Los steppers escriben en un <input>: hay que escuchar el teclado tambien,
  // no solo los botones.
  document.addEventListener('change', (e) => {
    const campo = (e.target as HTMLElement)?.closest<HTMLElement>('[data-sesion="valor"]');
    if (campo) updateEjercicio(Number(campo.dataset.indice));
  });
}

const PASO_STEPPER: Record<string, number> = { sets: 1, reps: 1, peso: 1 };

function manejarAccionDeSesion(el: HTMLElement): void {
  const indice = Number(el.dataset.indice);
  switch (el.dataset.sesion) {
    case 'volver':
      void showHome();
      break;
    case 'descanso':
      openRestTimerModal();
      break;
    case 'menos':
    case 'mas': {
      const campo = el.dataset.campo ?? 'sets';
      const input = document.getElementById(`${campo}-${indice}`) as HTMLInputElement | null;
      if (!input) break;
      const paso = PASO_STEPPER[campo] ?? 1;
      const actual = parseFloat(input.value) || 0;
      input.value = String(Math.max(0, el.dataset.sesion === 'mas' ? actual + paso : actual - paso));
      updateEjercicio(indice);
      break;
    }
    case 'completar':
      toggleCompletado(indice);
      break;
    case 'activar-opcional':
      activarEjercicioOpcional(indice);
      break;
    case 'guia':
      abrirGuia(indice);
      break;
    case 'rpe':
      responderRPE(indice, Number(el.dataset.valor));
      break;
    case 'rpe-omitir':
      responderRPE(indice, null);
      break;
    case 'rpe-abrir':
      reabrirRPE(indice);
      break;
    case 'guardar':
      saveWorkout();
      break;
    case 'terminar':
      void finishWorkout();
      break;
  }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

/**
 * Ganchos SOLO para las puertas de verificacion.
 *
 * No cuelgan de ningun boton ni cambian nada de la app: existen para que la
 * puerta pueda disparar los nueve mensajes del coach y abrir la guia de un
 * ejercicio que no esta en la base. Sin ellos, la puerta miraba el `innerText`
 * en un instante y se le escapaban ocho de los nueve textos.
 */
function exponerGanchosDeVerificacion(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__coachDePrueba = {
    initCoachSession,
    updateCoachOnSessionLoad,
    updateCoachOnExerciseUpdate,
    updateCoachOnExerciseComplete,
  };
  w.__guiaDePrueba = { mostrarGuiaEjercicio };
}

function init(): void {
  // FIERRO: toasts y confirmaciones. Va primero para que cualquier fallo
  // posterior tenga como reportarse sin recurrir a alert().
  inicializarFeedback();
  // La navegacion entre Perfil, Medidas, Calculadoras, Records y Graficos la
  // resuelve main.ts, que es quien conoce los contenedores; el modulo de
  // render solo dice a donde quiere ir.
  registrarNavegacionDePerfil((destino) => {
    switchTab(
      destino === 'medidas'
        ? 'medidas'
        : destino === 'calculadoras'
          ? 'calculators'
          : destino === 'records'
            ? 'prs'
            : destino === 'graficos'
              ? 'charts'
              : 'profile'
    );
  });

  exponerGanchosDeVerificacion();

  // Inicializar iconos Lucide
  initializeIcons();

  // Inicializar navegación
  initializeNavigation();

  // Inicializar modales
  initializeModals();

  // Inicializar timer
  initializeTimerListeners();

  // Inicializar perfil
  initializeProfile();
  updateMeasurementPreview();

  // Inicializar gamificacion (migrando datos existentes si es necesario)
  initGamification();

  // Cargar historial y PRs
  loadHistory();
  loadPRs();

  // Mostrar home por defecto
  void showHome();

  // Ocultar bottom nav cuando el teclado virtual está activo
  initializeKeyboardHandler();

  // Event delegation para botones
  initializeEventDelegation();

  // Refrescar iconos después de renderizar
  setTimeout(refreshIcons, 100);
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// El service worker lo registra vite-plugin-pwa (registerSW.js inyectado en
// index.html). Registrarlo tambien a mano era un duplicado sin dueno claro.

// Limpieza de una sola vez: los caches de runtime de Google Fonts que dejo la
// version anterior. cleanupOutdatedCaches solo borra precaches viejos de
// Workbox, no los de runtimeCaching, asi que sin esto sobreviven para siempre
// (200-400 KiB muertos) y presionan la cuota del dispositivo, que es justo lo
// que puede hacer que el navegador desaloje el precache que si importa.
// FIERRO: 'legacy-google-fonts' se retira en la fase 9 junto con esta limpieza.
const CACHES_HUERFANOS = ['google-fonts-cache', 'gstatic-fonts-cache'];
if ('caches' in window) {
  window.addEventListener('load', () => {
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((k) => CACHES_HUERFANOS.includes(k)).map((k) => caches.delete(k)))
      )
      .catch(() => {
        /* offline-first: si falla, no pasa nada y no bloquea nada */
      });
  });
}
