import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initGamification,
  processCompletedSession,
  getPlayerStats,
  getAchievements,
} from '../features/gamification';
import { migrateExistingData } from '../features/gamification/migration';
import { saveHistory, updatePR, saveProfile } from '../utils/storage';
import type { HistorySession, ExerciseData, MuscleGroup } from '../types';

// ==========================================
// HELPERS
// ==========================================

function buildSession(dateISO: string, sessionId: string, peso: number): HistorySession {
  const ejercicios: ExerciseData[] = [
    {
      nombre: 'Press Banca',
      sets: 3,
      reps: 10,
      peso,
      esMancuerna: false,
      grupoMuscular: 'Pecho' as MuscleGroup,
      volumen: 3 * 10 * peso,
      completado: true,
    },
  ];
  return {
    date: dateISO,
    savedAt: dateISO,
    sessionId,
    grupo: 'Pecho',
    type: 'weights',
    volumenTotal: 3 * 10 * peso,
    volumenPorGrupo: { Pecho: 3 * 10 * peso },
    ejercicios,
  };
}

/**
 * Simula 7 sesiones reales en 7 días consecutivos terminando "hoy" (reloj falso),
 * llamando a processCompletedSession() en orden como haría la app en vivo, para
 * cruzar el milestone de racha de 7 días y una subida de rango en la primera sesión.
 */
function liveSimulateSevenDayStreak(): { liveTotalXP: number; liveAchievements: ReturnType<typeof getAchievements> } {
  saveProfile({
    name: 'Test',
    birthdate: '2000-01-01',
    gender: 'male',
    weight: 80,
    height: 180,
    activity: 1.2,
  });

  const today = new Date(); // reloj falso ya fijado por el test antes de llamar esto
  const sessions: HistorySession[] = [];

  for (let day = 0; day < 7; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() - (6 - day));
    const dateISO = date.toISOString();
    const peso = 60; // peso constante: solo el día 0 genera un PR nuevo
    const session = buildSession(dateISO, `session_${day}`, peso);
    sessions.push(session);

    saveHistory([...sessions]);

    const isNewPR = day === 0;
    if (isNewPR) {
      updatePR('Press Banca', {
        peso,
        sets: 3,
        reps: 10,
        volumen: session.volumenTotal,
        date: dateISO,
      });
    }

    const newPRs = isNewPR ? [{ exercise: 'Press Banca', oldWeight: 0, newWeight: peso }] : [];
    processCompletedSession(session, newPRs);
  }

  return {
    liveTotalXP: getPlayerStats().totalXP,
    liveAchievements: getAchievements(),
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-10T12:00:00.000Z'));
  initGamification(); // fuerza un estado de gamificación fresco basado en storage vacío
});

afterEach(() => {
  vi.useRealTimers();
});

// ==========================================
// GAM2-01 — el recálculo nunca da un total de XP menor al que ya existía
// ==========================================

describe('migrateExistingData (GAM2-01) — recálculo de XP con racha y rango', () => {
  it('el XP recalculado nunca es menor al acumulado en vivo tras cruzar racha de 7 días y una subida de rango', () => {
    const { liveTotalXP, liveAchievements } = liveSimulateSevenDayStreak();

    // El sistema en vivo sí acumuló XP (racha de 7 + al menos la sesión base)
    expect(liveTotalXP).toBeGreaterThan(0);

    const recomputed = migrateExistingData(liveAchievements);

    expect(recomputed.playerStats.totalXP).toBeGreaterThanOrEqual(liveTotalXP);
  });

  it('el recálculo incluye XP de racha retroactivo (streakMilestones refleja lo ya reclamado)', () => {
    liveSimulateSevenDayStreak();

    const recomputed = migrateExistingData();
    // El milestone de 7 días debe quedar marcado como reclamado retroactivamente,
    // para no volver a pagarlo la próxima vez que se alcance en vivo.
    expect(recomputed.streakData.streakMilestones).toContain(7);
  });
});

// ==========================================
// GAM2-02 — un logro ya desbloqueado no se pierde en el recálculo
// ==========================================

describe('migrateExistingData (GAM2-02) — preservación de logros ya desbloqueados', () => {
  it('sin existingAchievements, un recálculo posterior a que la racha se rompió pierde el logro streak_7 (bug subyacente)', () => {
    liveSimulateSevenDayStreak();

    // Avanzar el reloj: la racha ya está rota al momento del recálculo
    vi.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));

    const recomputedWithoutPreservation = migrateExistingData();
    const streak7 = recomputedWithoutPreservation.achievements.find((a) => a.id === 'streak_7');

    expect(streak7?.unlockedAt).toBeUndefined();
  });

  it('con existingAchievements, el logro streak_7 se preserva aunque la racha ya esté rota (fix)', () => {
    const { liveAchievements } = liveSimulateSevenDayStreak();

    const wasUnlocked = liveAchievements.find((a) => a.id === 'streak_7')?.unlockedAt;
    expect(wasUnlocked).toBeDefined(); // precondición: sí se desbloqueó en vivo

    vi.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));

    const recomputedWithPreservation = migrateExistingData(liveAchievements);
    const streak7 = recomputedWithPreservation.achievements.find((a) => a.id === 'streak_7');

    expect(streak7?.unlockedAt).toBeDefined();
    expect(streak7?.xpReward).toBeGreaterThan(0);
  });

  it('reinitGamification-equivalente (migrateExistingData con logros previos) no descuenta XP de logros ya pagados', () => {
    const { liveAchievements } = liveSimulateSevenDayStreak();
    const liveAchievementXP = liveAchievements
      .filter((a) => a.unlockedAt)
      .reduce((sum, a) => sum + a.xpReward, 0);

    vi.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));
    const recomputed = migrateExistingData(liveAchievements);
    const recomputedAchievementXP = recomputed.achievements
      .filter((a) => a.unlockedAt)
      .reduce((sum, a) => sum + a.xpReward, 0);

    expect(recomputedAchievementXP).toBeGreaterThanOrEqual(liveAchievementXP);
  });
});
