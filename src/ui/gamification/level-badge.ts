// ==========================================
// LEVEL BADGE SVG COMPONENT
// ==========================================

import { getLevelTitle, getLevelColor } from '@/features/gamification';

/**
 * Genera el SVG del badge de nivel
 * @param level - Nivel actual (1-100)
 * @param size - Tamaño del badge (default 48)
 */
export function renderLevelBadge(level: number, size: number = 48): string {
  const color = getLevelColor(level);
  const isMaxLevel = level === 100;

  // Tamaño de fuente adaptativo
  const fontSize = level >= 100 ? size * 0.3 : size * 0.38;

  if (isMaxLevel) {
    // Badge especial para nivel 100
    return `
      <svg viewBox="0 0 48 48" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="level100-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#3B82F6"/>
            <stop offset="50%" style="stop-color:#8B5CF6"/>
            <stop offset="100%" style="stop-color:#3B82F6"/>
          </linearGradient>
          <filter id="level100-glow">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle cx="24" cy="24" r="22" fill="#111827" stroke="url(#level100-grad)" stroke-width="3" filter="url(#level100-glow)"/>
        <text x="24" y="29" text-anchor="middle" fill="url(#level100-grad)" font-size="${fontSize}" font-weight="bold" font-family="system-ui, sans-serif">100</text>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 48 48" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="level-bg-${level}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#1F2937"/>
          <stop offset="100%" style="stop-color:#111827"/>
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#level-bg-${level})" stroke="${color}" stroke-width="2"/>
      <text x="24" y="30" text-anchor="middle" fill="${color}" font-size="${fontSize}" font-weight="bold" font-family="system-ui, sans-serif">${level}</text>
    </svg>
  `;
}

/**
 * Genera el badge con barra de progreso
 */
export function renderLevelBadgeWithProgress(
  level: number,
  currentXP: number,
  maxXP: number
): string {
  const color = getLevelColor(level);
  const titleInfo = getLevelTitle(level);
  const percentage = maxXP > 0 ? (currentXP / maxXP) * 100 : 100;

  return `
    <div class="flex items-center gap-3">
      <div class="w-12 h-12">
        ${renderLevelBadge(level, 48)}
      </div>
      <div class="flex-1">
        <div class="flex items-baseline gap-2">
          <span class="text-lg font-bold" style="color: ${color}">Nivel ${level}</span>
          <span class="text-sm text-gray-400">${titleInfo.full}</span>
        </div>
        <div class="mt-1 h-2 bg-dark-border rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            style="width: ${percentage}%; background-color: ${color}"
          ></div>
        </div>
        <div class="text-xs text-gray-500 mt-0.5">
          ${currentXP.toLocaleString()} / ${maxXP.toLocaleString()} XP
        </div>
      </div>
    </div>
  `;
}
