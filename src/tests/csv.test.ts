import { describe, it, expect } from 'vitest';
import { partirEnRegistros, partirCeldas, neutralizarFormula, quitarNeutralizacion, escaparCelda } from '@/utils/csv';

describe('partirEnRegistros', () => {
  it('un mensaje con saltos de linea dentro de comillas es UN registro', () => {
    const t = 'a,b\nc1,"linea 1\nlinea 2\n\nlinea 4",x\nz,w';
    const r = partirEnRegistros(t);
    expect(r).toHaveLength(3);
    expect(partirCeldas(r[1])[1]).toBe('linea 1\nlinea 2\n\nlinea 4');
  });
  it('CRLF y lineas vacias', () => {
    expect(partirEnRegistros('a,b\r\n\r\nc,d\r\n')).toEqual(['a,b', 'c,d']);
  });
  it('comillas dobles escapadas y coma dentro', () => {
    const [r] = partirEnRegistros('1,"dijo ""hola"", y se fue",3');
    expect(partirCeldas(r)).toEqual(['1', 'dijo "hola", y se fue', '3']);
  });
  it('ida y vuelta de escaparCelda con todo tipo de texto', () => {
    for (const t of ['simple', 'con, coma', 'con "comillas"', 'salto\nde linea', 'mixto,"\n"', '', '  espacios  ', 'a\r\nb']) {
      const reg = partirEnRegistros(['x', escaparCelda(t), 'y'].join(','));
      expect(partirCeldas(reg[0])[1]).toBe(t === '  espacios  ' ? '  espacios  ' : t);
    }
  });
});

describe('neutralizar formulas', () => {
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)', '\tx'])('%s se vuelve texto', (v) => {
    const n = neutralizarFormula(v);
    expect(n.startsWith("'")).toBe(true);
    expect(quitarNeutralizacion(n)).toBe(v);
  });
  it('un texto normal no se toca, ni un apostrofe legitimo', () => {
    expect(neutralizarFormula('Press banca')).toBe('Press banca');
    expect(quitarNeutralizacion("'hola")).toBe("'hola");
  });
});
