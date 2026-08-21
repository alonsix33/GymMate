// ==========================================
// GAMIFICATION UI COMPONENTS
// ==========================================

import {
  getPlayerStats,
  getMuscleRanks,
  getCurrentLevelProgress,
  getStreakInfo,
  getAchievementsProgress,
  getAchievements,
  RANK_COLORS,
  RANK_DISPLAY_NAMES,
} from '@/features/gamification';
import { renderLevelBadge, renderLevelBadgeWithProgress } from './level-badge';
import { renderMuscleMapDual } from './muscle-map';
import { renderAllRanksLegend } from './rank-emblem';
import { icon, refreshIcons } from '@/utils/icons';

/**
 * Renderiza el widget de gamificacion para el header
 */
export function renderGamificationHeader(): string {
  const stats = getPlayerStats();
  const progress = getCurrentLevelProgress();
  const streak = getStreakInfo();

  return `
    <div
      class="gamification-header flex items-center gap-2 cursor-pointer"
      onclick="window.showGamificationModal && window.showGamificationModal()"
    >
      <div class="w-9 h-9">
        ${renderLevelBadge(stats.level, 36)}
      </div>
      <div class="hidden sm:flex flex-col">
        <div class="flex items-center gap-1">
          <span class="text-xs font-bold" style="color: ${stats.titleInfo.color}">${stats.level}</span>
          ${streak.current >= 3 ? `<span class="flex items-center gap-0.5 text-[10px] text-orange-400">${icon('fire', 'sm')}${streak.current}</span>` : ''}
        </div>
        <div class="w-16 h-1 bg-dark-border rounded-full overflow-hidden">
          <div
            class="h-full rounded-full"
            style="width: ${progress.percentage}%; background-color: ${stats.titleInfo.color}"
          ></div>
        </div>
      </div>
    </div>
  `;
}

/* renderGamificationHeroCard se retiro con FIERRO: su unico consumidor era
   renderGamificationInHome, y la card de nivel de H-01 la pinta ahora
   src/ui/home.ts. */

/**
 * Renderiza el modal completo de gamificacion
 */
