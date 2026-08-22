import { renderHome } from '@/ui/home';
import { cifra } from '@/utils/formato';
import { confirmarAccion, confirmarDestructivo, mostrarToast } from '@/ui/feedback';
import type { ExerciseData, TabName } from '@/types';
import { saveDraftNow, sessionData, hasUnsavedData, checkForExistingDraft, restoreFromDraft, endSession } from '@/state/session';
import { loadHistory, loadPRs } from '@/features/history';
import { abrirDetalle } from '@/ui/hueso';
import { initializeCharts } from '@/features/charts';
import { initializeCalculators } from '@/features/calculators';
import { loadProfile, loadMedidas } from '@/features/profile';

// ==========================================
// NAVEGACIÓN ENTRE TABS
// ==========================================

export function switchTab(tabName: TabName): void {
  // Ocultar home view
  const homeView = document.getElementById('homeView');
  if (homeView) {
    homeView.classList.add('hidden');
  }

  // Ocultar todas las vistas de cardio
  hideCardioViews();

  // Ocultar todos los tabs
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.add('hidden');
    tab.classList.remove('active');
  });

  // Mostrar el tab seleccionado
  const selectedTab = document.getElementById(tabName + 'Tab');
  if (selectedTab) {
    selectedTab.classList.remove('hidden');
    selectedTab.classList.add('active');
  }

  // Scroll al inicio
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Actualizar navegación inferior
  updateBottomNav(tabName);

  // Cargar datos específicos del tab
  loadTabData(tabName);

  // Refrescar iconos
}

/**
 * Describe la sesion en curso con datos reales para las confirmaciones.
 * No se inventan minutos: SessionData no guarda hora de inicio, asi que se
 * cuenta lo que si existe — sets registrados y volumen.
 */
function describirEjercicios(ejercicios: ExerciseData[], volumenTotal: number): string {
  const sets = ejercicios.reduce((total, e) => total + (e.sets || 0), 0);
  if (!sets) return 'Sin sets registrados todavía.';
  const kg = cifra(volumenTotal);
  return `${sets} ${sets === 1 ? 'set' : 'sets'} y ${kg} kg registrados.`;
}

function describirSesionEnCurso(): string {
  return describirEjercicios(sessionData.ejercicios ?? [], sessionData.volumenTotal);
}

/**
 * Lo que se va a perder al descartar es el BORRADOR PERSISTIDO, no la sesion
 * en memoria. La tarjeta que dispara el descarte se pinta al arrancar la app,
 * cuando sessionData esta vacio por definicion: describir sessionData decia
 * "Sin sets registrados todavia" justo antes de borrar una sesion entera.
 */
function describirBorrador(): string {
  const { draft } = checkForExistingDraft();
  if (!draft) return describirSesionEnCurso();
  return describirEjercicios(draft.ejercicios ?? [], draft.volumenTotal);
}

/** Pinta H-01 dentro de #fierroHome y engancha sus acciones. */
export function renderizarHome(): void {
  const contenedor = document.getElementById('fierroHome');
  if (!contenedor) return;
  // Repintar destruye el nodo que tenia el foco (el boton que disparo la
  // accion). Sin recogerlo, el foco cae a <body> y el teclado empieza otra vez
  // desde el principio de la pagina.
  const teniaFoco = contenedor.contains(document.activeElement);
  renderHome(contenedor);
  if (teniaFoco && (document.activeElement === document.body || !document.activeElement)) {
    // Sin preventScroll el navegador lleva el foco a la vista y la lista da
    // un salto de 81px bajo el dedo justo despues de borrar.
    document.getElementById('main-content')?.focus?.({ preventScroll: true });
  }
  if (contenedor.dataset.enganchado !== 'si') {
    // Delegacion: un solo listener que sobrevive a cada repintado.
    contenedor.addEventListener('click', alTocarHome);
    contenedor.dataset.enganchado = 'si';
  }
}

function alTocarHome(evento: Event): void {
  const objetivo = (evento.target as HTMLElement)?.closest<HTMLElement>('[data-accion],[data-grupo],[data-custom-workout],[data-eliminar-rutina]');
  if (!objetivo) return;

  const rutinaPropia = objetivo.dataset.customWorkout;
  const eliminar = objetivo.dataset.eliminarRutina;
  const grupo = objetivo.dataset.grupo;

  if (eliminar) {
    (window as unknown as { deleteCustomWorkout?: (id: string) => void }).deleteCustomWorkout?.(eliminar);
    return;
  }
  if (grupo || rutinaPropia) {
    const id = (grupo ?? rutinaPropia) as string;
    void import('@/features/workout')
      .then(({ loadTrainingGroup }) => loadTrainingGroup(id))
      .then((cargada) => cargada && switchTab('workout'))
      .catch((e) => console.error('No se pudo cargar la rutina', e));
    return;
  }

  switch (objetivo.dataset.accion) {
    case 'continuar':
      void resumeDraft();
      break;
    case 'descartar':
      void dismissDraft();
      break;
    case 'progreso':
      (window as unknown as { showGamificationModal?: () => void }).showGamificationModal?.();
      break;
    case 'cardio':
      (window as unknown as { showCardioSelector?: () => void }).showCardioSelector?.();
      break;
    case 'coach':
      void import('@/ui/coach-chat').then(({ abrirCoach }) =>
        abrirCoach(objetivo.dataset.mensaje || undefined)
      );
      break;
    case 'importar':
      (window as unknown as { importFromCSV?: () => void }).importFromCSV?.();
      break;
  }
}

