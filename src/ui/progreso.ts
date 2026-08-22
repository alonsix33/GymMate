/**
 * FIERRO · Gamificación — GM-01, GM-02, GM-03.
 *
 *   GM-01  Progreso: nivel, mapa dual, rangos y resumen de logros.
 *   GM-02  Escalera de rangos: subniveles y rangos especiales.
 *   GM-03  Logros: los 25, con progreso real.
 *
 * Vive en Carbón (lo que pasa HOY) y se abre desde PROGRESO en la tab bar.
 * Los polígonos del mapa se reutilizan TAL CUAL de muscle-map.ts, como pide el
 * README; lo único que cambia es que el fill de cada grupo es el color de su
 * rango.
 */
import {
  getAchievements,
  getCurrentLevelProgress,
  getMuscleRanks,
  getPlayerStats,
  getStreakInfo,
} from '@/features/gamification';
import { STREAK_MILESTONES, STREAK_XP } from '@/features/gamification/constants';
import { renderMapaFierro, colorDeRango } from '@/ui/gamification/muscle-map';
import type { Achievement, GamificationMuscleGroup, MuscleRanks, StrengthRank } from '@/types/gamification';
import { getProfile } from '@/utils/storage';
import { cifra } from '@/utils/formato';
import { nombreDeRango, pesoParaElSiguiente, siguienteEscalon, franjaDe } from '@/utils/rangos';

