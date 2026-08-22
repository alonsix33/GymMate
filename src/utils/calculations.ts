import { LOWER_BODY_KEYWORDS } from '@/constants';
import type { ExerciseData, MuscleGroup, OneRMResult, ProgressiveResult } from '@/types';
import { getHistory, getPR } from './storage';
import { normalizeExerciseName, isSameExercise } from './exercise-normalizer';
import { getExerciseInfo, allExercises } from '@/data/exercises';

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

/** Tope de repeticiones con el que las tres formulas siguen siendo un ajuste
 *  razonable. Por encima, la estimacion no vale y se dice que no vale. */
export const REPS_MAX_1RM = 15;

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

  // Fuera de dominio no hay 1RM que estimar.
  //
  // Brzycki es `peso × 36/(37−reps)`: en 37 repeticiones el denominador es CERO
  // y la cifra grande de CA-01 escribia "Infinity kg"; en 38, −430.6 kg. Las
  // tres formulas son ajustes empiricos validos hasta ~12-15 repeticiones, y ya
  // en 30 Brzycki da 5 veces el peso movido. Una serie de 37 repeticiones es
  // perfectamente registrable (gemelos, abdominales).
  if (!Number.isFinite(peso) || peso <= 0 || !Number.isFinite(reps) || reps < 1 || reps > REPS_MAX_1RM) {
    return null;
  }

  // Tres fórmulas de 1RM
  const { epley, brzycki, lombardi } = formulasDe1RM(peso, reps);

  return {
    bestPerformance: performance,
    epley: epley.toFixed(1),
    brzycki: brzycki.toFixed(1),
    lombardi: lombardi.toFixed(1),
    average: ((epley + brzycki + lombardi) / 3).toFixed(1),
  };
}

/**
 * Las tres formulas, en un solo sitio.
 *
 * PR-01 y CA-01 enseñan el PROMEDIO de las tres bajo el rotulo "1RM
 * estimado"; el coach (CO-01) usaba `estimateOneRM`, que es Epley a secas, y
 * pintaba 168 kg donde las otras dos pantallas ponen 165 para el mismo
 * ejercicio y la misma serie. Dos cifras distintas con el mismo rotulo en la
 * misma app destruyen la confianza en las dos.
 */
export function formulasDe1RM(peso: number, reps: number): {
  epley: number;
  brzycki: number;
  lombardi: number;
} {
  return {
    epley: peso * (1 + reps / 30),
    brzycki: peso * (36 / (37 - reps)),
    lombardi: peso * Math.pow(reps, 0.1),
  };
}

/**
 * El promedio de las tres, que es LA cifra que la app llama "1RM estimado".
 * Devuelve null fuera del dominio de las formulas, igual que `calculate1RM`.
 */
export function unaRepMaxPromedio(peso: number, reps: number): number | null {
  if (!Number.isFinite(peso) || peso <= 0 || !Number.isFinite(reps) || reps < 1 || reps > REPS_MAX_1RM) {
    return null;
  }
  const { epley, brzycki, lombardi } = formulasDe1RM(peso, reps);
  return (epley + brzycki + lombardi) / 3;
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
  // Desde el BMR REDONDEADO, que es el que la tarjeta enseña. Con el crudo,
  // 1592.5 × 1.55 daba 2468 mientras la pantalla invitaba a multiplicar
  // 1593 × 1.55 = 2469. Es la unica multiplicacion que el usuario puede
  // rehacer de cabeza, y no cuadraba en el 43% de los casos.
  const bmrMostrado = Math.round(bmr);
  const tdee = Math.round(bmrMostrado * activityLevel);
  const deficit = Math.round(tdee * 0.8);
  const surplus = Math.round(tdee * 1.2);

  return {
    bmr: bmrMostrado,
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

  // Con el nombre NORMALIZADO y, si no, por alias: el catalogo guarda
  // "RDL / Peso Muerto Rumano" y `getExerciseInfo('Peso Muerto Rumano')` no lo
  // encontraba, asi que caia a las keywords y clasificaba como tren superior
  // justo el ejemplo que el comentario de arriba dice haber arreglado.
  const info =
    getExerciseInfo(normalizado) ??
    getExerciseInfo(exerciseName) ??
    allExercises.find((e) => isSameExercise(e.nombre, normalizado));
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

  // Redondear a múltiplos de 2.5kg.
  //
  // El `Math.round(w * 1e6) / 1e6` no es cosmetico: `100 × 1.1` da
  // 110.00000000000001 en doble, y `Math.ceil` de eso salta un escalon entero
  // — el "agresivo +10%" de una sentadilla de 100 kg salia 112.5, o sea
  // +12.5%. Pasaba con 25, 50, 100 y 200 kg, que son justo los pesos redondos.
  const roundTo2_5 = (weight: number) => Math.ceil(Math.round(weight * 1e6) / 1e6 / 2.5) * 2.5;

  conservative = roundTo2_5(conservative);
  // Tres rotulos distintos exigen tres cifras distintas. Con un PR bajo el
  // redondeo a 2.5 las colapsaba: "Curl con Barra PR 20" daba 22.5 / 22.5 /
  // 22.5 bajo Conservador, Moderado y Agresivo.
  moderate = Math.max(roundTo2_5(moderate), conservative + 2.5);
  aggressive = Math.max(roundTo2_5(aggressive), moderate + 2.5);

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
