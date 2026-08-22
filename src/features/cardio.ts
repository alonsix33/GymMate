/**
 * FIERRO · Cardio & HIIT — C-01…C-08.
 *
 *   C-01  Selector de modo (seis; "For Time" se retiro).
 *   C-02  Configuracion de intervalos.
 *   C-03  Timer de anillo con marcas de ronda.
 *   C-04  Resumen con XP real.
 *   C-05  Piramide: la montaña ES el configurador.
 *   C-06  Piramide en curso: el timer ES la montaña.
 *   C-07  Circuito: la lista ES el recorrido.
 *   C-08  EMOM / AMRAP: un patron, dos modos.
 *
 * El motor del temporizador (fases, beeps, vibracion, guardado) se conserva;
 * lo que cambia es todo lo que se ve. La aritmetica vive en
 * src/utils/cardio-calc.ts, que se prueba sola.
 */
import { confirmarDestructivo } from '@/ui/feedback';
import { abrirHoja } from '@/ui/session-screens';
import type { CardioMode, CardioConfig, CardioSessionStats } from '@/types';
import { cardioState, resetCardioState } from '@/state/session';
import { getCardioExerciseNames } from '@/data/cardio-exercises';
import { addToHistory, getHistory } from '@/utils/storage';
import { processCompletedCardioSession } from '@/features/gamification';
import { cifra } from '@/utils/formato';
import {
  PRESETS_PIRAMIDE,
  PIRAMIDE_MEDIA,
  DESCANSO_PIRAMIDE,
  PASO_FACTOR,
  acotarFactor,
  alturaDeNivel,
  dasharrayDelAnillo,
  duracionTotal,
  escalarDesde,
  estadoDeNivel,
  formatearTiempo,
  llevaHoras,
  offsetDelAnillo,
  ritmoEmom,
  tramoDeNivel,
} from '@/utils/cardio-calc';

// ==========================================
// ESTADO
// ==========================================

let timerInterval: ReturnType<typeof setInterval> | null = null;
/** La cuenta atras "3, 2, 1" tenia su propio intervalo y nadie lo cancelaba:
 *  salir de la pantalla durante el conteo arrancaba igual la sesion, la corria
 *  entera en segundo plano y la guardaba. */
let cuentaAtrasInterval: ReturnType<typeof setInterval> | null = null;
let audioContext: AudioContext | null = null;
let amrapRounds = 0;
let presetActivo = 'media';
let ultimoXP: number | null = null;
/** Piramide base del preset activo. El escalado se aplica SIEMPRE sobre esta,
 *  con un factor acumulado, para que ↓ seguido de ↑ vuelva al punto de partida. */
let piramideBase: number[] = [...PIRAMIDE_MEDIA];
let factorPiramide = 1;
/** Guarda de reentrada: `stopCardioWorkout` espera una hoja de confirmacion, y
 *  si el temporizador terminaba solo mientras tanto el cierre corria dos veces
 *  — la segunda ya sin `mode`, guardando "Cardio - undefined" y cobrando XP. */
let cerrando = false;
/** Instante real de arranque y pausa acumulada: el reloj se rederiva de aqui,
 *  no de contar ticks. Un `setInterval` que no puede dispararse (pestaña en
 *  segundo plano, hilo bloqueado) fusiona callbacks y pierde tiempo real. */
let inicioReal = 0;
let pausadoDesde = 0;
let pausaAcumulada = 0;
/** Segundos ya consumidos por las fases cerradas, y duracion de la fase en
 *  curso. El restante se calcula contra el reloj de pared, no descontando de
 *  uno en uno. */
let baseDeFase = 0;
let duracionFase = 0;

type FaseCardio = typeof cardioState.currentPhase;

const RADIO_ANILLO = 104; // [REF Pantallas:399]

const DEFAULT_CONFIGS: Record<CardioMode, CardioConfig> = {
  tabata: { rounds: 8, work: 20, rest: 10 },
  emom: { rounds: 10, interval: 60, reps: 10 },
  amrap: { duration: 720, exercises: [] },
  circuit: { rounds: 3, work: 40, rest: 20, roundRest: 60, exercises: [] },
  pyramid: { levels: [...PIRAMIDE_MEDIA], rest: DESCANSO_PIRAMIDE },
  custom: { rounds: 5, work: 30, rest: 15 },
};

/**
 * Los seis modos de C-01, LITERALES del mockup (`cardioModes` en su
 * `<script data-dc-script>`).
 *
 * Los tags son de una sola letra. Los de dos que habia aqui eran invencion
 * mia, y `PR` ademas chocaba con PR = record personal, que la app usa en PR-01
 * y en los badges de HI-02.
 */
const MODOS: Array<{ id: CardioMode; tag: string; nombre: string; desc: string }> = [
  { id: 'tabata', tag: 'T', nombre: 'Tabata', desc: '20s trabajo / 10s descanso × 8 rondas' },
  { id: 'emom', tag: 'E', nombre: 'EMOM', desc: 'Every Minute On the Minute' },
  { id: 'amrap', tag: 'A', nombre: 'AMRAP', desc: 'As Many Reps As Possible' },
  {
    id: 'circuit',
    tag: 'C',
    nombre: 'Circuito',
    desc: 'Ejercicios en secuencia, con lista propia y descanso entre rondas',
  },
  { id: 'pyramid', tag: 'P', nombre: 'Pirámide', desc: 'Intervalos ascendentes y descendentes · 6 presets' },
  { id: 'custom', tag: 'X', nombre: 'Personalizado', desc: 'Configura tu propio intervalo' },
];

const NOMBRE_MODO: Record<CardioMode, string> = {
  tabata: 'TABATA',
  emom: 'EMOM',
  amrap: 'AMRAP',
  circuit: 'CIRCUITO',
  pyramid: 'PIRÁMIDE',
  custom: 'PERSONALIZADO',
};

/**
 * Subtitulo de la pantalla de configuracion.
 *
 * Se DERIVA de la config donde el mockup escribe cifras: era una cadena fija
 * que seguia diciendo "× 8 rondas" con 12 puestas en el stepper de al lado.
 * Con los valores por defecto sale exactamente el texto del mockup.
 */
function subDeModo(mode: CardioMode, config: CardioConfig): string {
  switch (mode) {
    case 'tabata':
    case 'custom':
      return `${config.work ?? 20}s trabajo / ${config.rest ?? 10}s descanso × ${
        config.rounds ?? 8
      } rondas`;
    case 'emom':
      return 'cada minuto, al minuto — lo que sobra es tu descanso';
    case 'amrap':
      return 'tantas rondas como puedas en el tiempo límite';
    case 'circuit':
      return 'ejercicios en secuencia · descanso entre rondas';
    case 'pyramid':
      return 'intervalos ascendentes y descendentes';
  }
}

