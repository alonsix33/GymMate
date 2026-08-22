// ==========================================
// GAMIFICATION CONSTANTS
// ==========================================

import type {
  StrengthRank,
  LevelTitleBase,
  RankColorInfo,
  GamificationMuscleGroup,
  Achievement,
} from '@/types/gamification';

// Re-export LevelTitleBase for use in other modules
export type { LevelTitleBase } from '@/types/gamification';

// ==========================================
// STORAGE KEYS
// ==========================================

export const GAMIFICATION_STORAGE_KEYS = {
  STATE: 'gymmate_gamification',
  XP_HISTORY: 'gymmate_xp_history',
} as const;

// Current schema version for migrations
export const GAMIFICATION_SCHEMA_VERSION = 3;

// Old XP values for v1->v2 migration (retroactive XP adjustment)
export const ACHIEVEMENT_XP_V1: Record<string, number> = {
  first_session: 100,
  sessions_10: 100,
  sessions_25: 300,
  sessions_100: 600,
  sessions_500: 1500,
  sessions_1000: 3000,
  volume_100k: 200,
  volume_500k: 500,
  volume_1m: 1000,
  volume_5m: 2500,
  volume_10m: 5000,
  first_pr: 50,
  prs_10: 150,
  prs_50: 400,
  prs_100: 800,
  streak_7: 100,
  streak_30: 500,
  streak_90: 2000,
  first_oro: 200,
  all_plata: 500,
  first_diamante: 800,
  simetrico: 10000,
  use_10_exercises: 150,
  use_30_exercises: 300,
};

// XP values for v2->v3 migration (reducing inflated XP)
export const ACHIEVEMENT_XP_V2: Record<string, number> = {
  first_session: 200,
  sessions_10: 400,
  sessions_25: 1000,
  sessions_100: 3000,
  sessions_500: 10000,
  sessions_1000: 25000,
  volume_100k: 500,
  volume_500k: 2000,
  volume_1m: 5000,
  volume_5m: 15000,
  volume_10m: 35000,
  first_pr: 150,
  prs_10: 500,
  prs_50: 2000,
  prs_100: 5000,
  streak_7: 400,
  streak_30: 2000,
  streak_90: 8000,
  first_oro: 600,
  all_plata: 2000,
  first_diamante: 4000,
  first_simetrico: 10000,
  simetrico: 50000,
  use_10_exercises: 400,
  use_30_exercises: 1200,
};

// ==========================================
// XP SYSTEM CONSTANTS
// ==========================================

/**
 * XP base por completar un entrenamiento
 */
export const XP_WORKOUT_COMPLETE = 50;

/**
 * XP por volumen (escalonado)
 * Primeros 5,000 kg: 1 XP / 200 kg (max 25 XP)
 * 5,001 - 10,000 kg: 1 XP / 400 kg (max 12 XP)
 * 10,001 - 20,000 kg: 1 XP / 800 kg (max 12 XP)
 * 20,001+ kg: 1 XP / 1,600 kg (max 6 XP)
 * Total maximo por volumen: 55 XP
 */
export const VOLUME_XP_TIERS = [
  { maxVolume: 5000, xpPer: 200, maxXP: 25 },
  { maxVolume: 10000, xpPer: 400, maxXP: 12 },
  { maxVolume: 20000, xpPer: 800, maxXP: 12 },
  { maxVolume: Infinity, xpPer: 1600, maxXP: 6 },
] as const;

/**
 * XP por tipo de PR
 */
export const PR_XP = {
  micro: 30,        // +1-2 kg o +1 rep
  minor: 60,        // +3-5 kg o +2-3 reps
  solid: 100,       // +6-10 kg o +4-5 reps
  major: 150,       // +11-15 kg
  exceptional: 250, // +16+ kg
} as const;

/**
 * Umbrales para clasificar PRs por peso
 */
export const PR_WEIGHT_THRESHOLDS = {
  micro: { min: 1, max: 2 },
  minor: { min: 3, max: 5 },
  solid: { min: 6, max: 10 },
  major: { min: 11, max: 15 },
  exceptional: { min: 16, max: Infinity },
} as const;

