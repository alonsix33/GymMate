// ==========================================
// TIPOS PRINCIPALES
// ==========================================

// Re-export gamification types
export * from './gamification';

export interface Exercise {
  nombre: string;
  esMancuerna: boolean;
  grupoMuscular: MuscleGroup;
}

export interface ExerciseData extends Exercise {
  sets: number;
  reps: number;
  peso: number;
  volumen: number;
  completado: boolean;
}

export interface SessionData {
  date: string;
  grupo: string;
  ejercicios: ExerciseData[];
  volumenTotal: number;
  volumenPorGrupo: Record<string, number>;
  savedAt?: string;
  sessionId?: string;
}

export interface TrainingGroup {
  nombre: string;
  ejercicios: Exercise[];
  opcionales: Exercise[];
}

export interface PRData {
  peso: number;
  sets: number;
  reps: number;
  volumen: number;
  date: string;
}

export interface ProfileData {
  name: string;
  birthdate: string;
  gender: 'male' | 'female';
  weight: number;
  height: number;
  activity: number;
}

export interface CardioExercise {
  difficulty: number;
  calories: number;
  muscles: string[];
  desc: string;
}

export interface CardioSessionStats {
  totalTime: number;
  workTime: number;
  restTime: number;
  roundsCompleted: number;
  calories: number;
}

export interface CardioSession {
  type: 'cardio';
  mode: CardioMode;
  date: string;
  config: CardioConfig;
  stats: CardioSessionStats;
}

export interface CardioState {
  mode: CardioMode | null;
  config: CardioConfig;
  isPaused: boolean;
  currentPhase: 'work' | 'rest' | 'roundRest' | 'emom';
  currentRound: number;
  currentExerciseIndex: number;
  timeRemaining: number;
  totalTimeElapsed: number;
  workTimeTotal: number;
  restTimeTotal: number;
  startTime: number | null;
}

export interface CardioConfig {
  rounds?: number;
  roundRest?: number;
  work?: number;
  rest?: number;
  interval?: number;
  duration?: number;
  exercise?: string;
  exercises?: CardioExerciseConfig[];
  reps?: number;
  levels?: number[];
}

export interface CardioExerciseConfig {
  name: string;
  target: number;
  type: 'reps' | 'time';
}

export interface RPEData {
  value: number;  // 1-10
  label: string;  // "Fácil", "Moderado", etc.
}

export interface HistorySession extends SessionData {
  type?: 'weights' | 'cardio';
  mode?: CardioMode;
  stats?: CardioSessionStats;
  rpe?: RPEData;
}

export interface OneRMResult {
  bestPerformance: ExerciseData;
  epley: string;
  brzycki: string;
  lombardi: string;
  average: string;
}

export interface ProgressiveResult {
  current: number;
  conservative: string;
  moderate: string;
  aggressive: string;
  exerciseType: 'Tren Inferior' | 'Tren Superior';
}

export interface MuscleRecommendation {
  muscle: string;
  daysSince: number;
  isNew: boolean;
  suggestedRoutines: string[];
}

export type MuscleGroup =
  | 'Glúteos'
  | 'Piernas'
  | 'Hombros'
  | 'Pecho'
  | 'Tríceps'
  | 'Espalda'
  | 'Bíceps'
  | 'Core';

export type CardioMode =
  | 'emom'
  | 'tabata'
  | 'circuit'
  | 'pyramid'
  | 'custom'
  | 'amrap'
  | 'fortime';

export interface BodyMeasurement {
  date: string;
  weight?: number;
  neck?: number;
  chest?: number;
  waist?: number;
  hips?: number;
  armLeft?: number;
  armRight?: number;
  thighLeft?: number;
  thighRight?: number;
  bodyFat?: number; // Calculated from Navy method
}

export type TabName =
  | 'home'
  | 'workout'
  | 'calculators'
  | 'charts'
  | 'history'
  | 'prs'
  | 'profile'
  | 'workoutBuilder';
