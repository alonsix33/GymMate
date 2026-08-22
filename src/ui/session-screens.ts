/**
 * FIERRO · W-02, W-03 y W-04 — las tres pantallas que rodean la sesion.
 *
 *   W-02  RPE al terminar: bottom sheet con el slider 1-10 y su gradiente
 *         semantico. Es el UNICO slider de RPE de la app: durante la sesion
 *         se usan chips (README 3).
 *   W-03  Resumen de XP: pantalla completa con el desglose real del motor de
 *         gamificacion, el ascenso de rango si lo hubo y la barra de nivel.
 *   W-04  Guia de ejercicio: bottom sheet al tocar el nombre o la "i". Si el
 *         ejercicio no tiene foto se omite el bloque — nunca un hueco vacio.
 */
import { atraparFoco } from '@/ui/feedback';
import { getHistory, getPR } from '@/utils/storage';
import { getExerciseInfo } from '@/data/exercises';
import { getMuscleRank, RANK_DISPLAY_NAMES } from '@/features/gamification';
import { colorDeRango } from '@/ui/gamification/muscle-map';
import { cifra } from '@/utils/formato';
import { ultimaVezDe, reloj, partirNombreDeGrupo } from '@/ui/workout-view';
import type { SessionXPSummary, GamificationMuscleGroup } from '@/types/gamification';

function escapar(texto: string): string {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

/** Una sola hoja viva a la vez, igual que en feedback.ts. */
let hojaViva: HTMLElement | null = null;
/** Lo que hay que deshacer al cerrarla: el resto de la pagina esta inerte. */
let liberarFoco: (() => void) | null = null;

/** Primitiva compartida de bottom sheet: velo, foco atrapado, Escape y cierre
 *  por clic fuera. La usan W-02, W-04 y la eleccion de estacion de C-07. */
export function abrirHoja(contenido: string, alCerrar?: () => void): HTMLElement | null {
  if (hojaViva) return null;
  const velo = document.createElement('div');
  velo.className = 'f-scrim f-root';
  velo.innerHTML = contenido;
  const cerrar = () => {
    document.removeEventListener('keydown', alTeclear);
    velo.remove();
    hojaViva = null;
    liberarFoco?.();
    liberarFoco = null;
    alCerrar?.();
  };
  const alTeclear = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cerrar();
  };
  velo.addEventListener('click', (e) => {
    if (e.target === velo) cerrar();
  });
  velo.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
  document.addEventListener('keydown', alTeclear);
  document.body.appendChild(velo);
  hojaViva = velo;
  liberarFoco = atraparFoco(velo);
  const sheet = velo.querySelector<HTMLElement>('.f-sheet');
  if (sheet) {
    sheet.tabIndex = -1;
    sheet.focus();
  }
  return velo;
}

function cerrarHojaViva(): void {
  hojaViva?.remove();
  hojaViva = null;
  // Sin esto, el resto de la pagina se quedaba inerte para siempre.
  liberarFoco?.();
  liberarFoco = null;
}

// --------------------------------------------------------------------------
// W-04 · Guia de ejercicio
// --------------------------------------------------------------------------

/** "17 abr" — la fecha del PR, corta como en el mockup. */
function fechaPR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mes = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return `${d.getDate()} ${mes}`;
}