/**
 * XP por rachas de entrenamiento
 */
export const STREAK_XP = {
  3: 25,
  7: 75,
  14: 150,
  30: 350,
  60: 750,
  90: 1200,
} as const;

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 90] as const;

/**
 * XP por subir rango muscular
 */
export const RANK_UP_XP: Record<StrengthRank, number> = {
  Hierro: 0,       // Rango inicial, no da XP
  Bronce: 25,
  Plata: 50,
  Oro: 100,
  Platino: 150,
  Esmeralda: 250,
  Diamante: 400,
  Campeon: 600,
  Simetrico: 1000,
};

// ==========================================
// LEVEL SYSTEM CONSTANTS
// ==========================================

/**
 * XP requerido para cada nivel (1-100)
 * Generado con progresion escalonada
 */
export const LEVEL_XP_REQUIREMENTS: number[] = generateLevelXPTable();

function generateLevelXPTable(): number[] {
  const table: number[] = [0]; // Level 1 requires 0 XP (start)

  for (let level = 2; level <= 100; level++) {
    let xpRequired: number;

    if (level <= 20) {
      // Niveles 1-20: Progresion lineal suave (400-1000)
      xpRequired = 400 + (level - 2) * 33;
    } else if (level <= 50) {
      // Niveles 21-50: Progresion moderada (1000-2200)
      xpRequired = 1000 + (level - 21) * 40;
    } else if (level <= 80) {
      // Niveles 51-80: Progresion pronunciada (2200-3400)
      xpRequired = 2200 + (level - 51) * 40;
    } else {
      // Niveles 81-100: Progresion elite (3400-4200)
      xpRequired = 3400 + (level - 81) * 42;
    }

    table.push(xpRequired);
  }

  return table;
}

/**
 * XP acumulado necesario para alcanzar cada nivel
 */
export const LEVEL_CUMULATIVE_XP: number[] = generateCumulativeXP();

function generateCumulativeXP(): number[] {
  const cumulative: number[] = [0];
  let total = 0;

  for (let i = 1; i < LEVEL_XP_REQUIREMENTS.length; i++) {
    total += LEVEL_XP_REQUIREMENTS[i];
    cumulative.push(total);
  }

  return cumulative;
}

/**
 * Configuracion de titulos por nivel
 */
export const LEVEL_TITLE_CONFIG: Array<{
  name: LevelTitleBase;
  minLevel: number;
  maxLevel: number;
  color: string;
}> = [
  // El handoff NO define un color por titulo de nivel: GM-01 pinta "Novato V ·
  // 599 / 1,480 XP" entero en texto secundario. Los siete colores que habia
  // aqui eran del tema anterior y no los leia ninguna pantalla. Se conserva el
  // campo porque la firma es publica, apuntando al token que de verdad se usa.
  { name: 'Principiante', minLevel: 1, maxLevel: 16, color: 'var(--text-secondary)' },
  { name: 'Novato', minLevel: 17, maxLevel: 33, color: 'var(--text-secondary)' },
  { name: 'Intermedio', minLevel: 34, maxLevel: 50, color: 'var(--text-secondary)' },
  { name: 'Avanzado', minLevel: 51, maxLevel: 66, color: 'var(--text-secondary)' },
  { name: 'Elite', minLevel: 67, maxLevel: 83, color: 'var(--text-secondary)' },
  { name: 'Legendario', minLevel: 84, maxLevel: 99, color: 'var(--text-secondary)' },
  { name: 'Simetrico', minLevel: 100, maxLevel: 100, color: 'var(--rango-simetrico)' },
];

/**
 * Numerales romanos para sub-niveles
 */
export const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const;

// ==========================================
// MUSCLE RANK SYSTEM CONSTANTS
// ==========================================

/**
 * Colores para cada rango de fuerza
 */
/**
 * Cada rango con su TOKEN, no con un hex.
 *
 * Los nueve hexes viven en `tokens.css` y salen del README; los que habia aqui
 * eran los del tema anterior (Platino en rojo, Simetrico en azul) y ademas
 * traian un `glow` que el handoff prohibe expresamente ("sin glow, sin
 * gradientes"). El `glow` se conserva en el tipo, vacio, porque la firma es
 * publica; ninguna pantalla lo pinta.
 */
