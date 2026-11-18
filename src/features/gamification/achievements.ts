// ==========================================
// ACHIEVEMENTS SYSTEM
// ==========================================

import type {
  Achievement,
  MuscleRanks,
  StrengthRank,
  GamificationMuscleGroup,
} from '@/types/gamification';
import type { HistorySession, PRData } from '@/types';
import { ACHIEVEMENT_DEFINITIONS, RANK_ORDER } from './constants';
import { seriesValidas } from '@/utils/series';

/**
 * Inicializa todos los logros como no desbloqueados
 */
export function initializeAchievements(): Achievement[] {
  return ACHIEVEMENT_DEFINITIONS.map(def => ({
    ...def,
    unlockedAt: undefined,
    progress: 0,
  }));
}

/**
 * Cuenta sesiones completadas
 */
export function countSessions(history: HistorySession[]): number {
  return history.length;
}

/**
 * Calcula volumen total acumulado
 */
export function calculateTotalVolume(history: HistorySession[]): number {
  return history.reduce((total, session) => {
    return total + (session.volumenTotal || 0);
  }, 0);
}

/**
 * Cuenta PRs totales
 */
export function countPRs(prs: Record<string, PRData>): number {
  return Object.keys(prs).length;
}

/**
 * Cuenta ejercicios unicos usados
 */
export function countUniqueExercises(history: HistorySession[]): number {
  const exercises = new Set<string>();
  for (const session of history) {
    if (session.ejercicios) {
      for (const ej of seriesValidas(session.ejercicios)) {
        exercises.add(ej.nombre.toLowerCase());
      }
    }
  }
  return exercises.size;
}

/**
 * Verifica si un musculo tiene cierto rango o superior
 */
function hasRankOrHigher(
  muscleRank: StrengthRank,
  targetRank: StrengthRank
): boolean {
  const muscleIndex = RANK_ORDER.indexOf(muscleRank);
  const targetIndex = RANK_ORDER.indexOf(targetRank);
  return muscleIndex >= targetIndex;
}

/**
 * Cuenta musculos con cierto rango o superior
 */
export function countMusclesWithRank(
  muscleRanks: MuscleRanks,
  targetRank: StrengthRank
): number {
  const muscles: GamificationMuscleGroup[] = [
    'pecho', 'espalda', 'hombros', 'biceps',
    'triceps', 'piernas', 'gluteos', 'core',
  ];

  return muscles.filter(muscle =>
    hasRankOrHigher(muscleRanks[muscle].rank, targetRank)
  ).length;
}

/**
 * Verifica y actualiza el progreso de todos los logros
 */
export function checkAchievements(
  currentAchievements: Achievement[],
  history: HistorySession[],
  prs: Record<string, PRData>,
  muscleRanks: MuscleRanks,
  currentStreak: number
): {
  achievements: Achievement[];
  newlyUnlocked: Achievement[];
} {
  const now = new Date().toISOString();
  const newlyUnlocked: Achievement[] = [];
  const updated = currentAchievements.map(achievement => {
    // Si ya esta desbloqueado, no hacer nada
    if (achievement.unlockedAt) {
      return achievement;
    }

    let progress = 0;
    let unlocked = false;

    switch (achievement.id) {
      // Sesiones
      case 'first_session':
      case 'sessions_10':
      case 'sessions_25':
      case 'sessions_100':
      case 'sessions_500':
      case 'sessions_1000':
        progress = countSessions(history);
        unlocked = progress >= (achievement.target || 0);
        break;

      // Volumen
      case 'volume_100k':
      case 'volume_500k':
      case 'volume_1m':
      case 'volume_5m':
      case 'volume_10m':
        progress = calculateTotalVolume(history);
        unlocked = progress >= (achievement.target || 0);
        break;

      // PRs
      case 'first_pr':
      case 'prs_10':
      case 'prs_50':
      case 'prs_100':
        progress = countPRs(prs);
        unlocked = progress >= (achievement.target || 0);
        break;

      // Rachas
      case 'streak_7':
        progress = currentStreak;
        unlocked = currentStreak >= 7;
        break;
      case 'streak_30':
        progress = currentStreak;
        unlocked = currentStreak >= 30;
        break;
      case 'streak_90':
        progress = currentStreak;
        unlocked = currentStreak >= 90;
        break;

      // Rangos
      case 'first_oro':
        progress = countMusclesWithRank(muscleRanks, 'Oro');
        unlocked = progress >= 1;
        break;
      case 'all_plata':
        progress = countMusclesWithRank(muscleRanks, 'Plata');
        unlocked = progress >= 8;
        break;
      case 'first_diamante':
        progress = countMusclesWithRank(muscleRanks, 'Diamante');
        unlocked = progress >= 1;
        break;
      case 'first_simetrico':
        progress = countMusclesWithRank(muscleRanks, 'Simetrico');
        unlocked = progress >= 1;
        break;
      case 'simetrico':
        progress = countMusclesWithRank(muscleRanks, 'Simetrico');
        unlocked = progress >= 8;
        break;

      // Especiales
      case 'use_10_exercises':
      case 'use_30_exercises':
        progress = countUniqueExercises(history);
        unlocked = progress >= (achievement.target || 0);
        break;
    }

    const updatedAchievement: Achievement = {
      ...achievement,
      progress,
      unlockedAt: unlocked ? now : undefined,
    };

    if (unlocked && !achievement.unlockedAt) {
      newlyUnlocked.push(updatedAchievement);
    }

    return updatedAchievement;
  });

  return { achievements: updated, newlyUnlocked };
}

/**
 * Obtiene logros desbloqueados
 */
export function getUnlockedAchievements(achievements: Achievement[]): Achievement[] {
  return achievements.filter(a => a.unlockedAt);
}

/**
 * Obtiene logros pendientes
 */
export function getPendingAchievements(achievements: Achievement[]): Achievement[] {
  return achievements.filter(a => !a.unlockedAt);
}

/**
 * Obtiene logros por categoria
 */
export function getAchievementsByCategory(
  achievements: Achievement[],
  category: Achievement['category']
): Achievement[] {
  return achievements.filter(a => a.category === category);
}

/**
 * Calcula el progreso general de logros
 */
export function getAchievementProgress(achievements: Achievement[]): {
  unlocked: number;
  total: number;
  percentage: number;
} {
  const unlocked = achievements.filter(a => a.unlockedAt).length;
  const total = achievements.length;
  return {
    unlocked,
    total,
    percentage: total > 0 ? (unlocked / total) * 100 : 0,
  };
}

/**
 * Obtiene el XP total de logros desbloqueados
 */
export function getTotalAchievementXP(achievements: Achievement[]): number {
  return achievements
    .filter(a => a.unlockedAt)
    .reduce((sum, a) => sum + a.xpReward, 0);
}
