import { confirmarDestructivo } from '@/ui/feedback';
import type { CardioMode, CardioConfig, CardioSessionStats } from '@/types';
import { cardioState, resetCardioState } from '@/state/session';
import { getCardioExerciseNames } from '@/data/cardio-exercises';
import { addToHistory } from '@/utils/storage';
import { icon, refreshIcons } from '@/utils/icons';

// ==========================================
// ESTADO DEL TIMER
// ==========================================

let timerInterval: ReturnType<typeof setInterval> | null = null;
let audioContext: AudioContext | null = null;

// ==========================================
// CONFIGURACIONES POR DEFECTO
// ==========================================

const DEFAULT_CONFIGS: Record<CardioMode, CardioConfig> = {
  tabata: { rounds: 8, work: 20, rest: 10 },
  emom: { rounds: 10, interval: 60 },
  amrap: { duration: 600, exercises: [] }, // 10 minutes
  circuit: { rounds: 3, work: 40, rest: 20, roundRest: 60, exercises: [] },
  pyramid: { levels: [20, 30, 40, 30, 20], rest: 10 },
  custom: { rounds: 5, work: 30, rest: 15 },
  fortime: { exercises: [], reps: 10 },
};

// ==========================================
// MOSTRAR SELECTOR DE CARDIO
// ==========================================

export function showCardioSelector(): void {
  // Ocultar home view y todos los tabs
  const homeView = document.getElementById('homeView');
  if (homeView) homeView.classList.add('hidden');

  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.add('hidden');
    tab.classList.remove('active');
  });

  hideAllCardioViews();

  const selectorView = document.getElementById('cardioSelectorView');
  if (!selectorView) return;

  selectorView.classList.remove('hidden');
  selectorView.innerHTML = `
    <!-- Navigation Bar -->
    <div class="flex items-center gap-3 mb-6">
      <button onclick="window.showHome()" class="w-11 h-11 flex items-center justify-center bg-dark-surface border border-dark-border rounded-xl active:scale-95 transition-transform">
        <i data-lucide="arrow-left" class="w-5 h-5 text-text-primary"></i>
      </button>
      <h2 class="text-xl font-display font-bold text-text-primary flex items-center gap-2">
        ${icon('fire', 'lg', 'text-orange-400')}
        Cardio & HIIT
      </h2>
    </div>

    <p class="text-text-secondary text-sm mb-4">Selecciona un modo de entrenamiento</p>

    <div class="space-y-3">
      ${renderModeCard('tabata', 'Tabata', '20s trabajo / 10s descanso × 8 rondas', 'zap')}
      ${renderModeCard('emom', 'EMOM', 'Every Minute On the Minute', 'clock')}
      ${renderModeCard('amrap', 'AMRAP', 'As Many Reps As Possible', 'trending')}
      ${renderModeCard('circuit', 'Circuito', 'Ejercicios en secuencia con descansos', 'activity')}
      ${renderModeCard('pyramid', 'Pirámide', 'Intervalos ascendentes y descendentes', 'triangle')}
      ${renderModeCard('custom', 'Personalizado', 'Configura tu propio intervalo', 'settings')}
    </div>
  `;

  refreshIcons();
}

function renderModeCard(mode: CardioMode, title: string, description: string, iconName: string): string {
  return `
    <button
      onclick="window.selectCardioMode('${mode}')"
      class="w-full bg-gradient-to-br from-orange-500/15 to-red-600/10 border border-orange-500/30 rounded-xl p-4 flex items-center gap-4
             active:scale-[0.98] transition-all hover:border-orange-400/50 text-left"
    >
      <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
        ${icon(iconName, 'lg', 'text-white')}
      </div>
      <div class="flex-1">
        <h3 class="font-bold text-white">${title}</h3>
        <p class="text-sm text-orange-200/70">${description}</p>
      </div>
      ${icon('chevronRight', 'md', 'text-orange-300')}
    </button>
  `;
}

// ==========================================
// SELECCIONAR MODO
// ==========================================

export function selectCardioMode(mode: CardioMode): void {
  cardioState.mode = mode;
  cardioState.config = { ...DEFAULT_CONFIGS[mode] };

  showCardioConfig();
}

// ==========================================
// MOSTRAR CONFIGURACIÓN
// ==========================================

