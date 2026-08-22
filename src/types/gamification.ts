// ==========================================
// GAMIFICATION TYPES
// ==========================================

// ==========================================
// NIVEL GENERAL DE CUENTA (1-100)
// ==========================================

/**
 * Titulos base para rangos de nivel de cuenta
 * Cada titulo (excepto Simetrico) tiene sub-niveles I-V
 */
export type LevelTitleBase =
  | 'Principiante'  // 1-16
  | 'Novato'        // 17-33
  | 'Intermedio'    // 34-50
  | 'Avanzado'      // 51-66
  | 'Elite'         // 67-83
  | 'Legendario'    // 84-99
  | 'Simetrico';    // 100 (unico)

/**
 * Numerales romanos para sub-niveles
 */
export type LevelNumeral = 'I' | 'II' | 'III' | 'IV' | 'V' | '';

/**
 * Titulo completo con numeral y color
 */
export interface LevelTitleInfo {
  base: LevelTitleBase;
  numeral: LevelNumeral;
  full: string;  // Ej: "Intermedio III" o "Simetrico"
  color: string;
}

/**
 * Estadisticas del jugador (nivel general)
 */
export interface PlayerStats {
  totalXP: number;
  level: number;               // 1-100
  titleInfo: LevelTitleInfo;
  currentLevelXP: number;      // XP en el nivel actual
  xpToNextLevel: number;       // XP necesario para subir
  createdAt: string;           // Fecha inicio
  lastUpdated: string;
}

/**
 * Transaccion de XP individual
 */
export interface XPTransaction {
  id: string;
  amount: number;
  source: XPSource;
  description: string;
  timestamp: string;
  sessionId?: string;
}

/**
 * Fuentes de XP
 */
export type XPSource =
  | 'workout_complete'
  | 'volume'
  | 'pr_micro'
  | 'pr_minor'
  | 'pr_solid'
  | 'pr_major'
  | 'pr_exceptional'
  | 'streak_3'
  | 'streak_7'
  | 'streak_14'
  | 'streak_30'
  | 'streak_60'
  | 'streak_90'
  | 'achievement'
  | 'rank_up'
  | 'cardio_complete'
  | 'migration';

// ==========================================
// RANGO POR GRUPO MUSCULAR (9 Rangos)
// ==========================================

/**
 * Rangos de fuerza por grupo muscular
 * Basado en ratio 1RM vs peso corporal
 */
export type StrengthRank =
  | 'Hierro'      // < 0.3x
  | 'Bronce'      // 0.3x - 0.5x
  | 'Plata'       // 0.5x - 0.7x
  | 'Oro'         // 0.7x - 0.9x
  | 'Platino'     // 0.9x - 1.1x
  | 'Esmeralda'   // 1.1x - 1.3x
  | 'Diamante'    // 1.3x - 1.6x
  | 'Campeon'     // 1.6x - 2.0x
  | 'Simetrico';  // > 2.0x

/**
 * Grupos musculares para gamificacion
 * Usar claves simplificadas sin tildes para consistencia interna
 */
export type GamificationMuscleGroup =
  | 'pecho'
  | 'espalda'
  | 'hombros'
  | 'biceps'
  | 'triceps'
  | 'piernas'
  | 'gluteos'
  | 'core';

/**
 * Datos de rango por grupo muscular
 */
export interface MuscleRankData {
  rank: StrengthRank;
  ratio: number;              // Ratio promedio ajustado
  bestExercise: string;       // Ejercicio con mejor ratio
  bestRatio: number;
  exerciseCount: number;      // Cuantos ejercicios contribuyen
  lastUpdated: string;
}

/**
 * Todos los rangos musculares
 */
export interface MuscleRanks {
  pecho: MuscleRankData;
  espalda: MuscleRankData;
  hombros: MuscleRankData;
  biceps: MuscleRankData;
  triceps: MuscleRankData;
  piernas: MuscleRankData;
  gluteos: MuscleRankData;
  core: MuscleRankData;
}

/**
 * Datos de fuerza por ejercicio individual
 */
export interface ExerciseStrength {
  exerciseName: string;
  muscleGroup: GamificationMuscleGroup;
  estimated1RM: number;
  bodyweightRatio: number;
  adjustedRatio: number;      // Despues de aplicar multiplicador
  rank: StrengthRank;
  lastUpdated: string;
}

// ==========================================
// LOGROS
// ==========================================

/**
 * Categoria de logro
 */
export type AchievementCategory =
  | 'sesiones'
  | 'volumen'
  | 'prs'
  | 'rachas'
  | 'rangos'
  | 'especial';

/**
 * Logro individual
 */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  xpReward: number;
  unlockedAt?: string;        // undefined = no desbloqueado
  progress?: number;          // Para logros con progreso
  target?: number;
}

// ==========================================
// RACHAS
// ==========================================

/**
 * Datos de racha
 */
export interface StreakData {
  currentStreak: number;
  bestStreak: number;
  lastWorkoutDate: string | null;
  streakMilestones: number[]; // [3, 7, 14, 30, 60, 90] ya alcanzados
}

// ==========================================
// ESTADO COMPLETO
// ==========================================

/**
 * Estado completo de gamificacion
 */
export interface GamificationState {
  version: number;            // Version del esquema para migraciones futuras
  playerStats: PlayerStats;
  muscleRanks: MuscleRanks;
  exerciseStrengths: Record<string, ExerciseStrength>;
  achievements: Achievement[];
  xpHistory: XPTransaction[]; // Ultimas 100 transacciones
  streakData: StreakData;
  initialized: boolean;
  migratedAt?: string;        // Fecha de migracion inicial
}

// ==========================================
// RESUMEN DE SESION
// ==========================================

/**
 * Desglose de XP ganado en una sesion
 */
export interface SessionXPBreakdown {
  baseXP: number;             // XP por completar
  volumeXP: number;           // XP por volumen
  prXP: { exercise: string; amount: number; type: string }[];
  streakXP: number;
  achievementXP: { name: string; amount: number }[];
  rankUpXP: { muscle: string; amount: number }[];
  totalXP: number;
}

/**
 * Resumen completo de sesion para el popup
 */
export interface SessionXPSummary extends SessionXPBreakdown {
  rankUps: { muscle: GamificationMuscleGroup; from: StrengthRank; to: StrengthRank }[];
  newLevel: number;
  oldLevel: number;
  leveledUp: boolean;
  titleInfo: LevelTitleInfo;
  levelProgress: { current: number; max: number; percentage: number };
}

// ==========================================
// COLORES DE RANGO
// ==========================================

/**
 * Colores para rangos de fuerza
 */
export interface RankColorInfo {
  fill: string;
  glow: string;
}