export function mostrarGuiaEjercicio(nombre: string): void {
  const info = getExerciseInfo(nombre);
  const pr = getPR(nombre);
  const ultima = ultimaVezDe(nombre, getHistory());
  // Sin badge de intensidad: ver la nota en workout-view.ts. La regla derivada
  // contradice el ejemplo del propio mockup, asi que no se pinta ninguna.
  const badge = '';
  // Sin foto no hay bloque. La carga es perezosa y nunca bloquea: si la red
  // no esta, el resto de la guia se lee igual.
  const foto = info?.imageUrl
    ? `<img class="f-guia__foto" src="${escapar(info.imageUrl)}" alt="" loading="lazy" decoding="async" onerror="this.remove()" />`
    : '';
  const descripcion = info?.descripcion
    ? `<p class="f-guia__texto">${escapar(info.descripcion)}</p>`
    : '';
  const filas: string[] = [];
  if (pr) {
    const fecha = fechaPR(pr.date);
    filas.push(
      `<div class="f-guia__fila"><span class="f-guia__label">Tu PR</span><span class="f-guia__valor f-guia__valor--pr">${cifra(
        pr.peso
      )} kg${fecha ? ` · ${fecha}` : ''}</span></div>`
    );
  }
  if (ultima) {
    filas.push(
      `<div class="f-guia__fila"><span class="f-guia__label">Última vez</span><span class="f-guia__valor">${ultima.sets}×${ultima.reps} · ${cifra(
        ultima.peso
      )} kg</span></div>`
    );
  }
  const datos = filas.length ? `<div class="f-guia__datos">${filas.join('')}</div>` : '';
  const musculo = info ? escapar(info.grupoMuscular).toUpperCase() : '';

  abrirHoja(`
    <div class="f-sheet" role="dialog" aria-modal="true" aria-label="Guía de ${escapar(nombre)}">
      <div class="f-sheet__handle" aria-hidden="true"></div>
      <div class="f-guia__cabecera">
        <div class="f-guia__identidad">
          <span class="f-guia__nombre">${escapar(nombre)}</span>
          ${musculo ? `<span class="f-guia__musculos">${musculo}</span>` : ''}
        </div>
        ${badge}
      </div>
      ${foto}
      ${descripcion}
      ${datos}
      <button type="button" class="f-btn f-btn--secundario f-btn--bloque f-btn--hoja" data-cerrar>Cerrar</button>
    </div>
  `);
}

// --------------------------------------------------------------------------
// W-02 · RPE de la sesion
// --------------------------------------------------------------------------

export const RPE_MIN = 1;
export const RPE_MAX = 10;

/**
 * Color del numero. El mockup dice "del color de la zona" y dibuja la pista
 * con tres paradas: verde en t=0, ambar en t=.55 y rojo en t=1.
 *
 * El unico valor trabajado que da el diseño es RPE 8, y lo pinta en AMBAR
 * (#DFA23A). Tomar "la parada mas cercana" dejaba el 8 en rojo por un margen
 * de 0.006, contradiciendo el unico ejemplo que hay. Las fronteras se fijan
 * por tanto en los valores, no en el punto medio entre paradas: 1-3 verde,
 * 4-8 ambar, 9-10 rojo — con el 8 ambar, como el mockup.
 */
export const RPE_VERDE_HASTA = 3;
export const RPE_AMBAR_HASTA = 8;

export function zonaDeRPE(valor: number): 'verde' | 'ambar' | 'roja' {
  if (valor <= RPE_VERDE_HASTA) return 'verde';
  if (valor <= RPE_AMBAR_HASTA) return 'ambar';
  return 'roja';
}

export function posicionDeRPE(valor: number): number {
  return (valor - RPE_MIN) / (RPE_MAX - RPE_MIN);
}

export interface OpcionesRPE {
  inicial: number;
  etiqueta: (valor: number) => string;
}

