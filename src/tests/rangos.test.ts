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

  it('los cortes REDONDOS caen del lado correcto', () => {
    // La franja Diamante es 1.3–1.6, asi que sus tercios estan en 1.4 y 1.5:
    // numeros que un ratio real pisa. Sin tolerancia, `(1.4-1.3)/0.3` da
    // 0.33333333333333287 —menor que 1/3 por un bit— y el subnivel salia I
    // mientras el consejo de al lado decia "A 0.10x de Diamante III".
    expect(subnivelDe('Diamante', 1.4)).toBe('II');
    expect(subnivelDe('Diamante', 1.5)).toBe('III');
    expect(subnivelDe('Oro', 0.7 + 0.2 / 3)).toBe('II');
    expect(subnivelDe('Platino', 0.9 + 0.2 / 3)).toBe('II');
    expect(subnivelDe('Bronce', 0.3 + 0.2 / 3)).toBe('II');
  });

  it('la escalera y el consejo NUNCA se saltan un subnivel', () => {
    // La propiedad, no el caso: el subnivel que pinta la escalera y el que
    // anuncia `siguienteEscalon` tienen que ser consecutivos.
    const ORDEN = ['I', 'II', 'III'];
    for (const rango of ['Bronce', 'Plata', 'Oro', 'Platino', 'Esmeralda', 'Diamante', 'Campeon'] as const) {
      const f = franjaDe(rango)!;
      for (let k = 0; k <= 300; k++) {
        const ratio = f.min + ((f.max - f.min) * k) / 300;
        if (ratio >= f.max) continue;
        const aqui = subnivelDe(rango, ratio);
        const e = siguienteEscalon(rango, ratio);
        if (!e) continue;
        const [, subSiguiente] = e.nombre.split(' ');
        if (subSiguiente && e.nombre.startsWith(rango === 'Campeon' ? 'Campeón' : rango)) {
          expect(ORDEN.indexOf(subSiguiente)).toBe(ORDEN.indexOf(aqui) + 1);
        } else {
          // Cambia de rango: entonces estabamos en el ultimo tercio.
          expect(aqui).toBe('III');
        }
      }
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

  it('devuelve el multiplicador del ejercicio a la cuenta', () => {
    // El ratio que decide el rango es `(1RM/peso) / multiplicador`, y el de la
    // Prensa de Piernas es 2.0. Sin devolverlo, GM-02 decia "sube tu 1RM a
    // 83 kg" a quien ya levantaba 120.
    expect(pesoParaElSiguiente(1.1, 75, 2)).toBe(165);
    expect(pesoParaElSiguiente(1.1, 75, 1)).toBe(83);
    // Un multiplicador invalido no puede partir la cifra por cero.
    expect(pesoParaElSiguiente(1.1, 75, 0)).toBe(83);
    expect(pesoParaElSiguiente(1.1, 75, NaN)).toBe(83);
  });
});