function escapar(texto: string): string {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

function vista(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function hideAllCardioViews(): void {
  ['cardioSelectorView', 'cardioConfigView', 'cardioTimerView', 'cardioSummaryView'].forEach((id) => {
    vista(id)?.classList.add('hidden');
  });
}

/** Un solo listener por vista, que sobrevive a los repintados. */
function enganchar(el: HTMLElement, manejador: (accion: HTMLElement) => void): void {
  if (el.dataset.enganchado === 'si') return;
  el.addEventListener('click', (e) => {
    const objetivo = (e.target as HTMLElement)?.closest<HTMLElement>('[data-cardio]');
    if (objetivo) manejador(objetivo);
  });
  el.dataset.enganchado = 'si';
}

// ==========================================
// C-01 · SELECTOR
// ==========================================

export function showCardioSelector(): void {
  vista('homeView')?.classList.add('hidden');
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.add('hidden');
    tab.classList.remove('active');
  });
  hideAllCardioViews();

  const v = vista('cardioSelectorView');
  if (!v) return;
  v.classList.remove('hidden');
  v.innerHTML = `
    <div class="f-cardio f-root">
      <div class="f-cardio__cabecera">
        <button type="button" class="f-sesion__volver" data-cardio="inicio" aria-label="Volver al inicio">←</button>
        <span class="f-cardio__titulo">CARDIO &amp; HIIT</span>
      </div>
      <span class="f-cardio__intro">Elige un modo — la sesión se guarda sola al terminar.</span>
      <div class="f-cardio__modos">
        ${MODOS.map(
          (m) => `
          <button type="button" class="f-modo" data-cardio="modo" data-modo="${m.id}">
            <span class="f-modo__tag">${m.tag}</span>
            <span class="f-modo__textos">
              <span class="f-modo__nombre">${escapar(m.nombre)}</span>
              <span class="f-modo__desc">${escapar(m.desc)}</span>
            </span>
            <span class="f-modo__chevron" aria-hidden="true">›</span>
          </button>`
        ).join('')}
      </div>
    </div>
  `;
  enganchar(v, alTocarCardio);
}

export function selectCardioMode(mode: CardioMode): void {
  cardioState.mode = mode;
  // Copia PROFUNDA: con el spread superficial, `exercises` y `levels` eran el
  // mismo array que el default del modulo, asi que agregar una estacion lo
  // mutaba para siempre y volver a entrar al circuito conservaba las de antes.
  cardioState.config = clonarConfig(DEFAULT_CONFIGS[mode]);
  if (mode === 'pyramid') {
    presetActivo = 'media';
    piramideBase = [...PIRAMIDE_MEDIA];
    factorPiramide = 1;
  }
  showCardioConfig();
}

function clonarConfig(config: CardioConfig): CardioConfig {
  return {
    ...config,
    ...(config.levels ? { levels: [...config.levels] } : {}),
    ...(config.exercises ? { exercises: config.exercises.map((e) => ({ ...e })) } : {}),
  };
}

// ==========================================
// C-02, C-05, C-07, C-08 · CONFIGURACIÓN
// ==========================================

function stepper(clave: keyof CardioConfig, paso: number, valor: number, unidad = '', compacto = false): string {
  // El paso de `duration` viaja en minutos y el manejador lo pasa a segundos:
  // el minimo hay que compararlo en la misma unidad que el valor mostrado.
  const enSegundos = clave === 'duration';
  const pasoReal = enSegundos ? paso * 60 : paso;
  const valorReal = enSegundos ? valor * 60 : valor;
  const tope = enElMinimo(clave, valorReal, pasoReal);
  return `
    <div class="f-stepper ${compacto ? 'f-stepper--compacto' : 'f-stepper--cardio'}">
      <button type="button" class="f-stepper__btn" data-cardio="menos" data-clave="${clave}" data-paso="${paso}"${
        tope ? ' disabled' : ''
      } aria-label="Bajar">−</button>
      <div class="f-stepper__valor" role="status">${valor}${
        unidad ? `<span class="f-stepper__unidad">${unidad}</span>` : ''
      }</div>
      <button type="button" class="f-stepper__btn" data-cardio="mas" data-clave="${clave}" data-paso="${paso}" aria-label="Subir">+</button>
    </div>
  `;
}

function campo(label: string, contenido: string, corto = false): string {
  return `
    <div class="f-campo">
      <span class="f-campo__label${corto ? ' f-campo__label--corto' : ''}">${escapar(label)}</span>
      ${contenido}
    </div>
  `;
}

/** "12:00 min" pero "1:12:00" a secas: `min` detras de un h:mm:ss no es una
 *  duracion en minutos. */
function conUnidad(segundos: number, prefijo = ''): string {
  return `${prefijo}${formatearTiempo(segundos)}${llevaHoras(segundos) ? '' : ' min'}`;
}

function pieDeTotal(etiqueta: string, valor: string, corto = false): string {
  return `
    <div class="f-cardio__total${corto ? ' f-cardio__total--corto' : ''}">
      <span class="f-cardio__total-label">${escapar(etiqueta)}</span>
      <span class="f-cardio__total-cifra">${escapar(valor)}</span>
    </div>
  `;
}

function botonComenzar(texto = 'Comenzar · 3, 2, 1'): string {
  return `<button type="button" class="f-btn f-btn--primario f-btn--bloque" data-cardio="comenzar">${escapar(
    texto
  )}</button>`;
}

function configTabata(config: CardioConfig): string {
  return [
    campo('RONDAS', stepper('rounds', 1, config.rounds ?? 8)),
    campo('TRABAJO (S)', stepper('work', 5, config.work ?? 20)),
    campo('DESCANSO (S)', stepper('rest', 5, config.rest ?? 10)),
  ].join('');
}

function configCustom(config: CardioConfig): string {
  return configTabata(config);
}

function configAmrap(config: CardioConfig): string {
  // Paso 1: el manejador ya multiplica por 60 para pasar a segundos. Con
  // `paso: 60` se multiplicaba dos veces y un solo tap sumaba una hora.
  return campo('DURACIÓN (MIN)', stepper('duration', 1, Math.round((config.duration ?? 720) / 60)));
}

