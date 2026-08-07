// ==========================================
// DATA MIGRATION FOR GAMIFICATION
// ==========================================

import type {
  GamificationState,
  XPTransaction,
  GamificationMuscleGroup,
  Achievement,
} from '@/types/gamification';
import type { HistorySession, PRData } from '@/types';
import { getHistory, getPRs, getProfile } from '@/utils/storage';
import { allExercises } from '@/data/exercises';
import {
  XP_WORKOUT_COMPLETE,
  DEFAULT_BODYWEIGHT,
  GAMIFICATION_SCHEMA_VERSION,
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_XP_V2,
  STREAK_XP,
  STREAK_MILESTONES,
  GAMIFICATION_STORAGE_KEYS,
} from './constants';
import {
  calculateVolumeXP,
  calculatePRXP,
  generateTransactionId,
  calculateCurrentStreak,
  calculateCardioSessionXP,
} from './xp';
import { calculateLevel, getLevelProgress, getLevelTitle } from './levels';
import { calculateAllMuscleRanks, detectRankChanges, toGamificationMuscle } from './muscle-ranks';
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
export function migrateExistingData(existingAchievements?: Achievement[]): GamificationState {
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

  // Calcular XP retroactivo (entrenamientos + volumen + PRs + cardio)
  const { totalXP: baseXP, xpTransactions } = calculateRetroactiveXP(history);

  // Calcular rangos musculares (estado final)
  const { muscleRanks, exerciseStrengths } = prs && Object.keys(prs).length > 0
    ? calculateAllMuscleRanks(prs, exerciseToMuscle, bodyweight)
    : { muscleRanks: createInitialMuscleRanks(), exerciseStrengths: {} };

  // Calcular racha actual
  const currentStreak = calculateCurrentStreak(history);

  // XP retroactivo de racha: recorre el historial cronológicamente y
  // otorga cada milestone (3/7/14/30/60/90) la primera vez que se cruza,
  // igual que hace el sistema en vivo (los milestones no se "des-reclaman"
  // cuando la racha se rompe después).
  const { totalXP: retroactiveStreakXP, claimedMilestones } = calculateRetroactiveStreakXP(history);

  // XP retroactivo de subida de rango: recorre el historial cronológicamente
  // reconstruyendo los PRs acumulados sesión a sesión y sumando el XP de cada
  // subida de rango detectada, igual que hace processCompletedSession() en vivo.
  const retroactiveRankXP = calculateRetroactiveRankXP(history, exerciseToMuscle, bodyweight);

  // Inicializar y verificar logros a partir del estado final
  const initialAchievements = initializeAchievements();
  let { achievements } = checkAchievements(
    initialAchievements,
    history,
    prs,
    muscleRanks,
    currentStreak
  );

  // Un logro ya desbloqueado nunca debe perder ese estado durante un recálculo,
  // aunque la lógica actual (p.ej. racha rota, rango bajado) ya no lo cumpliría.
  if (existingAchievements && existingAchievements.length > 0) {
    const previouslyUnlocked = new Map(
      existingAchievements.filter(a => a.unlockedAt).map(a => [a.id, a])
    );
    achievements = achievements.map((achievement) => {
      const prev = previouslyUnlocked.get(achievement.id);
      if (prev && !achievement.unlockedAt) {
        return {
          ...achievement,
          unlockedAt: prev.unlockedAt,
          progress: Math.max(achievement.progress ?? 0, prev.progress ?? 0),
        };
      }
      return achievement;
    });
  }

  // Calcular XP de logros desbloqueados y añadirlo al total
  let achievementXP = 0;
  for (const achievement of achievements) {
    if (achievement.unlockedAt) {
      achievementXP += achievement.xpReward;
    }
  }

  // XP total = entrenamientos + volumen + PRs + racha + rangos + logros
  const totalXP = baseXP + retroactiveStreakXP + retroactiveRankXP + achievementXP;

  if (retroactiveStreakXP > 0) {
    xpTransactions.push({
      id: generateTransactionId(),
      amount: retroactiveStreakXP,
      source: 'migration',
      description: 'Rachas históricas',
      timestamp: new Date().toISOString(),
    });
  }

  if (retroactiveRankXP > 0) {
    xpTransactions.push({
      id: generateTransactionId(),
      amount: retroactiveRankXP,
      source: 'migration',
      description: 'Subidas de rango históricas',
      timestamp: new Date().toISOString(),
    });
  }

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
      // Milestones ya reclamados retroactivamente (ver calculateRetroactiveStreakXP),
      // para no volver a pagar su XP la próxima vez que se alcancen en vivo.
      streakMilestones: claimedMilestones,
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
  history: HistorySession[]
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

  // XP por PRs: reconstruido cronológicamente (misma clasificación que usa
  // getNewPRsInSession() en vivo), no una aproximación plana por conteo.
  const prXP = calculateRetroactivePRXP(sortedHistory);
  if (prXP > 0) {
    totalXP += prXP;

    transactions.push({
      id: generateTransactionId(),
      amount: prXP,
      source: 'migration',
      description: 'PRs históricos',
      timestamp: new Date().toISOString(),
    });
  }

  return { totalXP, xpTransactions: transactions };
}

