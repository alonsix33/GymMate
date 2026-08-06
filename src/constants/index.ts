// ==========================================
// CONSTANTES DE LA APLICACIÓN
// ==========================================

// Auto-guardado
export const DRAFT_SAVE_DELAY = 15000; // 15 segundos
export const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas
export const MAX_HISTORY_ITEMS = 200;

// Verificación de PR: esperar a que el usuario termine de editar la fila
// antes de persistir un posible nuevo récord (evita capturar valores a medio escribir)
export const PR_CHECK_DEBOUNCE_DELAY = 1200; // 1.2 segundos

// Rango razonable para aceptar un valor como PR real (evita fat-finger typos)
export const MAX_REASONABLE_PESO = 500; // kg
export const MAX_REASONABLE_SETS = 20;
export const MAX_REASONABLE_REPS = 100;

// LocalStorage Keys
export const STORAGE_KEYS = {
  HISTORY: 'gymmate_history',
  PRS: 'gymmate_prs',
  PROFILE: 'gymmate_profile',
  DRAFT: 'gymmate_draft',
  SESSION: 'gymmate_session',
  CUSTOM_WORKOUTS: 'gymmate_custom_workouts',
  GAMIFICATION: 'gymmate_gamification',
} as const;

// Colores del tema - Negro puro para OLED
export const THEME_COLORS = {
  bg: '#000000',
  surface: '#1e293b',
  accent: '#3b82f6',
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    muted: '#64748b',
  },
  status: {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#06b6d4',
  },
} as const;

// Grupos musculares disponibles
export const ALL_MUSCLES = [
  'Piernas',
  'Glúteos',
  'Pecho',
  'Espalda',
  'Hombros',
  'Bíceps',
  'Tríceps',
  'Core',
] as const;

// Mapeo de grupo muscular a rutinas
export const MUSCLE_TO_ROUTINES: Record<string, string[]> = {
  Piernas: ['GRUPO 1', 'GRUPO 3'],
  Glúteos: ['GRUPO 1'],
  Pecho: ['GRUPO 2'],
  Hombros: ['GRUPO 2', 'GRUPO 5'],
  Tríceps: ['GRUPO 2', 'GRUPO 5'],
  Espalda: ['GRUPO 4'],
  Bíceps: ['GRUPO 4'],
  Core: ['Cualquier rutina'],
};

// Sugerencias por día de la semana
export const DAY_SUGGESTIONS = [
  { muscle: 'PIERNAS + GLÚTEOS', routine: 'GRUPO 1', day: 'DOMINGO' },
  { muscle: 'PECHO + HOMBROS', routine: 'GRUPO 2', day: 'LUNES' },
  { muscle: 'ESPALDA + BÍCEPS', routine: 'GRUPO 4', day: 'MARTES' },
  { muscle: 'PIERNAS QUAD', routine: 'GRUPO 3', day: 'MIÉRCOLES' },
  { muscle: 'HOMBRO + TRÍCEPS', routine: 'GRUPO 5', day: 'JUEVES' },
  { muscle: 'PIERNAS + GLÚTEOS', routine: 'GRUPO 1', day: 'VIERNES' },
  { muscle: 'PECHO + HOMBROS', routine: 'GRUPO 2', day: 'SÁBADO' },
] as const;

// Keywords para detectar tren inferior
export const LOWER_BODY_KEYWORDS = [
  'squat',
  'prensa',
  'leg',
  'pierna',
  'rdl',
  'hip thrust',
  'zancada',
  'hack',
  'cuádriceps',
  'femoral',
  'glúteo',
  'aduc',
  'abduc',
];
