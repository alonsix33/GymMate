import { describe, it, expect } from 'vitest';
import { migratePRsToNormalizedNames } from '@/utils/exercise-normalizer';

describe('migratePRsToNormalizedNames: gana el MEJOR record, no el primero', () => {
  it('si dos nombres colapsan, queda el de mayor peso (campo peso)', () => {
    const r = migratePRsToNormalizedNames({
      'press banca': { peso: 60, sets: 4, reps: 10 },
      'Press Banca': { peso: 80, sets: 4, reps: 8 },
    }) as Record<string, { peso: number }>;
    const valores = Object.values(r);
    expect(valores).toHaveLength(1);
    expect(valores[0].peso).toBe(80);
  });
  it('el orden de llegada no cambia el resultado', () => {
    const r = migratePRsToNormalizedNames({
      'Press Banca': { peso: 80, sets: 4, reps: 8 },
      'press banca': { peso: 60, sets: 4, reps: 10 },
    }) as Record<string, { peso: number }>;
    expect(Object.values(r)[0].peso).toBe(80);
  });
});
