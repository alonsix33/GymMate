/**
 * G-01 · Gráficos.
 *
 * Chart.js se retiro con FIERRO: el handoff prohibe librerias de charts y los
 * mockups dibujan los graficos con SVG a mano. Este modulo solo engancha la
 * pantalla; el dibujo vive en src/ui/hueso.ts y la aritmetica en
 * src/utils/zonas.ts, que se prueba sola.
 */
import { renderGraficos, fijarRango, fijarEjercicio, animarZonas } from '@/ui/hueso';
import type { Rango } from '@/utils/zonas';

export function initializeCharts(): void {
  const contenedor = document.getElementById('fierroGraficos');
  if (!contenedor) return;
  renderGraficos(contenedor);
  animarZonas(contenedor);
  if (contenedor.dataset.enganchado === 'si') return;

  contenedor.addEventListener('click', (e) => {
    const objetivo = (e.target as HTMLElement)?.closest<HTMLElement>('[data-hueso]');
    if (!objetivo) return;
    if (objetivo.dataset.hueso === 'rango') {
      fijarRango(objetivo.dataset.rango as Rango);
      initializeCharts();
    } else if (objetivo.dataset.hueso === 'primera') {
      void import('@/ui/navigation').then(({ showHome }) => showHome());
    }
  });

  contenedor.addEventListener('change', (e) => {
    const selector = (e.target as HTMLElement)?.closest<HTMLSelectElement>('[data-hueso="ejercicio"]');
    if (!selector) return;
    fijarEjercicio(selector.value);
    initializeCharts();
  });

  contenedor.dataset.enganchado = 'si';
}
