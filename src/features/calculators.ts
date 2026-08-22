/**
 * CA-01 / CA-02 · Calculadoras.
 *
 * El render vive en `src/ui/perfil.ts` y la aritmetica en
 * `src/utils/calculations.ts`, que se prueba sola. Aqui solo queda el enganche.
 *
 * Lo que habia antes —dropdowns poblados a mano, `innerHTML` con clases de
 * Tailwind, tres bloques de resultado casi iguales— se retira entero: no
 * quedaba una sola linea que FIERRO reutilizara.
 */
import { renderCalculadoras } from '@/ui/perfil';

export function initializeCalculators(): void {
  const contenedor = document.getElementById('calculatorsTab');
  if (contenedor) renderCalculadoras(contenedor);
}
