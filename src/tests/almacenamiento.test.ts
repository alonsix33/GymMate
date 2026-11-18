import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  addToHistory, getHistory, saveHistory, savePRs, saveDraft, getDraft, getPRs,
} from '@/utils/storage';
import {
  loadTrainingGroup, saveWorkout,
} from '@/features/workout';
import {
  saveCurrentSession, resetSession, updateExercise, saveDraftNow, sessionId, hasUnsavedChanges,
} from '@/state/session';
import { importFromCSV } from '@/features/history';
import type { HistorySession } from '@/types';

/**
 * 1.1 · El guardado NO puede decir "guardado" cuando no lo esta.
 *
 * Con la cuota llena `setItem` lanza `QuotaExceededError`. Antes se tragaba en
 * silencio: el toast decia "Entrenamiento guardado" y el borrador se borraba,
 * o sea que el entrenamiento se perdia sin ninguna señal.
 */
const sesion = (id: string): HistorySession =>
  ({ sessionId: id, date: '2026-11-18', savedAt: '2026-11-18T17:00:00.000Z', grupo: 'G', type: 'weights', volumenTotal: 2200, volumenPorGrupo: { Espalda: 2200 },
     ejercicios: [{ nombre: 'Jalón al Pecho', sets: 4, reps: 10, peso: 55, volumen: 2200, completado: true, esMancuerna: false, grupoMuscular: 'Espalda' }] }) as unknown as HistorySession;

/** Hace fallar SOLO las escrituras de las claves que se pidan. */
function llenarAlmacenamiento(claves: string[]) {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (claves.some((c) => k.includes(c))) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return original.call(this, k, v);
  });
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="fierroWorkout"></div>';
  resetSession();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('las escrituras dicen si funcionaron', () => {
  it('con espacio: true', () => {
    expect(saveHistory([sesion('a')])).toBe(true);
    expect(savePRs({ X: { peso: 1, sets: 1, reps: 1, volumen: 1, date: 'x' } })).toBe(true);
    expect(addToHistory(sesion('b'))).toBe(true);
  });
  it('con la cuota llena: false, y el historial anterior no se pierde', () => {
    addToHistory(sesion('a'));
    llenarAlmacenamiento(['gymmate_history']);
    expect(addToHistory(sesion('b'))).toBe(false);
    expect(saveHistory([])).toBe(false);
    vi.restoreAllMocks();
    expect(getHistory().map((s) => s.sessionId)).toEqual(['a']);
  });
  it('los PRs y el borrador tambien', () => {
    llenarAlmacenamiento(['gymmate_prs', 'gymmate_draft']);
    expect(savePRs({})).toBe(false);
    expect(saveDraft({ date: 'x', grupo: 'G', ejercicios: [], volumenTotal: 0, volumenPorGrupo: {} })).toBe(false);
  });
});

describe('guardar un entrenamiento con la cuota llena', () => {
  async function conSesion() {
    expect(await loadTrainingGroup('grupo4')).toBe(true);
    updateExercise(0, 4, 10, 55);
    saveDraftNow(); // el borrador SI cabe: es la copia que no hay que perder
    expect(getDraft()).not.toBeNull();
  }

  it('saveCurrentSession devuelve "error" y NO borra el borrador', async () => {
    await conSesion();
    llenarAlmacenamiento(['gymmate_history']);
    expect(saveCurrentSession()).toBe('error');
    expect(getDraft()).not.toBeNull();
    expect(hasUnsavedChanges || getDraft()!.volumenTotal > 0).toBe(true);
  });

  it('el boton Guardar muestra el aviso de FALLO y no el de exito', async () => {
    await conSesion();
    llenarAlmacenamiento(['gymmate_history']);
    await saveWorkout();
    const texto = document.body.innerText || document.body.textContent || '';
    expect(texto).toContain('No se pudo guardar');
    expect(texto).not.toContain('Entrenamiento guardado');
  });

  it('con espacio sigue diciendo "guardado" y limpia el borrador', async () => {
    await conSesion();
    await saveWorkout();
    expect(document.body.textContent).toContain('Entrenamiento guardado');
    expect(getDraft()).toBeNull();
    expect(getHistory()).toHaveLength(1);
  });

  it('un fallo NO marca la sesion como guardada: reintentar cuando hay espacio funciona', async () => {
    await conSesion();
    const espia = llenarAlmacenamiento(['gymmate_history']);
    expect(saveCurrentSession()).toBe('error');
    espia.mockRestore();
    const id = sessionId;
    expect(saveCurrentSession()).toBe('new');
    expect(getHistory()).toHaveLength(1);
    expect(getHistory()[0].sessionId).toBe(id);
  });

  it('libera la copia redundante gymmate_session que dejo la version anterior', async () => {
    localStorage.setItem('gymmate_session', JSON.stringify({ viejo: true }));
    await conSesion();
    saveCurrentSession();
    expect(localStorage.getItem('gymmate_session')).toBeNull();
  });
});

describe('el autoguardado del borrador', () => {
  it('si no cabe, NO dice "CAMBIOS GUARDADOS": avisa', async () => {
    await loadTrainingGroup('grupo4');
    updateExercise(0, 4, 10, 55);
    llenarAlmacenamiento(['gymmate_draft']);
    saveDraftNow();
    const texto = document.body.textContent ?? '';
    expect(texto).toContain('No se pudo guardar');
    // Y el estado NO miente: siguen habiendo cambios sin guardar, y el
    // indicador no dice "CAMBIOS GUARDADOS".
    expect(hasUnsavedChanges).toBe(true);
    expect(document.getElementById('fierroAutosave')?.textContent ?? '').not.toContain('CAMBIOS GUARDADOS');
  });
});

describe('importar un CSV con la cuota llena', () => {
  const CSV = [
    '=== ENTRENAMIENTOS DE PESAS ===',
    'Fecha,Grupo,Ejercicio,Sets,Reps,Peso (kg),Es Mancuerna,Grupo Muscular,Volumen,Completado,Volumen Total Sesión',
    '13/11/2026,GRUPO 4,Jalón al Pecho,4,10,55,No,Espalda,2200,Sí,2200',
  ].join('\n');

  it('rechaza con un error, no dice "importado"', async () => {
    llenarAlmacenamiento(['gymmate_history']);
    await expect(importFromCSV(new File([CSV], 'a.csv', { type: 'text/csv' }))).rejects.toThrow(/almacenamiento/i);
  });
  it('con espacio importa', async () => {
    const r = await importFromCSV(new File([CSV], 'a.csv', { type: 'text/csv' }));
    expect(r.imported).toBe(1);
    expect(getHistory()).toHaveLength(1);
  });
  it('los records que no se pudieron escribir no se cuentan como importados', async () => {
    const CON_RECORDS = CSV + '\n\n=== RÉCORDS ===\nEjercicio,Peso (kg),Sets,Reps,Volumen,Fecha\nPrensa de Piernas,180,4,10,7200,2025-12-25T12:00:00.000Z';
    llenarAlmacenamiento(['gymmate_prs']);
    const r = await importFromCSV(new File([CON_RECORDS], 'a.csv', { type: 'text/csv' }));
    expect(r.records).toBe(0);
    expect(getPRs()['Prensa de Piernas']).toBeUndefined();
  });
});
