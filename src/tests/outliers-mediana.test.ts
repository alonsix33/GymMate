import { describe, it, expect } from 'vitest';
import { detectarOutliers } from '@/features/coach-estado';
import type { HistorySession } from '@/types';

function ses(fecha: string, nombre: string, peso: number): HistorySession {
  return {
    sessionId: `s_${fecha}_${nombre}_${peso}`, date: fecha, savedAt: `${fecha}T19:00:00-05:00`, grupo: 'G', type: 'weights',
    volumenTotal: peso * 40, volumenPorGrupo: {},
    ejercicios: [{ nombre, sets: 4, reps: 10, peso, volumen: peso * 40, completado: true, esMancuerna: false, grupoMuscular: 'Tríceps' }],
  } as unknown as HistorySession;
}
const serie = (nombre: string, pesos: number[]) => pesos.map((p, i) => ses(`2026-0${(i % 9) + 1}-10`, nombre, p));

describe('outliers por mediana', () => {
  it('dos sesiones de 60 en un ejercicio de 15 se detectan (el 3x del mejor las tapaba entre si)', () => {
    const h = serie('Triceps polea', [15, 15, 12.5, 15, 17.5, 15]);
    h.push(ses('2025-12-06', 'Triceps polea', 60), ses('2025-12-14', 'Triceps polea', 60));
    const o = detectarOutliers(h).filter((x) => x.peso === 60);
    expect(o).toHaveLength(2);
  });
  it('el 450 entre pesos de 55 se detecta', () => {
    const h = [...serie('Hip Thrust', [50, 55, 55, 60, 55]), ses('2026-11-10', 'Hip Thrust', 450)];
    expect(detectarOutliers(h).map((x) => x.peso)).toEqual([450]);
  });
  it('un salto real de 10 a 22 (progreso) no es sospechoso', () => {
    const h = serie('Curl', [10, 10, 10, 10, 12]).concat(ses('2026-11-10', 'Curl', 22));
    expect(detectarOutliers(h)).toEqual([]);
  });
  it('con menos de 5 registros la mediana no sirve', () => {
    const h = serie('Raro', [10, 10, 10]).concat(ses('2026-11-10', 'Raro', 26));
    expect(detectarOutliers(h)).toEqual([]);
  });
  it('una serie ya excluida no se vuelve a proponer', () => {
    const h = [...serie('Hip Thrust', [50, 55, 55, 60, 55]), ses('2026-11-10', 'Hip Thrust', 450)];
    (h[h.length - 1].ejercicios[0] as { excluido?: boolean }).excluido = true;
    expect(detectarOutliers(h)).toEqual([]);
  });
});
