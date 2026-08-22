// ==========================================
// XP CALCULATION SYSTEM
// ==========================================

import { claveDiaLocal } from '@/utils/fecha';
import type {
  XPSource,
  XPTransaction,
  SessionXPBreakdown,
} from '@/types/gamification';
import type { ExerciseData, HistorySession } from '@/types';
import {
  XP_WORKOUT_COMPLETE,
  VOLUME_XP_TIERS,
  PR_XP,
  PR_WEIGHT_THRESHOLDS,
  STREAK_XP,
  STREAK_MILESTONES,
  XP_CARDIO_COMPLETE,
  CARDIO_TIME_XP_TIERS,
  XP_PER_CARDIO_ROUND,
  MAX_CARDIO_ROUND_XP,
  CARDIO_MODE_BONUS,
} from './constants';

/**
 * Genera un ID unico para transacciones
 */
export function generateTransactionId(): string {
  return `xp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calcula XP por volumen de una sesion
 * Sistema escalonado que premia volumen pero con retornos decrecientes
 */
export function calculateVolumeXP(totalVolume: number): number {
  if (totalVolume <= 0) return 0;

  let xp = 0;
  let remainingVolume = totalVolume;
  let previousThreshold = 0;

  for (const tier of VOLUME_XP_TIERS) {
    // Volumen en este tier
    const volumeInTier = Math.min(
      remainingVolume,
      tier.maxVolume - previousThreshold
    );

    if (volumeInTier <= 0) break;

    // XP de este tier (con cap)
    const tierXP = Math.min(
      Math.floor(volumeInTier / tier.xpPer),
      tier.maxXP
    );

    xp += tierXP;
    remainingVolume -= volumeInTier;
    previousThreshold = tier.maxVolume;

    if (remainingVolume <= 0) break;
  }

  return xp;
}

/**
 * Clasifica un PR basado en la mejora de peso
 */
export function classifyPR(
  newWeight: number,
  oldWeight: number
): { type: keyof typeof PR_XP; xp: number } | null {
  if (newWeight <= oldWeight) return null;

  const improvement = newWeight - oldWeight;

  for (const [type, thresholds] of Object.entries(PR_WEIGHT_THRESHOLDS)) {
    if (improvement >= thresholds.min && improvement <= thresholds.max) {
      return {
        type: type as keyof typeof PR_XP,
        xp: PR_XP[type as keyof typeof PR_XP],
      };
    }
  }

  return null;
}

/**
 * Calcula XP por un PR especifico
 * @param improvement - Mejora en kg
 */
export function calculatePRXP(improvement: number): { type: string; xp: number } {
  if (improvement <= 0) {
    return { type: 'none', xp: 0 };
  }

  if (improvement <= 2) {
    return { type: 'micro', xp: PR_XP.micro };
  } else if (improvement <= 5) {
    return { type: 'minor', xp: PR_XP.minor };
  } else if (improvement <= 10) {
    return { type: 'solid', xp: PR_XP.solid };
  } else if (improvement <= 15) {
    return { type: 'major', xp: PR_XP.major };
  } else {
    return { type: 'exceptional', xp: PR_XP.exceptional };
  }
}

/**
 * Calcula XP por racha alcanzada
 */
export function calculateStreakXP(
  currentStreak: number,
  alreadyClaimedMilestones: number[]
): { milestone: number; xp: number } | null {
  // Buscar el milestone mas alto que se ha alcanzado pero no reclamado
  for (const milestone of [...STREAK_MILESTONES].reverse()) {
    if (currentStreak >= milestone && !alreadyClaimedMilestones.includes(milestone)) {
      return {
        milestone,
        xp: STREAK_XP[milestone as keyof typeof STREAK_XP],
      };
    }
  }
  return null;
}

/**
 * Determina si dos fechas son dias consecutivos
 */
export function areConsecutiveDays(date1: string, date2: string): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);

  // Normalizar a medianoche
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);

  // Diferencia en dias
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  return diffDays === 1;
}

/**
 * Determina si es el mismo dia
 */
export function isSameDay(date1: string, date2: string): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);

  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Calcula la racha actual basada en el historial
 */
export function calculateCurrentStreak(
  sessions: Array<{ date: string }>,
  today: string = new Date().toISOString()
): number {
  if (sessions.length === 0) return 0;

  // Ordenar sesiones por fecha (mas reciente primero)
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Obtener fechas unicas (un dia cuenta solo una vez). Dia LOCAL: con
  // `toISOString()` toda sesion posterior a las 19:00 en Lima caia en el dia
  // UTC siguiente y colisionaba con la del dia real siguiente, asi que
  // entrenar cuatro dias seguidos alternando tarde y noche daba racha 1.
  const uniqueDates = new Set<string>();
  for (const session of sorted) {
    uniqueDates.add(claveDiaLocal(new Date(session.date)));
  }

  const sortedDates = Array.from(uniqueDates).sort().reverse();

  if (sortedDates.length === 0) return 0;

  // Verificar si la ultima sesion fue hoy o ayer
  const todayStr = claveDiaLocal(new Date(today));
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = claveDiaLocal(yesterday);

  const lastSessionDate = sortedDates[0];

  // Si la ultima sesion no fue hoy ni ayer, la racha se rompio
  if (lastSessionDate !== todayStr && lastSessionDate !== yesterdayStr) {
    return 0;
  }

  // Contar dias consecutivos hacia atras
  let streak = 1;
  let currentDate = new Date(lastSessionDate);

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = claveDiaLocal(prevDate);

    if (sortedDates[i] === prevDateStr) {
      streak++;
      currentDate = prevDate;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calcula el desglose completo de XP para una sesion
 */
export function calculateSessionXPBreakdown(
  session: HistorySession,
  prsAchieved: Array<{ exercise: string; oldWeight: number; newWeight: number }>,
  streakInfo: { current: number; claimedMilestones: number[] },
  achievementsUnlocked: Array<{ name: string; xp: number }>,
  rankUps: Array<{ muscle: string; xp: number }>
): SessionXPBreakdown {
  // XP base por completar
  const baseXP = XP_WORKOUT_COMPLETE;

  // XP por volumen
  const volumeXP = calculateVolumeXP(session.volumenTotal || 0);

  // XP por PRs
  const prXP: { exercise: string; amount: number; type: string }[] = [];
  for (const pr of prsAchieved) {
    const improvement = pr.newWeight - pr.oldWeight;
    const prResult = calculatePRXP(improvement);
    if (prResult.xp > 0) {
      prXP.push({
        exercise: pr.exercise,
        amount: prResult.xp,
        type: prResult.type,
      });
    }
  }

  // XP por racha
  let streakXP = 0;
  const streakResult = calculateStreakXP(
    streakInfo.current,
    streakInfo.claimedMilestones
  );
  if (streakResult) {
    streakXP = streakResult.xp;
  }

  // XP por logros
  const achievementXP = achievementsUnlocked.map(a => ({
    name: a.name,
    amount: a.xp,
  }));

  // XP por subir rango
  const rankUpXP = rankUps.map(r => ({
    muscle: r.muscle,
    amount: r.xp,
  }));

  // Total
  const totalXP =
    baseXP +
    volumeXP +
    prXP.reduce((sum, p) => sum + p.amount, 0) +
    streakXP +
    achievementXP.reduce((sum, a) => sum + a.amount, 0) +
    rankUpXP.reduce((sum, r) => sum + r.amount, 0);

  return {
    baseXP,
    volumeXP,
    prXP,
    streakXP,
    achievementXP,
    rankUpXP,
    totalXP,
  };
}

/**
 * Crea una transaccion de XP
 */
export function createXPTransaction(
  amount: number,
  source: XPSource,
  description: string,
  sessionId?: string
): XPTransaction {
  return {
    id: generateTransactionId(),
    amount,
    source,
    description,
    timestamp: new Date().toISOString(),
    sessionId,
  };
}

/**
 * Calcula el volumen total de una sesion
 */
export function calculateSessionVolume(ejercicios: ExerciseData[]): number {
  return ejercicios.reduce((total, ej) => {
    if (ej.completado && ej.peso > 0 && ej.sets > 0 && ej.reps > 0) {
      // Para mancuernas, el peso ya esta multiplicado por 2 en el sistema
      return total + ej.volumen;
    }
    return total;
  }, 0);
}

/**
 * Estima el 1RM usando la formula de Epley
 */
export function estimateOneRM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;

  // Formula de Epley: 1RM = peso × (1 + reps/30)
  return weight * (1 + reps / 30);
}

// ==========================================
// CARDIO XP CALCULATIONS
// ==========================================

/**
 * Calcula XP por tiempo de trabajo en una sesion de cardio
 * @param workTimeSeconds - Tiempo de trabajo en segundos
 */
export function calculateCardioTimeXP(workTimeSeconds: number): number {
  if (workTimeSeconds <= 0) return 0;

  const workTimeMinutes = workTimeSeconds / 60;
  let xp = 0;
  let remainingMinutes = workTimeMinutes;
  let previousThreshold = 0;

  for (const tier of CARDIO_TIME_XP_TIERS) {
    const minutesInTier = Math.min(
      remainingMinutes,
      tier.maxMinutes - previousThreshold
    );

    if (minutesInTier <= 0) break;

    const tierXP = Math.min(
      Math.floor(minutesInTier * tier.xpPerMin),
      tier.maxXP
    );

    xp += tierXP;
    remainingMinutes -= minutesInTier;
    previousThreshold = tier.maxMinutes;

    if (remainingMinutes <= 0) break;
  }

  return xp;
}

/**
 * Calcula XP por rondas completadas en una sesion de cardio
 * @param roundsCompleted - Numero de rondas completadas
 */
export function calculateCardioRoundsXP(roundsCompleted: number): number {
  if (roundsCompleted <= 0) return 0;
  return Math.min(roundsCompleted * XP_PER_CARDIO_ROUND, MAX_CARDIO_ROUND_XP);
}

/**
 * Obtiene el bonus XP por el modo de cardio
 * @param mode - Modo de cardio (tabata, emom, amrap, etc.)
 */
export function getCardioModeBonus(mode: string | undefined): number {
  if (!mode) return CARDIO_MODE_BONUS.custom || 5;
  return CARDIO_MODE_BONUS[mode.toLowerCase()] || CARDIO_MODE_BONUS.custom || 5;
}

/**
 * Calcula el XP total para una sesion de cardio
 */
/** Segundos de trabajo por debajo de los cuales una sesion de cardio no paga
 *  XP. Un minuto es el intervalo mas corto que la app sabe medir (EMOM), asi
 *  que es el suelo natural. */
export const TRABAJO_MINIMO_XP = 60;

export function calculateCardioSessionXP(session: HistorySession): {
  baseXP: number;
  timeXP: number;
  roundsXP: number;
  modeBonus: number;
  totalXP: number;
} {
  if (session.type !== 'cardio' || !session.stats) {
    return { baseXP: 0, timeXP: 0, roundsXP: 0, modeBonus: 0, totalXP: 0 };
  }

  // Suelo de trabajo real. Sin el, un Tabata con todos los steppers al minimo
  // pagaba 40+1+15 = 56 XP cada ~10 segundos de reloj, repetible en bucle: seis
  // segundos de cardio valian el 74% de una sesion de pierna de 5.760 kg. El
  // XP dejaba de significar nada y no habia forma de revertirlo.
  if ((session.stats.workTime || 0) < TRABAJO_MINIMO_XP) {
    return { baseXP: 0, timeXP: 0, roundsXP: 0, modeBonus: 0, totalXP: 0 };
  }

  const baseXP = XP_CARDIO_COMPLETE;
  const timeXP = calculateCardioTimeXP(session.stats.workTime || 0);
  const roundsXP = calculateCardioRoundsXP(session.stats.roundsCompleted || 0);
  const modeBonus = getCardioModeBonus(session.mode);

  const totalXP = baseXP + timeXP + roundsXP + modeBonus;

  return { baseXP, timeXP, roundsXP, modeBonus, totalXP };
}
