import { claveDiaDe, claveDiaDeSesion } from '@/utils/fecha';
import { STORAGE_KEYS, AVISAR_HISTORIAL_EN } from '@/constants';
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

// ==========================================
// FORMAS VALIDAS Y RESCATE DE DATOS DANADOS
// ==========================================

/** La forma que DEBE tener lo guardado en cada clave. */
export type Forma = 'lista' | 'objeto' | 'objeto_o_nulo';

export const FORMA_DE_CLAVE: Record<string, Forma> = {
  gymmate_history: 'lista',
  gymmate_prs: 'objeto',
  gymmate_profile: 'objeto',
  gymmate_draft: 'objeto_o_nulo',
  gymmate_session: 'objeto_o_nulo',
  gymmate_custom_workouts: 'lista',
  gymmate_custom_exercises: 'lista',
  gymmate_body_measurements: 'lista',
  gymmate_gamification: 'objeto',
  gymmate_coach_conversacion: 'lista',
};

export function formaValida(valor: unknown, forma: Forma): boolean {
  if (forma === 'lista') return Array.isArray(valor);
  const esObjeto = typeof valor === 'object' && valor !== null && !Array.isArray(valor);
  return forma === 'objeto' ? esObjeto : esObjeto || valor === null;
}

export interface Rescate {
  clave: string;
  copia: string;
  motivo: 'ilegible' | 'forma';
}

/** Lo que se rescato en esta sesion, para avisarle al usuario UNA vez. */
const rescates: Rescate[] = [];

export function rescatesPendientes(): Rescate[] {
  return rescates.splice(0, rescates.length);
}

/** Cuantas copias de un mismo dato danado se conservan: no llenar la cuota. */
const MAX_RESCATES_POR_CLAVE = 3;

/**
 * Antes de descartar un valor danado, se COPIA a `<clave>__corrupto_<marca>`.
 *
 * Sin esto el siguiente guardado sobrescribia la cadena ilegible, que a veces
 * era recuperable (un JSON cortado a la mitad por una cuota llena), y un `"null"`
 * guardado rompia `getHistory()` con "Cannot read properties of null".
 */
function rescatar(clave: string, crudo: string, motivo: Rescate['motivo']): void {
  try {
    const prefijo = `${clave}__corrupto_`;
    const previas: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefijo)) previas.push(k);
    }
    // El mismo contenido ya rescatado: no se duplica en cada lectura.
    if (previas.some((k) => localStorage.getItem(k) === crudo)) return;
    previas.sort();
    while (previas.length >= MAX_RESCATES_POR_CLAVE) localStorage.removeItem(previas.shift() as string);
    const copia = `${prefijo}${Date.now()}`;
    localStorage.setItem(copia, crudo);
    rescates.push({ clave, copia, motivo });
  } catch {
    // Sin sitio para la copia: aun asi se devuelve el valor por defecto; lo
    // contrario seria romper la app por un dato que ya estaba roto.
  }
}

function getItem<T>(key: string, defaultValue: T): T {
  let crudo: string | null = null;
  try {
    crudo = localStorage.getItem(key);
  } catch {
    return defaultValue;
  }
  if (crudo === null || crudo === '') return defaultValue;
  let valor: unknown;
  try {
    valor = JSON.parse(crudo);
  } catch {
    rescatar(key, crudo, 'ilegible');
    return defaultValue;
  }
  const forma = FORMA_DE_CLAVE[key];
  if (forma && !formaValida(valor, forma)) {
    // "null", "{}" donde va una lista, "[]" donde va un objeto...
    if (!(forma === 'objeto_o_nulo' && valor === null)) {
      rescatar(key, crudo, 'forma');
      return defaultValue;
    }
  }
  return (valor === null ? defaultValue : valor) as T;
}

/**
 * Devuelve si de verdad se escribio.
 *
 * Tragarse el `QuotaExceededError` en silencio era la peor combinacion posible:
 * el guardado fallaba y la pantalla decia "Entrenamiento guardado". Con el
 * historial, los PRs, el borrador y la conversacion del coach, la cuota llena
 * es el escenario normal de una PWA de uso diario. Quien guarda algo que el
 * usuario no puede perder TIENE que mirar este valor.
 */