export const RANK_COLORS: Record<StrengthRank, RankColorInfo> = {
  Hierro: { fill: 'var(--rango-hierro)', glow: 'none' },
  Bronce: { fill: 'var(--rango-bronce)', glow: 'none' },
  Plata: { fill: 'var(--rango-plata)', glow: 'none' },
  Oro: { fill: 'var(--rango-oro)', glow: 'none' },
  Platino: { fill: 'var(--rango-platino)', glow: 'none' },
  Esmeralda: { fill: 'var(--rango-esmeralda)', glow: 'none' },
  Diamante: { fill: 'var(--rango-diamante)', glow: 'none' },
  Campeon: { fill: 'var(--rango-campeon)', glow: 'none' },
  Simetrico: { fill: 'var(--rango-simetrico)', glow: 'none' },
};

/**
 * Umbrales de ratio para cada rango
 * Ratio = 1RM ajustado / peso corporal
 */
export const RANK_THRESHOLDS: Array<{ rank: StrengthRank; minRatio: number; maxRatio: number }> = [
  { rank: 'Hierro', minRatio: 0, maxRatio: 0.3 },
  { rank: 'Bronce', minRatio: 0.3, maxRatio: 0.5 },
  { rank: 'Plata', minRatio: 0.5, maxRatio: 0.7 },
  { rank: 'Oro', minRatio: 0.7, maxRatio: 0.9 },
  { rank: 'Platino', minRatio: 0.9, maxRatio: 1.1 },
  { rank: 'Esmeralda', minRatio: 1.1, maxRatio: 1.3 },
  { rank: 'Diamante', minRatio: 1.3, maxRatio: 1.6 },
  { rank: 'Campeon', minRatio: 1.6, maxRatio: 2.0 },
  { rank: 'Simetrico', minRatio: 2.0, maxRatio: Infinity },
];

/**
 * Orden de rangos (para comparaciones)
 */
export const RANK_ORDER: StrengthRank[] = [
  'Hierro',
  'Bronce',
  'Plata',
  'Oro',
  'Platino',
  'Esmeralda',
  'Diamante',
  'Campeon',
  'Simetrico',
];

/**
 * Nombres de rango para display (con tildes correctas)
 */
export const RANK_DISPLAY_NAMES: Record<StrengthRank, string> = {
  Hierro: 'Hierro',
  Bronce: 'Bronce',
  Plata: 'Plata',
  Oro: 'Oro',
  Platino: 'Platino',
  Esmeralda: 'Esmeralda',
  Diamante: 'Diamante',
  Campeon: 'Campeón',
  Simetrico: 'Simétrico',
};

/**
 * Nombres de título de nivel para display (con tildes correctas)
 */
export const LEVEL_TITLE_DISPLAY_NAMES: Record<LevelTitleBase, string> = {
  Principiante: 'Principiante',
  Novato: 'Novato',
  Intermedio: 'Intermedio',
  Avanzado: 'Avanzado',
  Elite: 'Élite',
  Legendario: 'Legendario',
  Simetrico: 'Simétrico',
};

/**
 * Multiplicadores por tipo de ejercicio para normalizar ratios
 * Los ratios base aplican a ejercicios de empuje (press banca, press hombro)
 * Otros ejercicios se dividen por su multiplicador para normalizarlos
 */
