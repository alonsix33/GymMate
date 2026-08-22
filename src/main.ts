import './styles/fonts.css';
import { registrarNavegacionDePerfil } from '@/ui/perfil';
import './styles/tokens.css';
// FIERRO va DESPUES del CSS legacy: durante la migracion tiene que ganar la
// cascada sin subir especificidad con !important.
import './styles/fierro.css';
import {
  inicializarFeedback,
  mostrarToast,
  mostrarToastDeshacer,
  confirmarAccion,
} from '@/ui/feedback';
import { initializeNavigation, showHome, switchTab, resumeDraft, dismissDraft, renderizarHome } from '@/ui/navigation';
import {
  initCoachSession,
  updateCoachOnSessionLoad,
  updateCoachOnExerciseUpdate,
  updateCoachOnExerciseComplete,
} from '@/features/coach';
import { usarAdaptador, adaptadorActual } from '@/features/coach-ia';
import { mostrarGuiaEjercicio } from '@/ui/session-screens';
import { initializeTimerListeners, openRestTimerModal } from '@/features/timer';
import { loadHistory, loadPRs, exportToExcel, deleteHistoryItem, triggerCSVImport } from '@/features/history';
import {
  loadTrainingGroup,
  updateEjercicio,
  incrementInput,
  decrementInput,
  toggleCompletado,
  saveWorkout,
  finishWorkout,
  activarEjercicioOpcional,
  abrirGuia,
  responderRPE,
  reabrirRPE,
  confirmRPE,
  skipRPE,
} from '@/features/workout';
import { initGamification, reinitGamification } from '@/features/gamification';
import { abrirProgreso, cerrarProgreso } from '@/ui/progreso';
import { abrirBuilder, cerrarBuilder } from '@/ui/builder';
import {
  showCardioSelector,
  selectCardioMode,
  showCardioConfig,
  adjustCardioConfig,
  setCardioExercise,
  adjustPyramidLevel,
  startCardioWorkout,
  toggleCardioPause,
  stopCardioWorkout,
  incrementAmrapRound,
} from '@/features/cardio';
import { saveCustomWorkouts, getCustomWorkouts, deleteCustomWorkout } from '@/utils/storage';

// ==========================================
// WORKOUT BUILDER STATE
// ==========================================
//
// El estado del builder vive ahora dentro de `src/ui/builder.ts`, que es quien
// lo usa. Aqui era un global que cualquiera podia tocar.

// ==========================================
// EXPONER FUNCIONES AL WINDOW (para onclick)
// ==========================================

declare global {
  interface Window {
    // Navigation
    showHome: typeof showHome;
    switchTab: typeof switchTab;
    resumeDraft: typeof resumeDraft;
    dismissDraft: typeof dismissDraft;

    // Workout
    loadTrainingGroup: typeof loadTrainingGroup;
    updateEjercicio: typeof updateEjercicio;
    incrementInput: typeof incrementInput;
    decrementInput: typeof decrementInput;
    toggleCompletado: typeof toggleCompletado;
    saveWorkout: typeof saveWorkout;
    finishWorkout: typeof finishWorkout;

    // RPE
    confirmRPE: typeof confirmRPE;
    skipRPE: typeof skipRPE;

    // Modals

    // Timer
    openRestTimerModal: typeof openRestTimerModal;

    // History
    deleteHistoryItem: typeof deleteHistoryItem;
    exportToExcel: typeof exportToExcel;
    importFromCSV: typeof triggerCSVImport;

    // Custom Workouts
    deleteCustomWorkout: typeof handleDeleteCustomWorkout;
    openWorkoutBuilder: typeof abrirBuilder;
    closeWorkoutBuilder: typeof cerrarBuilder;

    // Cardio
    showCardioSelector: typeof showCardioSelector;
    selectCardioMode: typeof selectCardioMode;
    showCardioConfig: typeof showCardioConfig;
    adjustCardioConfig: typeof adjustCardioConfig;
    setCardioExercise: typeof setCardioExercise;
    adjustPyramidLevel: typeof adjustPyramidLevel;
    startCardioWorkout: typeof startCardioWorkout;
    toggleCardioPause: typeof toggleCardioPause;
    stopCardioWorkout: typeof stopCardioWorkout;
    incrementAmrapRound: typeof incrementAmrapRound;

    // Body Measurements

    // Gamification
    showGamificationModal: typeof abrirProgreso;
    hideGamificationModal: typeof cerrarProgreso;
    recalculateXP: () => void;
  }
}