export function showCardioConfig(): void {
  hideAllCardioViews();

  const configView = document.getElementById('cardioConfigView');
  if (!configView || !cardioState.mode) return;

  configView.classList.remove('hidden');

  const mode = cardioState.mode;
  const config = cardioState.config;

  let configHTML = '';

  switch (mode) {
    case 'tabata':
      configHTML = `
        <div class="space-y-5">
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Rondas</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('rounds', -1)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configRounds" class="flex-1 text-3xl font-bold text-accent text-center">${config.rounds}</span>
              <button onclick="window.adjustCardioConfig('rounds', 1)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Trabajo (segundos)</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('work', -5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configWork" class="flex-1 text-3xl font-bold text-status-success text-center">${config.work}</span>
              <button onclick="window.adjustCardioConfig('work', 5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Descanso (segundos)</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('rest', -5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configRest" class="flex-1 text-3xl font-bold text-status-error text-center">${config.rest}</span>
              <button onclick="window.adjustCardioConfig('rest', 5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
        </div>
      `;
      break;

    case 'emom':
      configHTML = `
        <div class="space-y-5">
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Minutos totales</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('rounds', -1)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configRounds" class="flex-1 text-3xl font-bold text-accent text-center">${config.rounds}</span>
              <button onclick="window.adjustCardioConfig('rounds', 1)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm text-text-secondary mb-2">Ejercicio</label>
            <select id="emomExercise" onchange="window.setCardioExercise(this.value)" class="w-full">
              <option value="">-- Selecciona ejercicio --</option>
              ${getCardioExerciseNames().map(name => `<option value="${name}">${name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Repeticiones por minuto</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('reps', -1)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configReps" class="flex-1 text-3xl font-bold text-status-warning text-center">${config.reps || 10}</span>
              <button onclick="window.adjustCardioConfig('reps', 1)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
        </div>
      `;
      break;

    case 'amrap':
      configHTML = `
        <div class="space-y-5">
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Duración (minutos)</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('duration', -60)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configDuration" class="flex-1 text-3xl font-bold text-accent text-center">${(config.duration || 600) / 60}</span>
              <button onclick="window.adjustCardioConfig('duration', 60)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
          <p class="text-sm text-text-muted text-center">Completa tantas rondas como puedas en el tiempo límite.</p>
        </div>
      `;
      break;

    case 'pyramid':
      const levels = config.levels || [20, 30, 40, 30, 20];
      const totalWorkTime = levels.reduce((a, b) => a + b, 0);
      const totalRestTime = (levels.length - 1) * (config.rest || 10);
      configHTML = `
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-text-secondary mb-2">Estructura de pirámide</label>
            <div class="bg-dark-bg border border-dark-border rounded-lg p-3 mb-3">
              <!-- Visual pyramid -->
              <div id="pyramidLevels" class="flex items-end justify-center gap-1 mb-4 h-16">
                ${levels.map((l) => {
                  const maxLevel = Math.max(...levels);
                  const height = Math.round((l / maxLevel) * 100);
                  return `
                    <div class="flex flex-col items-center">
                      <span class="text-xs text-status-warning font-bold mb-1">${l}s</span>
                      <div class="w-8 bg-gradient-to-t from-orange-600 to-yellow-500 rounded-t" style="height: ${height}%"></div>
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Presets -->
              <div class="grid grid-cols-3 gap-2 mb-3">
                <button onclick="window.adjustPyramidLevel('corta')" class="p-2 bg-dark-surface border border-dark-border rounded-lg text-xs hover:border-orange-500/50 transition-colors">
                  Corta
                </button>
                <button onclick="window.adjustPyramidLevel('media')" class="p-2 bg-dark-surface border border-dark-border rounded-lg text-xs hover:border-orange-500/50 transition-colors">
                  Media
                </button>
                <button onclick="window.adjustPyramidLevel('larga')" class="p-2 bg-dark-surface border border-dark-border rounded-lg text-xs hover:border-orange-500/50 transition-colors">
                  Larga
                </button>
                <button onclick="window.adjustPyramidLevel('intensa')" class="p-2 bg-dark-surface border border-dark-border rounded-lg text-xs hover:border-orange-500/50 transition-colors">
                  Intensa
                </button>
                <button onclick="window.adjustPyramidLevel('extendida')" class="p-2 bg-dark-surface border border-dark-border rounded-lg text-xs hover:border-orange-500/50 transition-colors">
                  Extendida
                </button>
                <button onclick="window.adjustPyramidLevel('reset')" class="p-2 bg-dark-surface border border-dark-border rounded-lg text-xs hover:border-orange-500/50 transition-colors">
                  Reset
                </button>
              </div>

              <!-- Scale buttons -->
              <div class="flex gap-2">
                <button onclick="window.adjustPyramidLevel('scale_down')" class="flex-1 p-2 bg-dark-surface border border-dark-border rounded-lg text-sm active:scale-95 transition-transform">
                  ${icon('minus', 'sm')} Reducir
                </button>
                <button onclick="window.adjustPyramidLevel('scale_up')" class="flex-1 p-2 bg-dark-surface border border-dark-border rounded-lg text-sm active:scale-95 transition-transform">
                  ${icon('plus', 'sm')} Aumentar
                </button>
              </div>
            </div>
            <p id="pyramidTimeInfo" class="text-xs text-text-muted text-center">Tiempo trabajo: ${Math.floor(totalWorkTime / 60)}:${String(totalWorkTime % 60).padStart(2, '0')} | Total: ${Math.floor((totalWorkTime + totalRestTime) / 60)}:${String((totalWorkTime + totalRestTime) % 60).padStart(2, '0')}</p>
          </div>
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Descanso entre niveles (segundos)</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('rest', -5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configRest" class="flex-1 text-3xl font-bold text-status-error text-center">${config.rest || 10}</span>
              <button onclick="window.adjustCardioConfig('rest', 5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
        </div>
      `;
      break;

    default: // custom, circuit
      configHTML = `
        <div class="space-y-5">
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Rondas</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('rounds', -1)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configRounds" class="flex-1 text-3xl font-bold text-accent text-center">${config.rounds}</span>
              <button onclick="window.adjustCardioConfig('rounds', 1)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Trabajo (segundos)</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('work', -5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configWork" class="flex-1 text-3xl font-bold text-status-success text-center">${config.work || 30}</span>
              <button onclick="window.adjustCardioConfig('work', 5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm text-text-secondary mb-3 text-center">Descanso (segundos)</label>
            <div class="flex items-center justify-between">
              <button onclick="window.adjustCardioConfig('rest', -5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">−</span>
              </button>
              <span id="configRest" class="flex-1 text-3xl font-bold text-status-error text-center">${config.rest || 15}</span>
              <button onclick="window.adjustCardioConfig('rest', 5)" class="flex-1 h-14 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center active:scale-95 transition-transform hover:bg-dark-bg">
                <span class="text-3xl font-bold text-text-primary">+</span>
              </button>
            </div>
          </div>
        </div>
      `;
  }

  const modeNames: Record<CardioMode, string> = {
    tabata: 'Tabata',
    emom: 'EMOM',
    amrap: 'AMRAP',
    circuit: 'Circuito',
    pyramid: 'Pirámide',
    custom: 'Personalizado',
    fortime: 'For Time',
  };

  configView.innerHTML = `
    <!-- Navigation Bar -->
    <div class="flex items-center gap-3 mb-6">
      <button onclick="window.showCardioSelector()" class="w-11 h-11 flex items-center justify-center bg-dark-surface border border-dark-border rounded-xl active:scale-95 transition-transform">
        <i data-lucide="arrow-left" class="w-5 h-5 text-text-primary"></i>
      </button>
      <h2 class="text-xl font-display font-bold text-text-primary flex items-center gap-2">
        ${icon('settings', 'lg', 'text-orange-400')}
        Configurar ${modeNames[mode]}
      </h2>
    </div>

    <div class="bg-dark-surface border border-dark-border rounded-xl p-4 mb-6">
      ${configHTML}
    </div>

    <button
      onclick="window.startCardioWorkout()"
      class="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold py-4 px-6 rounded-xl
             active:scale-95 transition-all flex items-center justify-center gap-2 text-lg shadow-lg shadow-orange-500/30"
    >
      ${icon('play', 'lg')}
      Comenzar
    </button>
  `;

  refreshIcons();
}

// ==========================================
// AJUSTAR CONFIGURACIÓN
// ==========================================

export function adjustCardioConfig(key: keyof CardioConfig, delta: number): void {
  const config = cardioState.config;
  const current = (config[key] as number) || 0;
  const newValue = Math.max(5, current + delta); // Mínimo 5 segundos

  (config as Record<string, number>)[key] = newValue;

  // Update UI
  const element = document.getElementById(`config${key.charAt(0).toUpperCase() + key.slice(1)}`);
  if (element) {
    if (key === 'duration') {
      element.textContent = String(newValue / 60);
    } else {
      element.textContent = String(newValue);
    }
  }

  // Si es modo pirámide y se ajusta el descanso, actualizar el tiempo total
  if (cardioState.mode === 'pyramid' && key === 'rest') {
    updatePyramidTimeDisplay();
  }
}

function updatePyramidTimeDisplay(): void {
  const config = cardioState.config;
  const levels = config.levels || [20, 30, 40, 30, 20];
  const totalWorkTime = levels.reduce((a, b) => a + b, 0);
  const totalRestTime = (levels.length - 1) * (config.rest || 10);
  const totalTime = totalWorkTime + totalRestTime;

  const timeEl = document.getElementById('pyramidTimeInfo');
  if (timeEl) {
    timeEl.textContent = `Tiempo trabajo: ${Math.floor(totalWorkTime / 60)}:${String(totalWorkTime % 60).padStart(2, '0')} | Total: ${Math.floor(totalTime / 60)}:${String(totalTime % 60).padStart(2, '0')}`;
  }
}

export function setCardioExercise(exercise: string): void {
  cardioState.config.exercise = exercise;
}

// Presets de pirámide disponibles
const PYRAMID_PRESETS: Record<string, number[]> = {
  corta: [15, 20, 30, 20, 15],
  media: [20, 30, 40, 30, 20],
  larga: [30, 45, 60, 45, 30],
  intensa: [20, 40, 60, 40, 20],
  extendida: [15, 30, 45, 60, 45, 30, 15],
};

export function adjustPyramidLevel(action: string): void {
  const currentLevels = cardioState.config.levels || [20, 30, 40, 30, 20];

  if (action === 'scale_up') {
    // Escalar todos los niveles manteniendo la proporción (multiplicar por 1.25, máximo 120s)
    const newLevels = currentLevels.map(l => Math.min(120, Math.max(l + 5, Math.round(l * 1.25))));
    cardioState.config.levels = newLevels;
  } else if (action === 'scale_down') {
    // Reducir manteniendo proporción (dividir por 1.25, mínimo 15 segundos)
    const newLevels = currentLevels.map(l => Math.max(15, Math.round(l * 0.8)));
    cardioState.config.levels = newLevels;
  } else if (PYRAMID_PRESETS[action]) {
    // Aplicar preset
    cardioState.config.levels = [...PYRAMID_PRESETS[action]];
  } else if (action === 'reset') {
    cardioState.config.levels = [20, 30, 40, 30, 20];
  }

  // Re-render config
  showCardioConfig();
}

// ==========================================
// INICIAR WORKOUT
// ==========================================

// Estado para AMRAP round counter
let amrapRounds = 0;

export function startCardioWorkout(): void {
  hideAllCardioViews();

  const timerView = document.getElementById('cardioTimerView');
  if (!timerView) return;

  timerView.classList.remove('hidden');

  // Reset AMRAP counter
  amrapRounds = 0;

  // Show preparation countdown first
  showPreparationCountdown(() => {
    // After countdown, initialize and start
    initializeWorkout();
    renderTimerView();
    startTimer();
  });
}

function showPreparationCountdown(onComplete: () => void): void {
  const timerView = document.getElementById('cardioTimerView');
  if (!timerView) {
    onComplete();
    return;
  }

  const modeNames: Record<CardioMode, string> = {
    tabata: 'TABATA',
    emom: 'EMOM',
    amrap: 'AMRAP',
    circuit: 'CIRCUITO',
    pyramid: 'PIRÁMIDE',
    custom: 'PERSONALIZADO',
    fortime: 'FOR TIME',
  };

  let countdown = 3;

  const renderCountdown = () => {
    const text = countdown > 0 ? String(countdown) : '¡GO!';
    const color = countdown > 0 ? 'text-orange-400' : 'text-status-success';
    const scale = countdown > 0 ? 'scale-100' : 'scale-125';

    timerView.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-[70vh]">
        <p class="text-text-secondary text-lg mb-2">Prepárate para</p>
        <h2 class="text-3xl font-display font-bold text-orange-400 mb-12">${modeNames[cardioState.mode!]}</h2>
        <div class="w-40 h-40 rounded-full bg-dark-surface border-4 border-orange-500/50 flex items-center justify-center mb-8 transition-transform duration-300 ${scale}">
          <span class="text-7xl font-display font-bold ${color} transition-all duration-300">${text}</span>
        </div>
        <p class="text-text-muted text-sm">El entrenamiento comenzará en breve...</p>
      </div>
    `;

    playBeep(countdown === 0);
  };

  renderCountdown();

  const interval = setInterval(() => {
    countdown--;

    if (countdown < 0) {
      clearInterval(interval);
      onComplete();
      return;
    }

    renderCountdown();
  }, 1000);
}

function initializeWorkout(): void {
  // Initialize state
  cardioState.isPaused = false;
  cardioState.currentRound = 1;
  cardioState.currentPhase = 'work';
  cardioState.totalTimeElapsed = 0;
  cardioState.workTimeTotal = 0;
  cardioState.restTimeTotal = 0;
  cardioState.startTime = Date.now();

  const config = cardioState.config;
  const mode = cardioState.mode;

  // Set initial time based on mode
  if (mode === 'amrap') {
    cardioState.timeRemaining = config.duration || 600;
    cardioState.currentPhase = 'work';
  } else if (mode === 'emom') {
    cardioState.timeRemaining = config.interval || 60;
    cardioState.currentPhase = 'emom';
  } else if (mode === 'pyramid') {
    const levels = config.levels || [20, 30, 40, 30, 20];
    cardioState.currentExerciseIndex = 0;
    cardioState.timeRemaining = levels[0];
  } else {
    cardioState.timeRemaining = config.work || 20;
  }
}

// Función para incrementar rondas en AMRAP
export function incrementAmrapRound(): void {
  amrapRounds++;
  const counterEl = document.getElementById('amrapCounter');
  if (counterEl) {
    counterEl.textContent = String(amrapRounds);
    counterEl.classList.add('scale-125');
    setTimeout(() => counterEl.classList.remove('scale-125'), 150);
  }
  playBeep(false);
}

// ==========================================
// TIMER LOGIC
// ==========================================

function startTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(() => {
    if (cardioState.isPaused) return;

    cardioState.timeRemaining--;
    cardioState.totalTimeElapsed++;

    // Track work/rest time
    if (cardioState.currentPhase === 'work' || cardioState.currentPhase === 'emom') {
      cardioState.workTimeTotal++;
    } else {
      cardioState.restTimeTotal++;
    }

    updateTimerDisplay();

    // Check if phase ended
    if (cardioState.timeRemaining <= 0) {
      handlePhaseEnd();
    }

    // Play sound at 3, 2, 1
    if (cardioState.timeRemaining <= 3 && cardioState.timeRemaining > 0) {
      playBeep();
    }
  }, 1000);
}

function handlePhaseEnd(): void {
  const config = cardioState.config;
  const mode = cardioState.mode;
  const totalRounds = config.rounds || 8;

  playBeep(true); // Long beep

  if (mode === 'amrap') {
    // AMRAP ended
    finishCardioWorkout();
    return;
  }

  if (mode === 'emom') {
    // EMOM - each minute is a round
    if (cardioState.currentRound >= totalRounds) {
      finishCardioWorkout();
      return;
    }
    cardioState.currentRound++;
    cardioState.timeRemaining = config.interval || 60;
    renderTimerView();
    return;
  }

  if (mode === 'pyramid') {
    const levels = config.levels || [20, 30, 40, 30, 20];
    const currentLevelIndex = cardioState.currentExerciseIndex;

    if (cardioState.currentPhase === 'work') {
      // Switch to rest
      cardioState.currentPhase = 'rest';
      cardioState.timeRemaining = config.rest || 10;
    } else {
      // Rest ended, check if more levels
      const nextLevelIndex = currentLevelIndex + 1;
      if (nextLevelIndex >= levels.length) {
        finishCardioWorkout();
        return;
      }
      cardioState.currentExerciseIndex = nextLevelIndex;
      cardioState.currentRound = nextLevelIndex + 1;
      cardioState.currentPhase = 'work';
      cardioState.timeRemaining = levels[nextLevelIndex];
    }

    renderTimerView();
    return;
  }

  // Tabata/Custom/Circuit - alternate work/rest
  if (cardioState.currentPhase === 'work') {
    // Switch to rest
    cardioState.currentPhase = 'rest';
    cardioState.timeRemaining = config.rest || 10;
  } else {
    // Rest ended, check if more rounds
    if (cardioState.currentRound >= totalRounds) {
      finishCardioWorkout();
      return;
    }
    cardioState.currentRound++;
    cardioState.currentPhase = 'work';
    cardioState.timeRemaining = config.work || 20;
  }

  renderTimerView();
}

function updateTimerDisplay(): void {
  const timerEl = document.getElementById('cardioTimer');
  if (timerEl) {
    const mins = Math.floor(cardioState.timeRemaining / 60);
    const secs = cardioState.timeRemaining % 60;
    timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  }

  const totalEl = document.getElementById('cardioTotalTime');
  if (totalEl) {
    const mins = Math.floor(cardioState.totalTimeElapsed / 60);
    const secs = cardioState.totalTimeElapsed % 60;
    totalEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  }
}

function renderTimerView(): void {
  const timerView = document.getElementById('cardioTimerView');
  if (!timerView) return;

  const config = cardioState.config;
  const phase = cardioState.currentPhase;
  const mode = cardioState.mode;

  // Colores y fondos por fase
  const phaseStyles: Record<string, { text: string; bg: string; ring: string; border: string }> = {
    work: { text: 'text-emerald-400', bg: 'from-emerald-900/40 to-emerald-950/60', ring: 'stroke-emerald-500', border: 'border-emerald-500/30' },
    rest: { text: 'text-red-400', bg: 'from-red-900/40 to-red-950/60', ring: 'stroke-red-500', border: 'border-red-500/30' },
    emom: { text: 'text-amber-400', bg: 'from-amber-900/40 to-amber-950/60', ring: 'stroke-amber-500', border: 'border-amber-500/30' },
    roundRest: { text: 'text-blue-400', bg: 'from-blue-900/40 to-blue-950/60', ring: 'stroke-blue-500', border: 'border-blue-500/30' },
  };

  const phaseNames: Record<string, string> = {
    work: '¡TRABAJA!',
    rest: 'DESCANSA',
    emom: '¡GO!',
    roundRest: 'RECUPERACIÓN',
  };

  const style = phaseStyles[phase] || phaseStyles.work;
  const mins = Math.floor(cardioState.timeRemaining / 60);
  const secs = cardioState.timeRemaining % 60;

  // Calcular progreso para el anillo
  let totalPhaseTime = 1;
  if (mode === 'amrap') {
    totalPhaseTime = config.duration || 600;
  } else if (mode === 'emom') {
    totalPhaseTime = config.interval || 60;
  } else if (mode === 'pyramid') {
    const levels = config.levels || [20, 30, 40, 30, 20];
    totalPhaseTime = phase === 'work' ? levels[cardioState.currentExerciseIndex] : (config.rest || 10);
  } else {
    totalPhaseTime = phase === 'work' ? (config.work || 20) : (config.rest || 10);
  }
  const progress = cardioState.timeRemaining / totalPhaseTime;
  const circumference = 2 * Math.PI * 120;
  const strokeDashoffset = circumference * (1 - progress);

  // Contenido específico por modo
  let modeSpecificContent = '';

  if (mode === 'amrap') {
    modeSpecificContent = `
      <div class="mb-6">
        <button
          onclick="window.incrementAmrapRound()"
          class="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl shadow-lg shadow-orange-500/30 active:scale-95 transition-transform"
        >
          <div class="text-center">
            <p class="text-xs text-white/80 uppercase tracking-wider mb-1">Rondas completadas</p>
            <p id="amrapCounter" class="text-5xl font-display font-bold text-white transition-transform">${amrapRounds}</p>
          </div>
        </button>
        <p class="text-text-muted text-xs mt-2 text-center">Toca para sumar ronda</p>
      </div>
    `;
  } else if (mode === 'emom' && config.exercise) {
    modeSpecificContent = `
      <div class="mb-6 text-center">
        <p class="text-amber-300 font-bold text-lg">${config.exercise}</p>
        <p class="text-text-secondary">${config.reps || 10} repeticiones</p>
      </div>
    `;
  } else if (mode === 'pyramid') {
    const levels = config.levels || [20, 30, 40, 30, 20];
    modeSpecificContent = `
      <div class="flex items-center gap-1 mb-6">
        ${levels.map((l, i) => `
          <div class="flex flex-col items-center">
            <div class="w-6 h-${Math.round(l / 10)} ${i === cardioState.currentExerciseIndex ? 'bg-orange-500' : 'bg-dark-surface'} rounded-sm"></div>
            <span class="text-[10px] ${i === cardioState.currentExerciseIndex ? 'text-orange-400 font-bold' : 'text-text-muted'}">${l}s</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Información de progreso
  let progressInfo = '';
  if (mode === 'pyramid') {
    const levels = config.levels || [20, 30, 40, 30, 20];
    progressInfo = `Nivel ${cardioState.currentExerciseIndex + 1} de ${levels.length}`;
  } else if (mode === 'amrap') {
    progressInfo = 'Completa todas las rondas que puedas';
  } else if (mode !== 'emom') {
    progressInfo = `Ronda ${cardioState.currentRound} de ${config.rounds || 8}`;
  } else {
    progressInfo = `Minuto ${cardioState.currentRound} de ${config.rounds || 10}`;
  }

  timerView.innerHTML = `
    <div class="fixed inset-0 bg-gradient-to-b ${style.bg} -z-10 transition-all duration-500"></div>
    <div class="flex flex-col items-center justify-center min-h-[75vh] relative">
      <!-- Phase indicator -->
      <div class="mb-2">
        <span class="text-2xl font-bold ${style.text} tracking-wider">${phaseNames[phase]}</span>
      </div>

      <!-- Mode-specific content -->
      ${modeSpecificContent}

      <!-- Timer with progress ring -->
      <div class="relative mb-4">
        <svg class="w-64 h-64 -rotate-90" viewBox="0 0 256 256">
          <circle
            cx="128"
            cy="128"
            r="120"
            fill="none"
            stroke="currentColor"
            stroke-width="8"
            class="text-dark-surface"
          />
          <circle
            cx="128"
            cy="128"
            r="120"
            fill="none"
            stroke-width="8"
            stroke-linecap="round"
            class="${style.ring}"
            style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset}; transition: stroke-dashoffset 0.5s ease-out;"
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <div id="cardioTimer" class="text-6xl font-display font-bold ${style.text}">
            ${mins}:${String(secs).padStart(2, '0')}
          </div>
          <div class="text-text-secondary text-sm mt-1">${progressInfo}</div>
        </div>
      </div>

      <!-- Total time -->
      <div class="flex items-center gap-2 text-text-muted mb-6">
        ${icon('clock', 'sm', 'text-text-muted')}
        <span>Tiempo total: <span id="cardioTotalTime" class="font-mono text-text-secondary">${formatTime(cardioState.totalTimeElapsed)}</span></span>
      </div>

      <!-- Controls -->
      <div class="flex gap-4">
        <button
          onclick="window.toggleCardioPause()"
          class="w-16 h-16 rounded-full bg-dark-surface border ${style.border} flex items-center justify-center active:scale-95 transition-all shadow-lg"
        >
          ${icon(cardioState.isPaused ? 'play' : 'pause', 'xl', style.text.replace('text-', 'text-'))}
        </button>
        <button
          onclick="window.stopCardioWorkout()"
          class="w-16 h-16 rounded-full bg-dark-surface border border-red-500/30 flex items-center justify-center active:scale-95 transition-all shadow-lg"
        >
          ${icon('stop', 'xl', 'text-red-400')}
        </button>
      </div>

      ${cardioState.isPaused ? `
        <div class="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div class="text-center">
            <p class="text-4xl font-bold text-white mb-4">PAUSADO</p>
            <button
              onclick="window.toggleCardioPause()"
              class="px-8 py-3 bg-accent rounded-xl font-bold text-white active:scale-95 transition-transform"
            >
              Continuar
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  refreshIcons();
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ==========================================
// CONTROLES
// ==========================================

export function toggleCardioPause(): void {
  cardioState.isPaused = !cardioState.isPaused;
  renderTimerView();
}

export async function stopCardioWorkout(): Promise<void> {
  const terminar = await confirmarDestructivo({
    titulo: '¿Terminar el cardio?',
    cuerpo: 'La sesión se cierra donde está y se guarda con el tiempo hecho hasta ahora.',
    cancelar: 'Seguir',
    confirmar: 'Terminar',
  });
  if (terminar) finishCardioWorkout();
}

// ==========================================
// FINALIZAR WORKOUT
// ==========================================

function finishCardioWorkout(): void {
  // Stop timer
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Calculate stats
  const stats: CardioSessionStats = {
    totalTime: cardioState.totalTimeElapsed,
    workTime: cardioState.workTimeTotal,
    restTime: cardioState.restTimeTotal,
    roundsCompleted: cardioState.currentRound,
    calories: estimateCalories(cardioState.workTimeTotal),
  };

  // Save to history
  const session = {
    type: 'cardio' as const,
    mode: cardioState.mode!,
    // Instante completo: el heatmap deriva de aqui el dia LOCAL.
    date: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    config: { ...cardioState.config },
    stats,
    grupo: `Cardio - ${cardioState.mode?.toUpperCase()}`,
    ejercicios: [],
    volumenTotal: 0,
    volumenPorGrupo: {},
  };

  addToHistory(session);

  // Show summary
  showCardioSummary(stats);
}

function estimateCalories(workSeconds: number): number {
  // Rough estimate: ~10 calories per minute of high intensity work
  return Math.round((workSeconds / 60) * 10);
}

// ==========================================
// RESUMEN
// ==========================================

function showCardioSummary(stats: CardioSessionStats): void {
  hideAllCardioViews();

  const summaryView = document.getElementById('cardioSummaryView');
  if (!summaryView) return;

  summaryView.classList.remove('hidden');

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  summaryView.innerHTML = `
    <div class="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div class="w-20 h-20 rounded-full bg-status-success/20 flex items-center justify-center mb-6">
        ${icon('check', 'xl', 'text-status-success')}
      </div>

      <h2 class="text-2xl font-display font-bold text-text-primary mb-2">
        ¡Entrenamiento Completado!
      </h2>
      <p class="text-text-secondary mb-8">${cardioState.mode?.toUpperCase()}</p>

      <div class="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
        <div class="bg-dark-surface border border-dark-border rounded-xl p-4">
          <p class="text-3xl font-bold text-accent">${formatTime(stats.totalTime)}</p>
          <p class="text-xs text-text-muted">Tiempo Total</p>
        </div>
        <div class="bg-dark-surface border border-dark-border rounded-xl p-4">
          <p class="text-3xl font-bold text-status-warning">${stats.roundsCompleted}</p>
          <p class="text-xs text-text-muted">Rondas</p>
        </div>
        <div class="bg-dark-surface border border-dark-border rounded-xl p-4">
          <p class="text-3xl font-bold text-status-success">${formatTime(stats.workTime)}</p>
          <p class="text-xs text-text-muted">Trabajo</p>
        </div>
        <div class="bg-dark-surface border border-dark-border rounded-xl p-4">
          <p class="text-3xl font-bold text-status-error">${stats.calories}</p>
          <p class="text-xs text-text-muted">Calorías (est.)</p>
        </div>
      </div>

      <button
        onclick="window.showHome()"
        class="w-full max-w-sm bg-accent hover:bg-accent-hover text-white font-bold py-4 px-6 rounded-xl
               active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        ${icon('home', 'md')}
        Volver al Inicio
      </button>
    </div>
  `;

  // Reset state
  resetCardioState();

  refreshIcons();
}

// ==========================================
// UTILIDADES
// ==========================================

function hideAllCardioViews(): void {
  const views = ['cardioSelectorView', 'cardioConfigView', 'cardioTimerView', 'cardioSummaryView'];
  views.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function playBeep(long = false): void {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = long ? 880 : 440;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + (long ? 0.5 : 0.1));

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + (long ? 0.5 : 0.1));
  } catch {
    // Audio not supported, try vibration
    if ('vibrate' in navigator) {
      navigator.vibrate(long ? 300 : 100);
    }
  }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

export function initializeCardio(): void {
  // Nothing to initialize yet, views are created dynamically
}
