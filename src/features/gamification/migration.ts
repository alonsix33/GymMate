// ==========================================
// DATA MIGRATION FOR GAMIFICATION
// ==========================================

import type {
  GamificationState,
  XPTransaction,
  GamificationMuscleGroup,
} from '@/types/gamification';
import type { HistorySession, PRData } from '@/types';
import { getHistory, getPRs, getProfile } from '@/utils/storage';
import { allExercises } from '@/data/exercises';
import {
  XP_WORKOUT_COMPLETE,
  PR_XP,
  DEFAULT_BODYWEIGHT,
  GAMIFICATION_SCHEMA_VERSION,
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_XP_V2,
} from './constants';
import {
  calculateVolumeXP,
  generateTransactionId,
  calculateCurrentStreak,
  calculateCardioSessionXP,
} from './xp';
import { calculateLevel, getLevelProgress, getLevelTitle } from './levels';
import { calculateAllMuscleRanks, toGamificationMuscle } from './muscle-ranks';
import { initializeAchievements, checkAchievements } from './achievements';
import { createInitialMuscleRanks } from './muscle-ranks';

/**
 * Construye el mapeo de ejercicio a grupo muscular
 */
function buildExerciseToMuscleMap(): Record<string, GamificationMuscleGroup> {
  const map: Record<string, GamificationMuscleGroup> = {};

  for (const exercise of allExercises) {
    const gamificationMuscle = toGamificationMuscle(exercise.grupoMuscular);
    if (gamificationMuscle) {
      map[exercise.nombre] = gamificationMuscle;
    }
  }

  return map;
}

/**
 * Migra los datos existentes a un estado de gamificacion completo
 * Esta funcion lee el historial, PRs y perfil existentes y calcula
 * todo el XP retroactivo
 */
export function migrateExistingData(): GamificationState {
  const now = new Date().toISOString();
  const history = getHistory();
  const prs = getPRs();
  const profile = getProfile();
  const bodyweight = profile.weight || DEFAULT_BODYWEIGHT;

  // Construir mapeo de ejercicios
  const exerciseToMuscle = buildExerciseToMuscleMap();

  // Agregar ejercicios del historial que no esten en el mapa
  for (const session of history) {
    if (session.ejercicios) {
      for (const ej of session.ejercicios) {
        if (!exerciseToMuscle[ej.nombre] && ej.grupoMuscular) {
          const muscle = toGamificationMuscle(ej.grupoMuscular);
          if (muscle) {
            exerciseToMuscle[ej.nombre] = muscle;
          }
        }
      }
    }
  }

  // Calcular XP retroactivo (entrenamientos + PRs)
  const { totalXP: baseXP, xpTransactions } = calculateRetroactiveXP(history, prs);

  // Calcular rangos musculares
  const { muscleRanks, exerciseStrengths } = prs && Object.keys(prs).length > 0
    ? calculateAllMuscleRanks(prs, exerciseToMuscle, bodyweight)
    : { muscleRanks: createInitialMuscleRanks(), exerciseStrengths: {} };

  // Calcular racha actual
  // Solo pesas: el cardio no suma racha (cambio aprobado nº 4).
  const currentStreak = calculateCurrentStreak(history.filter((s) => s.type !== 'cardio'));

  // Inicializar y verificar logros
  const initialAchievements = initializeAchievements();
  const { achievements } = checkAchievements(
    initialAchievements,
    history,
    prs,
    muscleRanks,
    currentStreak
  );

  // Calcular XP de logros desbloqueados y añadirlo al total
  let achievementXP = 0;
  for (const achievement of achievements) {
    if (achievement.unlockedAt) {
      achievementXP += achievement.xpReward;
    }
  }

  // XP total = entrenamientos + PRs + logros
  const totalXP = baseXP + achievementXP;

  // Registrar XP de logros en transacciones si hay alguno
  if (achievementXP > 0) {
    const unlockedCount = achievements.filter(a => a.unlockedAt).length;
    xpTransactions.push({
      id: generateTransactionId(),
      amount: achievementXP,
      source: 'migration',
      description: `${unlockedCount} logros desbloqueados`,
      timestamp: new Date().toISOString(),
    });
  }

  // Calcular nivel con XP total (incluyendo logros)
  const level = calculateLevel(totalXP);
  const progress = getLevelProgress(totalXP);
  const titleInfo = getLevelTitle(level);

  // Construir estado completo
  const state: GamificationState = {
    version: GAMIFICATION_SCHEMA_VERSION,
    playerStats: {
      totalXP,
      level,
      titleInfo,
      currentLevelXP: progress.currentXP,
      xpToNextLevel: progress.maxXP,
      createdAt: history.length > 0
        ? history[history.length - 1].date
        : now,
      lastUpdated: now,
    },
    muscleRanks,
    exerciseStrengths,
    achievements,
    xpHistory: xpTransactions.slice(-100), // Ultimas 100
    streakData: {
      currentStreak,
      bestStreak: currentStreak, // Inicializar con actual
      lastWorkoutDate: history.length > 0 ? history[0].date : null,
      streakMilestones: [], // No reclamar milestones en migracion
    },
    initialized: true,
    migratedAt: now,
  };

  return state;
}