// ==========================================
// HANDLER PARA ELIMINAR RUTINAS PERSONALIZADAS
// ==========================================

function handleDeleteCustomWorkout(workoutId: string): void {
  // F-01: borrado reversible. La rutina desaparece de la vista al instante y
  // solo se borra de verdad cuando expira la cuenta atras.
  const rutinas = getCustomWorkouts();
  const posicion = rutinas.findIndex((w) => w.id === workoutId);
  if (posicion === -1) return;
  const rutina = rutinas[posicion];
  const restaurar = () => {
    // Vuelve a SU sitio: addCustomWorkout hace push y la rutina reaparecia al
    // final de la lista, que no es deshacer, es mover.
    const actuales = getCustomWorkouts();
    actuales.splice(Math.min(posicion, actuales.length), 0, rutina);
    saveCustomWorkouts(actuales);
    renderizarHome();
  };
  deleteCustomWorkout(workoutId);
  renderizarHome();
  mostrarToastDeshacer({
    titulo: `${rutina.nombre} eliminada`,
    alDeshacer: restaurar,
  });
}

window.showHome = showHome;
window.switchTab = switchTab;
window.resumeDraft = resumeDraft;
window.dismissDraft = dismissDraft;
window.loadTrainingGroup = loadTrainingGroup;
window.updateEjercicio = updateEjercicio;
window.incrementInput = incrementInput;
window.decrementInput = decrementInput;
window.toggleCompletado = toggleCompletado;
window.saveWorkout = saveWorkout;
window.finishWorkout = finishWorkout;
window.confirmRPE = confirmRPE;
window.skipRPE = skipRPE;
window.openRestTimerModal = openRestTimerModal;
window.deleteHistoryItem = deleteHistoryItem;
window.exportToExcel = exportToExcel;
window.importFromCSV = triggerCSVImport;
window.deleteCustomWorkout = handleDeleteCustomWorkout;
window.openWorkoutBuilder = abrirBuilder;
window.closeWorkoutBuilder = cerrarBuilder;
window.showCardioSelector = showCardioSelector;
window.selectCardioMode = selectCardioMode;
window.showCardioConfig = showCardioConfig;
window.adjustCardioConfig = adjustCardioConfig;
window.setCardioExercise = setCardioExercise;
window.adjustPyramidLevel = adjustPyramidLevel;
window.startCardioWorkout = startCardioWorkout;
window.toggleCardioPause = toggleCardioPause;
window.stopCardioWorkout = stopCardioWorkout;
window.incrementAmrapRound = incrementAmrapRound;
// GM-01 se abre desde PROGRESO en la tab bar. El nombre global se conserva
// porque index.html y navigation.ts lo llaman por ahi.
window.showGamificationModal = abrirProgreso;
window.hideGamificationModal = cerrarProgreso;

// Utility to recalculate all XP from history (for recovery)
window.recalculateXP = (): void => {
  void confirmarAccion({
    titulo: '¿Recalcular el XP?',
    cuerpo: 'Se reconstruye desde tu historial completo. No se pierde nada; la app se recarga al terminar.',
    cancelar: 'Ahora no',
    confirmar: 'Recalcular',
  }).then((recalcular) => {
    if (!recalcular) return;
    reinitGamification();
    mostrarToast({ tipo: 'exito', titulo: 'XP recalculado', detalle: 'Recargando…' });
    window.setTimeout(() => window.location.reload(), 900);
  });
};

// ==========================================
// B-01 · BUILDER DE RUTINAS
// ==========================================
//
// El builder legacy vivia aqui: ~440 lineas de `innerHTML` con un mapa de
// colores por grupo (`from-blue-500/10`, `border-emerald-500/30`…), handlers
// `onclick=` con el nombre del ejercicio interpolado en una cadena, y tres
// funciones de repintado que se llamaban entre si. No reutilizaba nada del
// sistema. B-01 lo sustituye entero: `src/ui/builder.ts`.