function configEmom(config: CardioConfig): string {
  const trabajo = ritmoEmom(getHistory());
  // Sin acotar a 90: el clamp enmascaraba el defecto (etiqueta "~60S" con la
  // barra al 90%) en vez de arreglarlo. `ritmoEmom` ya solo devuelve un ritmo
  // que deja sitio para respirar.
  const pct = trabajo ? Math.round((trabajo / 60) * 100) : null;
  const barra =
    pct === null
      ? `<span class="f-emom__nota">Todavía no hay un ritmo medido con el que estimar tu minuto. Cuando la app registre cuánto tardas dentro de cada intervalo, aquí verás lo que te sobra para respirar.</span>`
      : `
        <div class="f-emom__barra">
          <div class="f-emom__trabajo" style="width:${pct}%">
            <span class="f-emom__trabajo-label">TRABAJO ~${trabajo}S</span>
          </div>
          <div class="f-emom__respira"><span class="f-emom__respira-label">RESPIRA</span></div>
        </div>
        <span class="f-emom__nota">Estimado con tu ritmo de la última sesión EMOM. Termina antes, descansa más — el minuto no negocia.</span>
      `;

  return `
    ${campo('MINUTOS TOTALES', stepper('rounds', 1, config.rounds ?? 10))}
    <section class="f-emom">
      <span class="f-campo__label f-campo__label--corto">TU MINUTO, VISUALIZADO</span>
      ${barra}
    </section>
    <div class="f-amrap">
      <div class="f-amrap__cabecera">
        <span class="f-amrap__titulo">AMRAP</span>
        <span class="f-amrap__sub">mismo patrón, un solo bloque</span>
      </div>
      <div class="f-amrap__campos">
        <div class="f-amrap__campo">
          <span class="f-amrap__campo-label">Duración</span>
          <span class="f-amrap__campo-valor">${formatearTiempo(DEFAULT_CONFIGS.amrap.duration ?? 720)}</span>
        </div>
        <div class="f-amrap__campo">
          <span class="f-amrap__campo-label">Contador</span>
          <span class="f-amrap__campo-valor f-amrap__campo-valor--acento">rondas ↑</span>
        </div>
      </div>
      <span class="f-emom__nota">En el timer AMRAP el número protagonista no es el reloj: son las rondas completadas — tap grande en cualquier parte para sumar una.</span>
    </div>
  `;
}