/**
 * Calcula el XP retroactivo de todo el historial
 */
function calculateRetroactiveXP(
  history: HistorySession[],
  prs: Record<string, PRData>
): {
  totalXP: number;
  xpTransactions: XPTransaction[];
} {
  const transactions: XPTransaction[] = [];
  let totalXP = 0;

  // Ordenar historial por fecha (mas antiguo primero)
  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // XP por cada sesion
  for (const session of sortedHistory) {
    if (session.type === 'cardio') {
      // Sesion de cardio
      const cardioXP = calculateCardioSessionXP(session);
      totalXP += cardioXP.totalXP;

      const modeNames: Record<string, string> = {
        tabata: 'Tabata',
        emom: 'EMOM',
        amrap: 'AMRAP',
        circuit: 'Circuito',
        pyramid: 'Pirámide',
        custom: 'Personalizado',
        fortime: 'For Time',
      };
      const modeName = modeNames[session.mode || 'custom'] || 'Cardio';

      transactions.push({
        id: generateTransactionId(),
        amount: cardioXP.totalXP,
        source: 'migration',
        description: `Cardio ${modeName}`,
        timestamp: session.date,
        sessionId: session.sessionId,
      });
    } else {
      // Sesion de pesas
      // XP base por completar
      totalXP += XP_WORKOUT_COMPLETE;

      // XP por volumen
      const volumeXP = calculateVolumeXP(session.volumenTotal || 0);
      totalXP += volumeXP;

      // Registrar transaccion
      transactions.push({
        id: generateTransactionId(),
        amount: XP_WORKOUT_COMPLETE + volumeXP,
        source: 'migration',
        description: `Sesion ${session.grupo || 'Entrenamiento'}`,
        timestamp: session.date,
        sessionId: session.sessionId,
      });
    }
  }

  // XP por PRs existentes (asumimos PR menor promedio)
  const prCount = Object.keys(prs).length;
  if (prCount > 0) {
    const prXP = prCount * PR_XP.minor;
    totalXP += prXP;

    transactions.push({
      id: generateTransactionId(),
      amount: prXP,
      source: 'migration',
      description: `${prCount} PRs historicos`,
      timestamp: new Date().toISOString(),
    });
  }

  return { totalXP, xpTransactions: transactions };
}

/**
 * Verifica si la migracion es necesaria
 */
export function needsMigration(): boolean {
  try {
    const saved = localStorage.getItem('gymmate_gamification');
    if (!saved) return true;

    const state = JSON.parse(saved) as GamificationState;
    if (!state.initialized) return true;

    // Check if schema version needs update
    if ((state.version || 1) < GAMIFICATION_SCHEMA_VERSION) return true;

    return false;
  } catch {
    return true;
  }
}

/**
 * Migra el estado de v1 a v2
 * - Añade XP de logros (bug fix: nunca se añadió en v1)
 * - Actualiza XP rewards a los nuevos valores
 * - Añade el nuevo logro "first_simetrico"
 */
