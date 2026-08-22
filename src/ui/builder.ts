/**
 * FIERRO · B-01 — Nueva rutina.
 *
 * Sustituye al modal legacy, que traia un mapa de colores por grupo
 * (`from-blue-500/10`, `border-emerald-500/30`…) y no reutilizaba nada del
 * sistema.
 *
 * El nombre lo SUGIERE la propia eleccion, como dice el rotulo del mockup
 * ("NOMBRE · SUGERIDO POR TUS ELECCIONES"): quien quiera otro lo escribe, pero
 * dejarlo en blanco no puede dar una rutina sin nombre.
 */
import { addCustomWorkout, addCustomExerciseToStorage, getCustomExercises } from '@/utils/storage';
import { allExercises, getExerciseInfo } from '@/data/exercises';
import { trainingGroups } from '@/data/training-groups';
import { mostrarToast } from '@/ui/feedback';
import type { CustomWorkout } from '@/utils/storage';
import type { MuscleGroup } from '@/types';

function escapar(texto: string): string {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

interface Elegido {
  nombre: string;
  grupoMuscular: MuscleGroup;
}

let elegidos: Elegido[] = [];
let nombreEditado = '';
let formularioAbierto = false;

const ID = 'fierroBuilder';

/** Orden de musculos para agrupar la lista. */
const ORDEN: MuscleGroup[] = ['Piernas', 'Glúteos', 'Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Core'];

/**
 * Nombre sugerido por lo elegido: los dos grupos con mas ejercicios, unidos
 * por "+". Es lo que hace el mockup ("Piernas + Core" con una de piernas y una
 * de core).
 */
export function nombreSugerido(seleccion: Elegido[]): string {
  if (seleccion.length === 0) return '';
  const cuenta = new Map<string, number>();
  for (const e of seleccion) cuenta.set(e.grupoMuscular, (cuenta.get(e.grupoMuscular) ?? 0) + 1);
  const top = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || ORDEN.indexOf(a[0] as MuscleGroup) - ORDEN.indexOf(b[0] as MuscleGroup))
    .slice(0, 2)
    .map(([g]) => g);
  return top.join(' + ');
}

/** Todos los ejercicios disponibles: catalogo + los que el usuario creo. */
function catalogo(): Elegido[] {
  const propios = getCustomExercises().map((c) => ({
    nombre: c.nombre,
    grupoMuscular: c.grupoMuscular as MuscleGroup,
  }));
  const base = allExercises.map((e) => ({ nombre: e.nombre, grupoMuscular: e.grupoMuscular }));
  const vistos = new Set<string>();
  return [...propios, ...base].filter((e) => {
    const k = e.nombre.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

function contenedor(): HTMLElement {
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ID;
    el.className = 'f-builder f-root hidden';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Nueva rutina');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const o = (e.target as HTMLElement)?.closest<HTMLElement>('[data-builder]');
      if (o) alTocar(o);
    });
  }
  return el;
}

function render(): void {
  const el = contenedor();
  const sugerido = nombreSugerido(elegidos);
  const lista = catalogo();

  // Los grupos que el usuario ya toco van primero: es donde va a seguir
  // eligiendo. Con nada elegido, el orden es el de siempre.
  const tocados = new Set(elegidos.map((e) => e.grupoMuscular));
  const grupos = [...ORDEN].sort((a, b) => Number(tocados.has(b)) - Number(tocados.has(a)));

  el.innerHTML = `
    <div class="f-builder__cabecera">
      <span class="f-builder__titulo">NUEVA RUTINA</span>
      <button type="button" class="f-prog__cerrar" data-builder="cerrar" aria-label="Cerrar">✕</button>
    </div>

    <div class="f-campo">
      <span class="f-campo__label f-campo__label--corto">NOMBRE · SUGERIDO POR TUS ELECCIONES</span>
      <input class="f-campo__caja" type="text" id="builderNombre"
        value="${escapar(nombreEditado)}" placeholder="${escapar(sugerido || 'Elige ejercicios y te propongo un nombre')}"
        aria-label="Nombre de la rutina" />
    </div>

    ${
      elegidos.length === 0
        ? ''
        : `<div class="f-chips-elegidos">
            ${elegidos
              .map(
                (e, i) =>
                  `<button type="button" class="f-chip-elegido" data-builder="quitar" data-indice="${i}"
                     aria-label="Quitar ${escapar(e.nombre)}">${escapar(e.nombre.toUpperCase())} ✕</button>`
              )
              .join('')}
          </div>`
    }

    <div class="f-builder__crear">
      <button type="button" class="f-builder__crear-abrir" data-builder="crear-toggle"
        aria-expanded="${formularioAbierto}">
        <span class="f-builder__crear-texto">+ Crear ejercicio propio</span>
        <span class="f-builder__crear-chevron">▾</span>
      </button>
      ${
        formularioAbierto
          ? `<div class="f-builder__crear-form">
              <input class="f-campo__caja" type="text" id="builderNuevoNombre" placeholder="Nombre del ejercicio" aria-label="Nombre del ejercicio nuevo" />
              <div class="f-builder__crear-fila">
                <select class="f-campo__caja f-campo__caja--select" id="builderNuevoGrupo" aria-label="Grupo muscular">
                  ${ORDEN.map((g) => `<option value="${g}">${g}</option>`).join('')}
                </select>
                <button type="button" class="f-btn f-btn--secundario f-btn--medida" data-builder="crear-guardar">Añadir</button>
              </div>
             </div>`
          : ''
      }
    </div>

    <div class="f-builder__lista">
      ${grupos
        .map((grupo) => {
          const delGrupo = lista.filter((e) => e.grupoMuscular === grupo);
          if (delGrupo.length === 0) return '';
          return `
          <div class="f-builder__grupo">
            <span class="f-prog__label">${escapar(grupo.toUpperCase())}</span>
            ${delGrupo
              .map((e) => {
                const marcado = elegidos.some((x) => x.nombre === e.nombre);
                return `
                <button type="button" class="f-fila-ej${marcado ? ' f-fila-ej--marcado' : ''}"
                  data-builder="alternar" data-nombre="${escapar(e.nombre)}" data-grupo="${escapar(e.grupoMuscular)}"
                  aria-pressed="${marcado}">
                  <span class="f-fila-ej__check">${marcado ? '✓' : ''}</span>
                  <span class="f-fila-ej__nombre">${escapar(e.nombre)}</span>
                  <span class="f-fila-ej__grupo">${escapar(e.grupoMuscular.toUpperCase())}</span>
                </button>`;
              })
              .join('')}
          </div>`;
        })
        .join('')}
    </div>

    <button type="button" class="f-btn f-btn--primario f-btn--bloque f-builder__guardar"
      data-builder="guardar" ${elegidos.length === 0 ? 'disabled' : ''}>
      ${
        elegidos.length === 0
          ? 'Elige al menos un ejercicio'
          : `Guardar rutina · ${elegidos.length} ${elegidos.length === 1 ? 'ejercicio' : 'ejercicios'}`
      }
    </button>
  `;

  const input = el.querySelector<HTMLInputElement>('#builderNombre');
  input?.addEventListener('input', () => {
    nombreEditado = input.value;
    // Sin repintar: repintar en cada tecla mata el cursor.
    const boton = el.querySelector<HTMLButtonElement>('[data-builder="guardar"]');
    if (boton) boton.disabled = elegidos.length === 0;
  });
}

