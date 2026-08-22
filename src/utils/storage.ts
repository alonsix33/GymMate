import { claveDiaDe } from '@/utils/fecha';
import { STORAGE_KEYS, MAX_HISTORY_ITEMS } from '@/constants';
import type {
  SessionData,
  PRData,
  ProfileData,
  HistorySession,
  TrainingGroup,
  BodyMeasurement,
} from '@/types';
import {
  normalizeExerciseName,
  migratePRsToNormalizedNames,
  migrateHistoryExerciseNames,
} from '@/utils/exercise-normalizer';

// ==========================================
// WRAPPER PARA LOCALSTORAGE
// ==========================================

function getItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving to localStorage: ${key}`, error);
  }
}

function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing from localStorage: ${key}`, error);
  }
}

// ==========================================
// HISTORY
// ==========================================

let historyMigrated = false;

export function getHistory(): HistorySession[] {
  const history = getItem<HistorySession[]>(STORAGE_KEYS.HISTORY, []);

  // Migrar historial a nombres normalizados si no se ha hecho
  if (!historyMigrated && history.length > 0) {
    const migrated = migrateHistoryExerciseNames(history);
    // Solo guardar si hay cambios
    if (JSON.stringify(migrated) !== JSON.stringify(history)) {
      setItem(STORAGE_KEYS.HISTORY, migrated);
    }
    historyMigrated = true;
    return migrated;
  }

  return history;
}

export function saveHistory(history: HistorySession[]): void {
  // Mantener solo los últimos MAX_HISTORY_ITEMS
  if (history.length > MAX_HISTORY_ITEMS) {
    history.length = MAX_HISTORY_ITEMS;
  }
  setItem(STORAGE_KEYS.HISTORY, history);
}

export function addToHistory(session: HistorySession): void {
  // Normalizar nombres de ejercicios antes de guardar
  const normalizedSession = {
    ...session,
    ejercicios: session.ejercicios?.map(ej => ({
      ...ej,
      nombre: normalizeExerciseName(ej.nombre),
    })) || [],
  };

  const history = getHistory();
  const existingIndex = history.findIndex(
    (s) => s.sessionId === normalizedSession.sessionId
  );

  if (existingIndex !== -1) {
    history[existingIndex] = normalizedSession;
  } else {
    history.unshift(normalizedSession);
  }

  saveHistory(history);
}

export function deleteFromHistory(index: number): void {
  const history = getHistory();
  history.splice(index, 1);
  saveHistory(history);
}

// ==========================================
// PRs
// ==========================================

let prsMigrated = false;

export function getPRs(): Record<string, PRData> {
  const prs = getItem<Record<string, PRData>>(STORAGE_KEYS.PRS, {});

  // Migrar PRs a nombres normalizados si no se ha hecho
  if (!prsMigrated && Object.keys(prs).length > 0) {
    const migrated = migratePRsToNormalizedNames(prs) as Record<string, PRData>;
    // Solo guardar si hay cambios
    if (JSON.stringify(migrated) !== JSON.stringify(prs)) {
      setItem(STORAGE_KEYS.PRS, migrated);
    }
    prsMigrated = true;
    return migrated;
  }

  return prs;
}

export function savePRs(prs: Record<string, PRData>): void {
  setItem(STORAGE_KEYS.PRS, prs);
}

export function updatePR(exerciseName: string, prData: PRData): void {
  const normalizedName = normalizeExerciseName(exerciseName);
  const prs = getPRs();
  prs[normalizedName] = prData;
  savePRs(prs);
}

export function getPR(exerciseName: string): PRData | null {
  const normalizedName = normalizeExerciseName(exerciseName);
  const prs = getPRs();
  return prs[normalizedName] || null;
}

// ==========================================
// PROFILE
// ==========================================

export function getProfile(): Partial<ProfileData> {
  return getItem<Partial<ProfileData>>(STORAGE_KEYS.PROFILE, {});
}

export function saveProfile(profile: ProfileData): void {
  setItem(STORAGE_KEYS.PROFILE, profile);
}

// ==========================================
// DRAFT (Auto-guardado)
// ==========================================

export interface DraftData extends SessionData {
  draftSavedAt: string;
  draftTimestamp: number;
}

export function getDraft(): DraftData | null {
  return getItem<DraftData | null>(STORAGE_KEYS.DRAFT, null);
}

export function saveDraft(session: SessionData): void {
  const draft: DraftData = {
    ...session,
    draftSavedAt: new Date().toISOString(),
    draftTimestamp: Date.now(),
  };
  setItem(STORAGE_KEYS.DRAFT, draft);
}

