import { describe, it, expect } from 'vitest';
import { CASOS, evaluar, peticionDe, numerosInventados, REGLAS } from './eval-coach.mjs';

describe('eval del coach · los comprobadores', () => {
  it('hay 18 dialogos con id unico', () => {
    expect(CASOS).toHaveLength(18);
    expect(new Set(CASOS.map((c) => c.id)).size).toBe(18);
  });
  for (const c of CASOS) {
    it(`${c.id}: la respuesta buena pasa`, () => expect(evaluar(c, c.buena)).toEqual([]));
    c.malas.forEach((m, i) =>
      it(`${c.id}: la mala #${i + 1} falla (${m.slice(0, 40)}…)`, () => expect(evaluar(c, m).length).toBeGreaterThan(0))
    );
  }
  it('cada dialogo arma una peticion valida: sistema, contexto y la pregunta al final', () => {
    for (const c of CASOS) {
      const m = peticionDe(c);
      expect(m[0].role).toBe('system');
      expect(m[1].content).toContain('PANORAMA');
      expect(m[m.length - 1].content.startsWith(c.pregunta)).toBe(true);
    }
  });
  it('un aviso de la app llega como AVISOS, no como turno del asistente', () => {
    const m = peticionDe(CASOS.find((c) => c.id === 'tarjeta-volumen'));
    expect(m[m.length - 1].content).toContain('AVISOS DE LA APP');
  });
  it('numerosInventados: compara numeros enteros, no subcadenas', () => {
    expect(numerosInventados('subiste 57.5', { a: '57.5' }, '')).toEqual([]);
    expect(numerosInventados('subiste 75', { a: '57.5 y 750' }, '')).toEqual(['75']);
  });
  it('las reglas rechazan los sintomas del incidente', () => {
    expect(REGLAS.sinGritos('NO TE RINDAS')).not.toBe(true);
    expect(REGLAS.sinFechaMaquina('el 2026-11-13')).not.toBe(true);
    expect(REGLAS.sinFrasesVetadas('es un techo')).not.toBe(true);
    expect(REGLAS.sinPreguntaFinal('¿quieres?')).not.toBe(true);
  });
});
