/**
 * GM-02 · subniveles de rango. README §6 y la escalera del mockup.
 */
import { describe, it, expect } from 'vitest';
import {
  franjaDe,
  nombreDeRango,
  pesoParaElSiguiente,
  rangoSiguiente,
  siguienteEscalon,
  subnivelDe,
} from '@/utils/rangos';

describe('subniveles', () => {
  it('parte cada franja en TERCIOS iguales', () => {
    // Oro es 0.7–0.9: tercios en 0.7666… y 0.8333…
    expect(subnivelDe('Oro', 0.7)).toBe('I');
    expect(subnivelDe('Oro', 0.76)).toBe('I');
    expect(subnivelDe('Oro', 0.767)).toBe('II');
    expect(subnivelDe('Oro', 0.83)).toBe('II');
    expect(subnivelDe('Oro', 0.834)).toBe('III');
    expect(subnivelDe('Oro', 0.899)).toBe('III');
  });

  it('el ratio del mockup cae donde el mockup dice', () => {
    // GM-02: "Piernas · Oro III · 0.86x"
    expect(nombreDeRango('Oro', 0.86)).toBe('Oro III');
    // Y el resumen de GM-01 pinta a Glúteos en Oro con 0.74x.
    expect(nombreDeRango('Oro', 0.74)).toBe('Oro I');
  });

  it('Simetrico no tiene subniveles: su franja no tiene techo', () => {
    expect(subnivelDe('Simetrico', 2.5)).toBe('');
    expect(nombreDeRango('Simetrico', 2.5)).toBe('Simétrico');
    expect(franjaDe('Simetrico')?.max).toBe(Infinity);
  });

  it('los tres tercios cubren la franja entera, sin huecos ni solapes', () => {
    for (const rango of ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Esmeralda', 'Diamante', 'Campeon'] as const) {
      const f = franjaDe(rango)!;
      const vistos = new Set<string>();
      for (let k = 0; k <= 100; k++) {
        const r = f.min + ((f.max - f.min) * k) / 100;
        const sub = subnivelDe(rango, Math.min(r, f.max - 1e-9));
        expect(sub).not.toBe('');
        vistos.add(sub);
      }
      expect([...vistos].sort()).toEqual(['I', 'II', 'III']);
    }
  });

  it('un ratio absurdo no revienta', () => {
    expect(subnivelDe('Oro', NaN)).toBe('');
    expect(subnivelDe('Oro', Infinity)).toBe('');
  });
});

describe('el siguiente escalon', () => {
  it('dentro del rango es el siguiente subnivel', () => {
    const e = siguienteEscalon('Oro', 0.72);
    expect(e?.nombre).toBe('Oro II');
    expect(e?.ratioObjetivo).toBeCloseTo(0.767, 2);
  });

  it('en el ultimo tercio es el primer subnivel del rango de arriba', () => {
    // GM-02: "A 0.04x de Platino I" con 0.86x. Oro acaba en 0.90.
    const e = siguienteEscalon('Oro', 0.86);
    expect(e?.nombre).toBe('Platino I');
    expect(e?.ratioObjetivo).toBeCloseTo(0.9, 3);
    expect(e?.falta).toBeCloseTo(0.04, 3);
  });

  it('Simetrico es el final: no promete un escalon que no existe', () => {
    expect(siguienteEscalon('Simetrico', 2.5)).toBeNull();
    expect(rangoSiguiente('Simetrico')).toBeNull();
  });

  it('el peso objetivo es la cifra accionable del mockup', () => {
    // "sube tu 1RM de Prensa a ~189 kg": 0.90 x 210 kg = 189.
    expect(pesoParaElSiguiente(0.9, 210)).toBe(189);
    // Sin peso corporal no hay cifra que dar.
    expect(pesoParaElSiguiente(0.9, 0)).toBeNull();
  });
});
