import type { TrainingGroup } from '@/types';
import { getExerciseImage, getExerciseGuidance as getGuidance } from '@/data/exercises';
import { getCustomWorkouts } from '@/utils/storage';

// ==========================================
// GRUPOS DE ENTRENAMIENTO PREDEFINIDOS
// ==========================================

export const trainingGroups: Record<string, TrainingGroup> = {
  grupo1: {
    nombre: 'GRUPO 1 - Piernas + Glúteos',
    ejercicios: [
      {
        nombre: 'Prensa de Piernas',
        esMancuerna: false,
        grupoMuscular: 'Piernas',
      },
      {
        nombre: 'Abductora Máquina',
        esMancuerna: false,
        grupoMuscular: 'Glúteos',
      },
      {
        nombre: 'Aductora Máquina',
        esMancuerna: false,
        grupoMuscular: 'Piernas',
      },
      {
        nombre: 'Patada de Glúteo en Máquina',
        esMancuerna: false,
        grupoMuscular: 'Glúteos',
      },
      {
        nombre: 'Extensión de Cuádriceps',
        esMancuerna: false,
        grupoMuscular: 'Piernas',
      },
      {
        nombre: 'RDL / Peso Muerto Rumano',
        esMancuerna: false,
        grupoMuscular: 'Glúteos',
      },
    ],
    opcionales: [
      {
        nombre: 'Hip Thrust',
        esMancuerna: false,
        grupoMuscular: 'Glúteos',
      },
      {
        nombre: 'Abdominales en Máquina',
        esMancuerna: false,
        grupoMuscular: 'Core',
      },
    ],
  },
  grupo2: {
    nombre: 'GRUPO 2 - Upper Push',
    ejercicios: [
      {
        nombre: 'Press Militar',
        esMancuerna: false,
        grupoMuscular: 'Hombros',
      },
      { nombre: 'Press Banca', esMancuerna: false, grupoMuscular: 'Pecho' },
      {
        nombre: 'Elevación Lateral',
        esMancuerna: true,
        grupoMuscular: 'Hombros',
      },
      {
        nombre: 'Fondos en Máquina',
        esMancuerna: false,
        grupoMuscular: 'Tríceps',
      },
    ],
    opcionales: [
      {
        nombre: 'Press Inclinado',
        esMancuerna: false,
        grupoMuscular: 'Pecho',
      },
      {
        nombre: 'Extensión de Tríceps en Polea',
        esMancuerna: false,
        grupoMuscular: 'Tríceps',
      },
      {
        nombre: 'Abdominales en Máquina',
        esMancuerna: false,
        grupoMuscular: 'Core',
      },
    ],
  },
  grupo3: {
    nombre: 'GRUPO 3 - Piernas Quad Dominante',
    ejercicios: [
      { nombre: 'Sentadilla', esMancuerna: false, grupoMuscular: 'Piernas' },
      {
        nombre: 'Prensa de Piernas',
        esMancuerna: false,
        grupoMuscular: 'Piernas',
      },
      {
        nombre: 'Extensión de Cuádriceps',
        esMancuerna: false,
        grupoMuscular: 'Piernas',
      },
      {
        nombre: 'Aductora Máquina',
        esMancuerna: false,
        grupoMuscular: 'Piernas',
      },
    ],
    opcionales: [
      {
        nombre: 'Sentadilla Hack',
        esMancuerna: false,
        grupoMuscular: 'Piernas',
      },
      {
        nombre: 'Zancadas con Barra',
        esMancuerna: false,
        grupoMuscular: 'Piernas',
      },
      {
        nombre: 'Abdominales en Máquina',
        esMancuerna: false,
        grupoMuscular: 'Core',
      },
    ],
  },
  grupo4: {
    nombre: 'GRUPO 4 - Espalda + Bíceps',
    ejercicios: [
      {
        nombre: 'Jalón al Pecho',
        esMancuerna: false,
        grupoMuscular: 'Espalda',
      },
      {
        nombre: 'Remo en Máquina',
        esMancuerna: false,
        grupoMuscular: 'Espalda',
      },
      {
        nombre: 'Remo Mancuerna',
        esMancuerna: true,
        grupoMuscular: 'Espalda',
      },
      {
        nombre: 'Curl Martillo',
        esMancuerna: true,
        grupoMuscular: 'Bíceps',
      },
      {
        nombre: 'Curl Martillo Cross-body',
        esMancuerna: true,
        grupoMuscular: 'Bíceps',
      },
    ],
    opcionales: [
      {
        nombre: 'Pull-Over en Polea',
        esMancuerna: false,
        grupoMuscular: 'Espalda',
      },
      {
        nombre: 'Abdominales en Máquina',
        esMancuerna: false,
        grupoMuscular: 'Core',
      },
    ],
  },
  grupo5: {
    nombre: 'GRUPO 5 - Hombro + Tríceps (aislamiento)',
    ejercicios: [
      {
        nombre: 'Elevación Lateral',
        esMancuerna: true,
        grupoMuscular: 'Hombros',
      },
      {
        nombre: 'Elevación Frontal / Y-Raise',
        esMancuerna: true,
        grupoMuscular: 'Hombros',
      },
      {
        nombre: 'Pájaros (rear delts)',
        esMancuerna: true,
        grupoMuscular: 'Hombros',
      },
      {
        nombre: 'Fondos en Máquina',
        esMancuerna: false,
        grupoMuscular: 'Tríceps',
      },
      {
        nombre: 'Extensión de Tríceps en Polea',
        esMancuerna: false,
        grupoMuscular: 'Tríceps',
      },
    ],
    opcionales: [
      {
        nombre: 'Face Pull',
        esMancuerna: false,
        grupoMuscular: 'Hombros',
      },
      {
        nombre: 'Abdominales en Máquina',
        esMancuerna: false,
        grupoMuscular: 'Core',
      },
    ],
  },
};

// ==========================================
// HELPER PARA OBTENER GRUPO
// ==========================================

/**
 * Busca un grupo por su NOMBRE ("GRUPO 1 - Piernas + Glúteos"), que es lo
 * unico que guarda el borrador: ahi no se persiste el id. Sin esto,
 * reanudar una sesion no encontraba el grupo y todos los opcionales pasaban a
 * obligatorios.
 */
export function getTrainingGroupPorNombre(nombre: string): TrainingGroup | null {
  if (!nombre) return null;
  for (const grupo of Object.values(trainingGroups)) {
    if (grupo.nombre === nombre) return grupo;
  }
  const propia = getCustomWorkouts().find((w) => w.nombre === nombre);
  return propia ?? null;
}

export function getTrainingGroup(grupoId: string): TrainingGroup | null {
  // First check predefined groups
  if (trainingGroups[grupoId]) {
    return trainingGroups[grupoId];
  }

  // Then check custom workouts
  const customWorkouts = getCustomWorkouts();
  const customWorkout = customWorkouts.find((w) => w.id === grupoId);
  if (customWorkout) {
    return customWorkout;
  }

  return null;
}

// Get exercise image from database
export function getExerciseGif(exerciseName: string): string | null {
  return getExerciseImage(exerciseName);
}

// Re-export for use in components
export const getExerciseGuidance = getGuidance;