export async function showHome(): Promise<void> {
  // Verificar cambios sin guardar
  if (hasUnsavedData()) {
    // El autoguardado tiene 15s de retardo: sin forzarlo aqui, la frase
    // "el borrador queda guardado" seria falsa justo cuando se dice.
    saveDraftNow();
    const seguir = await confirmarAccion({
      titulo: '¿Salir de la sesión?',
      cuerpo: `${describirSesionEnCurso()} El borrador queda guardado, pero sales de la sesión.`,
      cancelar: 'Seguir entrenando',
      confirmar: 'Salir',
    });
    if (!seguir) return;
  }

  // Ocultar todos los tabs
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.add('hidden');
    tab.classList.remove('active');
  });

  // Ocultar vistas de cardio
  hideCardioViews();

  // Mostrar home view
  const homeView = document.getElementById('homeView');
  if (homeView) {
    homeView.classList.remove('hidden');
  }

  // Actualizar navegación
  updateBottomNav('home');

  // Scroll al inicio
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Repintar H-01
  renderizarHome();

  // Refrescar iconos
}

function hideCardioViews(): void {
  const cardioViews = [
    'cardioSelectorView',
    'cardioConfigView',
    'cardioTimerView',
    'cardioSummaryView',
  ];

  const habiaAlguna = cardioViews.some(
    (id) => document.getElementById(id)?.classList.contains('hidden') === false
  );

  cardioViews.forEach((id) => {
    const view = document.getElementById(id);
    if (view) {
      view.classList.add('hidden');
    }
  });

  // Ocultar no es parar. El motor del cardio seguia vivo al cambiar de
  // pestaña: sonaba y vibraba invisible y, al cumplirse el tiempo, guardaba
  // una sesion abandonada y pintaba el resumen encima de la pantalla nueva.
  if (habiaAlguna) {
    void import('@/features/cardio').then(({ detenerMotorCardio }) => detenerMotorCardio());
  }
}

function updateBottomNav(activeTab: TabName | 'home'): void {
  // La tab bar FIERRO marca el activo con aria-current: el punto Fragua y el
  // label en acento cuelgan de ese atributo, no de una clase.
  document.querySelectorAll('[data-nav]').forEach((item) => {
    const navType = (item as HTMLElement).dataset.nav;
    if (navType === activeTab) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function loadTabData(tabName: TabName): void {
  switch (tabName) {
    case 'history':
      // Entrar a HISTORIAL siempre abre la lista: el detalle se quedaba
      // abierto entre visitas y volver a la pestaña no lo cerraba.
      abrirDetalle(null);
      loadHistory();
      break;
    case 'prs':
      loadPRs();
      break;
    case 'charts':
      initializeCharts();
      break;
    case 'calculators':
      initializeCalculators();
      break;
    case 'profile':
      loadProfile();
      break;
    case 'medidas':
      loadMedidas();
      break;
  }
}

// ==========================================
// DRAFT MANAGEMENT
// ==========================================

export function resumeDraft(): void {
  const { draft } = checkForExistingDraft();
  if (draft) {
    restoreFromDraft(draft);
    switchTab('workout');
    // Renderizar el workout con los datos del draft
    import('@/features/workout').then(({ renderFromDraft }) => {
      renderFromDraft();
    });
  }
}

export async function dismissDraft(): Promise<void> {
  const descartar = await confirmarDestructivo({
    titulo: '¿Descartar la sesión?',
    cuerpo: `${describirBorrador()} Esto no se puede deshacer — el borrador desaparece.`,
    cancelar: 'Seguir entrenando',
    confirmar: 'Descartar',
  });
  if (!descartar) return;
  endSession(); // Limpia draft y resetea sesión
  renderizarHome();
  mostrarToast({ tipo: 'exito', titulo: 'Borrador descartado' });
}

// ==========================================
// INICIALIZAR NAVEGACIÓN
// ==========================================

export function initializeNavigation(): void {
  // Navegación inferior
  document.querySelectorAll('[data-nav]').forEach((item) => {
    item.addEventListener('click', function (this: HTMLElement) {
      // 'progress' no es un TabName: es la pestana nueva de FIERRO.
      const navType = this.dataset.nav as TabName | 'home' | 'progress';
      if (navType === 'home') {
        void showHome();
      } else if (navType === 'progress') {
        // GM-01 se construye en la fase 8; hasta entonces PROGRESO abre la
        // vista de gamificacion que ya existe, para no dejar la pestana muerta.
        (window as unknown as { showGamificationModal?: () => void }).showGamificationModal?.();
      } else {
        switchTab(navType as TabName);
      }
    });
  });

  // Rutinas clicables
  document.querySelectorAll('[data-grupo]').forEach((card) => {
    card.addEventListener('click', function (this: HTMLElement) {
      const grupo = this.dataset.grupo;
      if (grupo) {
        // Import dinámico para evitar dependencia circular
        void import('@/features/workout')
          .then(({ loadTrainingGroup }) => loadTrainingGroup(grupo))
          .then((cargada) => cargada && switchTab('workout'))
          .catch((e) => console.error('No se pudo cargar la rutina', e));
      }
    });
  });

  // Quick actions
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', function (this: HTMLElement) {
      const action = this.dataset.action as TabName;
      switchTab(action);
    });
  });

  // FAB button - open workout builder to create custom routine
  const fabButton = document.getElementById('fabButton');
  fabButton?.addEventListener('click', () => {
    // Use window to access the function from main.ts
    if (typeof (window as any).openWorkoutBuilder === 'function') {
      (window as any).openWorkoutBuilder();
    }
  });
}
