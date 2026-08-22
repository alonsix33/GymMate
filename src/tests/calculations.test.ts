import { describe, it, expect } from 'vitest';
import {
  calculateVolume,
  calculateVolumenPorGrupo,
  calculateCalories,
  calculate1RM,
  REPS_MAX_1RM,
  getWeekNumber,
  daysSince,
} from '../utils/calculations';
import type { ExerciseData, MuscleGroup } from '../types';

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

describe('1RM fuera de dominio', () => {
  it('37 repeticiones no producen Infinity', () => {
    // Brzycki es `peso x 36/(37-reps)`: en 37 el denominador es CERO y la
    // cifra grande de CA-01 escribia "Infinity kg"; en 38, -430.6 kg.
    localStorage.setItem(
      'gymmate_history',
      JSON.stringify([
        {
          sessionId: 'w', date: '2026-08-10T12:00:00', savedAt: '2026-08-10T12:00:00',
          grupo: 'Core', type: 'weights', volumenTotal: 0, volumenPorGrupo: {},
          ejercicios: [{ nombre: 'Abdominales', sets: 1, reps: 37, peso: 40, volumen: 1480,
            completado: true, esMancuerna: false, grupoMuscular: 'Core' }],
        },
      ])
    );
    expect(calculate1RM('Abdominales')).toBeNull();
    localStorage.clear();
  });

  it('dentro de dominio, las tres formulas dan cifras posibles', () => {
    for (let reps = 1; reps <= REPS_MAX_1RM; reps++) {
      localStorage.setItem(
        'gymmate_history',
        JSON.stringify([
          {
            sessionId: 'w', date: '2026-08-10T12:00:00', savedAt: '2026-08-10T12:00:00',
            grupo: 'Pecho', type: 'weights', volumenTotal: 0, volumenPorGrupo: {},
            ejercicios: [{ nombre: 'Press', sets: 1, reps, peso: 80, volumen: 80 * reps,
              completado: true, esMancuerna: false, grupoMuscular: 'Pecho' }],
          },
        ])
      );
      const r = calculate1RM('Press');
      expect(r).not.toBeNull();
      for (const v of [r!.epley, r!.brzycki, r!.lombardi, r!.average].map(Number)) {
        expect(Number.isFinite(v)).toBe(true);
        // Un 1RM nunca es menor que el peso movido ni el triple de el.
        expect(v).toBeGreaterThanOrEqual(80);
        expect(v).toBeLessThanOrEqual(240);
      }
    }
    localStorage.clear();
  });
});

describe('CA-02 · el BMR que se enseña es el que multiplica', () => {
  it('BMR x actividad da el TDEE de la pantalla', () => {
    // 1592.5 x 1.55 daba 2468 mientras la tarjeta invitaba a multiplicar
    // 1593 x 1.55 = 2469. Es la unica cuenta que el usuario puede rehacer.
    for (const edad of [22, 25, 40, 61]) {
      for (const peso of [55, 65, 82, 104]) {
        for (const altura of [155, 170, 178, 191]) {
          for (const act of [1.2, 1.375, 1.55, 1.725, 1.9]) {
            const r = calculateCalories(edad, 'male', peso, altura, act);
            expect(Math.round(r.bmr * act)).toBe(r.tdee);
            expect(Math.round(r.tdee * 0.8)).toBe(r.deficit);
            expect(Math.round(r.tdee * 1.2)).toBe(r.surplus);
          }
        }
      }
    }
  });
});
