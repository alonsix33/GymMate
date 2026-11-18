import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getHistory, getPRs, getProfile, getDraft, addToHistory, rescatesPendientes, formaValida } from '@/utils/storage';
import { bajarCopia } from '@/features/backend';
import type { HistorySession } from '@/types';

/**
 * 1.2 · Un dato dañado no puede romper la app ni perderse al sobrescribirlo.
 *
 * Antes: un JSON cortado a la mitad (una cuota llena a media escritura) se
 * descartaba y el siguiente guardado SOBRESCRIBIA la cadena, que a veces era
 * recuperable; y un "null" guardado hacia reventar `getHistory().length`.
 */
const sesion = (id: string): HistorySession =>
  ({ sessionId: id, date: '2026-11-18', savedAt: '2026-11-18T17:00:00.000Z', grupo: 'G', type: 'weights', volumenTotal: 1, volumenPorGrupo: {}, ejercicios: [] }) as unknown as HistorySession;
const copias = (clave: string) =>
  Object.keys(localStorage).filter((k) => k.startsWith(`${clave}__corrupto_`));

beforeEach(() => {
  localStorage.clear();
  rescatesPendientes();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('JSON ilegible', () => {
  const CORTADO = '[{"sessionId":"a","date":"2026-11-1';
  it('devuelve el valor por defecto, no revienta', () => {
    localStorage.setItem('gymmate_history', CORTADO);
    expect(getHistory()).toEqual([]);
  });
  it('GUARDA el crudo antes de que nada lo sobrescriba', () => {
    localStorage.setItem('gymmate_history', CORTADO);
    getHistory();
    const c = copias('gymmate_history');
    expect(c).toHaveLength(1);
    expect(localStorage.getItem(c[0])).toBe(CORTADO);
  });
  it('y el siguiente guardado NO destruye la copia', () => {
    localStorage.setItem('gymmate_history', CORTADO);
    getHistory();
    addToHistory(sesion('nueva'));
    expect(getHistory().map((s) => s.sessionId)).toEqual(['nueva']);
    expect(localStorage.getItem(copias('gymmate_history')[0])).toBe(CORTADO);
  });
  it('lo mismo para los PRs, el perfil y el borrador', () => {
    localStorage.setItem('gymmate_prs', '{"X":');
    localStorage.setItem('gymmate_profile', '{{{');
    localStorage.setItem('gymmate_draft', 'no es json');
    expect([getPRs(), getProfile(), getDraft()]).toEqual([{}, {}, null]);
    expect(copias('gymmate_prs')).toHaveLength(1);
    expect(copias('gymmate_profile')).toHaveLength(1);
    expect(copias('gymmate_draft')).toHaveLength(1);
  });
  it('no duplica la copia en cada lectura (aunque pase el tiempo entre lecturas)', () => {
    vi.useFakeTimers();
    localStorage.setItem('gymmate_history', CORTADO);
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(2026, 10, 18, 12, 0, i));
      getHistory();
    }
    vi.useRealTimers();
    expect(copias('gymmate_history')).toHaveLength(1);
  });
  it('conserva como mucho 3 copias distintas por clave', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(new Date(2026, 10, 18, 12, 0, i));
      localStorage.setItem('gymmate_history', `[{"roto":${i}`);
      getHistory();
    }
    vi.useRealTimers();
    expect(copias('gymmate_history').length).toBe(3);
  });
});

