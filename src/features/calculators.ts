import { mostrarToast } from '@/ui/feedback';
import { getHistory, getProfile } from '@/utils/storage';
import {
  calculate1RM,
  calculateCalories as calcCalories,
  calculateProgressive,
} from '@/utils/calculations';
import { icon, refreshIcons } from '@/utils/icons';

// ==========================================
// INICIALIZAR CALCULADORAS
// ==========================================

export function initializeCalculators(): void {
  populateExerciseDropdowns();
  setupEventListeners();
  // Auto-fill calories calculator from saved profile
  prefillCaloriesFromProfile();
}

// ==========================================
// POPULAR DROPDOWNS
// ==========================================

function populateExerciseDropdowns(): void {
  const history = getHistory();

  // Obtener ejercicios únicos
  const exercises = new Set<string>();

  history.forEach((session) => {
    if (session.ejercicios && Array.isArray(session.ejercicios)) {
      session.ejercicios.forEach((ej) => {
        if (ej.peso > 0) {
          exercises.add(ej.nombre);
        }
      });
    }
  });

  const exerciseArray = Array.from(exercises).sort();

  // Dropdown de 1RM
  const rm1Select = document.getElementById(
    'rm1ExerciseSelect'
  ) as HTMLSelectElement;
  if (rm1Select) {
    rm1Select.innerHTML = '<option value="">-- Elige un ejercicio --</option>';
    exerciseArray.forEach((ex) => {
      const option = document.createElement('option');
      option.value = ex;
      option.textContent = ex;
      rm1Select.appendChild(option);
    });
  }

  // Dropdown de progresivo
  const progressiveSelect = document.getElementById(
    'progressiveExerciseSelect'
  ) as HTMLSelectElement;
  if (progressiveSelect) {
    progressiveSelect.innerHTML =
      '<option value="">-- Elige un ejercicio --</option>';
    exerciseArray.forEach((ex) => {
      const option = document.createElement('option');
      option.value = ex;
      option.textContent = ex;
      progressiveSelect.appendChild(option);
    });
  }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function setupEventListeners(): void {
  // 1RM Calculator
  const rm1Select = document.getElementById('rm1ExerciseSelect');
  rm1Select?.addEventListener('change', handleRM1Change);

  // Calories Calculator
  const calcBtn = document.getElementById('calculateCaloriesBtn');
  calcBtn?.addEventListener('click', handleCaloriesCalculation);

  // Progressive Calculator
  const progressiveSelect = document.getElementById('progressiveExerciseSelect');
  progressiveSelect?.addEventListener('change', handleProgressiveChange);

  // Prefill from profile button
  const prefillBtn = document.getElementById('prefillFromProfile');
  prefillBtn?.addEventListener('click', prefillCaloriesFromProfile);
}

// ==========================================
// 1RM CALCULATOR
// ==========================================

function handleRM1Change(e: Event): void {
  const target = e.target as HTMLSelectElement;
  if (!target.value) return;

  const result = calculate1RM(target.value);
  const resultsDiv = document.getElementById('rm1Results');

  if (!result || !resultsDiv) {
    if (resultsDiv) {
      resultsDiv.innerHTML = `
        <p class="text-text-secondary text-center py-4">
          No hay datos suficientes para calcular el 1RM
        </p>
      `;
      resultsDiv.classList.remove('hidden');
    }
    return;
  }

  resultsDiv.innerHTML = `
    <div class="space-y-4">
      <div class="bg-dark-bg border border-dark-border rounded-xl p-4">
        <div class="flex items-center gap-2 mb-2">
          ${icon('trophy', 'md', 'text-status-warning')}
          <span class="text-sm text-text-secondary">Mejor Registro</span>
        </div>
        <p class="text-lg text-text-primary font-bold">
          ${result.bestPerformance.peso}kg x ${result.bestPerformance.reps} reps
          <span class="text-text-muted text-sm">(${result.bestPerformance.sets} sets)</span>
        </p>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="bg-dark-bg border border-dark-border rounded-xl p-3 text-center">
          <p class="text-xs text-text-secondary mb-1">Epley</p>
          <p class="text-xl font-bold text-accent">${result.epley}</p>
          <p class="text-xs text-text-muted">kg</p>
        </div>
        <div class="bg-dark-bg border border-dark-border rounded-xl p-3 text-center">
          <p class="text-xs text-text-secondary mb-1">Brzycki</p>
          <p class="text-xl font-bold text-accent">${result.brzycki}</p>
          <p class="text-xs text-text-muted">kg</p>
        </div>
        <div class="bg-dark-bg border border-dark-border rounded-xl p-3 text-center">
          <p class="text-xs text-text-secondary mb-1">Lombardi</p>
          <p class="text-xl font-bold text-accent">${result.lombardi}</p>
          <p class="text-xs text-text-muted">kg</p>
        </div>
      </div>

      <div class="bg-accent/10 border border-accent/20 rounded-xl p-4 text-center">
        <p class="text-sm text-text-secondary mb-1">1RM Estimado (Promedio)</p>
        <p class="text-3xl font-bold text-accent">${result.average} kg</p>
      </div>
    </div>
  `;

  resultsDiv.classList.remove('hidden');
  refreshIcons();
}

// ==========================================
// CALORIES CALCULATOR
// ==========================================

function handleCaloriesCalculation(): void {
  const age = parseFloat(
    (document.getElementById('caloriesAge') as HTMLInputElement)?.value || '0'
  );
  const gender = (document.getElementById('caloriesGender') as HTMLSelectElement)
    ?.value as 'male' | 'female';
  const weight = parseFloat(
    (document.getElementById('caloriesWeight') as HTMLInputElement)?.value || '0'
  );
  const height = parseFloat(
    (document.getElementById('caloriesHeight') as HTMLInputElement)?.value || '0'
  );
  const activity = parseFloat(
    (document.getElementById('caloriesActivity') as HTMLSelectElement)?.value ||
      '1.2'
  );

  if (!age || !weight || !height) {
    mostrarToast({
      tipo: 'aviso',
      titulo: 'Faltan datos',
      detalle: 'Edad, peso y estatura son necesarios para el cálculo.',
    });
    return;
  }

  const result = calcCalories(age, gender, weight, height, activity);
  const resultsDiv = document.getElementById('caloriesResults');

  if (!resultsDiv) return;

  resultsDiv.innerHTML = `
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div class="bg-dark-bg border border-dark-border rounded-xl p-3 text-center">
          <p class="text-xs text-text-secondary mb-1">BMR</p>
          <p class="text-xl font-bold text-text-primary">${result.bmr}</p>
          <p class="text-xs text-text-muted">kcal/día</p>
        </div>
        <div class="bg-dark-bg border border-dark-border rounded-xl p-3 text-center">
          <p class="text-xs text-text-secondary mb-1">TDEE</p>
          <p class="text-xl font-bold text-accent">${result.tdee}</p>
          <p class="text-xs text-text-muted">kcal/día</p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div class="bg-status-error/10 border border-status-error/20 rounded-lg p-2 text-center overflow-hidden">
          <p class="text-[10px] text-text-secondary mb-0.5 truncate">Déficit</p>
          <p class="text-base font-bold text-status-error">${result.deficit}</p>
          <p class="text-[10px] text-text-muted">kcal</p>
        </div>
        <div class="bg-status-success/10 border border-status-success/20 rounded-lg p-2 text-center overflow-hidden">
          <p class="text-[10px] text-text-secondary mb-0.5 truncate">Mantener</p>
          <p class="text-base font-bold text-status-success">${result.maintenance}</p>
          <p class="text-[10px] text-text-muted">kcal</p>
        </div>
        <div class="bg-accent/10 border border-accent/20 rounded-lg p-2 text-center overflow-hidden">
          <p class="text-[10px] text-text-secondary mb-0.5 truncate">Superávit</p>
          <p class="text-base font-bold text-accent">${result.surplus}</p>
          <p class="text-[10px] text-text-muted">kcal</p>
        </div>
      </div>

      <div class="bg-dark-bg border border-dark-border rounded-lg p-3">
        <div class="flex items-start gap-2">
          ${icon('info', 'sm', 'text-status-info flex-shrink-0')}
          <div class="text-[11px] text-text-secondary leading-relaxed">
            <p><strong>BMR:</strong> Calorías en reposo.</p>
            <p><strong>TDEE:</strong> Calorías totales con actividad.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  resultsDiv.classList.remove('hidden');
  refreshIcons();
}

function prefillCaloriesFromProfile(): void {
  const profile = getProfile();

  if (profile.birthdate) {
    const birth = new Date(profile.birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    const ageInput = document.getElementById('caloriesAge') as HTMLInputElement;
    if (ageInput) ageInput.value = String(age);
  }

  if (profile.gender) {
    const genderSelect = document.getElementById(
      'caloriesGender'
    ) as HTMLSelectElement;
    if (genderSelect) genderSelect.value = profile.gender;
  }

  if (profile.weight) {
    const weightInput = document.getElementById(
      'caloriesWeight'
    ) as HTMLInputElement;
    if (weightInput) weightInput.value = String(profile.weight);
  }

  if (profile.height) {
    const heightInput = document.getElementById(
      'caloriesHeight'
    ) as HTMLInputElement;
    if (heightInput) heightInput.value = String(profile.height);
  }

  if (profile.activity) {
    const activitySelect = document.getElementById(
      'caloriesActivity'
    ) as HTMLSelectElement;
    if (activitySelect) activitySelect.value = String(profile.activity);
  }
}

// ==========================================
// PROGRESSIVE CALCULATOR
// ==========================================

function handleProgressiveChange(e: Event): void {
  const target = e.target as HTMLSelectElement;
  if (!target.value) return;

  const result = calculateProgressive(target.value);
  const resultsDiv = document.getElementById('progressiveResults');

  if (!result || !resultsDiv) {
    if (resultsDiv) {
      resultsDiv.innerHTML = `
        <p class="text-text-secondary text-center py-4">
          No hay PRs registrados para este ejercicio
        </p>
      `;
      resultsDiv.classList.remove('hidden');
    }
    return;
  }

  resultsDiv.innerHTML = `
    <div class="space-y-4">
      <div class="bg-dark-bg border border-dark-border rounded-xl p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-text-secondary mb-1">Peso Actual (PR)</p>
            <p class="text-2xl font-bold text-text-primary">${result.current} kg</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-text-secondary mb-1">Tipo</p>
            <p class="text-sm font-semibold text-accent">${result.exerciseType}</p>
          </div>
        </div>
      </div>

      <p class="text-sm text-text-secondary">Próximo peso recomendado:</p>

      <div class="grid grid-cols-3 gap-3">
        <div class="bg-status-success/10 border border-status-success/20 rounded-xl p-3 text-center">
          <p class="text-xs text-text-secondary mb-1">Conservador</p>
          <p class="text-lg font-bold text-status-success">${result.conservative}</p>
          <p class="text-xs text-text-muted">kg (+2.5%)</p>
        </div>
        <div class="bg-status-warning/10 border border-status-warning/20 rounded-xl p-3 text-center">
          <p class="text-xs text-text-secondary mb-1">Moderado</p>
          <p class="text-lg font-bold text-status-warning">${result.moderate}</p>
          <p class="text-xs text-text-muted">kg (+5-7%)</p>
        </div>
        <div class="bg-status-error/10 border border-status-error/20 rounded-xl p-3 text-center">
          <p class="text-xs text-text-secondary mb-1">Agresivo</p>
          <p class="text-lg font-bold text-status-error">${result.aggressive}</p>
          <p class="text-xs text-text-muted">kg (+7.5-10%)</p>
        </div>
      </div>

      <div class="bg-dark-bg border border-dark-border rounded-xl p-4">
        <div class="flex items-start gap-2">
          ${icon('info', 'md', 'text-status-info')}
          <p class="text-xs text-text-secondary">
            Basado en recomendaciones ACSM/NSCA. Los valores están redondeados
            a múltiplos de 2.5kg para facilitar el uso de discos estándar.
          </p>
        </div>
      </div>
    </div>
  `;

  resultsDiv.classList.remove('hidden');
  refreshIcons();
}