export function clearDraft(): void {
  removeItem(STORAGE_KEYS.DRAFT);
}

// ==========================================
// SESSION
// ==========================================

export function getSession(): SessionData | null {
  return getItem<SessionData | null>(STORAGE_KEYS.SESSION, null);
}

export function saveSession(session: SessionData): void {
  setItem(STORAGE_KEYS.SESSION, session);
}

export function clearSession(): void {
  removeItem(STORAGE_KEYS.SESSION);
}

// ==========================================
// CUSTOM WORKOUTS
// ==========================================

export interface CustomWorkout extends TrainingGroup {
  id: string;
  isCustom: boolean;
  createdAt: string;
}

export function getCustomWorkouts(): CustomWorkout[] {
  return getItem<CustomWorkout[]>(STORAGE_KEYS.CUSTOM_WORKOUTS, []);
}

export function saveCustomWorkouts(workouts: CustomWorkout[]): void {
  setItem(STORAGE_KEYS.CUSTOM_WORKOUTS, workouts);
}

export function addCustomWorkout(workout: CustomWorkout): void {
  const workouts = getCustomWorkouts();
  workouts.push(workout);
  saveCustomWorkouts(workouts);
}

export function deleteCustomWorkout(workoutId: string): void {
  const workouts = getCustomWorkouts();
  const filtered = workouts.filter((w) => w.id !== workoutId);
  saveCustomWorkouts(filtered);
}

// ==========================================
// CUSTOM EXERCISES (User-created exercises)
// ==========================================

export interface CustomExercise {
  id: string;
  nombre: string;
  grupoMuscular: string;
  esMancuerna: boolean;
  createdAt: string;
}

const CUSTOM_EXERCISES_KEY = 'gymmate_custom_exercises';

export function getCustomExercises(): CustomExercise[] {
  return getItem<CustomExercise[]>(CUSTOM_EXERCISES_KEY, []);
}

export function saveCustomExercises(exercises: CustomExercise[]): void {
  setItem(CUSTOM_EXERCISES_KEY, exercises);
}

export function addCustomExerciseToStorage(exercise: CustomExercise): void {
  const exercises = getCustomExercises();
  exercises.push(exercise);
  saveCustomExercises(exercises);
}

export function deleteCustomExercise(exerciseId: string): void {
  const exercises = getCustomExercises();
  const filtered = exercises.filter((e) => e.id !== exerciseId);
  saveCustomExercises(filtered);
}

// ==========================================
// BODY MEASUREMENTS
// ==========================================

const BODY_MEASUREMENTS_KEY = 'gymmate_body_measurements';
const MAX_MEASUREMENTS = 100; // Keep last 100 measurements

export function getBodyMeasurements(): BodyMeasurement[] {
  return getItem<BodyMeasurement[]>(BODY_MEASUREMENTS_KEY, []);
}

export function saveBodyMeasurements(measurements: BodyMeasurement[]): void {
  setItem(BODY_MEASUREMENTS_KEY, measurements);
}

export function addBodyMeasurement(measurement: BodyMeasurement): void {
  const measurements = getBodyMeasurements();

  // Una por dia LOCAL: `date` es un ISO en UTC, asi que recortar 'T' hacia que
  // la medicion de las 20:00 en Lima cayera en el dia siguiente y no
  // sobrescribiera la de la mañana. El README pide "una por dia, la de hoy
  // sobrescribe" — en el dia del usuario, no en el de Greenwich.
  const today = claveDiaDe(measurement.date);
  const existingIndex = measurements.findIndex((m) => claveDiaDe(m.date) === today);

  if (existingIndex >= 0) {
    // Update existing measurement for today
    measurements[existingIndex] = measurement;
  } else {
    // Add new measurement
    measurements.unshift(measurement);
  }

  // Keep only MAX_MEASUREMENTS
  const trimmed = measurements.slice(0, MAX_MEASUREMENTS);
  saveBodyMeasurements(trimmed);
}

export function getLatestMeasurement(): BodyMeasurement | null {
  // Por fecha, no por posicion: el orden de insercion se pierde en cuanto un
  // CSV importado llega desordenado, y "la ultima" pasaba a ser otra.
  const measurements = getBodyMeasurements();
  if (measurements.length === 0) return null;
  return measurements.reduce((mejor, m) =>
    new Date(m.date).getTime() > new Date(mejor.date).getTime() ? m : mejor
  );
}

export function deleteMeasurement(date: string): void {
  const measurements = getBodyMeasurements();
  const filtered = measurements.filter(m => m.date !== date);
  saveBodyMeasurements(filtered);
}
