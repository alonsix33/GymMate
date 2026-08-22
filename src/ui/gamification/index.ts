// ==========================================
// GAMIFICATION UI — lo que sobrevive a FIERRO
// ==========================================
//
// Se han borrado `gamification-ui.ts`, `level-badge.ts`, `rank-emblem.ts` y
// `session-summary.ts`: eran el modal legacy y el resumen de sesion anterior,
// con sus clases de Tailwind y sus hexes sueltos. Ninguno tenia ya un solo
// llamador fuera de esta carpeta — W-03 sustituyo al resumen en la fase 4 y
// GM-01/02/03 sustituyen al modal en la 8.
//
// Del mapa muscular queda `renderMapaFierro`, que es el que pide el handoff:
// mismos poligonos, sin glow y sin gradientes, con el fill de cada grupo en el
// color de su rango.

export { renderMapaFierro, colorDeRango } from './muscle-map';
