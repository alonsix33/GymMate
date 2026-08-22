import { LOWER_BODY_KEYWORDS } from '@/constants';
import type { ExerciseData, MuscleGroup, OneRMResult, ProgressiveResult } from '@/types';
import { getHistory, getPR } from './storage';
import { normalizeExerciseName, isSameExercise } from './exercise-normalizer';
import { getExerciseInfo } from '@/data/exercises';

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
  const brzycki = peso * (36 / (37 - reps));
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

  // El deficit y el superavit salen del TDEE YA REDONDEADO, que es la cifra
  // que el usuario ve arriba. Desde el sin redondear, 1715 x 1.55 x 0.8 da
  // 2126.6 -> 2,127, y CA-02 del mockup escribe 2,126 (= 2658 x 0.8). Un kcal,
  // pero la cifra del handoff manda y ademas asi las tres filas son coherentes
  // entre si: el usuario puede rehacer la cuenta con la que tiene delante.
  const tdee = Math.round(bmr * activityLevel);
  const deficit = Math.round(tdee * 0.8);
  const surplus = Math.round(tdee * 1.2);

  return {
    bmr: Math.round(bmr),
    tdee,
    deficit,
    maintenance: tdee,
    surplus,
  };
}

// ==========================================
// CÁLCULO DE PESO PROGRESIVO (ACSM/NSCA)
// ==========================================

/** El peso mas alto registrado para un ejercicio en todo el historial. */
function mejorPesoDelHistorial(exerciseName: string): number {
  const normalizado = normalizeExerciseName(exerciseName);
  let mejor = 0;
  for (const sesion of getHistory()) {
    for (const ej of sesion.ejercicios ?? []) {
      if (isSameExercise(ej.nombre, normalizado) && ej.peso > mejor) mejor = ej.peso;
    }
  }
  return mejor;
}

/**
 * Tren inferior por el grupo muscular real del ejercicio.
 *
 * Primero el historial, que es donde el ejercicio ya viaja con su
 * `grupoMuscular`; luego el catalogo. Solo si el ejercicio no existe en
 * ninguno de los dos se cae a las keywords, y eso se anota: un ejercicio
 * inventado por el usuario no tiene grupo en ningun sitio.
 */
export function esTrenInferior(exerciseName: string): boolean {
  const GRUPOS_INFERIORES = new Set<MuscleGroup>(['Piernas', 'Glúteos']);
  const normalizado = normalizeExerciseName(exerciseName);

  for (const sesion of getHistory()) {
    for (const ej of sesion.ejercicios ?? []) {
      if (isSameExercise(ej.nombre, normalizado) && ej.grupoMuscular) {
        return GRUPOS_INFERIORES.has(ej.grupoMuscular);
      }
    }
  }

  const info = getExerciseInfo(exerciseName);
  if (info) return GRUPOS_INFERIORES.has(info.grupoMuscular);

  // Ultimo recurso para ejercicios que no estan ni en el historial ni en el
  // catalogo: no hay grupo que consultar.
  return LOWER_BODY_KEYWORDS.some((k) => exerciseName.toLowerCase().includes(k));
}

export function calculateProgressive(
  exerciseName: string
): ProgressiveResult | null {
  // El PR si existe; si no, el mejor peso del historial.
  //
  // Las dos calculadoras viven en la MISMA pantalla y no pueden discrepar
  // sobre si has levantado algo: `calculate1RM` deriva del historial y daba su
  // cifra, mientras el progresivo decia "todavia no tiene récord" del mismo
  // ejercicio. Pasa de verdad con un historial importado por CSV, que trae las
  // sesiones pero no reescribe la tabla de PRs.
  const currentWeight = getPR(exerciseName)?.peso ?? mejorPesoDelHistorial(exerciseName);
  if (!(currentWeight > 0)) {
    return null;
  }

  // Cambio aprobado nº 3 del handoff: clasificar por el GRUPO MUSCULAR REAL,
  // no por keywords del nombre. "Peso Muerto Rumano" no contiene ninguna
  // palabra de pierna y es tren inferior; "Prensa militar" contiene "prensa" y
  // es tren superior.
  const isLowerBody = esTrenInferior(exerciseName);

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
