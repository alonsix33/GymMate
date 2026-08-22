/**
 * Formato de cifras FIERRO.
 *
 * El mockup agrupa los miles con COMA en todas sus cifras — "8,325 kg",
 * "2,800 kg", "1,480 XP", "125,100" — pese a estar en espanol. Es una
 * decision del diseno aprobado, asi que se reproduce tal cual y no se deja al
 * criterio de toLocaleString('es'), que ademas no agrupa numeros de 4 digitos.
 */

const AGRUPADOR = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const AGRUPADOR_DECIMAL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** Entero con separador de miles: 8160 -> "8,160". */
export function cifra(valor: number): string {
  return AGRUPADOR.format(Math.round(valor || 0));
}

/** Igual, pero conserva un decimal si lo tiene: 47.5 -> "47.5". */
export function cifraDecimal(valor: number): string {
  return AGRUPADOR_DECIMAL.format(valor || 0);
}

/**
 * Texto que va a parar a un `innerHTML`, sea entre etiquetas o DENTRO de un
 * atributo.
 *
 * Habia nueve copias de esta funcion, todas con la misma version corta:
 * `div.textContent = t; return div.innerHTML`. Esa version escapa `&`, `<` y
 * `>` pero NO la comilla doble, y media app interpola en atributos
 * (`value="${escapar(...)}"`, `data-fecha="${escapar(...)}"`). Con un nombre
 * de perfil como `x" onfocus="..." z="` el atributo se cierra antes de tiempo
 * y el elemento gana atributos nuevos — JS arbitrario en el origen de la app,
 * alcanzable con un CSV de backup ajeno. Ademas truncaba en silencio: un
 * ejercicio llamado `Press "Militar"` salia del selector de graficos como
 * `Press `.
 */
export function escapar(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Las tres superposiciones a pantalla completa (PROGRESO, el builder y el
 * coach) tapan la tab bar: el mockup no la dibuja en ninguna de las tres.
 * Taparla con `z-index` la saca de la vista pero NO del arbol de
 * accesibilidad ni del recorrido con Tab, asi que un lector de pantalla
 * seguia anunciando cinco botones inalcanzables. `inert` los saca de los dos.
 */
export function taparNavegacion(tapada: boolean): void {
  const nav = document.querySelector<HTMLElement>('nav.f-tabbar');
  if (!nav) return;
  if (tapada) nav.setAttribute('inert', '');
  else nav.removeAttribute('inert');
}
