import './styles/fonts.css';
import './styles/tokens.css';
import './styles/main.css';
import { initializeIcons, refreshIcons } from '@/utils/icons';
import { initializeNavigation, showHome, switchTab, resumeDraft, dismissDraft } from '@/ui/navigation';
import { initializeModals, showAnimation, closeAnimationModal, type GuidanceType } from '@/ui/modals';
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
  selectRPE,
  confirmRPE,
  skipRPE,
} from '@/features/workout';
import { initGamification, reinitGamification } from '@/features/gamification';
import {
  renderGamificationHeroCard,
  showGamificationModal,
  hideGamificationModal,
} from '@/ui/gamification';
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
  getCustomWorkouts,
  deleteCustomWorkout,
  addCustomWorkout,
  CustomWorkout,
  getCustomExercises,
  addCustomExerciseToStorage,
  deleteCustomExercise,
  CustomExercise
} from '@/utils/storage';
import { icon } from '@/utils/icons';
import { groupIcon } from '@/utils/muscle-icons';
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
    selectRPE: typeof selectRPE;
    confirmRPE: typeof confirmRPE;
    skipRPE: typeof skipRPE;

    // Modals
    showAnimation: typeof showAnimation;
    closeAnimationModal: typeof closeAnimationModal;

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
    showGamificationModal: typeof showGamificationModal;
    hideGamificationModal: typeof hideGamificationModal;
    recalculateXP: () => void;
  }
}

// ==========================================
// HANDLER PARA ELIMINAR RUTINAS PERSONALIZADAS
// ==========================================

