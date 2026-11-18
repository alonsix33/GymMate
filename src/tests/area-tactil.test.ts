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
