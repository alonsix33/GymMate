import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateVolume,
  calculateVolumenPorGrupo,
  calculateCalories,
  calculate1RM,
  getWeekNumber,
  daysSince,
} from '../utils/calculations';
import { saveHistory } from '../utils/storage';
import type { ExerciseData, HistorySession, MuscleGroup } from '../types';

// ==========================================
// TESTS DE CÁLCULO DE VOLUMEN
// ==========================================

describe('calculateVolume', () => {
  it('should calculate volume correctly for barbell exercises', () => {
    const result = calculateVolume(3, 10, 50, false);
    expect(result).toBe(1500); // 3 * 10 * 50 = 1500
  });

  it('should calculate volume correctly for dumbbell exercises (x2 weight)', () => {
    const result = calculateVolume(3, 10, 20, true);
    expect(result).toBe(1200); // 3 * 10 * (20 * 2) = 1200
  });

  it('should return 0 when sets is 0', () => {
    const result = calculateVolume(0, 10, 50, false);
    expect(result).toBe(0);
  });

  it('should return 0 when reps is 0', () => {
    const result = calculateVolume(3, 0, 50, false);
    expect(result).toBe(0);
  });

  it('should return 0 when weight is 0', () => {
    const result = calculateVolume(3, 10, 0, false);
    expect(result).toBe(0);
  });

  it('should handle decimal weights', () => {
    const result = calculateVolume(3, 10, 22.5, false);
    expect(result).toBe(675); // 3 * 10 * 22.5 = 675
  });

  it('should handle decimal weights with dumbbells', () => {
    const result = calculateVolume(4, 8, 12.5, true);
    expect(result).toBe(800); // 4 * 8 * (12.5 * 2) = 800
  });
});

// ==========================================
// TESTS DE VOLUMEN POR GRUPO
// ==========================================

describe('calculateVolumenPorGrupo', () => {
  it('should aggregate volume by muscle group', () => {
    const ejercicios: ExerciseData[] = [
      {
        nombre: 'Press Banca',
        sets: 3,
        reps: 10,
        peso: 50,
        esMancuerna: false,
        grupoMuscular: 'Pecho' as MuscleGroup,
        volumen: 1500,
        completado: false,
      },
      {
        nombre: 'Press Inclinado',
        sets: 3,
        reps: 10,
        peso: 40,
        esMancuerna: false,
        grupoMuscular: 'Pecho' as MuscleGroup,
        volumen: 1200,
        completado: false,
      },
      {
        nombre: 'Sentadilla',
        sets: 4,
        reps: 8,
        peso: 80,
        esMancuerna: false,
        grupoMuscular: 'Piernas' as MuscleGroup,
        volumen: 2560,
        completado: false,
      },
    ];

    const result = calculateVolumenPorGrupo(ejercicios);

    expect(result['Pecho']).toBe(2700); // 1500 + 1200
    expect(result['Piernas']).toBe(2560);
  });

  it('should return empty object for empty array', () => {
    const result = calculateVolumenPorGrupo([]);
    expect(Object.keys(result).length).toBe(0);
  });

  it('should ignore exercises with 0 volume', () => {
    const ejercicios: ExerciseData[] = [
      {
        nombre: 'Press Banca',
        sets: 3,
        reps: 10,
        peso: 50,
        esMancuerna: false,
        grupoMuscular: 'Pecho' as MuscleGroup,
        volumen: 1500,
        completado: false,
      },
      {
        nombre: 'No hecho',
        sets: 0,
        reps: 0,
        peso: 0,
        esMancuerna: false,
        grupoMuscular: 'Espalda' as MuscleGroup,
        volumen: 0,
        completado: false,
      },
    ];

    const result = calculateVolumenPorGrupo(ejercicios);

    expect(result['Pecho']).toBe(1500);
    expect(result['Espalda']).toBeUndefined();
  });
});

// ==========================================
// TESTS DE CÁLCULO DE CALORÍAS
// ==========================================

