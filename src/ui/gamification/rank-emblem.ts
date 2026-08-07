// ==========================================
// RANK EMBLEM SVG COMPONENT
// ==========================================

import type { StrengthRank } from '@/types/gamification';
import { RANK_COLORS, RANK_DISPLAY_NAMES } from '@/features/gamification';

/**
 * Configuracion de formas para cada rango
 */
const EMBLEM_CONFIG: Record<StrengthRank, {
  points: number;
  innerRadius: number;
  rotation: number;
}> = {
  Hierro: { points: 6, innerRadius: 0.5, rotation: 0 },
  Bronce: { points: 6, innerRadius: 0.6, rotation: 30 },
  Plata: { points: 8, innerRadius: 0.55, rotation: 0 },
  Oro: { points: 8, innerRadius: 0.6, rotation: 22.5 },
  Platino: { points: 5, innerRadius: 0.4, rotation: -90 },
  Esmeralda: { points: 6, innerRadius: 0.45, rotation: 0 },
  Diamante: { points: 8, innerRadius: 0.35, rotation: 22.5 },
  Campeon: { points: 10, innerRadius: 0.4, rotation: 0 },
  Simetrico: { points: 12, innerRadius: 0.5, rotation: 0 },
};

/**
 * Aclara un color hex
 */
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}

/**
 * Genera el path de una estrella/poligono
 */
function generateStarPath(
  cx: number,
  cy: number,
  points: number,
  outerR: number,
  innerRatio: number,
  rotation: number
): string {
  const step = Math.PI / points;
  const innerR = outerR * innerRatio;
  let path = '';

  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2 + (rotation * Math.PI / 180);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    path += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }

  return path + 'Z';
}

/**
 * Genera el SVG del emblema de rango
 * @param rank - Rango de fuerza
 * @param size - Tamaño del emblema (default 48)
 */
export function renderRankEmblem(rank: StrengthRank, size: number = 48): string {
  const config = EMBLEM_CONFIG[rank];
  const colors = RANK_COLORS[rank];
  const cx = 24;
  const cy = 24;
  const r = 18;

  const starPath = generateStarPath(
    cx, cy,
    config.points,
    r,
    config.innerRadius,
    config.rotation
  );

  const lighterColor = lightenColor(colors.fill, 30);
  const hasGlow = colors.glow !== 'none';
  const uniqueId = `rank-${rank}-${Date.now()}`;

  // Emblema especial para Simetrico
  if (rank === 'Simetrico') {
    return `
      <svg viewBox="0 0 48 48" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${uniqueId}-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#60A5FA"/>
            <stop offset="50%" style="stop-color:#3B82F6"/>
            <stop offset="100%" style="stop-color:#2563EB"/>
          </linearGradient>
          <filter id="${uniqueId}-glow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle cx="24" cy="24" r="22" fill="${colors.glow}" opacity="0.3"/>
        <path d="${starPath}" fill="url(#${uniqueId}-grad)" filter="url(#${uniqueId}-glow)"/>
        <circle cx="24" cy="24" r="6" fill="white" opacity="0.3"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 48 48" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${uniqueId}-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${lighterColor}"/>
          <stop offset="100%" style="stop-color:${colors.fill}"/>
        </linearGradient>
        ${hasGlow ? `
        <filter id="${uniqueId}-glow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        ` : ''}
      </defs>
      ${hasGlow ? `<circle cx="24" cy="24" r="20" fill="${colors.glow}" opacity="0.4"/>` : ''}
      <path d="${starPath}" fill="url(#${uniqueId}-grad)" ${hasGlow ? `filter="url(#${uniqueId}-glow)"` : ''}/>
    </svg>
  `;
}

/**
 * Renderiza todos los rangos en grid compacto (para leyenda)
 */
export function renderAllRanksLegend(): string {
  const ranks: Array<{ name: StrengthRank; ratio: string }> = [
    { name: 'Hierro', ratio: '<0.3x' },
    { name: 'Bronce', ratio: '0.3-0.5x' },
    { name: 'Plata', ratio: '0.5-0.7x' },
    { name: 'Oro', ratio: '0.7-0.9x' },
    { name: 'Platino', ratio: '0.9-1.1x' },
    { name: 'Esmeralda', ratio: '1.1-1.3x' },
    { name: 'Diamante', ratio: '1.3-1.6x' },
    { name: 'Campeon', ratio: '1.6-2.0x' },
    { name: 'Simetrico', ratio: '>2.0x' },
  ];

  return `
    <div class="grid grid-cols-3 gap-2">
      ${ranks.map(({ name, ratio }) => {
        const colors = RANK_COLORS[name];
        const displayName = RANK_DISPLAY_NAMES[name];
        const isSimetrico = name === 'Simetrico';
        const nameClass = isSimetrico ? 'text-shiny' : '';
        const nameStyle = isSimetrico ? '' : `style="color: ${colors.fill}"`;
        return `
          <div class="flex items-center gap-1.5 bg-dark-bg/30 rounded-lg px-2 py-1.5">
            <div class="w-5 h-5 flex-shrink-0">${renderRankEmblem(name, 20)}</div>
            <div class="min-w-0">
              <div class="text-[11px] font-medium truncate ${nameClass}" ${nameStyle}>${displayName}</div>
              <div class="text-[9px] text-gray-500">${ratio}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
