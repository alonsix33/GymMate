/**
 * Empezar a entrenar en un toque: la rutina que toca hoy (la misma que el coach
 * sugiere, calculada por codigo), la tarjeta de la home y la hoja del "+".
 *
 * Antes la home enterraba las rutinas bajo el heatmap y el nivel, y el "+"
 * central abria solo el builder: lo que mas se hace —empezar— costaba un
 * scroll, y crear una rutina (lo que casi nunca se hace) tenia el boton mas
 * grande de la app.
 */
import { trainingGroups } from '@/data/training-groups';
import { fusionarDias, sugerirGrupoDeHoy, type PlantillaDeGrupo } from '@/features/coach-estado';
import { claveDiaLima } from '@/utils/fecha';
import { escapar } from '@/utils/formato';
import { getHistory } from '@/utils/storage';
import { checkForExistingDraft } from '@/state/session';
import { abrirHoja } from '@/ui/session-screens';
import type { HistorySession } from '@/types';

export interface RutinaDeHoy {
  id: string;
  /** "Piernas + Glúteos" (sin el prefijo GRUPO N). */
  titulo: string;
  motivo: string | null;
}

export const quitarPrefijo = (nombre: string): string => nombre.replace(/^GRUPO \d+\s*-\s*/, '');

function plantillas(): PlantillaDeGrupo[] {
  return Object.values(trainingGroups).map((g) => ({ nombre: g.nombre, ejercicios: g.ejercicios.map((e) => e.nombre) }));
}

/** La rutina que toca hoy, o null si hoy ya se entreno. Sin historial, la primera. */
export function rutinaQueToca(historial: HistorySession[], ahora: Date = new Date()): RutinaDeHoy | null {
  const hoy = claveDiaLima(ahora);
  const dias = fusionarDias(historial, Number(hoy.slice(0, 4)));
  if (dias.some((d) => d.fecha === hoy)) return null;
  const entradas = Object.entries(trainingGroups);
  if (entradas.length === 0) return null;
  const sug = sugerirGrupoDeHoy(dias, hoy, plantillas(), Number(hoy.slice(0, 4)));
  const elegida = (sug && entradas.find(([, g]) => g.nombre === sug.grupo)) ?? entradas[0];
  return { id: elegida[0], titulo: quitarPrefijo(elegida[1].nombre), motivo: sug?.motivo ?? null };
}

/** La tarjeta EMPEZAR de la home. Vacia si no hay nada que empezar. */
export function bloqueEmpezar(historial: HistorySession[], ahora: Date = new Date()): string {
  const r = rutinaQueToca(historial, ahora);
  if (!r) return '';
  return `
    <section class="f-home__hero" aria-label="Empezar entrenamiento">
      <span class="f-label">TOCA HOY</span>
      <span class="f-home__hero-nombre">${escapar(r.titulo)}</span>
      ${r.motivo ? `<span class="f-home__hero-motivo">${escapar(r.motivo)}</span>` : ''}
      <button type="button" class="f-btn f-btn--primario f-btn--bloque" data-grupo="${escapar(r.id)}">EMPEZAR</button>
    </section>
  `;
}

/** Las opciones del "+": empezar (o continuar) primero; crear una rutina, al final. */
export function opcionesDelMas(
  historial: HistorySession[],
  hayBorrador: boolean,
  ahora: Date = new Date()
): Array<{ accion: 'continuar' | 'empezar' | 'elegir' | 'nueva'; etiqueta: string; detalle?: string; id?: string }> {
  const salida: ReturnType<typeof opcionesDelMas> = [];
  if (hayBorrador) {
    salida.push({ accion: 'continuar', etiqueta: 'Continuar la sesión en curso' });
  } else {
    const r = rutinaQueToca(historial, ahora);
    if (r) salida.push({ accion: 'empezar', etiqueta: `Empezar ${r.titulo}`, detalle: r.motivo ?? undefined, id: r.id });
  }
  salida.push({ accion: 'elegir', etiqueta: 'Elegir otra rutina' });
  salida.push({ accion: 'nueva', etiqueta: 'Nueva rutina' });
  return salida;
}

type Opcion = ReturnType<typeof opcionesDelMas>[number];

export interface AccionesDelMas {
  continuar: () => void;
  empezar: (id: string) => void;
  elegir: () => void;
  nueva: () => void;
}

/** La hoja del "+". */
export function abrirMas(acciones: AccionesDelMas): void {
  const opciones = opcionesDelMas(getHistory(), checkForExistingDraft().hasDraft);
  const boton = (o: Opcion, i: number) => `
    <button type="button" class="f-btn ${i === 0 ? 'f-btn--primario' : 'f-btn--secundario'} f-btn--hoja f-mas__op" data-mas="${o.accion}" ${o.id ? `data-id="${escapar(o.id)}"` : ''}>
      ${escapar(o.etiqueta)}${o.detalle ? `<span class="f-mas__detalle">${escapar(o.detalle)}</span>` : ''}
    </button>`;
  const velo = abrirHoja(`
    <div class="f-sheet" role="dialog" aria-label="Qué quieres hacer">
      <div class="f-sheet__handle" aria-hidden="true"></div>
      <span class="f-sheet__titulo">¿Qué quieres hacer?</span>
      <div class="f-mas">${opciones.map(boton).join('')}</div>
      <button type="button" class="f-btn f-btn--secundario f-btn--hoja" data-cerrar>Cancelar</button>
    </div>
  `);
  velo?.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-mas]');
    if (!el) return;
    velo.querySelector<HTMLElement>('[data-cerrar]')?.click();
    switch (el.dataset.mas) {
      case 'continuar': acciones.continuar(); break;
      case 'empezar': acciones.empezar(el.dataset.id ?? ''); break;
      case 'elegir': acciones.elegir(); break;
      case 'nueva': acciones.nueva(); break;
    }
  });
}