function configPiramide(config: CardioConfig): string {
  const niveles = config.levels ?? [...PIRAMIDE_MEDIA];
  const pico = Math.max(...niveles);
  const presets = ['corta', 'media', 'larga', 'intensa', 'extendida', 'reset'];
  return `
    <div class="f-presets" role="group" aria-label="Presets de pirámide">
      ${presets
        .map(
          (p) =>
            `<button type="button" class="f-preset" data-cardio="preset" data-preset="${p}" aria-pressed="${
              p === presetActivo
            }">${p.toUpperCase()}</button>`
        )
        .join('')}
    </div>
    <section class="f-montana">
      <div class="f-montana__grafico">
        <div class="f-montana__pico-linea" aria-hidden="true"></div>
        <span class="f-montana__pico-label">PICO ${pico}S</span>
        ${niveles
          .map(
            (n) => `
          <div class="f-nivel">
            <span class="f-nivel__seg">${n}</span>
            <div class="f-nivel__barra f-nivel__barra--t${tramoDeNivel(n, pico)}" style="height:${alturaDeNivel(
              n,
              pico
            )}%"></div>
          </div>`
          )
          .join('')}
      </div>
      <div class="f-montana__pie">
        <span>SUBE ↗</span>
        <span>${config.rest ?? DESCANSO_PIRAMIDE}S DE DESCANSO ENTRE NIVELES</span>
        <span>↘ BAJA</span>
      </div>
      <div class="f-montana__acciones">
        <button type="button" class="f-btn f-btn--secundario f-montana__accion" data-cardio="escalar" data-factor="0.8"${
          puedeEscalar('down') ? '' : ' disabled'
        }>Escalar ↓</button>
        <button type="button" class="f-btn f-btn--secundario f-montana__accion" data-cardio="escalar" data-factor="1.25"${
          puedeEscalar('up') ? '' : ' disabled'
        }>Escalar ↑</button>
      </div>
      <span class="f-montana__nota">Escala toda la montaña — los ${
        niveles.length
      } niveles se recalculan en proporción. En el timer, el nivel activo late en Fragua y los superados quedan al 40%.</span>
    </section>
  `;
}

function configCircuito(config: CardioConfig): string {
  const estaciones = config.exercises ?? [];
  const filas = estaciones
    .map(
      (e, i) => `
      <div class="f-estacion">
        <div class="f-estacion__eje">
          <span class="f-estacion__numero">${i + 1}</span>
          <span class="f-estacion__linea"></span>
        </div>
        <div class="f-estacion__card">
          <div class="f-estacion__textos">
            <span class="f-estacion__nombre">${escapar(e.name)}</span>
            <span class="f-estacion__detalle">${
              e.type === 'reps' ? `${e.target} reps` : `${config.work ?? 40}s trabajo`
            }</span>
          </div>
          <button type="button" class="f-estacion__quitar" data-cardio="quitar-estacion" data-indice="${i}" aria-label="Quitar ${escapar(
            e.name
          )}">✕</button>
        </div>
      </div>`
    )
    .join('');

  // El mockup dibuja el circulo punteado "+" y "Agregar ejercicio", nada mas:
  // el <select> visible que habia aqui no existe en C-07 y ademas se pintaba
  // con el borde de las cards de seccion Hueso (#E0DED7) sobre fondo Carbon.
  // La eleccion se hace en una hoja, como el resto de las elecciones de la app.
  return `
    <div class="f-circuito">
      ${filas}
      <div class="f-estacion">
        <div class="f-estacion__eje">
          <button type="button" class="f-estacion__anadir" data-cardio="anadir-estacion" aria-label="Agregar ejercicio">+</button>
        </div>
        <button type="button" class="f-estacion__anadir-texto" data-cardio="anadir-estacion">Agregar ejercicio</button>
      </div>
    </div>
    <div class="f-cardio__dos-campos">
      ${campo('RONDAS', stepper('rounds', 1, config.rounds ?? 3, '', true), true)}
      ${campo('DESCANSO ENTRE RONDAS', stepper('roundRest', 15, config.roundRest ?? 60, 's', true), true)}
    </div>
  `;
}

export function showCardioConfig(): void {
  hideAllCardioViews();
  const v = vista('cardioConfigView');
  const mode = cardioState.mode;
  if (!v || !mode) return;
  v.classList.remove('hidden');

  const config = cardioState.config;
  let cuerpo = '';
  let pie = '';

  switch (mode) {
    case 'tabata':
      cuerpo = configTabata(config);
      pie = pieDeTotal('Duración total', conUnidad(duracionTotal(mode, config)));
      break;
    case 'custom':
      cuerpo = configCustom(config);
      pie = pieDeTotal('Duración total', conUnidad(duracionTotal(mode, config)));
      break;
    case 'amrap':
      cuerpo = configAmrap(config);
      pie = pieDeTotal('Duración total', conUnidad(duracionTotal(mode, config)));
      break;
    case 'emom':
      cuerpo = configEmom(config);
      pie = '';
      break;
    case 'pyramid':
      cuerpo = configPiramide(config);
      pie = pieDeTotal(
        `Total · ${(config.levels ?? PIRAMIDE_MEDIA).length} niveles + descansos`,
        conUnidad(duracionTotal(mode, config)),
        true
      );
      break;
    case 'circuit': {
      cuerpo = configCircuito(config);
      const estaciones = (config.exercises ?? []).length;
      pie = pieDeTotal(
        `${estaciones} ${estaciones === 1 ? 'estación' : 'estaciones'} × ${config.rounds ?? 3} rondas`,
        conUnidad(duracionTotal(mode, config), '~'),
        true
      );
      break;
    }
  }

  const comenzar =
    mode === 'emom'
      ? botonComenzar(`Comenzar EMOM · ${config.rounds ?? 10} min`)
      : botonComenzar();

  v.innerHTML = `
    <div class="f-cardio f-cardio--config${
      mode === 'circuit' || mode === 'emom' ? ' f-cardio--compacta' : ''
    } f-root">
      <div class="f-cardio__cabecera">
        <button type="button" class="f-sesion__volver" data-cardio="volver-selector" aria-label="Volver al selector">←</button>
        <div class="f-cardio__titulos">
          <span class="f-cardio__titulo">${NOMBRE_MODO[mode]}</span>
          <span class="f-cardio__sub">${escapar(subDeModo(mode, config))}</span>
        </div>
      </div>
      ${cuerpo}
      ${pie}
      ${comenzar}
    </div>
  `;
  enganchar(v, alTocarCardio);
}

/** C-07 · elegir la estacion a agregar. El mockup no dibuja un desplegable:
 *  dibuja el "+" y el texto, asi que la eleccion va en una hoja. */
function abrirHojaDeEstacion(): void {
  const opciones = getCardioExerciseNames()
    .map(
      (n) =>
        `<button type="button" class="f-sheet__opcion" data-estacion="${escapar(n)}">${escapar(
          n
        )}</button>`
    )
    .join('');
  const velo = abrirHoja(`
    <div class="f-sheet f-sheet--lista" role="dialog" aria-modal="true" aria-label="Agregar ejercicio">
      <div class="f-sheet__handle" aria-hidden="true"></div>
      <span class="f-sheet__titulo">Agregar ejercicio</span>
      <div class="f-sheet__opciones">${opciones}</div>
      <button type="button" class="f-btn f-btn--secundario f-btn--hoja" data-cerrar>Cerrar</button>
    </div>
  `);
  velo?.querySelectorAll<HTMLElement>('[data-estacion]').forEach((b) =>
    b.addEventListener('click', () => {
      const lista = cardioState.config.exercises ?? [];
      lista.push({ name: b.dataset.estacion ?? '', target: cardioState.config.work ?? 40, type: 'time' });
      cardioState.config.exercises = lista;
      velo.querySelector<HTMLElement>('[data-cerrar]')?.click();
      showCardioConfig();
    })
  );
}

/** Minimos por clave: un intervalo de 0s no es un intervalo. */
const MINIMOS: Partial<Record<keyof CardioConfig, number>> = {
  rounds: 1,
  work: 5,
  rest: 0,
  roundRest: 0,
  interval: 10,
  duration: 60,
  reps: 1,
};

export function adjustCardioConfig(key: keyof CardioConfig, delta: number): void {
  const config = cardioState.config;
  const actual = (config[key] as number) || 0;
  (config as Record<string, number>)[key] = Math.max(minimoDe(key), actual + delta);
  showCardioConfig();
}

export function minimoDe(key: keyof CardioConfig): number {
  return MINIMOS[key] ?? 0;
}

/** true cuando restar otro paso ya no cambiaria nada: el boton se deshabilita
 *  en vez de quedarse vivo de mentira. El README pide el deshabilitado visible. */
export function enElMinimo(key: keyof CardioConfig, valor: number, paso: number): boolean {
  return valor - paso < minimoDe(key);
}

export function setCardioExercise(exercise: string): void {
  cardioState.config.exercise = exercise;
}

export function adjustPyramidLevel(action: string): void {
  if (PRESETS_PIRAMIDE[action]) {
    // RESET vuelve a MEDIA y se ilumina MEDIA, que es lo que de verdad queda
    // seleccionado; encender RESET seria decir que hay un sexto preset activo.
    piramideBase = [...PRESETS_PIRAMIDE[action]];
    factorPiramide = 1;
    cardioState.config.levels = [...piramideBase];
    presetActivo = action === 'reset' ? 'media' : action;
  } else if (action === 'scale_up' || action === 'scale_down') {
    factorPiramide = acotarFactor(
      action === 'scale_up' ? factorPiramide * PASO_FACTOR : factorPiramide / PASO_FACTOR
    );
    cardioState.config.levels = escalarDesde(piramideBase, factorPiramide);
    presetActivo = factorPiramide === 1 ? presetActivo : '';
  }
  showCardioConfig();
}

/** El escalado esta acotado; los botones lo dicen en vez de fingir que siguen. */
export function puedeEscalar(direccion: 'up' | 'down'): boolean {
  const siguiente = direccion === 'up' ? factorPiramide * PASO_FACTOR : factorPiramide / PASO_FACTOR;
  return acotarFactor(siguiente) !== factorPiramide;
}

// ==========================================
// ARRANQUE
// ==========================================

export function startCardioWorkout(): void {
  hideAllCardioViews();
  const v = vista('cardioTimerView');
  if (!v) return;
  v.classList.remove('hidden');
  amrapRounds = 0;
  enganchar(v, alTocarCardio);

  showPreparationCountdown(() => {
    initializeWorkout();
    renderTimerView();
    startTimer();
  });
}

function showPreparationCountdown(onComplete: () => void): void {
  const v = vista('cardioTimerView');
  if (!v || !cardioState.mode) {
    onComplete();
    return;
  }
  let cuenta = 3;
  const pintar = () => {
    v.innerHTML = `
      <div class="f-preparacion f-root">
        <span class="f-preparacion__label">PREPÁRATE · ${NOMBRE_MODO[cardioState.mode!]}</span>
        <span class="f-preparacion__cifra" role="status" aria-live="assertive">${
          cuenta > 0 ? cuenta : 'YA'
        }</span>
      </div>
    `;
    playBeep(cuenta === 0);
    if (cuenta === 0) vibrar(200);
  };
  pintar();
  if (cuentaAtrasInterval) clearInterval(cuentaAtrasInterval);
  cuentaAtrasInterval = setInterval(() => {
    cuenta--;
    if (cuenta < 0) {
      if (cuentaAtrasInterval) clearInterval(cuentaAtrasInterval);
      cuentaAtrasInterval = null;
      onComplete();
      return;
    }
    pintar();
  }, 1000);
}

/**
 * Para TODOS los relojes del cardio y olvida la sesion en curso.
 *
 * Lo llama la navegacion al salir de la pantalla. Sin esto el motor seguia
 * corriendo invisible: sonaba, vibraba, y al cumplirse el tiempo guardaba una
 * sesion que el usuario habia abandonado y pintaba el resumen encima de la
 * pestaña en la que estuviera.
 */
export function detenerMotorCardio(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (cuentaAtrasInterval) {
    clearInterval(cuentaAtrasInterval);
    cuentaAtrasInterval = null;
  }
  cerrando = false;
  resetCardioState();
}

function initializeWorkout(): void {
  cardioState.isPaused = false;
  cardioState.currentRound = 1;
  cardioState.currentPhase = 'work';
  cardioState.totalTimeElapsed = 0;
  cardioState.workTimeTotal = 0;
  cardioState.restTimeTotal = 0;
  cardioState.startTime = Date.now();
  cardioState.currentExerciseIndex = 0;
  inicioReal = cardioState.startTime;
  pausaAcumulada = 0;
  pausadoDesde = 0;
  baseDeFase = 0;
  duracionFase = 0;
  cerrando = false;

  const config = cardioState.config;
  switch (cardioState.mode) {
    case 'amrap':
      cardioState.timeRemaining = config.duration ?? 720;
      break;
    case 'emom':
      cardioState.currentPhase = 'emom';
      cardioState.timeRemaining = config.interval ?? 60;
      break;
    case 'pyramid':
      cardioState.timeRemaining = (config.levels ?? PIRAMIDE_MEDIA)[0];
      break;
    default:
      cardioState.timeRemaining = config.work ?? 20;
  }
  duracionFase = cardioState.timeRemaining;
}

export function incrementAmrapRound(): void {
  amrapRounds++;
  const el = document.getElementById('amrapCounter');
  if (el) el.textContent = String(amrapRounds);
  const sub = document.querySelector<HTMLElement>('.f-anillo__sub');
  if (sub) sub.textContent = `${amrapRounds} ${amrapRounds === 1 ? 'ronda' : 'rondas'}`;
  playBeep(false);
}

// ==========================================
// MOTOR DEL TEMPORIZADOR
// ==========================================

/** Segundos transcurridos de reloj de pared, descontando lo que estuvo en pausa. */
function segundosCorridos(): number {
  const pausaViva = pausadoDesde ? Date.now() - pausadoDesde : 0;
  return Math.max(0, Math.floor((Date.now() - inicioReal - pausaAcumulada - pausaViva) / 1000));
}

/**
 * Un tick por segundo, pero el reloj se REDERIVA del tiempo real, no se
 * descuenta de uno en uno.
 *
 * `setInterval` fusiona los callbacks que no puede disparar: con el hilo
 * bloqueado 6s el reloj solo descontaba 2, y con la pestaña en segundo plano
 * (throttling a 1/min en movil) un Tabata de 4:00 podia tardar media hora y
 * reportar igualmente 240s. Ahora la unica fuente es `Date.now()`.
 */
function startTimer(): void {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (cardioState.isPaused) return;

    const corridos = segundosCorridos();
    const anterior = cardioState.timeRemaining;
    const enLaFase = Math.max(0, corridos - baseDeFase);

    // Puede haber saltado mas de un segundo: se contabiliza lo que de verdad
    // paso, no un tick fijo.
    const avance = Math.max(0, corridos - cardioState.totalTimeElapsed);
    cardioState.totalTimeElapsed = corridos;
    if (cardioState.currentPhase === 'work' || cardioState.currentPhase === 'emom') {
      cardioState.workTimeTotal += avance;
    } else {
      cardioState.restTimeTotal += avance;
    }

    cardioState.timeRemaining = Math.max(0, duracionFase - enLaFase);
    actualizarReloj();

    if (cardioState.timeRemaining <= 0) {
      handlePhaseEnd();
      return;
    }
    // El beep suena una vez por segundo, no una vez por tick perdido.
    if (cardioState.timeRemaining <= 3 && cardioState.timeRemaining !== anterior) playBeep();
  }, 1000);
}

/**
 * Entra en una fase nueva anclandola al calendario nominal, no al instante en
 * que se disparo el tick: la fase siguiente empieza donde TERMINABA la
 * anterior, asi que un tick tardio no desplaza todo el resto de la sesion.
 *
 * Devuelve false si la fase dura 0 — quien llama debe saltarla en el acto. Una
 * fase de duracion cero gastaba antes un tick entero, y un Tabata con el
 * descanso puesto a 0 anunciaba 0:40, duraba 0:42 y reportaba 2s de descanso.
 */
function entrarEnFase(fase: FaseCardio, duracion: number): boolean {
  baseDeFase += duracionFase;
  duracionFase = Math.max(0, duracion);
  cardioState.currentPhase = fase;
  cardioState.timeRemaining = duracionFase;
  return duracionFase > 0;
}

/**
 * Cierra la fase en curso y abre la siguiente.
 *
 * Devuelve la duracion de la fase abierta; 0 significa "saltala". El bucle de
 * `avanzarFase` se encarga de no dejar nunca una fase de duracion cero viva.
 */
function siguienteFase(): number | 'fin' {
  const config = cardioState.config;
  const mode = cardioState.mode;
  const totalRondas = config.rounds ?? 8;

  if (mode === 'amrap') return 'fin';

  if (mode === 'emom') {
    if (cardioState.currentRound >= totalRondas) return 'fin';
    cardioState.currentRound++;
    return entrarEnFase('emom', config.interval ?? 60) ? config.interval ?? 60 : 0;
  }

  if (mode === 'pyramid') {
    const niveles = config.levels ?? PIRAMIDE_MEDIA;
    if (cardioState.currentPhase === 'work') {
      // El ultimo nivel no lleva descanso detras.
      if (cardioState.currentExerciseIndex >= niveles.length - 1) return 'fin';
      const d = config.rest ?? DESCANSO_PIRAMIDE;
      entrarEnFase('rest', d);
      return d;
    }
    cardioState.currentExerciseIndex++;
    cardioState.currentRound = cardioState.currentExerciseIndex + 1;
    const d = niveles[cardioState.currentExerciseIndex];
    entrarEnFase('work', d);
    return d;
  }

  if (mode === 'circuit') {
    // El circuito NO cabe en el ciclo trabajo/descanso generico: recorre sus
    // estaciones dentro de cada ronda y mete un descanso propio entre rondas.
    // Sin esta rama caia en el `default`, ignoraba `exercises` y `roundRest`,
    // y una sesion que el pie anunciaba en 14:00 duraba 3:00.
    const estaciones = (config.exercises ?? []).length;
    if (estaciones === 0) return 'fin';

    if (cardioState.currentPhase === 'work') {
      const d = config.rest ?? 0;
      entrarEnFase('rest', d);
      return d;
    }
    if (cardioState.currentPhase === 'roundRest') {
      cardioState.currentRound++;
      cardioState.currentExerciseIndex = 0;
      const d = config.work ?? 40;
      entrarEnFase('work', d);
      return d;
    }
    // Fin del descanso de una estacion: o pasa a la siguiente, o cierra ronda.
    if (cardioState.currentExerciseIndex < estaciones - 1) {
      cardioState.currentExerciseIndex++;
      const d = config.work ?? 40;
      entrarEnFase('work', d);
      return d;
    }
    if (cardioState.currentRound >= totalRondas) return 'fin';
    const d = config.roundRest ?? 0;
    entrarEnFase('roundRest', d);
    return d;
  }

  // Tabata y personalizado: ciclos completos trabajo+descanso. El ultimo
  // descanso tambien se corre, que es lo que hace un Tabata de 4:00 y lo que
  // dice el pie de C-02.
  if (cardioState.currentPhase === 'work') {
    const d = config.rest ?? 10;
    entrarEnFase('rest', d);
    return d;
  }
  if (cardioState.currentRound >= totalRondas) return 'fin';
  cardioState.currentRound++;
  const d = config.work ?? 20;
  entrarEnFase('work', d);
  return d;
}

function handlePhaseEnd(): void {
  playBeep(true);
  vibrar(200);

  // Las fases de duracion 0 se consumen aqui mismo, no gastando un tick cada
  // una. El tope evita un bucle infinito si toda la configuracion es cero.
  for (let guarda = 0; guarda < 64; guarda++) {
    const d = siguienteFase();
    if (d === 'fin') {
      finishCardioWorkout();
      return;
    }
    if (d > 0) {
      renderTimerView();
      return;
    }
  }
  finishCardioWorkout();
}

/** Parche por segundo: repintar entero cada tick tira la animacion del anillo. */
function actualizarReloj(): void {
  const reloj = document.getElementById('cardioTimer');
  if (reloj) {
    const texto = formatearTiempo(cardioState.timeRemaining);
    reloj.textContent = texto;
    // "11:58" (cinco glifos) no cabe dentro del anillo de 230px con la cifra
    // de 72px, y es el estado POR DEFECTO del AMRAP de 12 min.
    reloj.classList.toggle('f-anillo__tiempo--largo', texto.length >= 5);
  }
  const arco = document.getElementById('cardioAnillo');
  if (arco) {
    arco.setAttribute(
      'stroke-dashoffset',
      String(offsetDelAnillo(cardioState.timeRemaining, duracionFase, RADIO_ANILLO))
    );
  }
  // C-06: la etiqueta del nivel activo es su countdown.
  const seg = document.getElementById(`nivelSeg-${cardioState.currentExerciseIndex}`);
  if (seg?.classList.contains('f-nivel__seg--activo')) {
    seg.textContent = formatearTiempo(cardioState.timeRemaining);
  }
  const barra = document.getElementById('cardioProgreso');
  if (barra) {
    const total = duracionTotal(cardioState.mode!, cardioState.config);
    barra.style.width = `${total > 0 ? Math.min(100, (cardioState.totalTimeElapsed / total) * 100) : 0}%`;
  }
  const transcurrido = document.getElementById('cardioTranscurrido');
  if (transcurrido) transcurrido.textContent = formatearTiempo(cardioState.totalTimeElapsed);
  const restante = document.getElementById('cardioRestante');
  if (restante) {
    const total = duracionTotal(cardioState.mode!, cardioState.config);
    restante.textContent = `QUEDAN ${formatearTiempo(Math.max(0, total - cardioState.totalTimeElapsed))}`;
  }
}

function totalDeLaFase(): number {
  const config = cardioState.config;
  switch (cardioState.mode) {
    case 'amrap':
      return config.duration ?? 720;
    case 'emom':
      return config.interval ?? 60;
    case 'pyramid': {
      const niveles = config.levels ?? PIRAMIDE_MEDIA;
      return cardioState.currentPhase === 'work'
        ? niveles[cardioState.currentExerciseIndex]
        : config.rest ?? DESCANSO_PIRAMIDE;
    }
    default:
      return cardioState.currentPhase === 'work' ? config.work ?? 20 : config.rest ?? 10;
  }
}

// ==========================================
// C-03 y C-06 · TIMER
// ==========================================

function controles(): string {
  return `
    <div class="f-cardio__controles">
      <button type="button" class="f-btn--claro" data-cardio="pausa">${
        cardioState.isPaused ? 'Reanudar' : 'Pausar'
      }</button>
      <button type="button" class="f-btn--detener" data-cardio="detener">Detener</button>
    </div>
  `;
}

function renderTimerView(): void {
  const v = vista('cardioTimerView');
  if (!v || !cardioState.mode) return;
  v.innerHTML = cardioState.mode === 'pyramid' ? timerPiramide() : timerAnillo();
  enganchar(v, alTocarCardio);
}

function timerAnillo(): string {
  const config = cardioState.config;
  const mode = cardioState.mode!;
  const descanso = cardioState.currentPhase === 'rest';
  const etiquetaFase = descanso ? 'DESCANSO' : 'TRABAJO';
  const total = duracionFase || totalDeLaFase();
  const c = dasharrayDelAnillo(RADIO_ANILLO);

  // En AMRAP el sub NO repite el reloj de arriba: se quedaba congelado en
  // "quedan 12:00" mientras la cifra grande bajaba, y aun actualizandolo seria
  // la unica linea que dice dos veces lo mismo. Lleva el dato que falta.
  let sub = '';
  if (mode === 'amrap') sub = `${amrapRounds} ${amrapRounds === 1 ? 'ronda' : 'rondas'}`;
  else if (mode === 'emom') sub = `minuto ${cardioState.currentRound} de ${config.rounds ?? 10}`;
  else sub = `ronda ${cardioState.currentRound} de ${config.rounds ?? 8}`;

  const rondasTotales = mode === 'amrap' ? 0 : config.rounds ?? 8;
  const marcas =
    rondasTotales > 0 && rondasTotales <= 20
      ? `<div class="f-rondas" aria-hidden="true">${Array.from({ length: rondasTotales }, (_, i) => {
          // `rondas` del mockup solo tiene DOS estados: Fragua hasta la ronda
          // en curso inclusive, y #20242D el resto. El salmon intermedio que
          // habia aqui no existe en el handoff.
          const clase = i + 1 <= cardioState.currentRound ? ' f-rondas__marca--hecha' : '';
          return `<span class="f-rondas__marca${clase}"></span>`;
        }).join('')}</div>`
      : '';

  // En AMRAP el protagonista son las rondas, no el reloj.
  const centro =
    mode === 'amrap'
      ? `
        <div class="f-amrap-vivo" aria-hidden="true">
          <span class="f-amrap-vivo__cifra" id="amrapCounter">${amrapRounds}</span>
          <span class="f-amrap-vivo__label">RONDAS · TOCA PARA SUMAR</span>
        </div>`
      : '';

  // README §9 y el mockup: "tap en cualquier parte del timer suma una ronda".
  // El manejador vivia solo en el boton del contador (350x91 de 390x844).
  const zonaTap =
    mode === 'amrap'
      ? ' f-cardio--amrap-tap" data-cardio="ronda-amrap" role="button" tabindex="0" aria-label="Sumar una ronda'
      : '';

  return `
    <div class="f-cardio f-cardio--timer f-root${zonaTap}">
      <span class="f-fase${
        cardioState.isPaused ? ' f-fase--pausa' : descanso ? ' f-fase--descanso' : ''
      }">${cardioState.isPaused ? 'EN PAUSA' : etiquetaFase}</span>
      <div class="f-anillo">
        <svg class="f-anillo__svg" viewBox="0 0 230 230" width="230" height="230" aria-hidden="true">
          <circle class="f-anillo__pista" cx="115" cy="115" r="${RADIO_ANILLO}"></circle>
          <circle
            class="f-anillo__avance"
            id="cardioAnillo"
            cx="115" cy="115" r="${RADIO_ANILLO}"
            stroke-dasharray="${c}"
            stroke-dashoffset="${offsetDelAnillo(cardioState.timeRemaining, total, RADIO_ANILLO)}"
          ></circle>
        </svg>
        <div class="f-anillo__centro">
          <span class="f-anillo__tiempo${
            formatearTiempo(cardioState.timeRemaining).length >= 5 ? ' f-anillo__tiempo--largo' : ''
          }" id="cardioTimer" role="timer">${formatearTiempo(cardioState.timeRemaining)}</span>
          <span class="f-anillo__sub">${escapar(sub)}</span>
        </div>
      </div>
      ${centro}
      ${marcas}
      ${controles()}
      <span class="f-cardio__pie">${
        cardioState.isPaused
          ? 'EL RELOJ ESTÁ DETENIDO · TOCA REANUDAR PARA SEGUIR'
          : 'BEEP EN 3-2-1 · VIBRACIÓN AL CAMBIO DE FASE'
      }</span>
    </div>
  `;
}

function timerPiramide(): string {
  const config = cardioState.config;
  const niveles = config.levels ?? PIRAMIDE_MEDIA;
  const pico = Math.max(...niveles);
  const actual = cardioState.currentExerciseIndex;
  const descanso = cardioState.currentPhase === 'rest';
  const total = duracionTotal('pyramid', config);
  const esPico = niveles[actual] === pico;

  // La etiqueta la decide el estado, como en `pyrLive` del mockup y como pide
  // el README §8 ("el activo ... con el countdown encima"): antes los siete
  // niveles enseñaban siempre sus segundos crudos.
  const barras = niveles
    .map((n, i) => {
      const estado = estadoDeNivel(i, actual);
      const etiqueta =
        estado === 'hecho' ? '✓' : estado === 'activo' ? formatearTiempo(cardioState.timeRemaining) : String(n);
      return `
      <div class="f-nivel">
        <span class="f-nivel__seg f-nivel__seg--vivo f-nivel__seg--${estado}" id="nivelSeg-${i}">${etiqueta}</span>
        <div class="f-nivel__barra f-nivel__barra--${estado}" style="height:${alturaDeNivel(n, pico)}%"></div>
      </div>`;
    })
    .join('');

  return `
    <div class="f-cardio f-cardio--piramide f-root">
      <div class="f-piramide__cabecera">
        <span class="f-piramide__nombre">PIRÁMIDE${presetActivo ? ` · ${presetActivo.toUpperCase()}` : ''}</span>
        <span class="f-piramide__fase${
          cardioState.isPaused ? ' f-piramide__fase--pausa' : descanso ? ' f-piramide__fase--descanso' : ''
        }">${cardioState.isPaused ? 'EN PAUSA' : descanso ? 'DESCANSO' : 'TRABAJO'}</span>
      </div>
      <div class="f-piramide__reloj">
        <span class="f-piramide__tiempo" id="cardioTimer" role="timer">${formatearTiempo(
          cardioState.timeRemaining
        )}</span>
        <span class="f-piramide__sub">${
          descanso
            ? `descanso · siguiente nivel ${Math.min(actual + 2, niveles.length)} de ${niveles.length}`
            : `nivel ${actual + 1} de ${niveles.length}${esPico ? ' · el pico' : ''} · ${niveles[actual]}s`
        }</span>
      </div>
      <div class="f-montana__grafico f-montana__grafico--vivo">${barras}</div>
      <div class="f-piramide__progreso">
        <div class="f-piramide__pista">
          <div class="f-piramide__relleno" id="cardioProgreso" style="width:${
            total > 0 ? Math.min(100, (cardioState.totalTimeElapsed / total) * 100).toFixed(1) : 0
          }%"></div>
        </div>
        <div class="f-piramide__marcas">
          <span id="cardioTranscurrido">${formatearTiempo(cardioState.totalTimeElapsed)}</span>
          <span id="cardioRestante">QUEDAN ${formatearTiempo(
            Math.max(0, total - cardioState.totalTimeElapsed)
          )}</span>
          <span>${formatearTiempo(total)}</span>
        </div>
      </div>
      ${controles()}
      <span class="f-piramide__leyenda">LOS NIVELES SUPERADOS QUEDAN EN BRASA · EL ACTIVO LATE · LOS PRÓXIMOS, EN LÍNEA DE PUNTOS</span>
    </div>
  `;
}

export function toggleCardioPause(): void {
  cardioState.isPaused = !cardioState.isPaused;
  if (cardioState.isPaused) {
    pausadoDesde = Date.now();
  } else if (pausadoDesde) {
    pausaAcumulada += Date.now() - pausadoDesde;
    pausadoDesde = 0;
  }
  renderTimerView();
}

export async function stopCardioWorkout(): Promise<void> {
  // El motor se para ANTES de esperar la respuesta. Mientras la hoja estaba
  // abierta el temporizador seguia corriendo, y si la fase expiraba el cierre
  // ocurria dos veces: la segunda ya sin `mode`, guardando una sesion fantasma
  // "Cardio - undefined" de 0s y cobrando su XP.
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (!cardioState.isPaused) {
    cardioState.isPaused = true;
    pausadoDesde = Date.now();
  }

  const terminar = await confirmarDestructivo({
    titulo: '¿Terminar el cardio?',
    cuerpo: 'La sesión se cierra donde está y se guarda con el tiempo hecho hasta ahora.',
    cancelar: 'Seguir',
    confirmar: 'Terminar',
  });

  if (terminar) {
    finishCardioWorkout({ abandonada: true });
    return;
  }
  // Reanudar: la espera de la hoja no cuenta como tiempo entrenado.
  if (pausadoDesde) {
    pausaAcumulada += Date.now() - pausadoDesde;
    pausadoDesde = 0;
  }
  cardioState.isPaused = false;
  renderTimerView();
  startTimer();
}

// ==========================================
// C-04 · CIERRE Y RESUMEN
// ==========================================

function finishCardioWorkout(opciones: { abandonada?: boolean } = {}): void {
  // Guarda de reentrada. Sin ella el cierre podia correr dos veces (la hoja de
  // "Detener" resuelta despues de que el temporizador expirara solo) y la
  // segunda vuelta escribia basura: `mode` ya era null.
  if (cerrando || !cardioState.mode) return;
  cerrando = true;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (cuentaAtrasInterval) {
    clearInterval(cuentaAtrasInterval);
    cuentaAtrasInterval = null;
  }

  const abandonada = opciones.abandonada === true;
  const stats: CardioSessionStats = {
    totalTime: cardioState.totalTimeElapsed,
    workTime: cardioState.workTimeTotal,
    restTime: cardioState.restTimeTotal,
    roundsCompleted: rondasCompletadas(abandonada),
    calories: estimateCalories(cardioState.workTimeTotal),
  };

  const ahora = new Date().toISOString();
  const sesion = {
    type: 'cardio' as const,
    mode: cardioState.mode!,
    sessionId: `cardio_${Date.now()}`,
    // Instante completo: el heatmap deriva de aqui el dia LOCAL.
    date: ahora,
    savedAt: ahora,
    config: { ...cardioState.config },
    stats,
    grupo: `Cardio - ${NOMBRE_MODO[cardioState.mode!]}`,
    ejercicios: [],
    volumenTotal: 0,
    volumenPorGrupo: {},
  };

  addToHistory(sesion);

  // El XP de cardio existia en el motor y no lo llamaba nadie: terminar un
  // Tabata no sumaba un solo punto. C-04 lo enseña.
  try {
    // Solo el XP de ESTA sesion: el de los logros va por su cuenta.
    ultimoXP = processCompletedCardioSession(sesion).totalXP;
  } catch (e) {
    console.error('No se pudo procesar el XP del cardio', e);
    ultimoXP = null;
  }

  showCardioSummary(stats, abandonada);
}

/**
 * Rondas COMPLETADAS, no la que estaba en marcha.
 *
 * `currentRound` es la ronda en curso: al cerrar a mitad reportaba una de mas,
 * y ese numero paga XP. Solo cuenta entera la que llego al final de su ciclo.
 */
function rondasCompletadas(abandonada: boolean): number {
  if (cardioState.mode === 'amrap') return amrapRounds;
  if (cardioState.mode === 'pyramid') {
    return abandonada ? cardioState.currentExerciseIndex : cardioState.currentRound;
  }
  if (!abandonada) return cardioState.currentRound;
  // Una ronda se cierra al terminar su descanso; si el corte cae en el
  // trabajo, esa ronda no cuenta.
  return Math.max(0, cardioState.currentRound - 1);
}

/**
 * ~15 kcal por minuto de trabajo de alta intensidad.
 *
 * Sale del propio mockup: C-04 pinta TRABAJO 2:40 con KCAL EST. ~40, o sea
 * 40 / (160/60) = 15 exactos. [REF Pantallas C-04]
 */
const KCAL_POR_MINUTO = 15;

function estimateCalories(workSeconds: number): number {
  return Math.round((workSeconds / 60) * KCAL_POR_MINUTO);
}

function showCardioSummary(stats: CardioSessionStats, abandonada = false): void {
  const v = vista('cardioSummaryView');
  if (!v) return;

  // Si el usuario ya no esta en cardio, la sesion se guarda pero el resumen NO
  // secuestra la pantalla en la que este: se pintaba encima del historial.
  const enCardio = ['cardioSelectorView', 'cardioConfigView', 'cardioTimerView'].some(
    (id) => vista(id)?.classList.contains('hidden') === false
  );
  if (!enCardio) {
    cerrando = false;
    resetCardioState();
    return;
  }

  hideAllCardioViews();
  v.classList.remove('hidden');

  const mode = cardioState.mode!;
  const rondasObjetivo =
    mode === 'amrap' ? null : mode === 'pyramid'
      ? (cardioState.config.levels ?? PIRAMIDE_MEDIA).length
      : cardioState.config.rounds ?? 0;
  const rondas = rondasObjetivo ? `${stats.roundsCompleted}/${rondasObjetivo}` : String(stats.roundsCompleted);

  const metricas = [
    { label: 'RONDAS', valor: rondas },
    { label: 'TRABAJO', valor: formatearTiempo(stats.workTime) },
    { label: 'KCAL EST.', valor: `~${cifra(stats.calories)}` },
  ];
  if (ultimoXP !== null && ultimoXP > 0) {
    metricas.push({ label: 'XP', valor: `+${cifra(ultimoXP)}` });
  }

  v.innerHTML = `
    <div class="f-cardio f-cardio--resumen f-root">
      <div class="f-cardio__resumen-cabecera">
        <span class="f-cardio__resumen-label">${NOMBRE_MODO[mode]} ${
          abandonada ? 'DETENIDO' : 'COMPLETADO'
        }</span>
        <span class="f-cardio__resumen-cifra">${formatearTiempo(stats.totalTime)}</span>
        <span class="f-cardio__guardado">Guardado en tu historial</span>
      </div>
      <div class="f-cardio__rejilla">
        ${metricas
          .map(
            (m) => `
          <div class="f-cardio__metrica">
            <span class="f-cardio__metrica-label">${m.label}</span>
            <span class="f-cardio__metrica-cifra${
              m.label === 'XP' ? ' f-cardio__metrica-cifra--xp' : ''
            }">${escapar(m.valor)}</span>
          </div>`
          )
          .join('')}
      </div>
      <button type="button" class="f-btn f-btn--primario f-btn--bloque" data-cardio="inicio">Volver al inicio</button>
    </div>
  `;

  enganchar(v, alTocarCardio);
  cerrando = false;
  resetCardioState();
}

// ==========================================
// DELEGACIÓN
// ==========================================

function alTocarCardio(el: HTMLElement): void {
  switch (el.dataset.cardio) {
    case 'inicio':
      void import('@/ui/navigation').then(({ showHome }) => showHome());
      break;
    case 'volver-selector':
      showCardioSelector();
      break;
    case 'modo':
      selectCardioMode(el.dataset.modo as CardioMode);
      break;
    case 'menos':
    case 'mas': {
      const paso = Number(el.dataset.paso) || 1;
      const clave = el.dataset.clave as keyof CardioConfig;
      const delta = el.dataset.cardio === 'mas' ? paso : -paso;
      // La duracion de AMRAP se enseña en minutos y se guarda en segundos.
      adjustCardioConfig(clave, clave === 'duration' ? delta * 60 : delta);
      break;
    }
    case 'preset':
      adjustPyramidLevel(el.dataset.preset ?? 'media');
      break;
    case 'escalar':
      adjustPyramidLevel(Number(el.dataset.factor) > 1 ? 'scale_up' : 'scale_down');
      break;
    case 'anadir-estacion':
      abrirHojaDeEstacion();
      break;
    case 'quitar-estacion': {
      const lista = cardioState.config.exercises ?? [];
      lista.splice(Number(el.dataset.indice), 1);
      cardioState.config.exercises = lista;
      showCardioConfig();
      break;
    }
    case 'comenzar':
      startCardioWorkout();
      break;
    case 'pausa':
      toggleCardioPause();
      break;
    case 'detener':
      void stopCardioWorkout();
      break;
    case 'ronda-amrap':
      incrementAmrapRound();
      break;
  }
}

// ==========================================
// SONIDO Y VIBRACIÓN
// ==========================================

function vibrar(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Sin soporte: el beep ya avisa.
  }
}

function playBeep(long = false): void {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    const oscilador = audioContext.createOscillator();
    const ganancia = audioContext.createGain();
    oscilador.connect(ganancia);
    ganancia.connect(audioContext.destination);
    oscilador.frequency.value = long ? 880 : 440;
    oscilador.type = 'sine';
    ganancia.gain.setValueAtTime(0.3, audioContext.currentTime);
    ganancia.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + (long ? 0.5 : 0.1));
    oscilador.start(audioContext.currentTime);
    oscilador.stop(audioContext.currentTime + (long ? 0.5 : 0.1));
  } catch {
    vibrar(long ? 300 : 100);
  }
}

export function initializeCardio(): void {
  // Las vistas se crean al vuelo; no hay nada que montar al arrancar.
}