export function renderGamificationModal(): string {
  const stats = getPlayerStats();
  const muscleRanks = getMuscleRanks();
  const progress = getCurrentLevelProgress();
  const streak = getStreakInfo();
  const achievementProgress = getAchievementsProgress();

  return `
    <div id="gamification-modal" class="fixed inset-0 bg-black/90 z-50 overflow-y-auto">
      <div class="min-h-screen p-4">
        <!-- Header -->
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-bold">Progreso</h2>
          <button
            onclick="window.hideGamificationModal && window.hideGamificationModal()"
            class="p-2 hover:bg-dark-surface rounded-full"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Seccion Nivel -->
        <div class="bg-dark-surface rounded-2xl p-4 mb-4">
          <h3 class="text-sm font-medium text-gray-400 mb-3">NIVEL DE CUENTA</h3>
          ${renderLevelBadgeWithProgress(stats.level, progress.currentXP, progress.maxXP)}

          <!-- Stats -->
          <div class="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-dark-border">
            <div class="text-center">
              <div class="text-2xl font-bold" style="color: ${stats.titleInfo.color}">${stats.totalXP.toLocaleString()}</div>
              <div class="text-xs text-gray-500">XP Total</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-orange-400">${streak.current}</div>
              <div class="text-xs text-gray-500">Racha actual</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-purple-400">${streak.best}</div>
              <div class="text-xs text-gray-500">Mejor racha</div>
            </div>
          </div>
        </div>

        <!-- Seccion Rangos Musculares -->
        <div class="bg-dark-surface rounded-2xl p-4 mb-4">
          <h3 class="text-sm font-medium text-gray-400 mb-3">RANGOS MUSCULARES</h3>

          <!-- Dual body map (front + back) -->
          <div class="flex justify-center mb-4">
            ${renderMuscleMapDual(muscleRanks, 280, 200)}
          </div>

          <!-- Legend grid -->
          <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            ${[
              { key: 'pecho', label: 'Pecho' },
              { key: 'espalda', label: 'Espalda' },
              { key: 'hombros', label: 'Hombros' },
              { key: 'biceps', label: 'Bíceps' },
              { key: 'triceps', label: 'Tríceps' },
              { key: 'core', label: 'Core' },
              { key: 'gluteos', label: 'Glúteos' },
              { key: 'piernas', label: 'Piernas' },
            ].map(({ key, label }) => {
              const data = muscleRanks[key as keyof typeof muscleRanks];
              const colors = RANK_COLORS[data.rank];
              const displayName = RANK_DISPLAY_NAMES[data.rank];
              const isSimetrico = data.rank === 'Simetrico';
              const rankClass = isSimetrico ? 'text-shiny' : 'font-medium';
              const rankStyle = isSimetrico ? '' : `style="color: ${colors.fill}"`;
              return `
                <div class="flex items-center justify-between">
                  <span class="text-gray-400">${label}</span>
                  <span class="${rankClass}" ${rankStyle}>${displayName}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Seccion Logros -->
        <div class="bg-dark-surface rounded-2xl p-4 mb-3">
          <button
            class="w-full flex items-center justify-between"
            onclick="window.toggleSection && window.toggleSection('achievements')"
          >
            <div class="flex items-center gap-2">
              <span class="text-yellow-400">${icon('award', 'sm')}</span>
              <h3 class="text-sm font-medium text-white">Logros</h3>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-yellow-400">${achievementProgress.unlocked}/${achievementProgress.total}</span>
              <span id="achievements-chevron" class="text-gray-400 transition-transform duration-200">
                ${icon('chevronDown', 'sm')}
              </span>
            </div>
          </button>

          <!-- Collapsed summary -->
          <div id="achievements-summary" class="mt-3">
            <div class="h-1.5 bg-dark-border rounded-full overflow-hidden">
              <div
                class="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400"
                style="width: ${achievementProgress.percentage}%"
              ></div>
            </div>
          </div>

          <!-- Expanded list -->
          <div id="achievements-expanded" class="hidden mt-4">
            ${renderAchievementsList()}
          </div>
        </div>

        <!-- Guia de Rangos -->
        <div class="bg-dark-surface rounded-2xl p-4 mb-3">
          <button
            class="w-full flex items-center justify-between"
            onclick="window.toggleSection && window.toggleSection('ranks')"
          >
            <div class="flex items-center gap-2">
              <span class="text-purple-400">${icon('info', 'sm')}</span>
              <h3 class="text-sm font-medium text-white">Guía de Rangos</h3>
            </div>
            <span id="ranks-chevron" class="text-gray-400 transition-transform duration-200">
              ${icon('chevronDown', 'sm')}
            </span>
          </button>

          <!-- Collapsed hint -->
          <div id="ranks-summary" class="mt-2">
            <p class="text-xs text-gray-500">Fuerza relativa: 1RM / peso corporal</p>
          </div>

          <!-- Expanded content -->
          <div id="ranks-expanded" class="hidden mt-3">
            ${renderAllRanksLegend()}
          </div>
        </div>

        <!-- Guia de Niveles -->
        <div class="bg-dark-surface rounded-2xl p-4 mb-3">
          <button
            class="w-full flex items-center justify-between"
            onclick="window.toggleSection && window.toggleSection('levels')"
          >
            <div class="flex items-center gap-2">
              <span class="text-blue-400">${icon('info', 'sm')}</span>
              <h3 class="text-sm font-medium text-white">Guía de Niveles</h3>
            </div>
            <span id="levels-chevron" class="text-gray-400 transition-transform duration-200">
              ${icon('chevronDown', 'sm')}
            </span>
          </button>

          <!-- Collapsed hint -->
          <div id="levels-summary" class="mt-2">
            <p class="text-xs text-gray-500">XP por entrenamientos, PRs y rachas</p>
          </div>

          <!-- Expanded content -->
          <div id="levels-expanded" class="hidden mt-3">
            ${renderLevelsGuide()}
          </div>
        </div>

        <!-- Herramientas -->
        <div class="bg-dark-surface rounded-2xl p-4">
          <button
            class="w-full flex items-center justify-between"
            onclick="window.toggleSection && window.toggleSection('tools')"
          >
            <div class="flex items-center gap-2">
              <span class="text-gray-400">${icon('settings', 'sm')}</span>
              <h3 class="text-sm font-medium text-white">Herramientas</h3>
            </div>
            <span id="tools-chevron" class="text-gray-400 transition-transform duration-200">
              ${icon('chevronDown', 'sm')}
            </span>
          </button>

          <!-- Collapsed hint -->
          <div id="tools-summary" class="mt-2">
            <p class="text-xs text-gray-500">Opciones de mantenimiento</p>
          </div>

          <!-- Expanded content -->
          <div id="tools-expanded" class="hidden mt-3">
            <div class="space-y-3">
              <div class="p-3 bg-dark-bg/50 rounded-lg">
                <div class="flex items-start gap-3">
                  <span class="text-yellow-400 mt-0.5">${icon('refresh', 'sm')}</span>
                  <div class="flex-1">
                    <p class="text-sm text-white font-medium">Recalcular XP</p>
                    <p class="text-xs text-gray-500 mt-1">
                      Recalcula todo el XP desde el historial. Útil si falta XP de alguna sesión.
                    </p>
                    <button
                      onclick="window.recalculateXP && window.recalculateXP()"
                      class="mt-2 px-3 py-1.5 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded-lg active:scale-95 transition-transform"
                    >
                      Recalcular ahora
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Categoria labels for achievements
 */
const CATEGORY_LABELS: Record<string, string> = {
  sesiones: 'Sesiones',
  volumen: 'Volumen',
  prs: 'Récords Personales',
  rachas: 'Rachas',
  rangos: 'Rangos',
  especial: 'Especiales',
};

/**
 * Renderiza la lista completa de logros
 */
function renderAchievementsList(): string {
  const achievements = getAchievements();

  // Group by category
  const byCategory: Record<string, typeof achievements> = {};
  for (const achievement of achievements) {
    const cat = achievement.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(achievement);
  }

  // Render each category
  const categories = ['sesiones', 'volumen', 'prs', 'rachas', 'rangos', 'especial'];

  return categories.map(cat => {
    const items = byCategory[cat] || [];
    if (items.length === 0) return '';

    const completed = items.filter(a => a.unlockedAt);
    const pending = items.filter(a => !a.unlockedAt);

    return `
      <div class="mb-4 last:mb-0">
        <div class="text-xs font-medium text-gray-500 mb-2">${CATEGORY_LABELS[cat]}</div>
        <div class="space-y-2">
          ${[...completed, ...pending].map(achievement => {
            const isUnlocked = !!achievement.unlockedAt;
            return `
              <div class="flex items-start gap-3 p-2 rounded-lg ${isUnlocked ? 'bg-dark-bg/50' : ''}">
                <div class="flex-shrink-0 mt-0.5 ${isUnlocked ? 'text-green-400' : 'text-gray-600'}">
                  ${isUnlocked ? icon('check', 'sm') : icon('target', 'sm')}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="${isUnlocked ? 'text-white' : 'text-gray-400'} font-medium text-sm">
                      ${achievement.name}
                    </span>
                    <span class="text-xs ${isUnlocked ? 'text-yellow-400' : 'text-gray-600'}">
                      +${achievement.xpReward} XP
                    </span>
                  </div>
                  <div class="text-xs ${isUnlocked ? 'text-gray-400' : 'text-gray-600'}">
                    ${achievement.description}
                  </div>
                  ${!isUnlocked && achievement.progress !== undefined && achievement.target ? `
                    <div class="mt-1 flex items-center gap-2">
                      <div class="flex-1 h-1 bg-dark-border rounded-full overflow-hidden">
                        <div
                          class="h-full rounded-full bg-gray-500"
                          style="width: ${Math.min(100, (achievement.progress / achievement.target) * 100)}%"
                        ></div>
                      </div>
                      <span class="text-[10px] text-gray-500">
                        ${achievement.progress}/${achievement.target}
                      </span>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renderiza la guía de niveles con badges visuales
 */
function renderLevelsGuide(): string {
  const levels = [
    { name: 'Principiante', range: '1-16', color: '#6B7280', subniveles: 'I-V' },
    { name: 'Novato', range: '17-33', color: '#22C55E', subniveles: 'I-V' },
    { name: 'Intermedio', range: '34-50', color: '#3B82F6', subniveles: 'I-V' },
    { name: 'Avanzado', range: '51-66', color: '#8B5CF6', subniveles: 'I-V' },
    { name: 'Élite', range: '67-83', color: '#F59E0B', subniveles: 'I-V' },
    { name: 'Legendario', range: '84-99', color: '#EF4444', subniveles: 'I-V' },
    { name: 'Simétrico', range: '100', color: '#3B82F6', subniveles: '', special: true },
  ];

  return `
    <div class="grid grid-cols-2 gap-2">
      ${levels.map(({ name, range, color, subniveles, special }) => `
        <div class="flex items-center gap-2 bg-dark-bg/30 rounded-lg px-2.5 py-2 ${special ? 'col-span-2 justify-center' : ''}">
          <div class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${color}; ${special ? 'box-shadow: 0 0 8px ' + color : ''}"></div>
          <div class="${special ? 'text-center' : ''}">
            <span class="text-xs ${special ? 'text-shiny' : 'font-medium'}" style="${!special ? 'color: ' + color : ''}">
              ${name}${subniveles ? ' ' + subniveles : ''}
            </span>
            <span class="text-[10px] text-gray-500 ml-1">Nv. ${range}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Toggle section expanded state (generic)
 */
function toggleSection(sectionId: string): void {
  const summary = document.getElementById(`${sectionId}-summary`);
  const expanded = document.getElementById(`${sectionId}-expanded`);
  const chevron = document.getElementById(`${sectionId}-chevron`);

  if (summary && expanded && chevron) {
    const isExpanded = !expanded.classList.contains('hidden');

    if (isExpanded) {
      expanded.classList.add('hidden');
      summary.classList.remove('hidden');
      chevron.style.transform = 'rotate(0deg)';
    } else {
      expanded.classList.remove('hidden');
      summary.classList.add('hidden');
      chevron.style.transform = 'rotate(180deg)';
      refreshIcons();
    }
  }
}

/**
 * Muestra el modal de gamificacion
 */
/**
 * La tab bar marca el destino activo con aria-current (el punto Fragua y el
 * label en acento cuelgan de ese atributo). PROGRESO abre un modal, no un
 * tab, asi que sin esto la pestana se quedaba siempre apagada aunque su
 * pantalla estuviese delante.
 *
 * La pestana anterior se recuerda en una variable de modulo, no en un
 * data-* del DOM: con el marcador en el DOM, cerrar dos veces seguidas (un
 * doble toque cae dentro de los 200ms de la animacion de salida) borraba el
 * marcador en la primera pasada y la segunda caia a un "vuelve a INICIO"
 * incondicional, dejando DOS pestanas encendidas a la vez. Aqui la funcion es
 * idempotente: al salir siempre queda exactamente un aria-current.
 */
let pestanaPrevia: string | null = null;

function marcarPestanaProgreso(activa: boolean): void {
  const items = [...document.querySelectorAll<HTMLElement>('[data-nav]')];
  const progreso = items.find((i) => i.dataset.nav === 'progress');
  if (!progreso) return;

  if (activa) {
    if (progreso.getAttribute('aria-current') !== 'page') {
      pestanaPrevia = items.find((i) => i.hasAttribute('aria-current'))?.dataset.nav ?? 'home';
    }
    items.forEach((i) => i.removeAttribute('aria-current'));
    progreso.setAttribute('aria-current', 'page');
    return;
  }

  // Salir solo tiene efecto si PROGRESO era la activa. Si no, la barra ya
  // esta donde debe y tocarla solo puede estropearla.
  if (progreso.getAttribute('aria-current') !== 'page') return;
  const destino = items.find((i) => i.dataset.nav === (pestanaPrevia ?? 'home')) ?? items[0];
  items.forEach((i) => i.removeAttribute('aria-current'));
  destino?.setAttribute('aria-current', 'page');
  pestanaPrevia = null;
}

export function showGamificationModal(): void {
  const existing = document.getElementById('gamification-modal');
  if (existing) {
    existing.remove();
  }

  const modal = document.createElement('div');
  modal.innerHTML = renderGamificationModal();
  document.body.appendChild(modal.firstElementChild as Node);

  marcarPestanaProgreso(true);

  // Animar entrada y refrescar iconos
  requestAnimationFrame(() => {
    const modalEl = document.getElementById('gamification-modal');
    if (modalEl) {
      modalEl.classList.add('animate-fade-in');
    }
    refreshIcons();
  });
}

/**
 * Oculta el modal de gamificacion
 */
export function hideGamificationModal(): void {
  const modal = document.getElementById('gamification-modal');
  // Sin modal no hay nada que cerrar: llamar igualmente movia la tab bar.
  if (!modal) return;
  marcarPestanaProgreso(false);
  modal.classList.add('animate-fade-out');
  // Se saca del DOM al instante para que un segundo cierre no lo encuentre;
  // la animacion la hace el nodo ya desconectado del arbol de la barra.
  modal.id = '';
  setTimeout(() => modal.remove(), 200);
}

// Exponer funciones globalmente para onclick handlers
if (typeof window !== 'undefined') {
  (window as any).showGamificationModal = showGamificationModal;
  (window as any).hideGamificationModal = hideGamificationModal;
  (window as any).toggleSection = toggleSection;
}
