import { describe, it, expect } from 'vitest';
import { rpeDeSesionDesdeEjercicios } from '@/utils/rpe';

const e = (rpe: number | undefined, extra = {}) => ({ rpe, volumen: 400, ...extra });

describe('un solo RPE: el de la sesion sale de los ejercicios si ya los contestaste', () => {
  it('sin ninguno contestado no hay RPE derivado (se pregunta una vez)', () => {
    expect(rpeDeSesionDesdeEjercicios([e(undefined), e(undefined)])).toBeNull();
    expect(rpeDeSesionDesdeEjercicios([])).toBeNull();
  });
  it('promedio redondeado', () => {
    expect(rpeDeSesionDesdeEjercicios([e(7), e(8), e(9)])).toBe(8);
    expect(rpeDeSesionDesdeEjercicios([e(7), e(8)])).toBe(8);
    expect(rpeDeSesionDesdeEjercicios([e(6), e(undefined), e(7)])).toBe(7);
  });
  it('una serie excluida o sin volumen no cuenta', () => {
    expect(rpeDeSesionDesdeEjercicios([e(9, { excluido: true }), e(5, { volumen: 0 }), e(6)])).toBe(6);
  });
});