// ==========================================
// MANEJO DEL TECLADO VIRTUAL
// ==========================================

/**
 * Con el teclado virtual abierto, la tab bar taparia los campos de sets, reps
 * y peso: se oculta mientras el foco este en un campo numerico.
 *
 * No basta con escuchar `focusout` sobre inputs. Chrome NO desenfoca un
 * elemento que pasa a `opacity:0`, asi que al cerrar un modal con la tecla
 * "Listo" del teclado numerico el evento no llegaba nunca y el usuario se
 * quedaba sin barra inferior hasta tocar la pantalla. Aqui se decide siempre
 * desde el estado real: si el elemento con el foco es un campo numerico
 * VISIBLE, la barra se esconde; en cualquier otro caso, vuelve.
 */
function initializeKeyboardHandler(): void {
  const barra = document.querySelector('.f-tabbar') as HTMLElement | null;
  if (!barra) return;

  const esCampoNumericoVisible = (el: Element | null): boolean => {
    if (!(el instanceof HTMLInputElement)) return false;
    const tipo = el.getAttribute('type');
    const modo = el.getAttribute('inputmode');
    if (tipo !== 'number' && modo !== 'numeric' && modo !== 'decimal') return false;
    // offsetParent nulo = display:none o fuera del flujo; el modal cerrado se
    // queda con opacity 0 y pointer-events none, asi que tambien se comprueba.
    if (!el.offsetParent) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.opacity !== '0' && cs.pointerEvents !== 'none';
  };

  const sincronizar = () => {
    const ocultar = esCampoNumericoVisible(document.activeElement);
    barra.style.display = ocultar ? 'none' : '';
    // El body reserva el alto de la barra; ocultarla sin soltar la reserva
    // dejaba 81px muertos bajo el campo con el teclado abierto.
    document.body.classList.toggle('f-sin-tabbar', ocultar);
  };

  // `focusout` llega antes de que el foco cambie: se difiere un tick.
  const sincronizarDiferido = () => setTimeout(sincronizar, 0);

  document.addEventListener('focusin', sincronizar);
  document.addEventListener('focusout', sincronizarDiferido);
  // Redes de seguridad para los casos en que el foco NO se mueve: cerrar un
  // modal con Enter, o tocar fuera.
  document.addEventListener('click', sincronizarDiferido);
  document.addEventListener('submit', sincronizarDiferido);
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') sincronizarDiferido();
  });
}

// ==========================================
// EVENT DELEGATION
// ==========================================

function initializeEventDelegation(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // W-01: toda la pantalla de sesion pasa por aqui. Delegacion, no un
    // listener por boton: la pantalla se repinta entera en cada cambio
    // estructural y los listeners directos se perderian con ella.
    const accion = target.closest<HTMLElement>('[data-sesion]');
    if (accion) {
      manejarAccionDeSesion(accion);
      return;
    }
  });

  // Los steppers escriben en un <input>: hay que escuchar el teclado tambien,
  // no solo los botones.
  document.addEventListener('change', (e) => {
    const campo = (e.target as HTMLElement)?.closest<HTMLElement>('[data-sesion="valor"]');
    if (campo) updateEjercicio(Number(campo.dataset.indice));
  });
}

const PASO_STEPPER: Record<string, number> = { sets: 1, reps: 1, peso: 1 };

