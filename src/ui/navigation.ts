import { renderHome } from '@/ui/home';
import { cifra } from '@/utils/formato';
import { confirmarAccion, confirmarDestructivo, mostrarToast } from '@/ui/feedback';
import type { ExerciseData, TabName, HistorySession } from '@/types';
import { saveDraftNow, sessionData, hasUnsavedData, checkForExistingDraft, restoreFromDraft, endSession } from '@/state/session';
import { loadHistory, loadPRs } from '@/features/history';
import { initializeCharts } from '@/features/charts';
import { initializeCalculators } from '@/features/calculators';
import { loadProfile } from '@/features/profile';
import { refreshIcons } from '@/utils/icons';
import { generateInsight } from '@/utils/insights';

// ==========================================
// NAVEGACIÓN ENTRE TABS
// ==========================================

export function switchTab(tabName: TabName): void {
  // Ocultar home view
  const homeView = document.getElementById('homeView');
  if (homeView) {
    homeView.classList.add('hidden');
  }

  // Ocultar todas las vistas de cardio
  hideCardioViews();

  renderizarHome();

  // Ocultar todos los tabs
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.add('hidden');
    tab.classList.remove('active');
  });

  // Mostrar el tab seleccionado
  const selectedTab = document.getElementById(tabName + 'Tab');
  if (selectedTab) {
    selectedTab.classList.remove('hidden');
    selectedTab.classList.add('active');
  }

  // Scroll al inicio
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Actualizar navegación inferior
  updateBottomNav(tabName);

  // Cargar datos específicos del tab
  loadTabData(tabName);

  // Refrescar iconos
  refreshIcons();
}

/**
 * Describe la sesion en curso con datos reales para las confirmaciones.
 * No se inventan minutos: SessionData no guarda hora de inicio, asi que se
 * cuenta lo que si existe — sets registrados y volumen.
 */
function describirEjercicios(ejercicios: ExerciseData[], volumenTotal: number): string {
  const sets = ejercicios.reduce((total, e) => total + (e.sets || 0), 0);
  if (!sets) return 'Sin sets registrados todavía.';
  const kg = cifra(volumenTotal);
  return `${sets} ${sets === 1 ? 'set' : 'sets'} y ${kg} kg registrados.`;
}

function describirSesionEnCurso(): string {
  return describirEjercicios(sessionData.ejercicios ?? [], sessionData.volumenTotal);
}

/**
 * Lo que se va a perder al descartar es el BORRADOR PERSISTIDO, no la sesion
 * en memoria. La tarjeta que dispara el descarte se pinta al arrancar la app,
 * cuando sessionData esta vacio por definicion: describir sessionData decia
 * "Sin sets registrados todavia" justo antes de borrar una sesion entera.
 */
function describirBorrador(): string {
  const { draft } = checkForExistingDraft();
  if (!draft) return describirSesionEnCurso();
  return describirEjercicios(draft.ejercicios ?? [], draft.volumenTotal);
}

/** Pinta H-01 dentro de #fierroHome y engancha sus acciones. */
export function renderizarHome(): void {
  const contenedor = document.getElementById('fierroHome');
  if (!contenedor) return;
  renderHome(contenedor);
  if (contenedor.dataset.enganchado !== 'si') {
    // Delegacion: un solo listener que sobrevive a cada repintado.
    contenedor.addEventListener('click', alTocarHome);
    contenedor.dataset.enganchado = 'si';
  }
}

function alTocarHome(evento: Event): void {
  const objetivo = (evento.target as HTMLElement)?.closest<HTMLElement>('[data-accion],[data-grupo],[data-custom-workout],[data-eliminar-rutina]');
  if (!objetivo) return;

  const rutinaPropia = objetivo.dataset.customWorkout;
  const eliminar = objetivo.dataset.eliminarRutina;
  const grupo = objetivo.dataset.grupo;

  if (eliminar) {
    (window as unknown as { deleteCustomWorkout?: (id: string) => void }).deleteCustomWorkout?.(eliminar);
    return;
  }
  if (grupo || rutinaPropia) {
    const id = (grupo ?? rutinaPropia) as string;
    void import('@/features/workout')
      .then(({ loadTrainingGroup }) => loadTrainingGroup(id))
      .then((cargada) => cargada && switchTab('workout'))
      .catch((e) => console.error('No se pudo cargar la rutina', e));
    return;
  }

  switch (objetivo.dataset.accion) {
    case 'continuar':
      void resumeDraft();
      break;
    case 'descartar':
      void dismissDraft();
      break;
    case 'progreso':
      (window as unknown as { showGamificationModal?: () => void }).showGamificationModal?.();
      break;
    case 'cardio':
      (window as unknown as { showCardioSelector?: () => void }).showCardioSelector?.();
      break;
    case 'importar':
      (window as unknown as { importFromCSV?: () => void }).importFromCSV?.();
      break;
  }
}