function handleDeleteCustomWorkout(workoutId: string): void {
  if (confirm('¿Eliminar esta rutina personalizada?')) {
    deleteCustomWorkout(workoutId);
    renderCustomWorkoutsInHome();
  }
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
window.selectRPE = selectRPE;
window.confirmRPE = confirmRPE;
window.skipRPE = skipRPE;
window.showAnimation = showAnimation;
window.closeAnimationModal = closeAnimationModal;
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
window.showGamificationModal = showGamificationModal;
window.hideGamificationModal = hideGamificationModal;

// Utility to recalculate all XP from history (for recovery)
window.recalculateXP = (): void => {
  if (confirm('¿Recalcular todo el XP desde el historial? Esto puede tomar un momento.')) {
    reinitGamification();
    alert('XP recalculado correctamente. Recargando página...');
    window.location.reload();
  }
};

// ==========================================
// RENDERIZAR RUTINAS EN HOME
// ==========================================

function renderRoutinesInHome(): void {
  const container = document.getElementById('routinesContainer');
  if (!container) return;

  const groupStyles: Record<string, { border: string; bg: string; gradient: string; iconGradient: string; textColor: string }> = {
    grupo1: {
      border: 'border-blue-500/40',
      bg: 'from-blue-500/20 to-blue-600/10',
      gradient: 'from-blue-500 to-indigo-600',
      iconGradient: 'from-blue-500 to-indigo-600',
      textColor: 'text-blue-300',
    },
    grupo2: {
      border: 'border-emerald-500/40',
      bg: 'from-emerald-500/20 to-green-600/10',
      gradient: 'from-emerald-500 to-green-600',
      iconGradient: 'from-emerald-500 to-green-600',
      textColor: 'text-emerald-300',
    },
    grupo3: {
      border: 'border-purple-500/40',
      bg: 'from-purple-500/20 to-violet-600/10',
      gradient: 'from-purple-500 to-violet-600',
      iconGradient: 'from-purple-500 to-violet-600',
      textColor: 'text-purple-300',
    },
    grupo4: {
      border: 'border-orange-500/40',
      bg: 'from-orange-500/20 to-amber-600/10',
      gradient: 'from-orange-500 to-amber-600',
      iconGradient: 'from-orange-500 to-amber-600',
      textColor: 'text-orange-300',
    },
    grupo5: {
      border: 'border-pink-500/40',
      bg: 'from-pink-500/20 to-rose-600/10',
      gradient: 'from-pink-500 to-rose-600',
      iconGradient: 'from-pink-500 to-rose-600',
      textColor: 'text-pink-300',
    },
  };

  let html = '';

  // Rutinas predefinidas
  Object.entries(trainingGroups).forEach(([id, group]) => {
    const style = groupStyles[id] || groupStyles.grupo1;
    // Extract short name (after the dash)
    const shortName = group.nombre.split(' - ')[1] || group.nombre;
    const groupNum = group.nombre.split(' - ')[0] || '';

    html += `
      <div
        data-grupo="${id}"
        class="bg-gradient-to-br ${style.bg} border ${style.border} rounded-2xl p-5
               cursor-pointer active:scale-[0.98] transition-all hover:border-opacity-70 min-h-[76px]"
      >
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${style.iconGradient} flex items-center justify-center flex-shrink-0 shadow-lg">
            ${groupIcon(id, 24, 'text-white')}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs ${style.textColor} font-semibold uppercase tracking-wide">${groupNum}</p>
            <h3 class="font-bold text-white text-base truncate">${shortName}</h3>
            <p class="text-sm text-white/60">${group.ejercicios.length} ejercicios</p>
          </div>
          <div class="flex-shrink-0 w-10 h-10 flex items-center justify-center">
            ${icon('chevronRight', 'md', style.textColor)}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Re-attach event listeners
  container.querySelectorAll('[data-grupo]').forEach((card) => {
    card.addEventListener('click', function (this: HTMLElement) {
      const grupo = this.dataset.grupo;
      if (grupo) {
        loadTrainingGroup(grupo);
        switchTab('workout');
      }
    });
  });

  refreshIcons();
}

// ==========================================
// RENDERIZAR RUTINAS PERSONALIZADAS
// ==========================================

function renderCustomWorkoutsInHome(): void {
  const container = document.getElementById('customWorkoutsContainer');
  if (!container) return;

  const customWorkouts = getCustomWorkouts();

  if (customWorkouts.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <div class="mt-6">
      <h2 class="text-lg font-display font-bold text-text-primary mb-3 flex items-center gap-2">
        ${icon('bookmark', 'md', 'text-accent')}
        Mis Rutinas
      </h2>
      <div class="space-y-3">
  `;

  customWorkouts.forEach((workout) => {
    html += `
      <div
        data-custom-workout="${workout.id}"
        class="bg-dark-surface border border-accent/30 border-l-4 border-l-accent rounded-xl p-4
               cursor-pointer active:scale-[0.98] transition-transform"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              ${icon('workout', 'lg', 'text-accent')}
            </div>
            <div>
              <h3 class="font-bold text-text-primary text-sm">${workout.nombre}</h3>
              <p class="text-xs text-text-secondary">${workout.ejercicios.length} ejercicios</p>
            </div>
          </div>
          <button
            onclick="event.stopPropagation(); deleteCustomWorkout('${workout.id}')"
            class="p-2 text-status-error hover:text-status-error/80 rounded-lg hover:bg-white/5"
          >
            ${icon('delete', 'md')}
          </button>
        </div>
      </div>
    `;
  });

  html += '</div></div>';
  container.innerHTML = html;

  // Add event listeners for custom workout clicks
  container.querySelectorAll('[data-custom-workout]').forEach((card) => {
    card.addEventListener('click', function (this: HTMLElement) {
      const workoutId = this.dataset.customWorkout;
      if (workoutId) {
        loadTrainingGroup(workoutId);
        switchTab('workout');
      }
    });
  });

  refreshIcons();
}

// ==========================================
// RENDERIZAR GAMIFICATION EN HOME
// ==========================================

function renderGamificationInHome(): void {
  // Renderizar el hero card de gamificación en su contenedor
  const heroContainer = document.getElementById('gamificationHeroContainer');
  if (heroContainer) {
    heroContainer.innerHTML = renderGamificationHeroCard();
  }

  refreshIcons();
}

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
    alert('Selecciona al menos un ejercicio');
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
  renderCustomWorkoutsInHome();
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
    alert('Ya existe un ejercicio con ese nombre');
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

function removeCustomExercise(exerciseId: string, exerciseName: string): void {
  if (confirm(`¿Eliminar "${exerciseName}" de tus ejercicios personalizados?`)) {
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

function initializeKeyboardHandler(): void {
  const bottomNav = document.querySelector('.bottom-nav') as HTMLElement;
  if (!bottomNav) return;

  // Detectar focus en inputs numéricos para ocultar bottom nav
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' &&
        (target.getAttribute('type') === 'number' ||
         target.getAttribute('inputmode') === 'numeric' ||
         target.getAttribute('inputmode') === 'decimal')) {
      bottomNav.style.display = 'none';
    }
  });

  document.addEventListener('focusout', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') {
      // Pequeño delay para evitar parpadeo al cambiar entre inputs
      setTimeout(() => {
        const activeElement = document.activeElement as HTMLElement;
        if (!activeElement ||
            activeElement.tagName !== 'INPUT' ||
            (activeElement.getAttribute('type') !== 'number' &&
             activeElement.getAttribute('inputmode') !== 'numeric' &&
             activeElement.getAttribute('inputmode') !== 'decimal')) {
          bottomNav.style.display = '';
        }
      }, 100);
    }
  });
}

// ==========================================
// EVENT DELEGATION
// ==========================================

function initializeEventDelegation(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // RPE buttons
    const rpeBtn = target.closest('[data-rpe]') as HTMLElement;
    if (rpeBtn) {
      const rpe = parseInt(rpeBtn.dataset.rpe || '0', 10);
      if (rpe >= 1 && rpe <= 10) {
        selectRPE(rpe);
      }
      return;
    }

    // Exercise guidance buttons
    const guidanceBtn = target.closest('[data-guidance-btn]') as HTMLElement;
    if (guidanceBtn) {
      const nombre = guidanceBtn.dataset.exerciseName || '';
      const type = guidanceBtn.dataset.guidanceType as GuidanceType;
      const content = guidanceBtn.dataset.guidanceContent || '';
      const fallback = guidanceBtn.dataset.guidanceFallback;

      if (nombre && type && content) {
        showAnimation(nombre, { type, content, fallback });
      }
      return;
    }
  });
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

function init(): void {
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

  // Renderizar rutinas en home
  renderRoutinesInHome();
  renderCustomWorkoutsInHome();

  // Renderizar gamificacion en home
  renderGamificationInHome();

  // Cargar historial y PRs
  loadHistory();
  loadPRs();

  // Mostrar home por defecto
  showHome();

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
