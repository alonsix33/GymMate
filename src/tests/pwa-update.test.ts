import { describe, it, expect, beforeEach, vi } from 'vitest';
import { alTomarControlLaVersionNueva, hayEntrenamientoEnCurso } from '@/pwa-update';
import { sessionData, resetSession } from '@/state/session';
import { saveDraft } from '@/utils/storage';

/**
 * La version nueva no debe llegar a costa de un entrenamiento: sin
 * entrenamiento recarga sola, con entrenamiento AVISA y espera, y la primera
 * instalacion no recarga nada.
 */
const decidir = (teniaControl: boolean, entrenando: boolean) => {
  const recargar = vi.fn();
  const avisar = vi.fn();
  const r = alTomarControlLaVersionNueva({ teniaControl, entrenando, recargar, avisar });
  return { r, recargar, avisar };
};

describe('cuando el worker nuevo toma el control', () => {
  it('la PRIMERA instalacion no recarga: no hay version vieja que reemplazar', () => {
    const { r, recargar, avisar } = decidir(false, false);
    expect(r).toBe('ignorada');
    expect(recargar).not.toHaveBeenCalled();
    expect(avisar).not.toHaveBeenCalled();
  });
  it('sin entrenamiento en curso recarga sola', () => {
    const { r, recargar } = decidir(true, false);
    expect(r).toBe('recargada');
    expect(recargar).toHaveBeenCalledTimes(1);
  });
  it('con un entrenamiento en curso NO recarga: avisa, y recarga al tocar ACTUALIZAR', () => {
    const { r, recargar, avisar } = decidir(true, true);
    expect(r).toBe('avisada');
    expect(recargar).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledTimes(1);
    (avisar.mock.calls[0][0] as () => void)();
    expect(recargar).toHaveBeenCalledTimes(1);
  });
  it('ni la primera instalacion ni el entrenamiento en curso recargan jamas por su cuenta', () => {
    for (const [tenia, entrena] of [[false, false], [false, true], [true, true]] as const) {
      expect(decidir(tenia, entrena).recargar).not.toHaveBeenCalled();
    }
  });
});

describe('que cuenta como "entrenamiento en curso"', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSession();
  });
  it('sin series ni borrador: no', () => {
    expect(hayEntrenamientoEnCurso()).toBe(false);
  });
  it('series en pantalla: si', () => {
    sessionData.volumenTotal = 2200;
    expect(hayEntrenamientoEnCurso()).toBe(true);
  });
  it('un borrador con series en disco (la app se reinicio): si', () => {
    saveDraft({ date: '2026-11-18', grupo: 'G4', ejercicios: [], volumenTotal: 2200, volumenPorGrupo: {} });
    expect(hayEntrenamientoEnCurso()).toBe(true);
  });
  it('un borrador de plantilla en 0: no', () => {
    saveDraft({ date: '2026-11-18', grupo: 'G4', ejercicios: [], volumenTotal: 0, volumenPorGrupo: {} });
    expect(hayEntrenamientoEnCurso()).toBe(false);
  });
});
