// ==========================================
// GAMIFICATION MODULE - MAIN EXPORTS
// ==========================================

import type {
  GamificationState,
  SessionXPSummary,
  GamificationMuscleGroup,
  StrengthRank,
  MuscleRanks,
  PlayerStats,
  LevelTitleInfo,
  Achievement,
} from '@/types/gamification';
import type { HistorySession } from '@/types';
import { getProfile, getPRs, getHistory } from '@/utils/storage';

// Import from submodules
import {
  loadGamificationState,
  saveGamificationState,
  addXPToState,
  updateMuscleRanksInState,
  updateAchievementsInState,
  updateStreakData,
  claimStreakMilestone,
  getXPHistory,
} from './state';

import {
  calculateLevel,
  getLevelProgress,
  getLevelTitle,
  getLevelColor,
  didLevelUp,
  getXPForLevel,
  getXPToNextLevel,
  MAX_LEVEL,
} from './levels';

import {
  calculateVolumeXP,
  calculatePRXP,
  calculateStreakXP,
  calculateSessionXPBreakdown,
  createXPTransaction,
  calculateCurrentStreak,
  calculateCardioSessionXP,
  estimateOneRM,
} from './xp';

import {
  getRankFromRatio,
  getRankColor,
  calculateAllMuscleRanks,
  detectRankChanges,
  getExerciseMultiplier,
  toGamificationMuscle,
  getAllRanksOrdered,
  getNextRank,
  calculateRankProgress,
} from './muscle-ranks';

import {
  checkAchievements,
  getUnlockedAchievements,
  getPendingAchievements,
  getAchievementProgress,
} from './achievements';

import {
  migrateExistingData,
  needsMigration,
  getExerciseToMuscleMap,
  migrateV1toV2,
  migrateV2toV3,
} from './migration';

import { GAMIFICATION_SCHEMA_VERSION } from './constants';

import {
  RANK_COLORS,
  RANK_UP_XP,
  STREAK_XP,
  DEFAULT_BODYWEIGHT,
  ACHIEVEMENT_DEFINITIONS,
  RANK_DISPLAY_NAMES,
  LEVEL_TITLE_DISPLAY_NAMES,
} from './constants';

// ==========================================
// SINGLETON STATE
// ==========================================

let _state: GamificationState | null = null;

/**
 * Obtiene el estado actual (carga desde storage si es necesario)
 */
function getState(): GamificationState {
  if (!_state) {
    _state = loadGamificationState();
  }
  return _state;
}

/**
 * Guarda el estado actual
 */
function persistState(state: GamificationState): void {
  _state = state;
  saveGamificationState(state);
}

// ==========================================
// INITIALIZATION
// ==========================================

/**
 * Inicializa el sistema de gamificacion
 * Migra datos existentes si es necesario
 */
export function initGamification(): GamificationState {
  if (needsMigration()) {
    // Check if there's existing state that just needs schema update
    const existingState = loadGamificationState();

    if (existingState.initialized && (existingState.version || 1) < GAMIFICATION_SCHEMA_VERSION) {
      // Schema version update - run migrations in order
      let migratedState = existingState;

      if ((migratedState.version || 1) < 2) {
        migratedState = migrateV1toV2(migratedState);
      }
      if ((migratedState.version || 1) < 3) {
        migratedState = migrateV2toV3(migratedState);
      }

      persistState(migratedState);
      return migratedState;
    }

    // Full migration from scratch
    const migratedState = migrateExistingData();
    persistState(migratedState);
    return migratedState;
  }

  return getState();
}

/**
 * Fuerza reinicializacion (para cuando hay nuevos datos)
 */
export function reinitGamification(): GamificationState {
  const state = migrateExistingData();
  persistState(state);
  return state;
}

// ==========================================
// PLAYER STATS
// ==========================================

/**
 * Obtiene las estadisticas del jugador
 */
export function getPlayerStats(): PlayerStats {
  return getState().playerStats;
}

/**
 * Obtiene el nivel actual
 */
export function getCurrentLevel(): number {
  return getState().playerStats.level;
}

/**
 * Obtiene el XP total
 */
export function getTotalXP(): number {
  return getState().playerStats.totalXP;
}

/**
 * Obtiene la informacion del titulo actual
 */
export function getCurrentTitle(): LevelTitleInfo {
  return getState().playerStats.titleInfo;
}

/**
 * Obtiene el progreso del nivel actual
 */
export function getCurrentLevelProgress(): {
  level: number;
  currentXP: number;
  maxXP: number;
  percentage: number;
} {
  return getLevelProgress(getState().playerStats.totalXP);
}

// ==========================================
// MUSCLE RANKS
// ==========================================

/**
 * Obtiene todos los rangos musculares
 */
export function getMuscleRanks(): MuscleRanks {
  return getState().muscleRanks;
}

/**
 * Obtiene el rango de un musculo especifico
 */