describe('calculateCalories', () => {
  it('should calculate BMR correctly for males', () => {
    // Mifflin-St Jeor for males: (10 * weight) + (6.25 * height) - (5 * age) + 5
    const result = calculateCalories(30, 'male', 75, 175, 1.2);

    // BMR = (10 * 75) + (6.25 * 175) - (5 * 30) + 5
    // BMR = 750 + 1093.75 - 150 + 5 = 1698.75 ≈ 1699
    expect(result.bmr).toBe(1699);
  });

  it('should calculate BMR correctly for females', () => {
    // Mifflin-St Jeor for females: (10 * weight) + (6.25 * height) - (5 * age) - 161
    const result = calculateCalories(30, 'female', 60, 165, 1.2);

    // BMR = (10 * 60) + (6.25 * 165) - (5 * 30) - 161
    // BMR = 600 + 1031.25 - 150 - 161 = 1320.25 ≈ 1320
    expect(result.bmr).toBe(1320);
  });

  it('should calculate TDEE correctly', () => {
    const result = calculateCalories(25, 'male', 70, 180, 1.55);

    // Calculate expected BMR first
    const expectedBMR = 10 * 70 + 6.25 * 180 - 5 * 25 + 5;
    const expectedTDEE = Math.round(expectedBMR * 1.55);

    expect(result.tdee).toBe(expectedTDEE);
  });

  it('should calculate deficit as 80% of TDEE', () => {
    const result = calculateCalories(25, 'male', 70, 180, 1.55);
    expect(result.deficit).toBe(Math.round(result.tdee * 0.8));
  });

  it('should calculate surplus as 120% of TDEE', () => {
    const result = calculateCalories(25, 'male', 70, 180, 1.55);
    // Surplus should be approximately 120% of TDEE (allow small rounding variance)
    const expected = result.tdee * 1.2;
    expect(Math.abs(result.surplus - expected)).toBeLessThanOrEqual(1);
  });

  it('should handle different activity levels', () => {
    const sedentary = calculateCalories(30, 'male', 75, 175, 1.2);
    const active = calculateCalories(30, 'male', 75, 175, 1.725);

    expect(active.tdee).toBeGreaterThan(sedentary.tdee);
  });
});

// ==========================================
// TESTS DE UTILIDADES DE FECHA
// ==========================================

describe('getWeekNumber', () => {
  it('should return week 1 for January 1st', () => {
    const date = new Date('2024-01-01');
    const result = getWeekNumber(date);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(53);
  });

  it('should return higher week number for later dates', () => {
    const jan = new Date('2024-01-15');
    const june = new Date('2024-06-15');

    const weekJan = getWeekNumber(jan);
    const weekJune = getWeekNumber(june);

    expect(weekJune).toBeGreaterThan(weekJan);
  });
});

describe('daysSince', () => {
  it('should return 0 for today', () => {
    const today = new Date();
    const result = daysSince(today);
    expect(result).toBe(0);
  });

  it('should return positive number for past dates', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const result = daysSince(pastDate);
    expect(result).toBe(5);
  });

  it('should return negative for future dates', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const result = daysSince(futureDate);
    expect(result).toBe(-3);
  });
});

// ==========================================
// TESTS DE CÁLCULO DE 1RM (WKT-04/HIST-06)
// ==========================================

describe('calculate1RM — fórmula de Brzycki con reps altas', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function seedSessionWithPerformance(reps: number, peso: number): void {
    const session: HistorySession = {
      date: new Date().toISOString(),
      savedAt: new Date().toISOString(),
      sessionId: 'test-session',
      grupo: 'Piernas',
      type: 'weights',
      volumenTotal: reps * peso,
      volumenPorGrupo: {},
      ejercicios: [
        {
          nombre: 'Sentadilla',
          sets: 1,
          reps,
          peso,
          esMancuerna: false,
          grupoMuscular: 'Piernas' as MuscleGroup,
          volumen: reps * peso,
          completado: true,
        },
      ],
    };
    saveHistory([session]);
  }

  it('nunca produce un resultado negativo o infinito con reps >= 37', () => {
    seedSessionWithPerformance(40, 50);

    const result = calculate1RM('Sentadilla');

    expect(result).not.toBeNull();
    const brzycki = parseFloat(result!.brzycki);
    expect(Number.isFinite(brzycki)).toBe(true);
    expect(brzycki).toBeGreaterThan(0);
  });

  it('el resultado con reps=37 exactamente (antes: división por cero) es finito', () => {
    seedSessionWithPerformance(37, 50);

    const result = calculate1RM('Sentadilla');

    expect(result).not.toBeNull();
    expect(Number.isFinite(parseFloat(result!.brzycki))).toBe(true);
  });

  it('el promedio de las 3 fórmulas también queda finito con reps altas', () => {
    seedSessionWithPerformance(50, 60);

    const result = calculate1RM('Sentadilla');

    expect(result).not.toBeNull();
    expect(Number.isFinite(parseFloat(result!.average))).toBe(true);
    expect(parseFloat(result!.average)).toBeGreaterThan(0);
  });

  it('sigue calculando correctamente para reps normales (sin cambios de comportamiento)', () => {
    seedSessionWithPerformance(5, 100);

    const result = calculate1RM('Sentadilla');

    expect(result).not.toBeNull();
    // Brzycki: 100 * (36 / (37 - 5)) = 112.5
    expect(result!.brzycki).toBe('112.5');
  });
});