export const EXERCISE_MULTIPLIERS: Record<string, number> = {
  // Ejercicios de empuje (base 1.0x)
  'Press Banca': 1.0,
  'Press Inclinado': 1.0,
  'Press Declinado': 1.0,
  'Press Banca Mancuernas': 1.0,
  'Press Inclinado Mancuernas': 1.0,
  'Press Militar': 1.0,
  'Press Arnold': 1.0,
  'Press Mancuernas Sentado': 1.0,
  'Press en Máquina': 1.0,
  'Press Cerrado': 1.0,

  // Sentadillas (mas peso que press)
  'Sentadilla': 1.25,
  'Sentadilla Hack': 1.2,
  'Sentadilla Sumo': 1.2,
  'Sentadilla Búlgara': 0.9, // Unilateral, menos peso
  'Sentadilla Goblet': 0.8,

  // Peso muerto (el mas fuerte)
  'Peso Muerto Convencional': 1.5,
  'Peso Muerto Sumo': 1.5,
  'RDL / Peso Muerto Rumano': 1.3,

  // Prensa (maquina = mas peso)
  'Prensa de Piernas': 2.0,

  // Ejercicios de gluteo
  'Hip Thrust': 1.4,
  'Puente de Glúteo': 1.2,
  'Buenos Días': 0.8,

  // Ejercicios de aislamiento (menos peso)
  'Curl Martillo': 0.4,
  'Curl Martillo Cross-body': 0.4,
  'Curl con Barra': 0.4,
  'Curl con Barra Z': 0.4,
  'Curl Mancuernas Alterno': 0.4,
  'Curl Concentrado': 0.35,
  'Curl en Banco Inclinado': 0.38,
  'Curl en Polea': 0.4,
  'Curl Predicador': 0.38,
  'Curl Spider': 0.35,

  // Triceps
  'Extensión de Tríceps en Polea': 0.35,
  'Extensión Tríceps con Cuerda': 0.35,
  'Extensión Tríceps Overhead': 0.4,
  'Press Francés': 0.45,
  'Press Francés con Mancuernas': 0.45,
  'Patada de Tríceps': 0.25,
  'Fondos en Máquina': 0.9,
  'Fondos en Banco': 0.7,
  'Extensión Polea Invertida': 0.35,

  // Hombros aislamiento
  'Elevación Lateral': 0.2,
  'Elevación Frontal / Y-Raise': 0.22,
  'Pájaros (rear delts)': 0.18,
  'Face Pull': 0.3,
  'Elevación Lateral en Polea': 0.2,
  'Pájaros en Máquina': 0.2,
  'Remo al Mentón': 0.5,
  'Vuelos Inversos en Banco': 0.18,

  // Espalda
  'Jalón al Pecho': 0.75,
  'Jalón Agarre Cerrado': 0.75,
  'Jalón Tras Nuca': 0.7,
  'Remo en Máquina': 0.8,
  'Remo Mancuerna': 0.7,
  'Remo con Barra': 0.85,
  'Remo en Polea Baja': 0.8,
  'Remo T-Bar': 0.85,
  'Remo en Máquina Hammer': 0.8,
  'Dominadas': 0.9,
  'Dominadas Agarre Neutro': 0.9,
  'Pull-Over en Polea': 0.5,
  'Pull-Over con Mancuerna': 0.5,
  'Encogimientos de Hombros': 0.7,

  // Pecho aislamiento
  'Aperturas con Mancuernas': 0.4,
  'Aperturas en Polea': 0.35,
  'Cruce de Poleas Bajo': 0.35,
  'Fondos en Paralelas (Pecho)': 0.9,
  'Flexiones': 0.6,

  // Piernas aislamiento/maquinas
  'Extensión de Cuádriceps': 0.5,
  'Curl Femoral Tumbado': 0.45,
  'Curl Femoral Sentado': 0.45,
  'Zancadas con Barra': 0.9,
  'Zancadas con Mancuernas': 0.8,
  'Step Ups': 0.7,
  'Aductora Máquina': 0.6,
  'Elevación de Talones (Gemelos)': 0.8,
  'Gemelos Sentado': 0.6,
  'Prensa de Gemelos': 1.5,

  // Gluteos maquinas
  'Abductora Máquina': 0.6,
  'Patada de Glúteo en Máquina': 0.5,
  'Patada de Glúteo en Polea': 0.4,
  'Abducción en Polea': 0.3,

  // Core (sin peso significativo, usar valor bajo)
  'Abdominales en Máquina': 0.4,
  'Crunch en Polea': 0.35,
  'Elevación de Piernas Colgado': 0.3,
  'Elevación de Rodillas Colgado': 0.25,
  'Russian Twist': 0.2,
  'Leñador en Polea': 0.3,
  'Ab Rollout': 0.3,
  'Crunch Bicicleta': 0.15,
  'Dead Bug': 0.15,
  'Pallof Press': 0.25,
};