export function getMuscleRank(muscle: GamificationMuscleGroup): {
  rank: StrengthRank;
  ratio: number;
  color: { fill: string; glow: string };
} {
  const data = getState().muscleRanks[muscle];
  return {
    rank: data.rank,
    ratio: data.ratio,
    color: getRankColor(data.rank),
  };
}

/**
 * Obtiene los colores para el mapa muscular
 */
export function getMuscleMapColors(): Record<GamificationMuscleGroup, { fill: string; glow: string }> {
  const ranks = getState().muscleRanks;
  const result: Record<GamificationMuscleGroup, { fill: string; glow: string }> = {} as any;

  const muscles: GamificationMuscleGroup[] = [
    'pecho', 'espalda', 'hombros', 'biceps',
    'triceps', 'piernas', 'gluteos', 'core',
  ];

  for (const muscle of muscles) {
    result[muscle] = getRankColor(ranks[muscle].rank);
  }

  return result;
}

// ==========================================
// ACHIEVEMENTS
// ==========================================

/**
 * Obtiene todos los logros
 */
export function getAchievements(): Achievement[] {
  return getState().achievements;
}

/**
 * Obtiene logros desbloqueados
 */
export function getUnlocked(): Achievement[] {
  return getUnlockedAchievements(getState().achievements);
}

/**
 * Obtiene el progreso de logros
 */
export function getAchievementsProgress(): {
  unlocked: number;
  total: number;
  percentage: number;
} {
  return getAchievementProgress(getState().achievements);
}

// ==========================================
// STREAK
// ==========================================

/**
 * Obtiene los datos de racha
 */
export function getStreakInfo(): {
  current: number;
  best: number;
  lastWorkout: string | null;
} {
  const data = getState().streakData;
  return {
    current: data.currentStreak,
    best: data.bestStreak,
    lastWorkout: data.lastWorkoutDate,
  };
}

/**
 * XP que gano una sesion concreta. HI-02 lo enseña; se suma de las
 * transacciones que llevan su sessionId. Devuelve null si esa sesion no dejo
 * ninguna (historial anterior a la gamificacion, o importada de CSV): antes
 * que enseñar "+0 XP", no se enseña la metrica.
 */
export function getSessionXP(sessionId: string | undefined): number | null {
  if (!sessionId) return null;
  const transacciones = getXPHistory(getState()).filter((t) => t.sessionId === sessionId);
  if (transacciones.length === 0) return null;
  return transacciones.reduce((total, t) => total + t.amount, 0);
}


// ==========================================
// SESSION PROCESSING
// ==========================================

/**
 * Procesa una sesion completada y calcula todo el XP
 * Esta es la funcion principal para llamar cuando termina un entrenamiento
 */
export function processCompletedSession(
  session: HistorySession,
  newPRs: Array<{ exercise: string; oldWeight: number; newWeight: number }>
): SessionXPSummary {
  let state = getState();
  const profile = getProfile();
  const bodyweight = profile.weight || DEFAULT_BODYWEIGHT;
  const allPRs = getPRs();
  const history = getHistory();

  // Calcular racha actualizada
  const newStreak = calculateCurrentStreak(history);
  const oldStreakData = state.streakData;

  // Actualizar racha en estado
  state = updateStreakData(state, {
    ...oldStreakData,
    currentStreak: newStreak,
    lastWorkoutDate: session.date,
  });

  // Detectar milestone de racha
  const streakResult = calculateStreakXP(newStreak, oldStreakData.streakMilestones);
  if (streakResult) {
    state = claimStreakMilestone(state, streakResult.milestone);
  }

  // Calcular nuevos rangos musculares
  const exerciseToMuscle = getExerciseToMuscleMap();

  // Agregar ejercicios de la sesion al mapa
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

  const oldMuscleRanks = state.muscleRanks;
  const { muscleRanks: newMuscleRanks, exerciseStrengths } = calculateAllMuscleRanks(
    allPRs,
    exerciseToMuscle,
    bodyweight
  );

  // Detectar cambios de rango
  const rankChanges = detectRankChanges(oldMuscleRanks, newMuscleRanks);

  // Actualizar rangos en estado
  state = updateMuscleRanksInState(state, newMuscleRanks, exerciseStrengths);

  // Verificar logros
  const { achievements: newAchievements, newlyUnlocked } = checkAchievements(
    state.achievements,
    history,
    allPRs,
    newMuscleRanks,
    newStreak
  );

  state = updateAchievementsInState(state, newAchievements);

  // Calcular desglose de XP
  const xpBreakdown = calculateSessionXPBreakdown(
    session,
    newPRs,
    {
      current: newStreak,
      claimedMilestones: oldStreakData.streakMilestones,
    },
    newlyUnlocked.map(a => ({ name: a.name, xp: a.xpReward })),
    rankChanges.map(r => ({ muscle: r.muscle, xp: r.xp }))
  );

  // Agregar XP al estado
  const oldLevel = state.playerStats.level;
  const transaction = createXPTransaction(
    xpBreakdown.totalXP,
    'workout_complete',
    `Sesion ${session.grupo || 'Entrenamiento'}`,
    session.sessionId
  );

  state = addXPToState(state, transaction);
  const newLevel = state.playerStats.level;

  // Guardar estado
  persistState(state);

  // Construir resumen
  const summary: SessionXPSummary = {
    ...xpBreakdown,
    rankUps: rankChanges,
    newLevel,
    oldLevel,
    leveledUp: newLevel > oldLevel,
    titleInfo: state.playerStats.titleInfo,
    levelProgress: {
      current: state.playerStats.currentLevelXP,
      max: state.playerStats.xpToNextLevel,
      percentage: state.playerStats.xpToNextLevel > 0
        ? (state.playerStats.currentLevelXP / state.playerStats.xpToNextLevel) * 100
        : 100,
    },
  };

  return summary;
}