/**
 * Calcula el XP retroactivo de PRs recorriendo el historial cronológicamente
 * y clasificando cada mejora (misma lógica que getNewPRsInSession() +
 * calculatePRXP() en vivo), en vez de una aproximación plana por conteo de
 * PRs vigentes que no reflejaba el tamaño real de cada mejora.
 */
function calculateRetroactivePRXP(sortedHistory: HistorySession[]): number {
  const runningBest: Record<string, number> = {};
  let totalXP = 0;

  for (const session of sortedHistory) {
    if (session.type === 'cardio' || !session.ejercicios) continue;

    for (const ej of session.ejercicios) {
      if (!ej.peso || ej.peso <= 0 || !ej.volumen) continue;
      const previousBest = runningBest[ej.nombre] || 0;
      if (ej.peso > previousBest) {
        const improvement = ej.peso - previousBest;
        totalXP += calculatePRXP(improvement).xp;
        runningBest[ej.nombre] = ej.peso;
      }
    }
  }

  return totalXP;
}

/**
 * Calcula el XP retroactivo de milestones de racha, recorriendo el historial
 * cronológicamente y otorgando cada milestone la primera vez que se cruza.
 * Refleja el mismo comportamiento que claimStreakMilestone() en vivo: una vez
 * reclamado, un milestone no se "des-reclama" aunque la racha se rompa después.
 */
function calculateRetroactiveStreakXP(history: HistorySession[]): {
  totalXP: number;
  claimedMilestones: number[];
} {
  if (history.length === 0) return { totalXP: 0, claimedMilestones: [] };

  // Fechas unicas ordenadas cronologicamente (mas antigua primero)
  const uniqueDates = Array.from(
    new Set(history.map((s) => new Date(s.date).toISOString().split('T')[0]))
  ).sort();

  let streak = 0;
  let prevDate: Date | null = null;
  const claimed: number[] = [];
  let totalXP = 0;

  for (const dateStr of uniqueDates) {
    const date = new Date(dateStr);

    if (prevDate) {
      const diffDays = Math.round(
        (date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      streak = diffDays === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    prevDate = date;

    for (const milestone of STREAK_MILESTONES) {
      if (streak >= milestone && !claimed.includes(milestone)) {
        claimed.push(milestone);
        totalXP += STREAK_XP[milestone as keyof typeof STREAK_XP];
      }
    }
  }

  return { totalXP, claimedMilestones: claimed };
}

/**
 * Calcula el XP retroactivo de subidas de rango, reconstruyendo los PRs
 * acumulados sesion a sesion (en orden cronologico) y sumando el XP de cada
 * subida de rango detectada, igual que hace processCompletedSession() en vivo.
 */
function calculateRetroactiveRankXP(
  history: HistorySession[],
  exerciseToMuscle: Record<string, GamificationMuscleGroup>,
  bodyweight: number
): number {
  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const runningPRs: Record<string, PRData> = {};
  let previousRanks = createInitialMuscleRanks();
  let totalRankXP = 0;

  for (const session of sortedHistory) {
    if (session.type === 'cardio' || !session.ejercicios) continue;

    let changed = false;
    for (const ej of session.ejercicios) {
      if (!ej.peso || ej.peso <= 0 || !ej.volumen) continue;
      const existing = runningPRs[ej.nombre];
      if (!existing || ej.peso > existing.peso) {
        runningPRs[ej.nombre] = {
          peso: ej.peso,
          sets: ej.sets,
          reps: ej.reps,
          volumen: ej.volumen,
          date: session.date,
        };
        changed = true;
      }
    }

    if (!changed) continue;

    const { muscleRanks: newRanks } = calculateAllMuscleRanks(
      runningPRs,
      exerciseToMuscle,
      bodyweight
    );
    const rankChanges = detectRankChanges(previousRanks, newRanks);
    for (const change of rankChanges) {
      totalRankXP += change.xp;
    }
    previousRanks = newRanks;
  }

  return totalRankXP;
}

/**
 * Verifica si la migracion es necesaria
 */
export function needsMigration(): boolean {
  try {
    // CORE-11: usar la constante compartida en vez de una clave mágica
    // duplicada (riesgo de desincronización si se renombra la clave real).
    const saved = localStorage.getItem(GAMIFICATION_STORAGE_KEYS.STATE);
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