function escapar(texto: string): string {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

type Vista = 'progreso' | 'rangos' | 'logros';
let vistaActual: Vista = 'progreso';
let musculoElegido: GamificationMuscleGroup = 'piernas';
let filtroLogros: 'todos' | 'sesiones' | 'volumen' | 'rachas' = 'todos';

const GRUPOS: Array<{ id: GamificationMuscleGroup; nombre: string }> = [
  { id: 'piernas', nombre: 'Piernas' },
  { id: 'gluteos', nombre: 'Glúteos' },
  { id: 'espalda', nombre: 'Espalda' },
  { id: 'pecho', nombre: 'Pecho' },
  { id: 'triceps', nombre: 'Tríceps' },
  { id: 'hombros', nombre: 'Hombros' },
  { id: 'biceps', nombre: 'Bíceps' },
  { id: 'core', nombre: 'Core' },
];

/** Los nueve rangos de la escalera, de arriba abajo. [REF rangoLadder] */
const ESCALERA: Array<{ rango: StrengthRank; nombre: string }> = [
  { rango: 'Simetrico', nombre: 'Simétrico' },
  { rango: 'Campeon', nombre: 'Campeón' },
  { rango: 'Diamante', nombre: 'Diamante' },
  { rango: 'Esmeralda', nombre: 'Esmeralda' },
  { rango: 'Platino', nombre: 'Platino' },
  { rango: 'Oro', nombre: 'Oro' },
  { rango: 'Plata', nombre: 'Plata' },
  { rango: 'Bronce', nombre: 'Bronce' },
  { rango: 'Hierro', nombre: 'Hierro' },
];

/** Los dos rangos especiales, literales del mockup (`especiales`). */
const ESPECIALES = [
  {
    nombre: 'FORJADO',
    detalle:
      'Mantén un músculo 12 semanas seguidas sin huecos de más de 7 días — se pierde si aparece un hueco',
    xp: '+500 XP',
    token: 'var(--accent)',
  },
  {
    nombre: 'SIMÉTRICO TOTAL',
    detalle: 'Los 8 grupos musculares en Simétrico (2.0x+) — el final del juego',
    xp: '+25,000 XP',
    token: 'var(--rango-simetrico)',
  },
];

function franjaTexto(rango: StrengthRank): string {
  const f = franjaDe(rango);
  if (!f) return '';
  if (!Number.isFinite(f.max)) return `${f.min.toFixed(1)}x+`;
  return `${f.min}–${f.max}`;
}

function ordenados(ranks: MuscleRanks): Array<{ id: GamificationMuscleGroup; nombre: string; rango: StrengthRank; ratio: number }> {
  return GRUPOS.map((g) => ({
    ...g,
    rango: ranks[g.id]?.rank ?? 'Hierro',
    ratio: ranks[g.id]?.ratio ?? 0,
  })).sort((a, b) => b.ratio - a.ratio);
}

// ==========================================
// GM-01 · PROGRESO
// ==========================================

function vistaProgreso(): string {
  const stats = getPlayerStats();
  const nivel = getCurrentLevelProgress();
  const ranks = getMuscleRanks();
  const logros = getAchievements();
  const conseguidos = logros.filter((l) => l.unlockedAt);
  const racha = getStreakInfo();

  const pct = nivel.maxXP > 0 ? Math.min(100, (nivel.currentXP / nivel.maxXP) * 100) : 100;
  const faltan = Math.max(0, nivel.maxXP - nivel.currentXP);
  const nivelesHasta100 = Math.max(0, 100 - nivel.level);

  // Los tres logros mas cercanos que aun no estan: lo proximo a caer.
  const proximos = logros
    .filter((l) => !l.unlockedAt)
    .map((l) => ({ l, t: (l.progress ?? 0) / (l.target ?? 1) }))
    .sort((a, b) => b.t - a.t)
    .slice(0, 3);

  const siguienteHito = STREAK_MILESTONES.find((m) => m > racha.current) ?? null;

  return `
    <div class="f-prog__cabecera">
      <span class="f-prog__titulo">PROGRESO</span>
      <button type="button" class="f-prog__cerrar" data-prog="cerrar" aria-label="Cerrar">✕</button>
    </div>

    <section class="f-prog__nivel">
      <div class="f-prog__nivel-fila">
        <span class="f-prog__nivel-cifra">NIVEL ${nivel.level}</span>
        <span class="f-prog__nivel-meta">${escapar(stats.titleInfo.full)} · ${cifra(
          nivel.currentXP
        )} / ${cifra(nivel.maxXP)} XP</span>
      </div>
      <div class="f-prog__pista"><div class="f-prog__relleno" style="width:${pct.toFixed(1)}%"></div></div>
      <span class="f-prog__nivel-pie">${
        nivelesHasta100 === 0
          ? 'Nivel máximo: has llegado a Simétrico.'
          : `${cifra(faltan)} XP para el siguiente nivel · ${nivelesHasta100} ${
              nivelesHasta100 === 1 ? 'nivel' : 'niveles'
            } hasta Simétrico`
      }</span>
    </section>

    <section class="f-prog__mapa">
      <span class="f-prog__label">MAPA MUSCULAR · FRENTE / ESPALDA</span>
      <div class="f-prog__cuerpos">
        ${renderMapaFierro(ranks, { ancho: 86, alto: 172 })}
        ${renderMapaFierro(ranks, { ancho: 86, alto: 172 })}
      </div>
      <div class="f-prog__rangos">
        ${ordenados(ranks)
          .map(
            (g) => `
          <button type="button" class="f-prog__rango" data-prog="rango" data-musculo="${g.id}">
            <span class="f-prog__rango-musculo">${escapar(g.nombre)}</span>
            <span class="f-prog__rango-dato">
              <span class="f-prog__punto" style="background:${colorDeRango(g.rango)}"></span>
              <span class="f-prog__rango-nombre" style="color:${colorDeRango(g.rango)}">${escapar(
                nombreDeRango(g.rango, g.ratio)
              )}</span>
              <span class="f-prog__rango-ratio">${g.ratio.toFixed(2)}x</span>
            </span>
          </button>`
          )
          .join('')}
      </div>
    </section>

    <section class="f-prog__logros">
      <button type="button" class="f-prog__label f-prog__label--accion" data-prog="logros">
        LOGROS · ${conseguidos.length} DE ${logros.length} ›
      </button>
      ${
        proximos.length === 0
          ? '<span class="f-prog__vacio">Los 25 logros están conseguidos. No queda nada por desbloquear.</span>'
          : proximos
              .map(
                ({ l }) => `
        <div class="f-logro-fila">
          <span class="f-logro-fila__punto"></span>
          <span class="f-logro-fila__textos">
            <span class="f-logro-fila__nombre">${escapar(l.name)}</span>
            <span class="f-logro-fila__detalle">${escapar(progresoDe(l))}</span>
          </span>
          <span class="f-logro-fila__xp">+${cifra(l.xpReward)} XP</span>
        </div>`
              )
              .join('')
      }
    </section>

    ${
      siguienteHito === null
        ? ''
        : `
    <div class="f-prog__hito">
      <span class="f-prog__hito-textos">
        <span class="f-prog__hito-titulo">Próximo milestone de racha</span>
        <span class="f-prog__hito-detalle">${siguienteHito} días · +${cifra(
          STREAK_XP[siguienteHito as keyof typeof STREAK_XP] ?? 0
        )} XP — ${
          siguienteHito - racha.current === 1
            ? 'te falta 1 día'
            : `te faltan ${siguienteHito - racha.current} días`
        }</span>
      </span>
      <span class="f-prog__hito-cifra">${racha.current}</span>
    </div>`
    }
  `;
}

/** "74,300 / 100,000 kg" o "3 / 7". Sin objetivo no se inventa una fraccion. */
function progresoDe(l: Achievement): string {
  if (l.target === undefined) return l.description;
  return `${cifra(l.progress ?? 0)} / ${cifra(l.target)}`;
}

// ==========================================
// GM-02 · ESCALERA DE RANGOS
// ==========================================

function vistaRangos(): string {
  const ranks = getMuscleRanks();
  const perfil = getProfile();
  const actual = ranks[musculoElegido];
  const rango = actual?.rank ?? 'Hierro';
  const ratio = actual?.ratio ?? 0;
  const nombreMusculo = GRUPOS.find((g) => g.id === musculoElegido)?.nombre ?? 'Piernas';
  const escalon = siguienteEscalon(rango, ratio);
  const objetivo = escalon ? pesoParaElSiguiente(escalon.ratioObjetivo, perfil.weight ?? 0) : null;

  return `
    <div class="f-prog__cabecera">
      <span class="f-prog__titulo">RANGOS</span>
      <button type="button" class="f-prog__cerrar" data-prog="volver" aria-label="Volver a progreso">←</button>
    </div>
    <span class="f-prog__sub">1RM estimado ÷ peso corporal · ajustado por ejercicio</span>

    <button type="button" class="f-selector-fila" data-prog="elegir-musculo">
      <span class="f-selector-fila__nombre">${escapar(nombreMusculo.toUpperCase())}</span>
      <span class="f-selector-fila__detalle">▾</span>
    </button>

    <div class="f-escalera">
      ${ESCALERA.map((e) => {
        const aqui = e.rango === rango;
        const sub = e.rango === 'Simetrico' ? 'ÚNICO' : 'I·II·III';
        return `
        <div class="f-escalon${aqui ? ' f-escalon--tuyo' : ''}">
          <span class="f-escalon__punto" style="background:${colorDeRango(e.rango)}"></span>
          <span class="f-escalon__nombre" style="color:${colorDeRango(e.rango)}">${escapar(e.nombre)}</span>
          <span class="f-escalon__sub">${sub}</span>
          <span class="f-escalon__franja">${escapar(franjaTexto(e.rango))}</span>
          ${
            aqui
              ? `<span class="f-escalon__tuyo">TÚ · ${escapar(
                  nombreDeRango(rango, ratio).split(' ')[1] ?? '—'
                )}</span>`
              : ''
          }
        </div>`;
      }).join('')}
    </div>

    <div class="f-prog__consejo">
      <span class="f-prog__consejo-titulo">${escapar(nombreMusculo)} · ${escapar(
        nombreDeRango(rango, ratio)
      )} · ${ratio.toFixed(2)}x</span>
      <span class="f-prog__consejo-cuerpo">${
        escalon === null
          ? 'Es el rango más alto: no hay escalón por encima.'
          : ratio <= 0
            ? 'Todavía no hay 1RM en este grupo. Registra una serie con peso y la escalera empieza a contar.'
            : objetivo === null
              ? `A ${escalon.falta.toFixed(2)}x de ${escapar(
                  escalon.nombre
                )}. Pon tu peso corporal en el perfil y te digo con cuántos kg asciendes.`
              : `A ${escalon.falta.toFixed(2)}x de ${escapar(
                  escalon.nombre
                )} — sube tu 1RM a ${cifra(objetivo)} kg y asciendes.`
      }</span>
    </div>

    <div class="f-especiales">
      <span class="f-prog__label">RANGOS ESPECIALES · NO SE COMPRAN CON FUERZA</span>
      ${ESPECIALES.map(
        (e) => `
        <div class="f-especial">
          <span class="f-especial__nombre" style="color:${e.token}">${escapar(e.nombre)}</span>
          <span class="f-especial__detalle">${escapar(e.detalle)}</span>
          <span class="f-especial__xp">${escapar(e.xp)}</span>
        </div>`
      ).join('')}
    </div>
  `;
}

// ==========================================
// GM-03 · LOGROS
// ==========================================

const FILTROS = [
  { id: 'todos', etiqueta: 'TODOS' },
  { id: 'sesiones', etiqueta: 'SESIONES' },
  { id: 'volumen', etiqueta: 'VOLUMEN' },
  { id: 'rachas', etiqueta: 'RACHAS' },
] as const;

function vistaLogros(): string {
  const todos = getAchievements();
  const filtrados = filtroLogros === 'todos' ? todos : todos.filter((l) => l.category === filtroLogros);
  const conseguidos = todos.filter((l) => l.unlockedAt);
  const xpGanado = conseguidos.reduce((t, l) => t + l.xpReward, 0);
  const pct = todos.length > 0 ? Math.round((conseguidos.length / todos.length) * 100) : 0;

  const enProgreso = filtrados
    .filter((l) => !l.unlockedAt && (l.progress ?? 0) > 0)
    .sort((a, b) => (b.progress ?? 0) / (b.target ?? 1) - (a.progress ?? 0) / (a.target ?? 1));
  const hechos = filtrados.filter((l) => l.unlockedAt);
  const bloqueados = filtrados.filter((l) => !l.unlockedAt && (l.progress ?? 0) === 0);

  const barra = todos
    .map(
      (l) => `<span class="f-logro-seg${l.unlockedAt ? ' f-logro-seg--hecho' : ''}"></span>`
    )
    .join('');

  return `
    <div class="f-prog__cabecera">
      <button type="button" class="f-prog__cerrar" data-prog="volver" aria-label="Volver a progreso">←</button>
      <span class="f-prog__titulo f-prog__titulo--con-volver">LOGROS</span>
    </div>
    <div class="f-prog__fila-meta">
      <span class="f-prog__sub">${conseguidos.length} de ${todos.length} · ${cifra(
        xpGanado
      )} XP ganados por logros</span>
      <span class="f-prog__pct">${pct}%</span>
    </div>
    <div class="f-logro-barra" aria-hidden="true">${barra}</div>

    <div class="f-filtros" role="group" aria-label="Filtrar logros">
      ${FILTROS.map(
        (f) => `
        <button type="button" class="f-filtro${
          f.id === filtroLogros ? ' f-filtro--activo' : ''
        }" data-prog="filtro" data-filtro="${f.id}">${f.etiqueta}</button>`
      ).join('')}
    </div>

    ${bloque('EN PROGRESO — LO PRÓXIMO A CAER', enProgreso, 'progreso')}
    ${bloque('CONSEGUIDOS', hechos, 'hecho')}
    ${bloque('BLOQUEADOS — CÓMO SE ABREN, SIEMPRE VISIBLE', bloqueados, 'bloqueado')}
    ${
      filtrados.length === 0
        ? '<span class="f-prog__vacio">Ningún logro de esta categoría todavía.</span>'
        : ''
    }
  `;
}

function bloque(titulo: string, logros: Achievement[], tipo: 'progreso' | 'hecho' | 'bloqueado'): string {
  if (logros.length === 0) return '';
  return `
    <section class="f-logro-bloque">
      <span class="f-prog__label">${escapar(titulo)}</span>
      ${logros.map((l) => tarjetaDeLogro(l, tipo)).join('')}
    </section>
  `;
}

function tarjetaDeLogro(l: Achievement, tipo: 'progreso' | 'hecho' | 'bloqueado'): string {
  if (tipo === 'hecho') {
    const f = l.unlockedAt
      ? new Date(l.unlockedAt)
          .toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
          .replace('.', '')
          .toUpperCase()
      : '';
    return `
      <div class="f-logro f-logro--hecho">
        <span class="f-logro__check">✓</span>
        <span class="f-logro__nombre">${escapar(l.name)}</span>
        <span class="f-logro__fecha">${escapar(f)}</span>
      </div>`;
  }
  if (tipo === 'bloqueado') {
    return `
      <div class="f-logro f-logro--bloqueado">
        <span class="f-logro__textos">
          <span class="f-logro__nombre">${escapar(l.name)}</span>
          <span class="f-logro__detalle">${escapar(l.description)}</span>
        </span>
        <span class="f-logro__xp">+${cifra(l.xpReward)}</span>
      </div>`;
  }
  const t = l.target ? Math.min(100, ((l.progress ?? 0) / l.target) * 100) : 0;
  return `
    <div class="f-logro f-logro--progreso">
      <div class="f-logro__fila">
        <span class="f-logro__nombre">${escapar(l.name)}</span>
        <span class="f-logro__xp f-logro__xp--acento">+${cifra(l.xpReward)} XP</span>
      </div>
      <div class="f-logro__pista"><div class="f-logro__relleno" style="width:${t.toFixed(1)}%"></div></div>
      <div class="f-logro__fila">
        <span class="f-logro__detalle">${escapar(progresoDe(l))}</span>
        <span class="f-logro__detalle">${escapar(l.description)}</span>
      </div>
    </div>`;
}

// ==========================================
// MONTAJE Y DELEGACIÓN
// ==========================================

const ID_OVERLAY = 'fierroProgreso';

function contenedor(): HTMLElement {
  let el = document.getElementById(ID_OVERLAY);
  if (!el) {
    el = document.createElement('div');
    el.id = ID_OVERLAY;
    el.className = 'f-prog f-root hidden';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Progreso');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const objetivo = (e.target as HTMLElement)?.closest<HTMLElement>('[data-prog]');
      if (objetivo) alTocarProgreso(objetivo);
    });
  }
  return el;
}

export function renderProgreso(): void {
  const el = contenedor();
  el.innerHTML =
    vistaActual === 'progreso' ? vistaProgreso() : vistaActual === 'rangos' ? vistaRangos() : vistaLogros();
  el.scrollTop = 0;
}

export function abrirProgreso(): void {
  vistaActual = 'progreso';
  const el = contenedor();
  el.classList.remove('hidden');
  renderProgreso();
  marcarPestana(true);
}

export function cerrarProgreso(): void {
  const el = document.getElementById(ID_OVERLAY);
  if (!el || el.classList.contains('hidden')) return;
  el.classList.add('hidden');
  marcarPestana(false);
}

/** PROGRESO no es un tab_content: es una superposicion, asi que la marca de la
 *  tab bar se pone y se quita a mano. */
let pestanaPrevia: string | null = null;
function marcarPestana(activa: boolean): void {
  const items = [...document.querySelectorAll<HTMLElement>('[data-nav]')];
  // El atributo del HTML es `progress`, no `progreso`: buscar el castellano
  // devolvia undefined y la barra se quedaba marcando la pestaña anterior.
  const progreso = items.find((i) => i.dataset.nav === 'progress');
  if (!progreso) return;
  if (activa) {
    pestanaPrevia = items.find((i) => i.getAttribute('aria-current') === 'page')?.dataset.nav ?? 'home';
    items.forEach((i) => i.removeAttribute('aria-current'));
    progreso.setAttribute('aria-current', 'page');
    return;
  }
  if (progreso.getAttribute('aria-current') !== 'page') return;
  const destino = items.find((i) => i.dataset.nav === (pestanaPrevia ?? 'home')) ?? items[0];
  items.forEach((i) => i.removeAttribute('aria-current'));
  destino?.setAttribute('aria-current', 'page');
  pestanaPrevia = null;
}

function alTocarProgreso(el: HTMLElement): void {
  switch (el.dataset.prog) {
    case 'cerrar':
      cerrarProgreso();
      break;
    case 'volver':
      vistaActual = 'progreso';
      renderProgreso();
      break;
    case 'logros':
      vistaActual = 'logros';
      renderProgreso();
      break;
    case 'rango':
      musculoElegido = (el.dataset.musculo as GamificationMuscleGroup) ?? 'piernas';
      vistaActual = 'rangos';
      renderProgreso();
      break;
    case 'filtro':
      filtroLogros = (el.dataset.filtro as typeof filtroLogros) ?? 'todos';
      renderProgreso();
      break;
    case 'elegir-musculo':
      void import('@/ui/session-screens').then(({ abrirHoja }) => {
        const velo = abrirHoja(`
          <div class="f-sheet f-sheet--lista" role="dialog" aria-modal="true" aria-label="Elegir músculo">
            <div class="f-sheet__handle" aria-hidden="true"></div>
            <span class="f-sheet__titulo">Elige un músculo</span>
            <div class="f-sheet__opciones">
              ${GRUPOS.map(
                (g) =>
                  `<button type="button" class="f-sheet__opcion" data-musculo="${g.id}">${escapar(
                    g.nombre
                  )}</button>`
              ).join('')}
            </div>
            <button type="button" class="f-btn f-btn--secundario f-btn--hoja" data-cerrar>Cerrar</button>
          </div>
        `);
        velo?.querySelectorAll<HTMLElement>('[data-musculo]').forEach((b) =>
          b.addEventListener('click', () => {
            musculoElegido = (b.dataset.musculo as GamificationMuscleGroup) ?? 'piernas';
            velo.querySelector<HTMLElement>('[data-cerrar]')?.click();
            velo.remove();
            renderProgreso();
          })
        );
      });
      break;
  }
}