/**
 * Multiplicador por defecto para ejercicios no listados
 */
export const DEFAULT_EXERCISE_MULTIPLIER = 1.0;

/**
 * Mapeo de grupos musculares del sistema a grupos de gamificacion
 * Los grupos del sistema usan tildes, los de gamificacion no
 */
export const MUSCLE_GROUP_MAP: Record<string, GamificationMuscleGroup> = {
  'Pecho': 'pecho',
  'Espalda': 'espalda',
  'Hombros': 'hombros',
  'Bíceps': 'biceps',
  'Tríceps': 'triceps',
  'Piernas': 'piernas',
  'Glúteos': 'gluteos',
  'Core': 'core',
};

/**
 * Mapeo inverso: de grupo gamificacion a grupo sistema (con tildes)
 */
export const GAMIFICATION_TO_SYSTEM_MUSCLE: Record<GamificationMuscleGroup, string> = {
  pecho: 'Pecho',
  espalda: 'Espalda',
  hombros: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  piernas: 'Piernas',
  gluteos: 'Glúteos',
  core: 'Core',
};

// ==========================================
// ACHIEVEMENTS DEFINITIONS
// ==========================================

/**
 * Definiciones de todos los logros
 * XP rewards v3 - balanceados (~50% de v2)
 */
export const ACHIEVEMENT_DEFINITIONS: Omit<Achievement, 'unlockedAt' | 'progress'>[] = [
  // Sesiones (6)
  { id: 'first_session', name: 'Primera Sesión', description: 'Completa tu primer entrenamiento', category: 'sesiones', xpReward: 100, target: 1 },
  { id: 'sessions_10', name: 'Constante', description: 'Completa 10 sesiones', category: 'sesiones', xpReward: 200, target: 10 },
  { id: 'sessions_25', name: 'Dedicado', description: 'Completa 25 sesiones', category: 'sesiones', xpReward: 500, target: 25 },
  { id: 'sessions_100', name: 'Veterano', description: 'Completa 100 sesiones', category: 'sesiones', xpReward: 1500, target: 100 },
  { id: 'sessions_500', name: 'Leyenda', description: 'Completa 500 sesiones', category: 'sesiones', xpReward: 5000, target: 500 },
  { id: 'sessions_1000', name: 'Titan', description: 'Completa 1,000 sesiones', category: 'sesiones', xpReward: 12000, target: 1000 },

  // Volumen (5)
  { id: 'volume_100k', name: 'Volumen 100K', description: 'Acumula 100,000 kg de volumen', category: 'volumen', xpReward: 250, target: 100000 },
  { id: 'volume_500k', name: 'Volumen 500K', description: 'Acumula 500,000 kg de volumen', category: 'volumen', xpReward: 1000, target: 500000 },
  { id: 'volume_1m', name: 'Volumen 1M', description: 'Acumula 1,000,000 kg de volumen', category: 'volumen', xpReward: 2500, target: 1000000 },
  { id: 'volume_5m', name: 'Volumen 5M', description: 'Acumula 5,000,000 kg de volumen', category: 'volumen', xpReward: 7500, target: 5000000 },
  { id: 'volume_10m', name: 'Volumen 10M', description: 'Acumula 10,000,000 kg de volumen', category: 'volumen', xpReward: 17500, target: 10000000 },

  // PRs (4)
  { id: 'first_pr', name: 'Primer PR', description: 'Consigue tu primer récord personal', category: 'prs', xpReward: 75, target: 1 },
  { id: 'prs_10', name: '10 PRs', description: 'Consigue 10 récords personales', category: 'prs', xpReward: 250, target: 10 },
  { id: 'prs_50', name: '50 PRs', description: 'Consigue 50 récords personales', category: 'prs', xpReward: 1000, target: 50 },
  { id: 'prs_100', name: '100 PRs', description: 'Consigue 100 récords personales', category: 'prs', xpReward: 2500, target: 100 },

  // Rachas (3)
  { id: 'streak_7', name: 'Semana Perfecta', description: 'Entrena 7 días consecutivos', category: 'rachas', xpReward: 200, target: 7 },
  { id: 'streak_30', name: 'Mes Imparable', description: 'Entrena 30 días consecutivos', category: 'rachas', xpReward: 1000, target: 30 },
  { id: 'streak_90', name: 'Trimestre de Hierro', description: 'Entrena 90 días consecutivos', category: 'rachas', xpReward: 4000, target: 90 },

  // Rangos (5)
  { id: 'first_oro', name: 'Primer Oro', description: 'Alcanza rango Oro en cualquier músculo', category: 'rangos', xpReward: 300, target: 1 },
  { id: 'all_plata', name: 'Cuerpo de Plata', description: 'Alcanza rango Plata en todos los músculos', category: 'rangos', xpReward: 1000, target: 8 },
  { id: 'first_diamante', name: 'Primer Diamante', description: 'Alcanza rango Diamante en cualquier músculo', category: 'rangos', xpReward: 2000, target: 1 },
  { id: 'first_simetrico', name: 'Primer Simétrico', description: 'Alcanza rango Simétrico en cualquier músculo', category: 'rangos', xpReward: 5000, target: 1 },
  { id: 'simetrico', name: 'Cuerpo Simétrico', description: 'Alcanza rango Simétrico en todos los músculos', category: 'rangos', xpReward: 25000, target: 8 },

  // Especiales (2)
  { id: 'use_10_exercises', name: 'Explorador', description: 'Usa 10 ejercicios diferentes', category: 'especial', xpReward: 200, target: 10 },
  { id: 'use_30_exercises', name: 'Maestro de Variedad', description: 'Usa 30 ejercicios diferentes', category: 'especial', xpReward: 600, target: 30 },
];