export async function showHome(): Promise<void> {
  // Verificar cambios sin guardar
  if (hasUnsavedData()) {
    // El autoguardado tiene 15s de retardo: sin forzarlo aqui, la frase
    // "el borrador queda guardado" seria falsa justo cuando se dice.
    saveDraftNow();
    const seguir = await confirmarAccion({
      titulo: '¿Salir de la sesión?',
      cuerpo: `${describirSesionEnCurso()} El borrador queda guardado, pero sales de la sesión.`,
      cancelar: 'Seguir entrenando',
      confirmar: 'Salir',
    });
    if (!seguir) return;
  }

  // Ocultar todos los tabs
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.add('hidden');
    tab.classList.remove('active');
  });

  // Ocultar vistas de cardio
  hideCardioViews();

  // Mostrar home view
  const homeView = document.getElementById('homeView');
  if (homeView) {
    homeView.classList.remove('hidden');
  }

  // Actualizar navegación
  updateBottomNav('home');

  // Scroll al inicio
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Actualizar UI del home
  updateHomeUI();

  // Refrescar iconos
  refreshIcons();
}

function hideCardioViews(): void {
  const cardioViews = [
    'cardioSelectorView',
    'cardioConfigView',
    'cardioTimerView',
    'cardioSummaryView',
  ];

  cardioViews.forEach((id) => {
    const view = document.getElementById(id);
    if (view) {
      view.classList.add('hidden');
    }
  });
}

