/**
 * UN solo criterio para "esta serie cuenta".
 *
 * Una serie cuenta si tiene volumen y el usuario no la marco como no hecha ni
 * como valor erroneo (`excluido`). Antes cada calculo tenia su propio filtro y
 * solo el coach y las zonas respetaban la exclusion: las calculadoras, los
 * graficos, el historial y la XP seguian sumando el 450 de Hip Thrust.
 */
export interface SerieLike {
  volumen?: number;
  excluido?: boolean;
}

export function esSerieValida(e: SerieLike): boolean {
  return (e.volumen ?? 0) > 0 && e.excluido !== true;
}

export function seriesValidas<T extends SerieLike>(ejercicios: readonly T[] | undefined | null): T[] {
  return (ejercicios ?? []).filter(esSerieValida);
}
