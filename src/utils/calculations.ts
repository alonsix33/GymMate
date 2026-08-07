import { LOWER_BODY_KEYWORDS } from '@/constants';
import type { ExerciseData, OneRMResult, ProgressiveResult } from '@/types';
import { getHistory, getPR } from './storage';
import { normalizeExerciseName, isSameExercise } from './exercise-normalizer';

// ==========================================
// CÁLCULO DE VOLUMEN
// ==========================================

export function calculateVolume(
  sets: number,
  reps: number,
  peso: number,
  esMancuerna: boolean
): number {
  const pesoFinal = esMancuerna ? peso * 2 : peso;
  return sets * reps * pesoFinal;
}

export function calculateVolumenPorGrupo(
  ejercicios: ExerciseData[]
): Record<string, number> {
  const volumenPorGrupo: Record<string, number> = {};

  ejercicios.forEach((ej) => {
    if (ej.volumen > 0) {
      const grupo = ej.grupoMuscular;
      if (!volumenPorGrupo[grupo]) {
        volumenPorGrupo[grupo] = 0;
      }
      volumenPorGrupo[grupo] += ej.volumen;
    }
  });

  return volumenPorGrupo;
}

// ==========================================
// CÁLCULO DE 1RM (Repetition Maximum)
// ==========================================

export function calculate1RM(exerciseName: string): OneRMResult | null {
  const history = getHistory();
  const normalizedName = normalizeExerciseName(exerciseName);

  let bestPerformance: ExerciseData | null = null;
  let maxWeight = 0;

  history.forEach((session) => {
    if (session.ejercicios && Array.isArray(session.ejercicios)) {
      const exercise = session.ejercicios.find(
        (ej) => isSameExercise(ej.nombre, normalizedName)
      );
      if (exercise && exercise.peso > 0) {
        if (
          exercise.peso > maxWeight ||
          (exercise.peso === maxWeight &&
            exercise.reps > (bestPerformance?.reps || 0))
        ) {
          maxWeight = exercise.peso;
          bestPerformance = exercise;
        }
      }
    }
  });

  if (!bestPerformance) {
    return null;
  }

  // TypeScript needs explicit assertion after closure assignment
  const performance = bestPerformance as ExerciseData;
  const peso = performance.peso;
  const reps = performance.reps;

  // Tres fórmulas de 1RM
  const epley = peso * (1 + reps / 30);
  // La fórmula de Brzycki solo está definida para reps < 37 (a partir de ahí
  // el denominador llega a 0 o se vuelve negativo, dando Infinity o un
  // resultado negativo sin sentido). Se acota al límite matemático de la
  // fórmula en vez de dejarla romperse (WKT-04/HIST-06).
  const brzyckiReps = Math.min(reps, 36);
  const brzycki = peso * (36 / (37 - brzyckiReps));
  const lombardi = peso * Math.pow(reps, 0.1);

  return {
    bestPerformance: performance,
    epley: epley.toFixed(1),
    brzycki: brzycki.toFixed(1),
    lombardi: lombardi.toFixed(1),
    average: ((epley + brzycki + lombardi) / 3).toFixed(1),
  };
}

// ==========================================
// CÁLCULO DE CALORÍAS (Mifflin-St Jeor)
// ==========================================

export interface CaloriesResult {
  bmr: number;
  tdee: number;
  deficit: number;
  maintenance: number;
  surplus: number;
}

export function calculateCalories(
  age: number,
  gender: 'male' | 'female',
  weight: number,
  height: number,
  activityLevel: number
): CaloriesResult {
  let bmr: number;

  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }

  const tdee = bmr * activityLevel;
  const deficit = tdee * 0.8;
  const surplus = tdee * 1.2;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficit: Math.round(deficit),
    maintenance: Math.round(tdee),
    surplus: Math.round(surplus),
  };
}

// ==========================================
// CÁLCULO DE PESO PROGRESIVO (ACSM/NSCA)
// ==========================================

export function calculateProgressive(
  exerciseName: string
): ProgressiveResult | null {
  const exercisePR = getPR(exerciseName);

  if (!exercisePR) {
    return null;
  }

  const currentWeight = exercisePR.peso;

  // Detectar si es tren inferior basado en el nombre del ejercicio
  const isLowerBody = LOWER_BODY_KEYWORDS.some((keyword) =>
    exerciseName.toLowerCase().includes(keyword)
  );

  let conservative: number, moderate: number, aggressive: number;

  if (isLowerBody) {
    // Tren inferior: incrementos mayores (NSCA: 5-10kg)
    conservative = currentWeight * 1.025; // 2.5%
    moderate = currentWeight * 1.075; // 7.5%
    aggressive = currentWeight * 1.1; // 10%
  } else {
    // Tren superior: incrementos menores (NSCA: 2.5-5kg)
    conservative = currentWeight * 1.025; // 2.5%
    moderate = currentWeight * 1.05; // 5%
    aggressive = currentWeight * 1.075; // 7.5%
  }

  // Redondear a múltiplos de 2.5kg
  const roundTo2_5 = (weight: number) => Math.ceil(weight / 2.5) * 2.5;

  conservative = roundTo2_5(conservative);
  moderate = roundTo2_5(moderate);
  aggressive = roundTo2_5(aggressive);

  return {
    current: currentWeight,
    conservative: conservative.toFixed(1),
    moderate: moderate.toFixed(1),
    aggressive: aggressive.toFixed(1),
    exerciseType: isLowerBody ? 'Tren Inferior' : 'Tren Superior',
  };
}

// ==========================================
// DETECCIÓN DE PR
// ==========================================

export function checkForPR(ejercicioData: ExerciseData): boolean {
  if (ejercicioData.volumen === 0) return false;

  const currentPR = getPR(ejercicioData.nombre);

  if (!currentPR || ejercicioData.peso > currentPR.peso) {
    return true;
  }

  return false;
}

// ==========================================
// UTILIDADES DE FECHA
// ==========================================

export function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear =
    (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

export function daysSince(date: Date): number {
  const today = new Date();
  return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-ES', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-ES', {
    month: 'short',
    day: 'numeric',
  });
}