function updateBottomNav(activeTab: TabName | 'home'): void {
  // La tab bar FIERRO marca el activo con aria-current: el punto Fragua y el
  // label en acento cuelgan de ese atributo, no de una clase.
  document.querySelectorAll('[data-nav]').forEach((item) => {
    const navType = (item as HTMLElement).dataset.nav;
    if (navType === activeTab) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function loadTabData(tabName: TabName): void {
  switch (tabName) {
    case 'history':
      loadHistory();
      break;
    case 'prs':
      loadPRs();
      break;
    case 'charts':
      initializeCharts();
      break;
    case 'calculators':
      initializeCalculators();
      break;
    case 'profile':
      loadProfile();
      break;
  }
}

// ==========================================
// UI DEL HOME
// ==========================================

function updateHomeUI(): void {
  updateHeroSection();
  updateResumeWorkoutCard();
}

function updateHeroSection(): void {
  const heroContent = document.getElementById('heroContent');
  if (!heroContent) return;

  // Get comprehensive stats
  const { hasDraft } = checkForExistingDraft();
  const stats = getQuickHomeStats();
  const recentPR = getRecentPR();
  const weeklyVolume = getWeeklyVolume();

  // Time-based greeting
  const hour = new Date().getHours();
  let greeting = 'Hola';
  let timeIcon = 'sun';
  if (hour < 12) {
    greeting = 'Buenos días';
    timeIcon = 'sun';
  } else if (hour < 18) {
    greeting = 'Buenas tardes';
    timeIcon = 'cloud-sun';
  } else {
    greeting = 'Buenas noches';
    timeIcon = 'moon';
  }

  // Generate ML-powered insight
  const insight = generateInsight(hasDraft, stats);
  const heroGradient = insight.gradient;
  const accentGradient = insight.accentGradient;
  const statusIcon = insight.icon;

  // Build stats display - more vibrant
  const statsHtml = stats.totalWorkouts > 0 ? `
    <div class="grid grid-cols-3 gap-2 mt-5">
      <div class="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-xl p-2 text-center overflow-hidden">
        <p class="text-2xl font-bold text-blue-400 truncate">${stats.totalWorkouts}</p>
        <p class="text-[10px] text-blue-300/80 font-medium truncate">Entrenos</p>
      </div>
      <div class="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/30 rounded-xl p-2 text-center overflow-hidden">
        <p class="text-2xl font-bold text-orange-400 truncate">${stats.streak}</p>
        <p class="text-[10px] text-orange-300/80 font-medium truncate">Racha</p>
      </div>
      <div class="bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-xl p-2 text-center overflow-hidden">
        <p class="text-2xl font-bold text-emerald-400 truncate">${formatVolume(weeklyVolume)}</p>
        <p class="text-[10px] text-emerald-300/80 font-medium truncate">Kg/Sem</p>
      </div>
    </div>
  ` : `
    <div class="mt-5 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-4 text-center">
      <p class="text-cyan-400 font-medium">✨ Comienza tu primer entrenamiento</p>
      <p class="text-sm text-cyan-300/60 mt-1">Elige una rutina abajo para empezar</p>
    </div>
  `;

  // Recent PR display - celebratory!
  const prHtml = recentPR ? `
    <div class="mt-4 bg-gradient-to-r from-yellow-500/20 via-amber-500/15 to-orange-500/20 border border-yellow-500/40 rounded-xl p-3 overflow-hidden">
      <div class="flex items-center gap-2">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-yellow-500/30">
          <i data-lucide="trophy" class="w-5 h-5 text-white"></i>
        </div>
        <div class="flex-1 min-w-0 overflow-hidden">
          <p class="text-[10px] text-yellow-400 font-bold uppercase tracking-wide truncate flex items-center gap-1">
            <i data-lucide="trophy" class="w-3 h-3"></i> PR Reciente!
          </p>
          <p class="text-sm text-white font-bold truncate">${recentPR.exercise}</p>
          <p class="text-xs text-yellow-300/80 font-semibold truncate">${recentPR.weight}kg x ${recentPR.reps} reps</p>
        </div>
      </div>
    </div>
  ` : '';

  heroContent.innerHTML = `
    <div class="bg-gradient-to-br ${heroGradient} border border-white/10 rounded-2xl p-5 relative overflow-hidden shadow-xl">
      <!-- Animated decorative elements -->
      <div class="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${accentGradient} rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/2 animate-pulse"></div>
      <div class="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-br ${accentGradient} rounded-full blur-3xl opacity-20 translate-y-1/2 -translate-x-1/2"></div>

      <!-- Header -->
      <div class="relative">
        <div class="flex items-center justify-between mb-2">
          <p class="text-base text-white/80 flex items-center gap-1.5">
            <i data-lucide="${timeIcon}" class="w-4 h-4"></i>
            ${greeting}
          </p>
          <div class="flex items-center gap-1 px-2 py-1 bg-white/10 rounded-full">
            <i data-lucide="${statusIcon}" class="w-4 h-4 text-white/80"></i>
          </div>
        </div>
        <h1 class="text-3xl font-display font-bold text-white mb-3">GymMate</h1>

        <!-- ML Insight banner -->
        <div class="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-3">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <i data-lucide="${insight.icon}" class="w-4 h-4 ${insight.textClass}"></i>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-white">${insight.message}</p>
              ${insight.subtext ? `<p class="text-xs text-white/60 mt-0.5">${insight.subtext}</p>` : ''}
            </div>
          </div>
        </div>

        ${statsHtml}
        ${prHtml}
      </div>
    </div>
  `;

  refreshIcons();
}

function getRecentPR(): { exercise: string; weight: number; reps: number } | null {
  try {
    const prs = JSON.parse(localStorage.getItem('gymmate_prs') || '{}');
    const entries = Object.entries(prs);

    if (entries.length === 0) return null;

    // Get the most recent PR by date
    type PREntry = { exercise: string; weight: number; reps: number; date: string };
    let mostRecent: PREntry | null = null;

    for (const [exercise, data] of entries) {
      const prData = data as { peso: number; reps: number; date: string };
      const current: PREntry = {
        exercise,
        weight: prData.peso,
        reps: prData.reps,
        date: prData.date,
      };

      if (!mostRecent || new Date(current.date) > new Date(mostRecent.date)) {
        mostRecent = current;
      }
    }

    // Only show if PR is from last 30 days
    if (mostRecent) {
      const daysSincePR = Math.floor(
        (new Date().getTime() - new Date(mostRecent.date).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSincePR <= 30) {
        return { exercise: mostRecent.exercise, weight: mostRecent.weight, reps: mostRecent.reps };
      }
    }
  } catch (e) {
    console.error('Error getting recent PR:', e);
  }

  return null;
}

function getWeeklyVolume(): number {
  const history: HistorySession[] = JSON.parse(localStorage.getItem('gymmate_history') || '[]');
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  return history
    .filter((s) => s.type !== 'cardio' && new Date(s.savedAt || s.date) >= oneWeekAgo)
    .reduce((sum, s) => sum + (s.volumenTotal || 0), 0);
}

function formatVolume(vol: number): string {
  if (vol >= 1000) {
    return (vol / 1000).toFixed(1) + 'k';
  }
  return vol.toString();
}

function updateResumeWorkoutCard(): void {
  // El banner de borrador vive dentro de H-01 (src/ui/home.ts). Repintar la
  // pantalla lo actualiza; ya no hay un #resumeWorkoutCard suelto.
  renderizarHome();
}

function getQuickHomeStats(): {
  totalWorkouts: number;
  streak: number;
  daysSinceLastWorkout: number;
} {
  const history: HistorySession[] = JSON.parse(localStorage.getItem('gymmate_history') || '[]');
  const weightSessions = history.filter((s) => s.type !== 'cardio');

  let streak = 0;
  let daysSinceLastWorkout = 0;

  if (weightSessions.length > 0) {
    const lastWorkout = new Date(weightSessions[0].savedAt || weightSessions[0].date);
    const today = new Date();
    daysSinceLastWorkout = Math.floor(
      (today.getTime() - lastWorkout.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calcular racha
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateString = checkDate.toISOString().split('T')[0];

      const hasWorkout = weightSessions.some((s) => {
        const sessionDate = new Date(s.savedAt || s.date).toISOString().split('T')[0];
        return sessionDate === dateString;
      });

      if (hasWorkout) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
  }

  return {
    totalWorkouts: weightSessions.length,
    streak,
    daysSinceLastWorkout,
  };
}

// ==========================================
// DRAFT MANAGEMENT
// ==========================================

export function resumeDraft(): void {
  const { draft } = checkForExistingDraft();
  if (draft) {
    restoreFromDraft(draft);
    switchTab('workout');
    // Renderizar el workout con los datos del draft
    import('@/features/workout').then(({ renderFromDraft }) => {
      renderFromDraft();
    });
  }
}

export async function dismissDraft(): Promise<void> {
  const descartar = await confirmarDestructivo({
    titulo: '¿Descartar la sesión?',
    cuerpo: `${describirBorrador()} Esto no se puede deshacer — el borrador desaparece.`,
    cancelar: 'Seguir entrenando',
    confirmar: 'Descartar',
  });
  if (!descartar) return;
  endSession(); // Limpia draft y resetea sesión
  updateResumeWorkoutCard();
  mostrarToast({ tipo: 'exito', titulo: 'Borrador descartado' });
}

// ==========================================
// INICIALIZAR NAVEGACIÓN
// ==========================================

export function initializeNavigation(): void {
  // Navegación inferior
  document.querySelectorAll('[data-nav]').forEach((item) => {
    item.addEventListener('click', function (this: HTMLElement) {
      // 'progress' no es un TabName: es la pestana nueva de FIERRO.
      const navType = this.dataset.nav as TabName | 'home' | 'progress';
      if (navType === 'home') {
        void showHome();
      } else if (navType === 'progress') {
        // GM-01 se construye en la fase 8; hasta entonces PROGRESO abre la
        // vista de gamificacion que ya existe, para no dejar la pestana muerta.
        (window as unknown as { showGamificationModal?: () => void }).showGamificationModal?.();
      } else {
        switchTab(navType as TabName);
      }
    });
  });

  // Rutinas clicables
  document.querySelectorAll('[data-grupo]').forEach((card) => {
    card.addEventListener('click', function (this: HTMLElement) {
      const grupo = this.dataset.grupo;
      if (grupo) {
        // Import dinámico para evitar dependencia circular
        void import('@/features/workout')
          .then(({ loadTrainingGroup }) => loadTrainingGroup(grupo))
          .then((cargada) => cargada && switchTab('workout'))
          .catch((e) => console.error('No se pudo cargar la rutina', e));
      }
    });
  });

  // Quick actions
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', function (this: HTMLElement) {
      const action = this.dataset.action as TabName;
      switchTab(action);
    });
  });

  // FAB button - open workout builder to create custom routine
  const fabButton = document.getElementById('fabButton');
  fabButton?.addEventListener('click', () => {
    // Use window to access the function from main.ts
    if (typeof (window as any).openWorkoutBuilder === 'function') {
      (window as any).openWorkoutBuilder();
    }
  });
}
