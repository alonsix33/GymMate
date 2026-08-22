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
  alturaDeNivel,
  duracionTotal,
  escalar,
  estadoDeNivel,
  formatearTiempo,
  offsetDelAnillo,
  ritmoEmom,
} from '@/utils/cardio-calc';

// ==========================================
// ESTADO
// ==========================================

let timerInterval: ReturnType<typeof setInterval> | null = null;
let audioContext: AudioContext | null = null;
let amrapRounds = 0;
let presetActivo = 'media';
let ultimoXP: number | null = null;

const RADIO_ANILLO = 104; // [REF Pantallas:399]

const DEFAULT_CONFIGS: Record<CardioMode, CardioConfig> = {
  tabata: { rounds: 8, work: 20, rest: 10 },
  emom: { rounds: 10, interval: 60, reps: 10 },
  amrap: { duration: 720, exercises: [] },
  circuit: { rounds: 3, work: 40, rest: 20, roundRest: 60, exercises: [] },
  pyramid: { levels: [...PIRAMIDE_MEDIA], rest: DESCANSO_PIRAMIDE },
  custom: { rounds: 5, work: 30, rest: 15 },
};

const MODOS: Array<{ id: CardioMode; tag: string; nombre: string; desc: string }> = [
  { id: 'tabata', tag: 'TB', nombre: 'Tabata', desc: '20s trabajo / 10s descanso × 8 rondas' },
  { id: 'emom', tag: 'EM', nombre: 'EMOM', desc: 'cada minuto, al minuto' },
  { id: 'amrap', tag: 'AM', nombre: 'AMRAP', desc: 'tantas rondas como puedas' },
  { id: 'circuit', tag: 'CI', nombre: 'Circuito', desc: 'ejercicios en secuencia · descanso entre rondas' },
  { id: 'pyramid', tag: 'PI', nombre: 'Pirámide', desc: 'intervalos ascendentes y descendentes' },
  { id: 'custom', tag: 'PR', nombre: 'Personalizado', desc: 'configura tu propio intervalo' },
];

const NOMBRE_MODO: Record<CardioMode, string> = {
  tabata: 'TABATA',
  emom: 'EMOM',
  amrap: 'AMRAP',
  circuit: 'CIRCUITO',
  pyramid: 'PIRÁMIDE',
  custom: 'PERSONALIZADO',
};

const SUB_MODO: Record<CardioMode, string> = {
  tabata: '20s trabajo / 10s descanso × 8 rondas',
  emom: 'cada minuto, al minuto — lo que sobra es tu descanso',
  amrap: 'tantas rondas como puedas en el tiempo límite',
  circuit: 'ejercicios en secuencia · descanso entre rondas',
  pyramid: 'intervalos ascendentes y descendentes',
  custom: 'tu propio intervalo de trabajo y descanso',
};

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
  cardioState.config = { ...DEFAULT_CONFIGS[mode] };
  if (mode === 'pyramid') presetActivo = 'media';
  showCardioConfig();
}

// ==========================================
// C-02, C-05, C-07, C-08 · CONFIGURACIÓN
// ==========================================

function stepper(clave: keyof CardioConfig, paso: number, valor: number, unidad = '', compacto = false): string {
  return `
    <div class="f-stepper ${compacto ? 'f-stepper--compacto' : 'f-stepper--cardio'}">
      <button type="button" class="f-stepper__btn" data-cardio="menos" data-clave="${clave}" data-paso="${paso}" aria-label="Bajar">−</button>
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

function pieDeTotal(etiqueta: string, valor: string): string {
  return `
    <div class="f-cardio__total">
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
  return campo('DURACIÓN (MIN)', stepper('duration', 60, Math.round((config.duration ?? 720) / 60)));
}