function manejarAccionDeSesion(el: HTMLElement): void {
  const indice = Number(el.dataset.indice);
  switch (el.dataset.sesion) {
    case 'volver':
      void showHome();
      break;
    case 'descanso':
      openRestTimerModal();
      break;
    case 'menos':
    case 'mas': {
      const campo = el.dataset.campo ?? 'sets';
      const input = document.getElementById(`${campo}-${indice}`) as HTMLInputElement | null;
      if (!input) break;
      const paso = PASO_STEPPER[campo] ?? 1;
      const actual = parseFloat(input.value) || 0;
      input.value = String(Math.max(0, el.dataset.sesion === 'mas' ? actual + paso : actual - paso));
      updateEjercicio(indice);
      break;
    }
    case 'completar':
      toggleCompletado(indice);
      break;
    case 'activar-opcional':
      activarEjercicioOpcional(indice);
      break;
    case 'guia':
      abrirGuia(indice);
      break;
    case 'rpe':
      responderRPE(indice, Number(el.dataset.valor));
      break;
    case 'rpe-omitir':
      responderRPE(indice, null);
      break;
    case 'rpe-abrir':
      reabrirRPE(indice);
      break;
    case 'guardar':
      saveWorkout();
      break;
    case 'terminar':
      void finishWorkout();
      break;
  }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

/**
 * Ganchos SOLO para las puertas de verificacion.
 *
 * No cuelgan de ningun boton ni cambian nada de la app: existen para que la
 * puerta pueda disparar los nueve mensajes del coach y abrir la guia de un
 * ejercicio que no esta en la base. Sin ellos, la puerta miraba el `innerText`
 * en un instante y se le escapaban ocho de los nueve textos.
 */
function exponerGanchosDeVerificacion(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__coachDePrueba = {
    initCoachSession,
    updateCoachOnSessionLoad,
    updateCoachOnExerciseUpdate,
    updateCoachOnExerciseComplete,
    // El adaptador local nunca falla ni tarda, asi que CO-02 (PENSANDO →
    // streaming) y CO-03 (sin conexion) no se podian alcanzar desde fuera:
    // eran dos pantallas del handoff sin una sola comprobacion. Esto deja
    // instalar uno lento o uno que revienta. No lo llama nadie mas.
    usarAdaptador,
    adaptadorActual,
  };
  w.__guiaDePrueba = { mostrarGuiaEjercicio };
}

function init(): void {
  // FIERRO: toasts y confirmaciones. Va primero para que cualquier fallo
  // posterior tenga como reportarse sin recurrir a alert().
  inicializarFeedback();
  // La navegacion entre Perfil, Medidas, Calculadoras, Records y Graficos la
  // resuelve main.ts, que es quien conoce los contenedores; el modulo de
  // render solo dice a donde quiere ir.
  registrarNavegacionDePerfil((destino) => {
    switchTab(
      destino === 'medidas'
        ? 'medidas'
        : destino === 'calculadoras'
          ? 'calculators'
          : destino === 'records'
            ? 'prs'
            : destino === 'graficos'
              ? 'charts'
              : 'profile'
    );
  });

  exponerGanchosDeVerificacion();

  // Inicializar iconos Lucide

  // Inicializar navegación
  initializeNavigation();

  // Inicializar modales

  // Inicializar timer
  initializeTimerListeners();

  // Inicializar gamificacion (migrando datos existentes si es necesario)
  initGamification();

  // Cargar historial y PRs
  loadHistory();
  loadPRs();

  // Mostrar home por defecto
  void showHome();

  // Ocultar bottom nav cuando el teclado virtual está activo
  initializeKeyboardHandler();

  // Event delegation para botones
  initializeEventDelegation();

  // Refrescar iconos después de renderizar
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// El service worker lo registra vite-plugin-pwa (registerSW.js inyectado en
// index.html). Registrarlo tambien a mano era un duplicado sin dueno claro.

// Limpieza de una sola vez: los caches de runtime de Google Fonts que dejo la
// version anterior. cleanupOutdatedCaches solo borra precaches viejos de
// Workbox, no los de runtimeCaching, asi que sin esto sobreviven para siempre
// (200-400 KiB muertos) y presionan la cuota del dispositivo, que es justo lo
// que puede hacer que el navegador desaloje el precache que si importa.
// FIERRO: 'legacy-google-fonts' se retira en la fase 9 junto con esta limpieza.
const CACHES_HUERFANOS = ['google-fonts-cache', 'gstatic-fonts-cache'];
if ('caches' in window) {
  window.addEventListener('load', () => {
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((k) => CACHES_HUERFANOS.includes(k)).map((k) => caches.delete(k)))
      )
      .catch(() => {
        /* offline-first: si falla, no pasa nada y no bloquea nada */
      });
  });
}