describe('JSON válido pero con la forma equivocada', () => {
  it('"null" donde va la lista: [] y no "Cannot read properties of null"', () => {
    localStorage.setItem('gymmate_history', 'null');
    expect(getHistory()).toEqual([]);
    expect(copias('gymmate_history')).toHaveLength(1);
  });
  it('un objeto donde va una lista, y una lista donde va un objeto', () => {
    localStorage.setItem('gymmate_history', '{}');
    localStorage.setItem('gymmate_prs', '[]');
    expect(getHistory()).toEqual([]);
    expect(getPRs()).toEqual({});
  });
  it('un borrador legítimamente vacío ("null") NO se rescata', () => {
    localStorage.setItem('gymmate_draft', 'null');
    expect(getDraft()).toBeNull();
    expect(copias('gymmate_draft')).toHaveLength(0);
  });
  it('los datos buenos pasan intactos y sin rescates', () => {
    addToHistory(sesion('a'));
    expect(getHistory()).toHaveLength(1);
    expect(copias('gymmate_history')).toHaveLength(0);
    expect(rescatesPendientes()).toEqual([]);
  });
  it('formaValida', () => {
    expect(formaValida([], 'lista')).toBe(true);
    expect(formaValida({}, 'lista')).toBe(false);
    expect(formaValida(null, 'objeto')).toBe(false);
    expect(formaValida(null, 'objeto_o_nulo')).toBe(true);
    expect(formaValida([], 'objeto')).toBe(false);
  });
});

describe('el aviso al usuario', () => {
  it('se informa de lo rescatado UNA vez', () => {
    localStorage.setItem('gymmate_history', 'null');
    getHistory();
    const r = rescatesPendientes();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ clave: 'gymmate_history', motivo: 'forma' });
    expect(rescatesPendientes()).toEqual([]);
  });
});

describe('restaurar la copia del servidor', () => {
  function servidor(datos: Record<string, unknown> | null) {
    localStorage.setItem('gymmate_backend_token', 'tok');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ datos }) })));
  }
  it('solo entran los bloques con la forma correcta; los demás se omiten y se dicen', async () => {
    servidor({ gymmate_history: [sesion('s')], gymmate_prs: [], gymmate_profile: { name: 'A' } });
    const r = await bajarCopia();
    expect(r.ok).toBe(true);
    expect(r.omitidas).toEqual(['gymmate_prs']);
    expect(getHistory()).toHaveLength(1);
    expect(getProfile()).toEqual({ name: 'A' });
    expect(localStorage.getItem('gymmate_prs')).toBeNull();
  });
  it('una copia con TODO mal formado no toca nada', async () => {
    addToHistory(sesion('local'));
    servidor({ gymmate_history: null, gymmate_prs: [] });
    const r = await bajarCopia();
    expect(r.ok).toBe(false);
    expect(getHistory().map((s) => s.sessionId)).toEqual(['local']);
  });
  it('restaurar GUARDA antes lo que había', async () => {
    addToHistory(sesion('local'));
    servidor({ gymmate_history: [sesion('remota')] });
    await bajarCopia();
    expect(getHistory().map((s) => s.sessionId)).toEqual(['remota']);
    const previo = JSON.parse(localStorage.getItem('gymmate_history__previo_restauracion')!);
    expect(previo.map((s: HistorySession) => s.sessionId)).toEqual(['local']);
  });
  it('si no cabe la copia de seguridad, NO restaura nada', async () => {
    addToHistory(sesion('local'));
    servidor({ gymmate_history: [sesion('remota')] });
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.includes('__previo_')) throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, k, v);
    });
    const r = await bajarCopia();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exporta/i);
    vi.restoreAllMocks();
    expect(getHistory().map((s) => s.sessionId)).toEqual(['local']);
  });
  it('todo o nada: si una escritura falla a medias, se devuelve lo anterior', async () => {
    addToHistory(sesion('local'));
    localStorage.setItem('gymmate_profile', JSON.stringify({ name: 'Antes' }));
    servidor({ gymmate_history: [sesion('remota')], gymmate_profile: { name: 'Remoto' } });
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === 'gymmate_profile') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, k, v);
    });
    const r = await bajarCopia();
    vi.restoreAllMocks();
    expect(r.ok).toBe(false);
    expect(getHistory().map((s) => s.sessionId)).toEqual(['local']); // el historial NO se quedo a medias
    expect(getProfile()).toEqual({ name: 'Antes' });
  });
});