export function abrirBuilder(): void {
  elegidos = [];
  nombreEditado = '';
  formularioAbierto = false;
  const el = contenedor();
  el.classList.remove('hidden');
  render();
  el.scrollTop = 0;
}

export function cerrarBuilder(): void {
  document.getElementById(ID)?.classList.add('hidden');
}

function esMancuernaDe(nombre: string): boolean {
  const propio = getCustomExercises().find((c) => c.nombre === nombre);
  if (propio) return propio.esMancuerna;
  const info = getExerciseInfo(nombre);
  if (info) return info.esMancuerna;
  for (const grupo of Object.values(trainingGroups)) {
    const hallado = [...grupo.ejercicios, ...grupo.opcionales].find((e) => e.nombre === nombre);
    if (hallado) return hallado.esMancuerna;
  }
  return false;
}

function alTocar(el: HTMLElement): void {
  switch (el.dataset.builder) {
    case 'cerrar':
      cerrarBuilder();
      break;

    case 'alternar': {
      const nombre = el.dataset.nombre ?? '';
      const grupo = (el.dataset.grupo ?? 'Core') as MuscleGroup;
      const i = elegidos.findIndex((x) => x.nombre === nombre);
      if (i >= 0) elegidos.splice(i, 1);
      else elegidos.push({ nombre, grupoMuscular: grupo });
      render();
      break;
    }

    case 'quitar':
      elegidos.splice(Number(el.dataset.indice), 1);
      render();
      break;

    case 'crear-toggle':
      formularioAbierto = !formularioAbierto;
      render();
      break;

    case 'crear-guardar': {
      const raiz = contenedor();
      const nombre = raiz.querySelector<HTMLInputElement>('#builderNuevoNombre')?.value.trim() ?? '';
      const grupo = (raiz.querySelector<HTMLSelectElement>('#builderNuevoGrupo')?.value ??
        'Core') as MuscleGroup;
      if (!nombre) {
        mostrarToast({ tipo: 'aviso', titulo: 'Ponle nombre al ejercicio' });
        return;
      }
      if (catalogo().some((e) => e.nombre.toLowerCase() === nombre.toLowerCase())) {
        mostrarToast({
          tipo: 'aviso',
          titulo: 'Ese ejercicio ya existe',
          detalle: 'Búscalo en la lista de abajo y márcalo.',
        });
        return;
      }
      addCustomExerciseToStorage({
        id: `ex_${Date.now()}`,
        nombre,
        esMancuerna: false,
        grupoMuscular: grupo,
        createdAt: new Date().toISOString(),
      });
      elegidos.push({ nombre, grupoMuscular: grupo });
      formularioAbierto = false;
      render();
      mostrarToast({ tipo: 'exito', titulo: `${nombre} añadido` });
      break;
    }

    case 'guardar': {
      if (elegidos.length === 0) return;
      const nombre = (nombreEditado.trim() || nombreSugerido(elegidos)).slice(0, 60);
      const rutina: CustomWorkout = {
        id: `custom_${Date.now()}`,
        nombre,
        ejercicios: elegidos.map((e) => ({
          nombre: e.nombre,
          esMancuerna: esMancuernaDe(e.nombre),
          grupoMuscular: e.grupoMuscular,
        })),
        opcionales: [],
        isCustom: true,
        createdAt: new Date().toISOString(),
      };
      addCustomWorkout(rutina);
      cerrarBuilder();
      mostrarToast({
        tipo: 'exito',
        titulo: `${nombre} guardada`,
        detalle: `${elegidos.length} ${elegidos.length === 1 ? 'ejercicio' : 'ejercicios'}`,
      });
      void import('@/ui/navigation').then(({ renderizarHome }) => renderizarHome());
      break;
    }
  }
}
