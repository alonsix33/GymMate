import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CSP } from './csp.mjs';

describe('CSP', () => {
  it('netlify.toml lleva EXACTAMENTE la misma politica que el servidor', () => {
    const toml = readFileSync('netlify.toml', 'utf8');
    const m = toml.match(/Content-Security-Policy = "([^"]+)"/);
    expect(m).not.toBeNull();
    expect(m[1]).toBe(CSP);
  });
  it('no permite scripts inline ni eval, ni frames, ni objetos', () => {
    expect(CSP).toMatch(/script-src 'self'(;|$)/);
    expect(CSP).not.toMatch(/unsafe-eval/);
    expect(CSP).toMatch(/frame-ancestors 'none'/);
    expect(CSP).toMatch(/object-src 'none'/);
  });
  it('index.html no tiene scripts inline (la CSP los bloquearia)', () => {
    const html = readFileSync('index.html', 'utf8');
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter((m) => m[1].trim());
    expect(inline).toHaveLength(0);
  });
});
