// ==========================================
// GAMIFICATION STATE MANAGEMENT
// ==========================================

import type {
  GamificationState,
  PlayerStats,
  MuscleRanks,
  XPTransaction,
  StreakData,
  Achievement,
  ExerciseStrength,
  LevelTitleInfo,
} from '@/types/gamification';
import {
  GAMIFICATION_STORAGE_KEYS,
  GAMIFICATION_SCHEMA_VERSION,
  MAX_XP_HISTORY,
} from './constants';
import { calculateLevel, getLevelProgress, getLevelTitle } from './levels';
import { createInitialMuscleRanks } from './muscle-ranks';
import { initializeAchievements } from './achievements';

// ==========================================
// LOCAL STORAGE HELPERS
// ==========================================

function getItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving to localStorage: ${key}`, error);
  }
}

// ==========================================
// INITIAL STATE
// ==========================================

/**
 * Crea el estado inicial de gamificacion
 */
export function createInitialState(): GamificationState {
  const now = new Date().toISOString();
  const titleInfo = getLevelTitle(1);

  return {
    version: GAMIFICATION_SCHEMA_VERSION,
    playerStats: {
      totalXP: 0,
      level: 1,
      titleInfo,
      currentLevelXP: 0,
      xpToNextLevel: 0,
      createdAt: now,
      lastUpdated: now,
    },
    muscleRanks: createInitialMuscleRanks(),
    exerciseStrengths: {},
    achievements: initializeAchievements(),
    xpHistory: [],
    streakData: {
      currentStreak: 0,
      bestStreak: 0,
      lastWorkoutDate: null,
      streakMilestones: [],
    },
    initialized: false,
  };
}

// ==========================================
// STATE OPERATIONS
// ==========================================

/**
 * Carga el estado de gamificacion desde localStorage
 */
export function loadGamificationState(): GamificationState {
  const saved = getItem<GamificationState | null>(
    GAMIFICATION_STORAGE_KEYS.STATE,
    null
  );

  if (!saved) {
    return createInitialState();
  }

  // Verificar version y migrar si es necesario
  if (saved.version !== GAMIFICATION_SCHEMA_VERSION) {
    // Por ahora, solo actualizar version si es compatible
    saved.version = GAMIFICATION_SCHEMA_VERSION;
  }

  return saved;
}

/**
 * Guarda el estado de gamificacion en localStorage
 */
export function saveGamificationState(state: GamificationState): void {
  // Limitar historial de XP
  if (state.xpHistory.length > MAX_XP_HISTORY) {
    state.xpHistory = state.xpHistory.slice(-MAX_XP_HISTORY);
  }

  setItem(GAMIFICATION_STORAGE_KEYS.STATE, state);
}

/**
 * Actualiza las estadisticas del jugador basado en el XP total
 */
export function updatePlayerStats(
  currentStats: PlayerStats,
  totalXP: number
): PlayerStats {
  const level = calculateLevel(totalXP);
  const progress = getLevelProgress(totalXP);
  const titleInfo = getLevelTitle(level);

  return {
    ...currentStats,
    totalXP,
    level,
    titleInfo,
    currentLevelXP: progress.currentXP,
    xpToNextLevel: progress.maxXP,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Agrega XP al estado actual
 */
export function addXPToState(
  state: GamificationState,
  transaction: XPTransaction
): GamificationState {
  const newTotalXP = state.playerStats.totalXP + transaction.amount;
  const newPlayerStats = updatePlayerStats(state.playerStats, newTotalXP);

  return {
    ...state,
    playerStats: newPlayerStats,
    xpHistory: [...state.xpHistory, transaction],
  };
}

/**
 * Actualiza los rangos musculares en el estado
 */
export function updateMuscleRanksInState(
  state: GamificationState,
  muscleRanks: MuscleRanks,
  exerciseStrengths: Record<string, ExerciseStrength>
): GamificationState {
  return {
    ...state,
    muscleRanks,
    exerciseStrengths,
  };
}

/**
 * Actualiza los logros en el estado
 */
export function updateAchievementsInState(
  state: GamificationState,
  achievements: Achievement[]
): GamificationState {
  return {
    ...state,
    achievements,
  };
}

/**
 * Actualiza los datos de racha
 */
export function updateStreakData(
  state: GamificationState,
  streakData: StreakData
): GamificationState {
  return {
    ...state,
    streakData: {
      ...streakData,
      bestStreak: Math.max(streakData.currentStreak, state.streakData.bestStreak),
    },
  };
}

/**
 * Registra un milestone de racha como reclamado
 */
export function claimStreakMilestone(
  state: GamificationState,
  milestone: number
): GamificationState {
  if (state.streakData.streakMilestones.includes(milestone)) {
    return state;
  }

  return {
    ...state,
    streakData: {
      ...state.streakData,
      streakMilestones: [...state.streakData.streakMilestones, milestone],
    },
  };
}

/**
 * Marca el estado como inicializado
 */
export function markAsInitialized(
  state: GamificationState,
  migratedAt?: string
): GamificationState {
  return {
    ...state,
    initialized: true,
    migratedAt: migratedAt || state.migratedAt,
  };
}

// ==========================================
// GETTERS
// ==========================================

/**
 * Obtiene las estadisticas del jugador
 */
export function getPlayerStats(state: GamificationState): PlayerStats {
  return state.playerStats;
}

/**
 * Obtiene el nivel actual
 */
export function getCurrentLevel(state: GamificationState): number {
  return state.playerStats.level;
}

/**
 * Obtiene el XP total
 */
export function getTotalXP(state: GamificationState): number {
  return state.playerStats.totalXP;
}

/**
 * Obtiene los rangos musculares
 */
export function getMuscleRanks(state: GamificationState): MuscleRanks {
  return state.muscleRanks;
}

/**
 * Obtiene los datos de racha
 */
export function getStreakData(state: GamificationState): StreakData {
  return state.streakData;
}

/**
 * Obtiene los logros
 */
export function getAchievements(state: GamificationState): Achievement[] {
  return state.achievements;
}

/**
 * Obtiene el historial de XP
 */
export function getXPHistory(state: GamificationState): XPTransaction[] {
  return state.xpHistory;
}

/**
 * Obtiene la info del titulo actual
 */
export function getTitleInfo(state: GamificationState): LevelTitleInfo {
  return state.playerStats.titleInfo;
}

/**
 * Verifica si el estado esta inicializado
 */
export function isInitialized(state: GamificationState): boolean {
  return state.initialized;
}