export function migrateV1toV2(state: GamificationState): GamificationState {
  if ((state.version || 1) >= 2) return state;

  let totalAchievementXP = 0;

  // Add missing "first_simetrico" achievement if not present
  const hasFirstSimetrico = state.achievements.some(a => a.id === 'first_simetrico');
  if (!hasFirstSimetrico) {
    const simetricoDef = ACHIEVEMENT_DEFINITIONS.find(d => d.id === 'first_simetrico');
    if (simetricoDef) {
      // Check if already has Simetrico rank in any muscle
      const hasSimetricoRank = Object.values(state.muscleRanks).some(
        m => m.rank === 'Simetrico'
      );

      state.achievements.push({
        ...simetricoDef,
        unlockedAt: hasSimetricoRank ? new Date().toISOString() : undefined,
        progress: hasSimetricoRank ? 1 : 0,
      });
    }
  }

  // Update all achievement XP rewards to new values AND calculate total XP
  // Bug fix: In v1, achievement XP was never added to totalXP
  for (const achievement of state.achievements) {
    const newDef = ACHIEVEMENT_DEFINITIONS.find(d => d.id === achievement.id);
    if (newDef) {
      achievement.xpReward = newDef.xpReward;

      // Add FULL achievement XP (not difference) because v1 never added it
      if (achievement.unlockedAt) {
        totalAchievementXP += newDef.xpReward;
      }
    }
  }

  // Update total XP with full achievement XP
  state.playerStats.totalXP += totalAchievementXP;

  // Recalculate level with new XP
  const newLevel = calculateLevel(state.playerStats.totalXP);
  const newProgress = getLevelProgress(state.playerStats.totalXP);
  const newTitle = getLevelTitle(newLevel);

  state.playerStats.level = newLevel;
  state.playerStats.titleInfo = newTitle;
  state.playerStats.currentLevelXP = newProgress.currentXP;
  state.playerStats.xpToNextLevel = newProgress.maxXP;
  state.playerStats.lastUpdated = new Date().toISOString();

  // Update version
  state.version = 2;

  // Add migration transaction if XP changed
  if (totalAchievementXP > 0) {
    const unlockedCount = state.achievements.filter(a => a.unlockedAt).length;
    state.xpHistory.push({
      id: generateTransactionId(),
      amount: totalAchievementXP,
      source: 'migration',
      description: `${unlockedCount} logros (+${totalAchievementXP.toLocaleString()} XP)`,
      timestamp: new Date().toISOString(),
    });
  }

  return state;
}

/**
 * Migra el estado de v2 a v3
 * - Reduce XP de logros a ~50% de v2
 * - Recalcula nivel con los nuevos valores
 */
export function migrateV2toV3(state: GamificationState): GamificationState {
  if ((state.version || 1) >= 3) return state;

  // First ensure we're at v2
  if ((state.version || 1) < 2) {
    state = migrateV1toV2(state);
  }

  let xpDifference = 0;

  // Update all achievement XP rewards to new v3 values and calculate difference
  for (const achievement of state.achievements) {
    const oldXP = ACHIEVEMENT_XP_V2[achievement.id] || 0;
    const newDef = ACHIEVEMENT_DEFINITIONS.find(d => d.id === achievement.id);
    const newXP = newDef?.xpReward || 0;

    if (newDef) {
      achievement.xpReward = newXP;
    }

    // Only subtract difference for unlocked achievements
    if (achievement.unlockedAt) {
      xpDifference += oldXP - newXP; // Positive = XP to remove
    }
  }

  // Subtract the difference (reducing total XP)
  state.playerStats.totalXP = Math.max(0, state.playerStats.totalXP - xpDifference);

  // Recalculate level with new XP
  const newLevel = calculateLevel(state.playerStats.totalXP);
  const newProgress = getLevelProgress(state.playerStats.totalXP);
  const newTitle = getLevelTitle(newLevel);

  state.playerStats.level = newLevel;
  state.playerStats.titleInfo = newTitle;
  state.playerStats.currentLevelXP = newProgress.currentXP;
  state.playerStats.xpToNextLevel = newProgress.maxXP;
  state.playerStats.lastUpdated = new Date().toISOString();

  // Update version
  state.version = 3;

  // Add migration transaction if XP changed
  if (xpDifference > 0) {
    state.xpHistory.push({
      id: generateTransactionId(),
      amount: -xpDifference,
      source: 'migration',
      description: `Rebalanceo de logros (-${xpDifference.toLocaleString()} XP)`,
      timestamp: new Date().toISOString(),
    });
  }

  return state;
}

/**
 * Obtiene el mapeo de ejercicio a grupo muscular
 * Usado para ejercicios nuevos o personalizados
 */
export function getExerciseToMuscleMap(): Record<string, GamificationMuscleGroup> {
  return buildExerciseToMuscleMap();
}

/**
 * Agrega un ejercicio personalizado al mapeo
 */
export function addCustomExerciseToMap(
  _exerciseName: string,
  muscleGroup: string
): GamificationMuscleGroup | null {
  return toGamificationMuscle(muscleGroup);
}