function setItem<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error saving to localStorage: ${key}`, error);
    return false;
  }
}

/** Lector con rescate y validacion de forma, para quien guarda su propia clave. */
export const leerClave = getItem;
/** Escritor que dice si de verdad escribio. */
export const escribirClave = setItem;

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

/** NO recorta ni toca el arreglo del llamador: lo que llega es lo que se guarda. */
export function saveHistory(history: HistorySession[]): boolean {
  return setItem(STORAGE_KEYS.HISTORY, history);
}

/**
 * Cuantas sesiones hay si el historial ya esta grande, y solo UNA vez al dia.
 * Sin tope no hay perdida silenciosa; esto da tiempo a exportar antes de que
 * el teléfono se quede sin sitio.
 */
export function avisoDeHistorialGrande(hoy: string): number | null {
  const n = getHistory().length;
  if (n < AVISAR_HISTORIAL_EN) return null;
  try {
    if (localStorage.getItem('gymmate_aviso_historial') === hoy) return null;
    localStorage.setItem('gymmate_aviso_historial', hoy);
  } catch {
    // Sin sitio para recordar el aviso: se da igual.
  }
  return n;
}

/**
 * Solo entran las series que el usuario CONFIRMO: con volumen, o marcadas como
 * hechas. `loadTrainingGroup` carga la plantilla entera con 0x0@0 y el guardado
 * la copiaba tal cual, asi que cada sesion arrastraba los ejercicios que no se
 * hicieron (y la bitacora del coach los listaba como si lo fueran).
 */
function soloLoConfirmado<T extends { volumen?: number; completado?: boolean }>(ejercicios: T[]): T[] {
  return ejercicios.filter((e) => (e.volumen ?? 0) > 0 || e.completado === true);
}

/** Devuelve false si NO se pudo escribir (almacenamiento lleno): el llamador
 *  no debe dar la sesion por guardada ni borrar su borrador. */
export function addToHistory(session: HistorySession): boolean {
  // Normalizar nombres de ejercicios antes de guardar
  const normalizedSession = {
    ...session,
    ejercicios: soloLoConfirmado(
      session.ejercicios?.map(ej => ({
        ...ej,
        nombre: normalizeExerciseName(ej.nombre),
      })) || []
    ),
  };

  const history = getHistory();
  let existingIndex = history.findIndex(
    (s) => s.sessionId === normalizedSession.sessionId
  );

  // Una sesion por dia (Lima) y por entrenamiento. Reanudar un borrador
  // perdia el sessionId y el segundo guardado entraba como sesion NUEVA junto
  // a la ya guardada: el 13-nov habia dos registros, y el volumen y las
  // "sesiones sin subir" contaban el dia dos veces. El guardado mas reciente
  // es el borrador completo, asi que sustituye al anterior (que conserva su
  // sessionId, del que cuelga su XP).
  if (existingIndex === -1 && normalizedSession.type !== 'cardio') {
    const dia = claveDiaDeSesion(normalizedSession);
    if (dia) {
      existingIndex = history.findIndex(
        (s) =>
          s.type !== 'cardio' &&
          s.grupo === normalizedSession.grupo &&
          claveDiaDeSesion(s) === dia
      );
      if (existingIndex !== -1) normalizedSession.sessionId = history[existingIndex].sessionId;
    }
  }

  if (existingIndex !== -1) {
    history[existingIndex] = normalizedSession;
  } else {
    history.unshift(normalizedSession);
  }

  return saveHistory(history);
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

export function savePRs(prs: Record<string, PRData>): boolean {
  return setItem(STORAGE_KEYS.PRS, prs);
}

export function updatePR(exerciseName: string, prData: PRData): boolean {
  const normalizedName = normalizeExerciseName(exerciseName);
  const prs = getPRs();
  prs[normalizedName] = prData;
  return savePRs(prs);
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

export function saveProfile(profile: ProfileData): boolean {
  return setItem(STORAGE_KEYS.PROFILE, profile);
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

export function saveDraft(session: SessionData): boolean {
  const draft: DraftData = {
    ...session,
    draftSavedAt: new Date().toISOString(),
    draftTimestamp: Date.now(),
  };
  return setItem(STORAGE_KEYS.DRAFT, draft);
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

export function saveSession(session: SessionData): boolean {
  return setItem(STORAGE_KEYS.SESSION, session);
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

export function saveCustomWorkouts(workouts: CustomWorkout[]): boolean {
  return setItem(STORAGE_KEYS.CUSTOM_WORKOUTS, workouts);
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

export function saveBodyMeasurements(measurements: BodyMeasurement[]): boolean {
  return setItem(BODY_MEASUREMENTS_KEY, measurements);
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