function configEmom(config: CardioConfig): string {
  const trabajo = ritmoEmom(getHistory());
  const pct = trabajo ? Math.max(10, Math.min(90, Math.round((trabajo / 60) * 100))) : null;
  const barra =
    pct === null
      ? `<span class="f-emom__nota">Todavía no hay una sesión EMOM con la que estimar tu ritmo. Después de la primera, aquí verás cuánto del minuto te queda para respirar.</span>`
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
            <div class="f-nivel__barra${n === pico ? ' f-nivel__barra--pico' : ''}" style="height:${alturaDeNivel(
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
        <button type="button" class="f-montana__accion" data-cardio="escalar" data-factor="0.8">Escalar ↓</button>
        <button type="button" class="f-montana__accion" data-cardio="escalar" data-factor="1.25">Escalar ↑</button>
      </div>
      <span class="f-montana__nota">Escala toda la montaña — los ${
        niveles.length
      } niveles se recalculan en proporción. En el timer, el nivel activo late en Fragua y los superados quedan en brasa.</span>
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
            <span class="f-estacion__detalle">${e.target} ${e.type === 'reps' ? 'reps' : 'segundos'}</span>
          </div>
          <button type="button" class="f-estacion__quitar" data-cardio="quitar-estacion" data-indice="${i}" aria-label="Quitar ${escapar(
            e.name
          )}">✕</button>
        </div>
      </div>`
    )
    .join('');

  const opciones = getCardioExerciseNames()
    .map((n) => `<option value="${escapar(n)}">${escapar(n)}</option>`)
    .join('');

  return `
    <div class="f-circuito">
      ${filas}
      <div class="f-estacion">
        <div class="f-estacion__eje">
          <button type="button" class="f-estacion__anadir" data-cardio="anadir-estacion" aria-label="Agregar ejercicio">+</button>
        </div>
        <label class="f-estacion__anadir-texto" for="cardioNuevaEstacion">Agregar ejercicio</label>
      </div>
      <select id="cardioNuevaEstacion" class="f-graf__selector" data-cardio="nueva-estacion" aria-label="Ejercicio a agregar">
        <option value="">— elige un ejercicio —</option>
        ${opciones}
      </select>
    </div>
    <div class="f-cardio__dos-campos">
      ${campo('RONDAS', stepper('rounds', 1, config.rounds ?? 3, '', true), true)}
      ${campo('DESCANSO ENTRE RONDAS', stepper('roundRest', 15, config.roundRest ?? 60, 's', true), true)}
    </div>
    <div class="f-cardio__dos-campos">
      ${campo('TRABAJO (S)', stepper('work', 5, config.work ?? 40, '', true), true)}
      ${campo('DESCANSO (S)', stepper('rest', 5, config.rest ?? 20, '', true), true)}
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
      pie = pieDeTotal('Duración total', `${formatearTiempo(duracionTotal(mode, config))} min`);
      break;
    case 'custom':
      cuerpo = configCustom(config);
      pie = pieDeTotal('Duración total', `${formatearTiempo(duracionTotal(mode, config))} min`);
      break;
    case 'amrap':
      cuerpo = configAmrap(config);
      pie = pieDeTotal('Duración total', `${formatearTiempo(duracionTotal(mode, config))} min`);
      break;
    case 'emom':
      cuerpo = configEmom(config);
      pie = '';
      break;
    case 'pyramid':
      cuerpo = configPiramide(config);
      pie = pieDeTotal(
        `Total · ${(config.levels ?? PIRAMIDE_MEDIA).length} niveles + descansos`,
        `${formatearTiempo(duracionTotal(mode, config))} min`
      );
      break;
    case 'circuit': {
      cuerpo = configCircuito(config);
      const estaciones = (config.exercises ?? []).length;
      pie = pieDeTotal(
        `${estaciones} ${estaciones === 1 ? 'estación' : 'estaciones'} × ${config.rounds ?? 3} rondas`,
        `~${formatearTiempo(duracionTotal(mode, config))} min`
      );
      break;
    }
  }

  const comenzar =
    mode === 'emom'
      ? botonComenzar(`Comenzar EMOM · ${config.rounds ?? 10} min`)
      : botonComenzar();

  v.innerHTML = `
    <div class="f-cardio f-cardio--config f-root">
      <div class="f-cardio__cabecera">
        <button type="button" class="f-sesion__volver" data-cardio="volver-selector" aria-label="Volver al selector">←</button>
        <div class="f-cardio__titulos">
          <span class="f-cardio__titulo">${NOMBRE_MODO[mode]}</span>
          <span class="f-cardio__sub">${escapar(SUB_MODO[mode])}</span>
        </div>
      </div>
      ${cuerpo}
      ${pie}
      ${comenzar}
    </div>
  `;
  enganchar(v, alTocarCardio);
  const selector = v.querySelector<HTMLSelectElement>('[data-cardio="nueva-estacion"]');
  selector?.addEventListener('change', () => {
    if (!selector.value) return;
    const lista = cardioState.config.exercises ?? [];
    lista.push({ name: selector.value, target: cardioState.config.work ?? 40, type: 'time' });
    cardioState.config.exercises = lista;
    showCardioConfig();
  });
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
  const minimo = MINIMOS[key] ?? 0;
  (config as Record<string, number>)[key] = Math.max(minimo, actual + delta);
  showCardioConfig();
}

export function setCardioExercise(exercise: string): void {
  cardioState.config.exercise = exercise;
}

