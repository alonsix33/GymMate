// ==========================================
// LEVEL SYSTEM
// ==========================================

import type { LevelTitleInfo, LevelTitleBase, LevelNumeral } from '@/types/gamification';
import {
  LEVEL_XP_REQUIREMENTS,
  LEVEL_CUMULATIVE_XP,
  LEVEL_TITLE_CONFIG,
  ROMAN_NUMERALS,
  LEVEL_TITLE_DISPLAY_NAMES,
} from './constants';

/**
 * Calcula el nivel basado en el XP total
 * @param totalXP - XP total acumulado
 * @returns Nivel (1-100)
 */
export function calculateLevel(totalXP: number): number {
  if (totalXP <= 0) return 1;

  // Buscar el nivel mas alto que el usuario ha alcanzado
  for (let level = 100; level >= 1; level--) {
    if (totalXP >= LEVEL_CUMULATIVE_XP[level - 1]) {
      return level;
    }
  }

  return 1;
}

/**
 * Obtiene el XP necesario para alcanzar un nivel especifico
 * @param level - Nivel objetivo (1-100)
 * @returns XP acumulado necesario
 */
export function getXPForLevel(level: number): number {
  if (level < 1) return 0;
  if (level > 100) return LEVEL_CUMULATIVE_XP[99];
  return LEVEL_CUMULATIVE_XP[level - 1];
}

/**
 * Obtiene el XP necesario para subir del nivel actual al siguiente
 * @param level - Nivel actual (1-100)
 * @returns XP necesario para el siguiente nivel (0 si ya es nivel 100)
 */
export function getXPToNextLevel(level: number): number {
  if (level >= 100) return 0;
  if (level < 1) return LEVEL_XP_REQUIREMENTS[1];
  return LEVEL_XP_REQUIREMENTS[level];
}

/**
 * Calcula el progreso dentro del nivel actual
 * @param totalXP - XP total acumulado
 * @returns Objeto con XP actual en nivel, XP necesario y porcentaje
 */
export function getLevelProgress(totalXP: number): {
  level: number;
  currentXP: number;
  maxXP: number;
  percentage: number;
} {
  const level = calculateLevel(totalXP);

  if (level >= 100) {
    return {
      level: 100,
      currentXP: 0,
      maxXP: 0,
      percentage: 100,
    };
  }

  const xpAtCurrentLevel = LEVEL_CUMULATIVE_XP[level - 1];
  const xpForNextLevel = LEVEL_XP_REQUIREMENTS[level];
  const currentXP = totalXP - xpAtCurrentLevel;
  const percentage = Math.min(100, (currentXP / xpForNextLevel) * 100);

  return {
    level,
    currentXP,
    maxXP: xpForNextLevel,
    percentage,
  };
}

/**
 * Obtiene el titulo completo para un nivel (con numeral romano)
 * @param level - Nivel (1-100)
 * @returns Informacion del titulo
 */
export function getLevelTitle(level: number): LevelTitleInfo {
  // Nivel 100 es especial: Simetrico sin numeral
  if (level >= 100) {
    const config = LEVEL_TITLE_CONFIG.find(t => t.name === 'Simetrico')!;
    const displayName = LEVEL_TITLE_DISPLAY_NAMES['Simetrico'];
    return {
      base: 'Simetrico',
      numeral: '',
      full: displayName,
      color: config.color,
    };
  }

  // Asegurar nivel minimo de 1
  const safeLevel = Math.max(1, level);

  // Encontrar la configuracion del titulo
  const config = LEVEL_TITLE_CONFIG.find(
    t => safeLevel >= t.minLevel && safeLevel <= t.maxLevel
  );

  if (!config) {
    // Fallback a Principiante I si algo falla
    return {
      base: 'Principiante',
      numeral: 'I',
      full: 'Principiante I',
      color: 'var(--text-secondary)',
    };
  }

  // Calcular el numeral (I-V) basado en la posicion dentro del rango
  const range = config.maxLevel - config.minLevel + 1;
  const position = safeLevel - config.minLevel;
  const numeralIndex = Math.min(
    Math.floor(position / (range / 5)),
    4
  );
  const numeral = ROMAN_NUMERALS[numeralIndex] as LevelNumeral;

  // Usar nombre con tildes para display
  const displayName = LEVEL_TITLE_DISPLAY_NAMES[config.name];

  return {
    base: config.name as LevelTitleBase,
    numeral,
    full: `${displayName} ${numeral}`,
    color: config.color,
  };
}

/**
 * Obtiene el color del nivel
 * @param level - Nivel (1-100)
 * @returns Color hexadecimal
 */
export function getLevelColor(level: number): string {
  const titleInfo = getLevelTitle(level);
  return titleInfo.color;
}

/**
 * Verifica si hubo un level up
 * @param oldXP - XP antes
 * @param newXP - XP despues
 * @returns true si subio de nivel
 */
export function didLevelUp(oldXP: number, newXP: number): boolean {
  const oldLevel = calculateLevel(oldXP);
  const newLevel = calculateLevel(newXP);
  return newLevel > oldLevel;
}

/**
 * Verifica si hubo un cambio de titulo
 * @param oldLevel - Nivel antes
 * @param newLevel - Nivel despues
 * @returns true si cambio el titulo base
 */
export function didTitleChange(oldLevel: number, newLevel: number): boolean {
  const oldTitle = getLevelTitle(oldLevel);
  const newTitle = getLevelTitle(newLevel);
  return oldTitle.base !== newTitle.base;
}

/**
 * Obtiene el nivel maximo
 */
export const MAX_LEVEL = 100;

/**
 * Obtiene el XP maximo (nivel 100)
 */
export const MAX_XP = LEVEL_CUMULATIVE_XP[99];