// ==========================================
// LIMITS AND CONFIGURATION
// ==========================================

/**
 * Maximo de transacciones de XP a guardar
 */
export const MAX_XP_HISTORY = 100;

/**
 * Peso corporal por defecto si no hay perfil
 */
export const DEFAULT_BODYWEIGHT = 70;

// ==========================================
// CARDIO XP SYSTEM CONSTANTS
// ==========================================

/**
 * XP base por completar una sesion de cardio
 */
export const XP_CARDIO_COMPLETE = 40;

/**
 * XP por tiempo de trabajo (escalonado, en minutos)
 * Primeros 10 min: 2 XP/min (max 20 XP)
 * 10-20 min: 1.5 XP/min (max 15 XP)
 * 20-30 min: 1 XP/min (max 10 XP)
 * 30+ min: 0.5 XP/min (max 10 XP)
 * Total maximo por tiempo: 55 XP
 */
export const CARDIO_TIME_XP_TIERS = [
  { maxMinutes: 10, xpPerMin: 2, maxXP: 20 },
  { maxMinutes: 20, xpPerMin: 1.5, maxXP: 15 },
  { maxMinutes: 30, xpPerMin: 1, maxXP: 10 },
  { maxMinutes: Infinity, xpPerMin: 0.5, maxXP: 10 },
] as const;

/**
 * XP por ronda completada (max 20 rondas = 20 XP)
 */
export const XP_PER_CARDIO_ROUND = 1;
export const MAX_CARDIO_ROUND_XP = 20;

/**
 * Bonus XP por modo de cardio
 */
export const CARDIO_MODE_BONUS: Record<string, number> = {
  tabata: 15,     // Alta intensidad (20s trabajo / 10s descanso)
  pyramid: 12,    // Subida Y bajada de tiempos, muy exigente
  hiit: 10,       // Intervalos intensos (no existe actualmente pero por si se agrega)
  amrap: 10,      // Esfuerzo máximo por tiempo
  emom: 5,        // Intensidad moderada-alta
  fortime: 5,     // Variable
  circuit: 5,     // Variable
  custom: 5,      // Variable
};