export function adjustPyramidLevel(action: string): void {
  const niveles = cardioState.config.levels ?? [...PIRAMIDE_MEDIA];
  if (PRESETS_PIRAMIDE[action]) {
    cardioState.config.levels = [...PRESETS_PIRAMIDE[action]];
    presetActivo = action === 'reset' ? 'media' : action;
  } else if (action === 'scale_up') {
    cardioState.config.levels = escalar(niveles, 1.25);
    presetActivo = '';
  } else if (action === 'scale_down') {
    cardioState.config.levels = escalar(niveles, 0.8);
    presetActivo = '';
  }
  showCardioConfig();
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
  const intervalo = setInterval(() => {
    cuenta--;
    if (cuenta < 0) {
      clearInterval(intervalo);
      onComplete();
      return;
    }
    pintar();
  }, 1000);
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
}

export function incrementAmrapRound(): void {
  amrapRounds++;
  const el = document.getElementById('amrapCounter');
  if (el) el.textContent = String(amrapRounds);
  playBeep(false);
}

// ==========================================
// MOTOR DEL TEMPORIZADOR
// ==========================================

function startTimer(): void {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (cardioState.isPaused) return;

    cardioState.timeRemaining--;
    cardioState.totalTimeElapsed++;
    if (cardioState.currentPhase === 'work' || cardioState.currentPhase === 'emom') {
      cardioState.workTimeTotal++;
    } else {
      cardioState.restTimeTotal++;
    }

    actualizarReloj();

    if (cardioState.timeRemaining <= 0) {
      handlePhaseEnd();
      return;
    }
    if (cardioState.timeRemaining <= 3) playBeep();
  }, 1000);
}

function handlePhaseEnd(): void {
  const config = cardioState.config;
  const mode = cardioState.mode;
  const totalRondas = config.rounds ?? 8;

  playBeep(true);
  vibrar(200);

  if (mode === 'amrap') {
    finishCardioWorkout();
    return;
  }

  if (mode === 'emom') {
    if (cardioState.currentRound >= totalRondas) {
      finishCardioWorkout();
      return;
    }
    cardioState.currentRound++;
    cardioState.timeRemaining = config.interval ?? 60;
    renderTimerView();
    return;
  }

  if (mode === 'pyramid') {
    const niveles = config.levels ?? PIRAMIDE_MEDIA;
    if (cardioState.currentPhase === 'work') {
      // El ultimo nivel no lleva descanso detras.
      if (cardioState.currentExerciseIndex >= niveles.length - 1) {
        finishCardioWorkout();
        return;
      }
      cardioState.currentPhase = 'rest';
      cardioState.timeRemaining = config.rest ?? DESCANSO_PIRAMIDE;
    } else {
      cardioState.currentExerciseIndex++;
      cardioState.currentRound = cardioState.currentExerciseIndex + 1;
      cardioState.currentPhase = 'work';
      cardioState.timeRemaining = niveles[cardioState.currentExerciseIndex];
    }
    renderTimerView();
    return;
  }

  // Ciclos completos trabajo+descanso: el ultimo descanso tambien se corre,
  // que es lo que hace un Tabata de 4:00 y lo que dice el pie de C-02.
  if (cardioState.currentPhase === 'work') {
    cardioState.currentPhase = 'rest';
    cardioState.timeRemaining = config.rest ?? 10;
  } else {
    if (cardioState.currentRound >= totalRondas) {
      finishCardioWorkout();
      return;
    }
    cardioState.currentRound++;
    cardioState.currentPhase = 'work';
    cardioState.timeRemaining = config.work ?? 20;
  }
  renderTimerView();
}