/** Resuelve con el RPE elegido, o `null` si se omitio o se descarto. */
export function preguntarRPEDeSesion(opciones: OpcionesRPE): Promise<number | null> {
  return new Promise((resolver) => {
    let valor = opciones.inicial;
    let respondido = false;
    const contenido = `
      <div class="f-sheet f-rpe-hoja" role="dialog" aria-modal="true" aria-labelledby="rpeTitulo">
        <div class="f-sheet__handle" aria-hidden="true"></div>
        <div class="f-rpe-hoja__encabezado">
          <span class="f-sheet__titulo" id="rpeTitulo">¿Qué tan dura estuvo?</span>
          <span class="f-rpe-hoja__sub">RPE de la sesión — ajusta la sugerencia de peso de la próxima</span>
        </div>
        <div class="f-rpe-bloque">
          <div class="f-rpe-bloque__fila">
            <span class="f-rpe-bloque__cifra" id="rpeCifra"></span>
            <span class="f-rpe-bloque__etiqueta" id="rpeEtiqueta"></span>
          </div>
          <div class="f-rpe-pista" id="rpePista">
            <input
              class="f-rpe-rango"
              id="rpeRango"
              type="range"
              min="${RPE_MIN}"
              max="${RPE_MAX}"
              step="1"
              value="${valor}"
              aria-labelledby="rpeTitulo"
            />
            <span class="f-rpe-bola" id="rpeBola" aria-hidden="true"></span>
          </div>
          <div class="f-rpe-pista__extremos">
            <span>1 · MUY FÁCIL</span>
            <span>10 · MÁXIMO</span>
          </div>
        </div>
        <button type="button" class="f-btn f-btn--primario f-btn--bloque" id="rpeConfirmar">Confirmar</button>
        <button type="button" class="f-rpe-hoja__omitir" id="rpeOmitir">Omitir</button>
      </div>
    `;
    const velo = abrirHoja(contenido, () => {
      if (!respondido) resolver(null);
    });
    if (!velo) {
      resolver(null);
      return;
    }
    const cifraEl = velo.querySelector<HTMLElement>('#rpeCifra');
    const etiquetaEl = velo.querySelector<HTMLElement>('#rpeEtiqueta');
    const bola = velo.querySelector<HTMLElement>('#rpeBola');
    const rango = velo.querySelector<HTMLInputElement>('#rpeRango');
    const pintar = () => {
      const zona = zonaDeRPE(valor);
      if (cifraEl) {
        cifraEl.textContent = String(valor);
        cifraEl.style.color = `var(--zona-${zona})`;
      }
      if (etiquetaEl) {
        etiquetaEl.textContent = opciones.etiqueta(valor);
        etiquetaEl.style.color = `var(--zona-${zona})`;
      }
      bola?.style.setProperty('--t', String(posicionDeRPE(valor)));
    };
    pintar();
    rango?.addEventListener('input', () => {
      valor = Number(rango.value);
      pintar();
    });
    const terminar = (resultado: number | null) => {
      respondido = true;
      cerrarHojaViva();
      resolver(resultado);
    };
    velo.querySelector('#rpeConfirmar')?.addEventListener('click', () => terminar(valor));
    velo.querySelector('#rpeOmitir')?.addEventListener('click', () => terminar(null));
  });
}

// --------------------------------------------------------------------------
// W-03 · Resumen de XP
// --------------------------------------------------------------------------

const NOMBRE_MUSCULO: Record<GamificationMuscleGroup, string> = {
  pecho: 'Pecho',
  espalda: 'Espalda',
  hombros: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  piernas: 'Piernas',
  gluteos: 'Glúteos',
  core: 'Core',
};

/** Filas del desglose, en el orden en que el motor las produce. */
export function filasDeXP(resumen: SessionXPSummary): Array<{ concepto: string; valor: number }> {
  const filas: Array<{ concepto: string; valor: number }> = [];
  if (resumen.baseXP) filas.push({ concepto: 'Sesión completada', valor: resumen.baseXP });
  if (resumen.volumeXP) filas.push({ concepto: 'Volumen levantado', valor: resumen.volumeXP });
  for (const pr of resumen.prXP) filas.push({ concepto: `PR · ${pr.exercise}`, valor: pr.amount });
  if (resumen.streakXP) filas.push({ concepto: 'Racha', valor: resumen.streakXP });
  for (const logro of resumen.achievementXP) filas.push({ concepto: `Logro · ${logro.name}`, valor: logro.amount });
  for (const subida of resumen.rankUpXP) {
    const nombre = NOMBRE_MUSCULO[subida.muscle as GamificationMuscleGroup] ?? subida.muscle;
    filas.push({ concepto: `Ascenso · ${nombre}`, valor: subida.amount });
  }
  return filas;
}

export interface ContextoResumen {
  /** Segundos que duro la sesion; 0 si no se sabe. */
  duracion: number;
  grupo: string;
  volumen: number;
}

