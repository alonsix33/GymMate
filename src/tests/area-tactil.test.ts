import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const css = readFileSync('src/styles/fierro.css', 'utf8');
const tokens = readFileSync('src/styles/tokens.css', 'utf8');

describe('area tactil minima de 44 px', () => {
  it('el token vale 44', () => {
    expect(tokens).toMatch(/--touch-min:\s*44px/);
  });
  for (const sel of ['.f-sesion__volver', '.f-sesion__crono', '.f-ejercicio__nombre', '.f-ejercicio__info', '.f-ejercicio__check', '.f-opcional__check', '.f-opcional__nombre', '.f-home__enlace']) {
    it(`${sel} agranda su area con ::after`, () => {
      expect(css).toContain(`${sel}::after`);
    });
  }
  it('la barra inferior gana a `.f-root button { min-height: 0 }` (especificidad)', () => {
    expect(css).toMatch(/\.f-root \.f-tabbar__item\s*\{\s*min-height:\s*var\(--touch-min\)/);
  });
  it('los +/- de la sesion extienden el area hacia afuera, sin tapar el numero', () => {
    expect(css).toMatch(/\[data-sesion='menos'\]::after\s*\{\s*left:\s*-\d+px/);
    expect(css).toMatch(/\[data-sesion='mas'\]::after\s*\{\s*right:\s*-\d+px/);
  });
});

describe('la barra de descanso de la sesion se ve', () => {
  it('ninguna regla global `.f-descanso` la oculta (solo el banner #restTimerBanner)', () => {
    const globales = [...css.matchAll(/(^|\n)\.f-descanso\s*\{([^}]*)\}/g)].map((m) => m[2]);
    expect(globales.some((r) => /display:\s*none/.test(r))).toBe(false);
    expect(css).toMatch(/#restTimerBanner\.f-descanso\s*\{[^}]*display:\s*none/);
  });
  it('queda a la vista: sticky sobre la barra de navegacion', () => {
    expect(css).toMatch(/#fierroDescanso\s*\{\s*position:\s*sticky/);
  });
});

describe('el heatmap no ensancha la tarjeta', () => {
  it('es una rejilla de 16 columnas minmax(0, 1fr), no flex con minimo por contenido', () => {
    expect(css).toMatch(/\.f-heat\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(16,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.f-home__heatmap\s*\{[^}]*overflow:\s*hidden/);
  });
});