/**
 * Cierra una sesion de CARDIO.
 *
 * El motor ya tenia la formula (calculateCardioSessionXP) pero solo la usaba
 * la migracion: al terminar un Tabata no se sumaba un solo XP, y C-04 enseña
 * "+78 XP". Aqui se engancha, con dos reglas del README:
 *   - el cardio NO suma racha (por eso no se toca streakData),
 *   - el cardio no mueve rangos musculares: no hay kg que comparar.
 */
export function processCompletedCardioSession(session: HistorySession): {
  totalXP: number;
  desglose: { baseXP: number; timeXP: number; roundsXP: number; modeBonus: number };
  newLevel: number;
  oldLevel: number;
  leveledUp: boolean;
  titleInfo: LevelTitleInfo;
  levelProgress: { current: number; max: number; percentage: number };
} {
  let state = getState();
  const xp = calculateCardioSessionXP(session);

  // Los logros SI se revisan: hay logros de cardio.
  const { achievements, newlyUnlocked } = checkAchievements(
    state.achievements,
    getHistory(),
    getPRs(),
    state.muscleRanks,
    state.streakData.currentStreak
  );
  state = updateAchievementsInState(state, achievements);
  const xpLogros = newlyUnlocked.reduce((t, a) => t + a.xpReward, 0);

  const oldLevel = state.playerStats.level;
  const total = xp.totalXP + xpLogros;
  if (total > 0) {
    state = addXPToState(
      state,
      createXPTransaction(
        total,
        'cardio_complete',
        `Cardio ${session.mode ?? ''}`.trim(),
        session.sessionId
      )
    );
  }
  const newLevel = state.playerStats.level;
  persistState(state);

  return {
    totalXP: total,
    desglose: { baseXP: xp.baseXP, timeXP: xp.timeXP, roundsXP: xp.roundsXP, modeBonus: xp.modeBonus },
    newLevel,
    oldLevel,
    leveledUp: newLevel > oldLevel,
    titleInfo: state.playerStats.titleInfo,
    levelProgress: {
      current: state.playerStats.currentLevelXP,
      max: state.playerStats.xpToNextLevel,
      percentage:
        state.playerStats.xpToNextLevel > 0
          ? (state.playerStats.currentLevelXP / state.playerStats.xpToNextLevel) * 100
          : 100,
    },
  };
}

/**
 * Recalcula todo cuando cambia el peso corporal
 */
export function onBodyweightChange(newWeight: number): void {
  const allPRs = getPRs();
  const exerciseToMuscle = getExerciseToMuscleMap();

  const { muscleRanks, exerciseStrengths } = calculateAllMuscleRanks(
    allPRs,
    exerciseToMuscle,
    newWeight
  );

  let state = getState();
  state = updateMuscleRanksInState(state, muscleRanks, exerciseStrengths);
  persistState(state);
}

// ==========================================
// RE-EXPORTS
// ==========================================

export {
  // Types
  type GamificationState,
  type SessionXPSummary,
  type MuscleRanks,
  type PlayerStats,
  type LevelTitleInfo,
  type Achievement,

  // Level functions
  calculateLevel,
  getLevelProgress,
  getLevelTitle,
  getLevelColor,
  didLevelUp,
  getXPForLevel,
  getXPToNextLevel,
  MAX_LEVEL,

  // Rank functions
  getRankFromRatio,
  getRankColor,
  getAllRanksOrdered,
  getNextRank,
  calculateRankProgress,
  getExerciseMultiplier,
  toGamificationMuscle,

  // XP functions
  calculateVolumeXP,
  calculatePRXP,
  estimateOneRM,

  // Achievement functions
  getUnlockedAchievements,
  getPendingAchievements,

  // Constants
  RANK_COLORS,
  RANK_UP_XP,
  STREAK_XP,
  DEFAULT_BODYWEIGHT,
  ACHIEVEMENT_DEFINITIONS,
  RANK_DISPLAY_NAMES,
  LEVEL_TITLE_DISPLAY_NAMES,
};