export function renderResumenXP(resumen: SessionXPSummary, ctx: ContextoResumen): string {
  const filas = filasDeXP(resumen)
    .map(
      (f) =>
        `<div class="f-xp__fila"><span class="f-xp__concepto">${escapar(
          f.concepto
        )}</span><span class="f-xp__valor">+${cifra(f.valor)}</span></div>`
    )
    .join('');

  const ascensos = resumen.rankUps
    .map((subida) => {
      const color = colorDeRango(subida.to);
      const musculo = NOMBRE_MUSCULO[subida.muscle] ?? subida.muscle;
      const desde = RANK_DISPLAY_NAMES[subida.from];
      const hasta = RANK_DISPLAY_NAMES[subida.to];
      const ratio = getMuscleRank(subida.muscle).ratio;
      const xp = resumen.rankUpXP.find((r) => r.muscle === subida.muscle)?.amount ?? 0;
      const detalle = [`${desde} → ${hasta}`, `ratio ${ratio.toFixed(2)}x`, xp ? `+${cifra(xp)} XP` : '']
        .filter(Boolean)
        .join(' · ');
      return `
        <div class="f-xp__ascenso" style="--rango:${color}">
          <span class="f-xp__ascenso-cuadro" aria-hidden="true"></span>
          <div class="f-xp__ascenso-textos">
            <span class="f-xp__ascenso-titulo">${escapar(musculo)} subió a <span class="f-xp__ascenso-rango">${escapar(
              hasta
            )}</span></span>
            <span class="f-xp__ascenso-detalle">${escapar(detalle)}</span>
          </div>
        </div>
      `;
    })
    .join('');

  const cabeceraLabel = ctx.duracion > 0
    ? `SESIÓN COMPLETADA · ${reloj(ctx.duracion)}`
    : 'SESIÓN COMPLETADA';
  // "Piernas + Glúteos", no "GRUPO 1 - Piernas + Glúteos": el prefijo ya se
  // dijo en la cabecera de la sesion. [REF Pantallas:305]
  const sub = [partirNombreDeGrupo(ctx.grupo).titulo, ctx.volumen > 0 ? `${cifra(ctx.volumen)} kg` : '']
    .filter(Boolean)
    .join(' · ');

  return `
    <div class="f-xp f-root">
      <div class="f-xp__cabecera">
        <span class="f-xp__label">${escapar(cabeceraLabel)}</span>
        <span class="f-xp__cifra">+${cifra(resumen.totalXP)} XP</span>
        ${sub ? `<span class="f-xp__sub">${escapar(sub)}</span>` : ''}
      </div>
      ${filas ? `<div class="f-xp__desglose">${filas}</div>` : ''}
      ${ascensos}
      <div class="f-xp__nivel">
        <div class="f-xp__nivel-fila">
          <span>Nivel ${resumen.newLevel} · ${escapar(resumen.titleInfo.full)}</span>
          <span class="f-xp__nivel-xp">${cifra(resumen.levelProgress.current)} / ${cifra(
            resumen.levelProgress.max
          )} XP</span>
        </div>
        <div class="f-xp__pista"><div class="f-xp__relleno" style="width:${Math.max(
          0,
          Math.min(100, resumen.levelProgress.percentage)
        )}%"></div></div>
      </div>
      <button type="button" class="f-btn f-btn--primario f-btn--bloque" id="xpContinuar">Continuar</button>
    </div>
  `;
}

/** Pinta W-03 a pantalla completa y resuelve cuando el usuario continua. */
export function mostrarResumenXP(resumen: SessionXPSummary, ctx: ContextoResumen): Promise<void> {
  return new Promise((resolver) => {
    document.getElementById('fierroResumenXP')?.remove();
    const capa = document.createElement('div');
    capa.id = 'fierroResumenXP';
    capa.className = 'f-capa-xp';
    capa.innerHTML = renderResumenXP(resumen, ctx);
    document.body.appendChild(capa);
    const continuar = () => {
      capa.remove();
      resolver();
    };
    capa.querySelector('#xpContinuar')?.addEventListener('click', continuar);
    capa.querySelector<HTMLElement>('#xpContinuar')?.focus();
  });
}