/** Parche por segundo: repintar entero cada tick tira la animacion del anillo. */
function actualizarReloj(): void {
  const reloj = document.getElementById('cardioTimer');
  if (reloj) reloj.textContent = formatearTiempo(cardioState.timeRemaining);
  const arco = document.getElementById('cardioAnillo');
  if (arco) {
    arco.setAttribute(
      'stroke-dashoffset',
      String(offsetDelAnillo(cardioState.timeRemaining, totalDeLaFase(), RADIO_ANILLO))
    );
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
  const total = totalDeLaFase();
  const c = 2 * Math.PI * RADIO_ANILLO;

  let sub = '';
  if (mode === 'amrap') sub = `quedan ${formatearTiempo(cardioState.timeRemaining)}`;
  else if (mode === 'emom') sub = `minuto ${cardioState.currentRound} de ${config.rounds ?? 10}`;
  else sub = `ronda ${cardioState.currentRound} de ${config.rounds ?? 8}`;

  const rondasTotales = mode === 'amrap' ? 0 : config.rounds ?? 8;
  const marcas =
    rondasTotales > 0 && rondasTotales <= 20
      ? `<div class="f-rondas" aria-hidden="true">${Array.from({ length: rondasTotales }, (_, i) => {
          const clase =
            i + 1 < cardioState.currentRound
              ? ' f-rondas__marca--hecha'
              : i + 1 === cardioState.currentRound
                ? ' f-rondas__marca--actual'
                : '';
          return `<span class="f-rondas__marca${clase}"></span>`;
        }).join('')}</div>`
      : '';

  // En AMRAP el protagonista son las rondas, no el reloj.
  const centro =
    mode === 'amrap'
      ? `
        <button type="button" class="f-amrap-vivo" data-cardio="ronda-amrap" aria-label="Sumar una ronda">
          <span class="f-amrap-vivo__cifra" id="amrapCounter">${amrapRounds}</span>
          <span class="f-amrap-vivo__label">RONDAS · TOCA PARA SUMAR</span>
        </button>`
      : '';

  return `
    <div class="f-cardio f-cardio--timer f-root">
      <span class="f-fase${descanso ? ' f-fase--descanso' : ''}">${etiquetaFase}</span>
      <div class="f-anillo">
        <svg class="f-anillo__svg" viewBox="0 0 230 230" width="230" height="230" aria-hidden="true">
          <circle class="f-anillo__pista" cx="115" cy="115" r="${RADIO_ANILLO}"></circle>
          <circle
            class="f-anillo__avance"
            id="cardioAnillo"
            cx="115" cy="115" r="${RADIO_ANILLO}"
            stroke-dasharray="${c.toFixed(0)}"
            stroke-dashoffset="${offsetDelAnillo(cardioState.timeRemaining, total, RADIO_ANILLO).toFixed(0)}"
          ></circle>
        </svg>
        <div class="f-anillo__centro">
          <span class="f-anillo__tiempo" id="cardioTimer" role="timer">${formatearTiempo(
            cardioState.timeRemaining
          )}</span>
          <span class="f-anillo__sub">${escapar(sub)}</span>
        </div>
      </div>
      ${centro}
      ${marcas}
      ${controles()}
      <span class="f-cardio__pie">BEEP EN 3-2-1 · VIBRACIÓN AL CAMBIO DE FASE</span>
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

  const barras = niveles
    .map((n, i) => {
      const estado = estadoDeNivel(i, actual);
      return `
      <div class="f-nivel">
        <span class="f-nivel__seg">${n}</span>
        <div class="f-nivel__barra f-nivel__barra--${estado}" style="height:${alturaDeNivel(n, pico)}%"></div>
      </div>`;
    })
    .join('');

  return `
    <div class="f-cardio f-cardio--piramide f-root">
      <div class="f-piramide__cabecera">
        <span class="f-piramide__nombre">PIRÁMIDE${presetActivo ? ` · ${presetActivo.toUpperCase()}` : ''}</span>
        <span class="f-piramide__fase${descanso ? ' f-piramide__fase--descanso' : ''}">${
          descanso ? 'DESCANSO' : 'TRABAJO'
        }</span>
      </div>
      <div class="f-piramide__reloj">
        <span class="f-piramide__tiempo" id="cardioTimer" role="timer">${formatearTiempo(
          cardioState.timeRemaining
        )}</span>
        <span class="f-piramide__sub">nivel ${actual + 1} de ${niveles.length}${
          esPico ? ' · el pico' : ''
        } · ${niveles[actual]}s</span>
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
  renderTimerView();
}

export async function stopCardioWorkout(): Promise<void> {
  const terminar = await confirmarDestructivo({
    titulo: '¿Terminar el cardio?',
    cuerpo: 'La sesión se cierra donde está y se guarda con el tiempo hecho hasta ahora.',
    cancelar: 'Seguir',
    confirmar: 'Terminar',
  });
  if (terminar) finishCardioWorkout();
}

// ==========================================
// C-04 · CIERRE Y RESUMEN
// ==========================================

function finishCardioWorkout(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const stats: CardioSessionStats = {
    totalTime: cardioState.totalTimeElapsed,
    workTime: cardioState.workTimeTotal,
    restTime: cardioState.restTimeTotal,
    roundsCompleted: cardioState.mode === 'amrap' ? amrapRounds : cardioState.currentRound,
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
    ultimoXP = processCompletedCardioSession(sesion).totalXP;
  } catch (e) {
    console.error('No se pudo procesar el XP del cardio', e);
    ultimoXP = null;
  }

  showCardioSummary(stats);
}

function estimateCalories(workSeconds: number): number {
  // ~10 kcal por minuto de trabajo de alta intensidad.
  return Math.round((workSeconds / 60) * 10);
}

function showCardioSummary(stats: CardioSessionStats): void {
  hideAllCardioViews();
  const v = vista('cardioSummaryView');
  if (!v) return;
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
        <span class="f-cardio__resumen-label">${NOMBRE_MODO[mode]} COMPLETADO</span>
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
