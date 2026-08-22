import { describe, it, expect, beforeEach } from 'vitest';
import { initGamification, fusionarGamificacion, reinitGamification } from '@/features/gamification';
import type { HistorySession } from '@/types';

/**
 * El defecto: importar un CSV llamaba a `reinitGamification()`, que rederiva el
 * estado desde CERO. Todo lo que se gana en vivo y el historial no sabe
 * reproducir —los bonos de hito de racha, el escalon real de cada PR, el XP de
 * ascenso de rango, la mejor racha, la fecha de desbloqueo de los logros— se
 * perdia. Un usuario con 4.613 XP importaba UNA sesion vieja y salia con 3.809
 * y un nivel menos, bajo un toast verde. Irreversible.
 *
 * La regla, y lo que estas pruebas fijan: por importar un archivo no puede
 * bajar ninguna cifra.
 */

function sesion(diasAtras: number, peso: number): HistorySession {
  const hoy = new Date();
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - diasAtras, 19, 0);
  return {
    sessionId: `s_${diasAtras}`,
    date: d.toISOString(),
    savedAt: d.toISOString(),
    grupo: 'GRUPO 1 - Piernas + Glúteos',
    type: 'weights',
    volumenTotal: peso * 48,
    volumenPorGrupo: { Piernas: peso * 48 },
    ejercicios: [
      { nombre: 'Prensa de Piernas', sets: 4, reps: 12, peso, volumen: peso * 48,
        completado: true, esMancuerna: false, grupoMuscular: 'Piernas' },
    ],
  } as HistorySession;
}

const CLAVE = 'gymmate_gamification';

beforeEach(() => localStorage.clear());

describe('fusionarGamificacion · nada de lo ganado puede bajar', () => {
  it('conserva el XP ganado en vivo cuando el historial rederiva menos', () => {
    localStorage.setItem('gymmate_history', JSON.stringify([1, 3, 5].map((d) => sesion(d, 100))));
    initGamification();
    const g = JSON.parse(localStorage.getItem(CLAVE)!);
    const rederivado = g.playerStats.totalXP;
    g.playerStats.totalXP = rederivado + 3000;
    localStorage.setItem(CLAVE, JSON.stringify(g));

    fusionarGamificacion();
    const despues = JSON.parse(localStorage.getItem(CLAVE)!);
    expect(despues.playerStats.totalXP).toBe(rederivado + 3000);
    // Y el nivel se recalcula desde el XP que sobrevive, no desde el rederivado.
    expect(despues.playerStats.level).toBeGreaterThanOrEqual(g.playerStats.level);
  });

  it('conserva la mejor racha y los hitos cobrados', () => {
    localStorage.setItem('gymmate_history', JSON.stringify([1, 3].map((d) => sesion(d, 100))));
    initGamification();
    const g = JSON.parse(localStorage.getItem(CLAVE)!);
    g.streakData.bestStreak = 31;
    g.streakData.streakMilestones = [3, 7, 14, 30];
    localStorage.setItem(CLAVE, JSON.stringify(g));

    fusionarGamificacion();
    const despues = JSON.parse(localStorage.getItem(CLAVE)!);
    expect(despues.streakData.bestStreak).toBe(31);
    expect(despues.streakData.streakMilestones).toEqual([3, 7, 14, 30]);
  });

  it('un logro conseguido no se desconsigue, y conserva su fecha', () => {
    localStorage.setItem('gymmate_history', JSON.stringify([sesion(1, 100)]));
    initGamification();
    const g = JSON.parse(localStorage.getItem(CLAVE)!);
    const pendiente = g.achievements.find((a: { unlockedAt?: string }) => !a.unlockedAt);
    pendiente.unlockedAt = '2026-01-15T12:00:00.000Z';
    const conseguidosAntes = g.achievements.filter((a: { unlockedAt?: string }) => a.unlockedAt).length;
    localStorage.setItem(CLAVE, JSON.stringify(g));

    fusionarGamificacion();
    const despues = JSON.parse(localStorage.getItem(CLAVE)!);
    expect(despues.achievements.filter((a: { unlockedAt?: string }) => a.unlockedAt).length)
      .toBeGreaterThanOrEqual(conseguidosAntes);
    expect(despues.achievements.find((a: { id: string }) => a.id === pendiente.id).unlockedAt)
      .toBe('2026-01-15T12:00:00.000Z');
  });

  it('con estado vacio se comporta como la migracion: rellena en vez de dejar cero', () => {
    // El caso que motivó llamar a esto al importar: navegador limpio, historial
    // restaurado, y la home diciendo "NIVEL 1 · 0 XP" con el heatmap lleno.
    localStorage.setItem('gymmate_history', JSON.stringify([1, 3, 5, 8].map((d) => sesion(d, 120))));
    fusionarGamificacion();
    const despues = JSON.parse(localStorage.getItem(CLAVE)!);
    expect(despues.playerStats.totalXP).toBeGreaterThan(0);
    expect(despues.initialized).toBe(true);
  });

  it('los rangos musculares SI se rederivan: es lo que la importacion amplia', () => {
    localStorage.setItem('gymmate_history', JSON.stringify([sesion(1, 60)]));
    localStorage.setItem('gymmate_profile', JSON.stringify({ weight: 80, height: 176, gender: 'male' }));
    localStorage.setItem('gymmate_prs', JSON.stringify({
      'Prensa de Piernas': { peso: 60, sets: 4, reps: 12, volumen: 2880, date: new Date().toISOString() },
    }));
    initGamification();
    const antes = JSON.parse(localStorage.getItem(CLAVE)!).muscleRanks?.piernas?.ratio ?? 0;
    expect(antes).toBeGreaterThan(0);

    localStorage.setItem('gymmate_history', JSON.stringify([sesion(1, 200), sesion(3, 60)]));
    localStorage.setItem('gymmate_prs', JSON.stringify({
      'Prensa de Piernas': { peso: 200, sets: 4, reps: 12, volumen: 9600, date: new Date().toISOString() },
    }));
    fusionarGamificacion();
    const despues = JSON.parse(localStorage.getItem(CLAVE)!).muscleRanks?.piernas?.ratio ?? 0;
    expect(despues).toBeGreaterThan(antes);
  });

  it('reinitGamification SIGUE reemplazando: es lo que "Recalcular el XP" pide', () => {
    localStorage.setItem('gymmate_history', JSON.stringify([sesion(1, 100)]));
    initGamification();
    const g = JSON.parse(localStorage.getItem(CLAVE)!);
    const rederivado = g.playerStats.totalXP;
    g.playerStats.totalXP = rederivado + 5000;
    localStorage.setItem(CLAVE, JSON.stringify(g));

    reinitGamification();
    expect(JSON.parse(localStorage.getItem(CLAVE)!).playerStats.totalXP).toBe(rederivado);
  });
});
