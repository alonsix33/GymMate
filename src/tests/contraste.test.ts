import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const valorDe = (nombre: string): string => {
  const m = css.match(new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`falta --${nombre}`);
  return m[1];
};
function lum(h: string): number {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('contraste del texto secundario y deshabilitado (WCAG AA 4.5:1)', () => {
  it('--text-disabled apunta a la variante legible', () => {
    expect(css).toMatch(/--text-disabled:\s*var\(--carbon-350\)/);
  });
  const fondos = ['carbon-950', 'carbon-900'];
  for (const texto of ['carbon-350', 'carbon-300']) {
    for (const f of fondos) {
      it(`${texto} sobre ${f}`, () => {
        expect(ratio(valorDe(texto), valorDe(f))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
