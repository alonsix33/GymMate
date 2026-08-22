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
 * Fuerza reinicializacion (para cuando hay nuevos datos).
 *
 * REEMPLAZA el estado por uno rederivado del historial. Todo lo que se gana en
 * vivo y no es rederivable se pierde: los bonos de hito de racha, el escalon
 * real de cada PR (150/250 XP frente a los 60 fijos que asume la migracion),
 * el XP de ascenso de rango, `bestStreak` y las fechas de desbloqueo de los
 * logros. Sirve para "Recalcular el XP", que es una accion que el usuario pide
 * a proposito y que la app le avisa antes de hacer.
 *
 * NO sirve despues de importar un CSV. Para eso esta `fusionarGamificacion`.
 */
export function reinitGamification(): GamificationState {
  const state = migrateExistingData();
  persistState(state);
  return state;
}

/**
 * Incorpora los datos nuevos SIN quitarle al usuario nada de lo que ya tenia.
 *
 * El defecto que cierra: importar un CSV llamaba a `reinitGamification()`, que
 * rederiva desde cero. Un usuario con 4.613 XP, racha maxima 31 y cuatro hitos
 * cobrados importaba UNA sesion vieja —o sea, mas datos, no menos— y salia con
 * 3.809 XP, racha maxima 1 y cero hitos, un nivel por debajo, bajo un toast
 * verde que decia "CSV importado". Irreversible: no hay copia del estado
 * anterior.
 *
 * La regla es que ninguna cifra baje. Se toma el maximo del XP y de la mejor
 * racha, la union de los hitos cobrados y de los logros conseguidos, y el
 * nivel se recalcula desde el XP que sobrevive. Los rangos musculares y las
 * fuerzas por ejercicio SI se rederivan enteros: salen del historial, que es
 * justo lo que la importacion acaba de ampliar.
 */
export function fusionarGamificacion(): GamificationState {
  // Se lee lo PERSISTIDO, no el `_state` en memoria: la importacion acaba de
  // reescribir localStorage por debajo, y ese es el estado que hay que
  // respetar. Ademas hace la funcion comprobable sin montar la app entera.
  const crudo = loadGamificationState();
  const rederivado = migrateExistingData();

  // `loadGamificationState` devuelve lo que haya en localStorage tal cual, y la
  // importacion de un CSV escribe ahi un estado PARCIAL (solo el XP, la mejor
  // racha, los hitos y las fechas de logro: lo unico que el historial no sabe
  // rederivar). Sin estos rellenos, el `spread` de `xpHistory` reventaba.
  const previo: GamificationState = {
    ...rederivado,
    ...crudo,
    playerStats: { ...rederivado.playerStats, ...(crudo.playerStats ?? {}) },
    streakData: { ...rederivado.streakData, ...(crudo.streakData ?? {}) },
    achievements: Array.isArray(crudo.achievements) ? crudo.achievements : [],
    xpHistory: Array.isArray(crudo.xpHistory) ? crudo.xpHistory : [],
  };

  const totalXP = Math.max(previo.playerStats.totalXP, rederivado.playerStats.totalXP);
  const level = calculateLevel(totalXP);
  const progreso = getLevelProgress(totalXP);

  const logrosPrevios = new Map(previo.achievements.map((a) => [a.id, a]));
  const achievements = rederivado.achievements.map((a) => {
    const antes = logrosPrevios.get(a.id);
    // Un logro conseguido no se puede "desconseguir" por importar un archivo,
    // y su fecha de desbloqueo es un dato que el historial no sabe reproducir.
    if (antes?.unlockedAt) return { ...a, unlockedAt: antes.unlockedAt };
    return a;
  });

  const fusionado: GamificationState = {
    ...rederivado,
    playerStats: {
      ...rederivado.playerStats,
      totalXP,
      level,
      titleInfo: getLevelTitle(level),
      currentLevelXP: progreso.currentXP,
      xpToNextLevel: progreso.maxXP,
      createdAt: previo.playerStats.createdAt || rederivado.playerStats.createdAt,
      lastUpdated: new Date().toISOString(),
    },
    streakData: {
      ...rederivado.streakData,
      bestStreak: Math.max(previo.streakData.bestStreak, rederivado.streakData.bestStreak),
      streakMilestones: [
        ...new Set([
          ...(previo.streakData.streakMilestones ?? []),
          ...(rederivado.streakData.streakMilestones ?? []),
        ]),
      ].sort((a, b) => a - b),
    },
    achievements,
    // El historial de XP es el registro de lo que paso: se conserva el previo y
    // se le añade la linea de la importacion.
    xpHistory: [...rederivado.xpHistory, ...previo.xpHistory].slice(0, 100),
  };
  persistState(fusionado);
  return fusionado;
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
  // El cardio NO suma racha (cambio aprobado nº 4 del handoff). No basta con
  // que `processCompletedCardioSession` no toque `streakData`: si el historial
  // completo entra aqui, los dias de cardio cuentan igual en el siguiente
  // recalculo, y un historial de solo cardio pintaba "RACHA 3" en la home.
  const newStreak = calculateCurrentStreak(sesionesDeRacha(history));
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
/**
 * Sesiones que cuentan para la racha: solo pesas.
 *
 * Cambio aprobado nº 4 del handoff — "cardio no suma racha". Una sola
 * implementacion, la de gamificacion: `getQuickStats` tenia otra, con otro
 * criterio y sin un solo llamador, y se ha borrado.
 */
export function sesionesDeRacha(history: HistorySession[]): HistorySession[] {
  return history.filter((s) => s.type !== 'cardio');
}

export function processCompletedCardioSession(session: HistorySession): {
  totalXP: number;
  xpDeLogros: number;
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
    // El XP DE LA SESION, separado del de los logros. La casilla XP de C-04
    // los sumaba en una sola cifra, asi que dos sesiones identicas enseñaban
    // +156 y +56 y el usuario no tenia forma de saber por que.
    totalXP: xp.totalXP,
    xpDeLogros: xpLogros,
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
