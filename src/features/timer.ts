
/**
 * La barra de DESCANSO de W-01 vive DENTRO de la sesion [REF Pantallas:233].
 * El banner flotante legacy se conserva para las pantallas que la fase 4 aun
 * no ha rehecho; cuando la sesion esta en pantalla manda la barra FIERRO.
 */
function barraFierro(): HTMLElement | null {
  return document.getElementById('fierroDescanso');
}

/** Vuelve a dibujar la barra tras un repintado de W-01. */
export function repintarDescanso(): void {
  pintarBarraFierro();
}

function pintarBarraFierro(): void {
  const hueco = barraFierro();
  if (!hueco) return;
  if (restTimer === null && restTimeRemaining <= 0) {
    hueco.innerHTML = '';
    return;
  }
  const minutos = Math.floor(restTimeRemaining / 60);
  const segundos = restTimeRemaining % 60;
  hueco.innerHTML = `
    <div class="f-descanso" role="timer" aria-label="Tiempo de descanso">
      <span class="f-descanso__label">DESCANSO</span>
      <span class="f-descanso__tiempo" id="fierroDescansoTiempo">${minutos}:${String(segundos).padStart(2, '0')}</span>
      <button type="button" class="f-descanso__accion" id="fierroDescansoPausa">${isPaused ? 'Reanudar' : 'Pausar'}</button>
      <button type="button" class="f-descanso__accion f-descanso__accion--detener" id="fierroDescansoDetener">Detener</button>
    </div>
  `;
  hueco.querySelector('#fierroDescansoPausa')?.addEventListener('click', () => pauseTimer());
  hueco.querySelector('#fierroDescansoDetener')?.addEventListener('click', () => stopTimer());
}

// ==========================================
// ESTADO DEL TIMER
// ==========================================

let restTimer: ReturnType<typeof setInterval> | null = null;
let restTimeRemaining = 0;
let isPaused = false;
/** Instante (ms de reloj) en que acaba el descanso. El tiempo que falta se
 *  CALCULA contra el reloj de pared: con un contador de ticks, iOS congelaba el
 *  descanso al bloquear la pantalla y al volver seguia donde lo dejo. */
let finDelDescanso = 0;

const CLAVE_ULTIMO_DESCANSO = 'gymmate_ultimo_descanso';
const DESCANSO_POR_DEFECTO = 90;

/** Cuanto falta, en segundos (0 si no hay descanso). */
export function descansoRestante(): number {
  return restTimeRemaining;
}

/** El ultimo tiempo de descanso que elegiste (90 s la primera vez). */
export function ultimoDescanso(): number {
  try {
    const v = Number(localStorage.getItem(CLAVE_ULTIMO_DESCANSO));
    if (Number.isFinite(v) && v >= 10 && v <= 900) return v;
  } catch {
    // sin almacenamiento: el de por defecto
  }
  return DESCANSO_POR_DEFECTO;
}

/** Recalcula lo que falta contra el reloj. Si ya paso, termina. */
function sincronizar(): void {
  if (isPaused || finDelDescanso === 0) return;
  restTimeRemaining = Math.max(0, Math.ceil((finDelDescanso - Date.now()) / 1000));
  updateTimerDisplay();
  if (restTimeRemaining <= 0) {
    if (restTimer) {
      clearInterval(restTimer);
      restTimer = null;
    }
    finDelDescanso = 0;
    soltarPantalla();
    onTimerComplete();
  }
}

// La pantalla se mantiene encendida SOLO mientras corre un descanso: un
// entrenamiento entero con la pantalla forzada gasta bateria sin necesidad.
let candado: { release: () => Promise<void> } | null = null;
function mantenerPantalla(): void {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wl || candado) return;
    void wl.request('screen').then((l) => { candado = l; }).catch(() => {});
  } catch {
    // sin soporte: no pasa nada
  }
}
function soltarPantalla(): void {
  const l = candado;
  candado = null;
  void l?.release().catch(() => {});
}

if (typeof document !== 'undefined') {
  // Al volver a la app (desbloquear, cambiar de pestaña) se recalcula YA y,
  // si el descanso sigue en marcha, se vuelve a pedir la pantalla.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') return;
    sincronizar();
    if (finDelDescanso !== 0 && !isPaused) mantenerPantalla();
  });
}

/** Al marcar el check de un ejercicio: el descanso arranca solo con el ultimo tiempo. */
export function iniciarDescansoAutomatico(): void {
  initializeTimer(ultimoDescanso());
}

// ==========================================
// HOJA DE ELECCION DEL DESCANSO
// ==========================================

/** Los seis tiempos, con el nombre que el usuario les da. */
const TIEMPOS: Array<{ segundos: number; cifra: string; nombre: string; etiqueta: string }> = [
  { segundos: 30, cifra: '30s', nombre: 'Rápido', etiqueta: '30 segundos' },
  { segundos: 60, cifra: '1:00', nombre: 'Normal', etiqueta: '1 minuto' },
  { segundos: 90, cifra: '1:30', nombre: 'Largo', etiqueta: '1 minuto y 30 segundos' },
  { segundos: 120, cifra: '2:00', nombre: 'Pesado', etiqueta: '2 minutos' },
  { segundos: 180, cifra: '3:00', nombre: 'Fuerza', etiqueta: '3 minutos' },
  { segundos: 300, cifra: '5:00', nombre: 'Máximo', etiqueta: '5 minutos' },
];

/**
 * Se monta al abrirla y se desmonta al cerrarla, como el resto de los bottom
 * sheets. Tenerla montada y oculta en `index.html` hacia que cualquier
 * `querySelector('.f-sheet')` de documento entero la encontrara a ella: varios
 * chequeos dejaron de poder fallar por eso, y uno se colgo intentando pulsar
 * un boton invisible.
 */
export function openRestTimerModal(): void {
  closeRestTimerModal();
  const velo = document.createElement('div');
  velo.id = 'restTimerModal';
  velo.className = 'f-scrim f-root';
  velo.setAttribute('role', 'dialog');
  velo.setAttribute('aria-modal', 'true');
  velo.setAttribute('aria-label', 'Tiempo de descanso');
  velo.innerHTML = `
    <div class="f-sheet">
      <div class="f-sheet__handle" aria-hidden="true"></div>
      <span class="f-sheet__titulo">Tiempo de descanso</span>
      <div class="f-descansos" role="group" aria-label="Opciones de tiempo de descanso">
        ${TIEMPOS.map(
          (t) => `
          <button data-seconds="${t.segundos}" type="button" class="rest-time-btn f-descanso-op"
            aria-label="Iniciar descanso de ${t.etiqueta}">
            <span class="f-descanso-op__cifra">${t.cifra}</span>
            <span class="f-descanso-op__label">${t.nombre}</span>
          </button>`
        ).join('')}
      </div>
      <button type="button" id="closeRestModal" class="f-btn f-btn--secundario f-btn--hoja">Cerrar</button>
    </div>
  `;
  velo.addEventListener('click', (e) => {
    const objetivo = e.target as HTMLElement;
    if (objetivo === velo || objetivo.closest('#closeRestModal')) {
      closeRestTimerModal();
      return;
    }
    const boton = objetivo.closest<HTMLElement>('.rest-time-btn');
    if (boton) initializeTimer(Number(boton.dataset.seconds) || 60);
  });
  document.body.appendChild(velo);
}

export function closeRestTimerModal(): void {
  document.getElementById('restTimerModal')?.remove();
}

// ==========================================
// INICIAR TIMER
// ==========================================

export function initializeTimer(seconds: number): void {
  restTimeRemaining = seconds;
  isPaused = false;
  finDelDescanso = Date.now() + seconds * 1000;
  try {
    localStorage.setItem(CLAVE_ULTIMO_DESCANSO, String(seconds));
  } catch {
    // no es critico
  }
  // El permiso de avisos se pide AQUI, que viene de un toque, y no al abrir la
  // app: sin gesto el navegador lo ignora o lo penaliza.
  pedirPermisoDeAvisos();
  mantenerPantalla();

  // Cerrar modal de selección, abrir banner
  closeRestTimerModal();

  const banner = document.getElementById('restTimerBanner');
  if (banner) {
    banner.classList.add('active');
  }

  pintarBarraFierro();
  updateTimerDisplay();
  updatePauseButtonText();
  // Con la barra FIERRO en pantalla, el banner flotante legacy sobra: se
  // pintaba encima de la cabecera de la sesion, con su azul y sus iconos.
  if (barraFierro()) banner?.classList.remove('active');

  // Limpiar timer anterior
  if (restTimer) {
    clearInterval(restTimer);
  }

  restTimer = setInterval(sincronizar, 1000);
}

// ==========================================
// ACTUALIZAR DISPLAY
// ==========================================

function updateTimerDisplay(): void {
  const minutes = Math.floor(restTimeRemaining / 60);
  const seconds = restTimeRemaining % 60;
  const display = document.getElementById('timerDisplay');
  if (display) {
    display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  // El mockup no rellena con cero el minuto: "1:24", no "01:24".
  const fierro = document.getElementById('fierroDescansoTiempo');
  if (fierro) fierro.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updatePauseButtonText(): void {
  const pauseBtn = document.getElementById('pauseTimer');
  if (pauseBtn) {
    // Texto, no icono: el handoff no usa libreria de iconos.
    pauseBtn.textContent = isPaused ? 'Reanudar' : 'Pausar';
  }
}

// ==========================================
// CONTROLES DEL TIMER
// ==========================================

export function pauseTimer(): void {
  if (!isPaused) {
    // Se congela lo que falta; al reanudar se recalcula el fin.
    sincronizar();
    isPaused = true;
  } else {
    isPaused = false;
    finDelDescanso = Date.now() + restTimeRemaining * 1000;
  }
  updatePauseButtonText();
  const boton = document.getElementById('fierroDescansoPausa');
  if (boton) boton.textContent = isPaused ? 'Reanudar' : 'Pausar';
}

export function stopTimer(): void {
  if (restTimer) {
    clearInterval(restTimer);
    restTimer = null;
  }

  const banner = document.getElementById('restTimerBanner');
  if (banner) {
    banner.classList.remove('active');
  }

  restTimeRemaining = 0;
  finDelDescanso = 0;
  soltarPantalla();
  pintarBarraFierro();
}

// ==========================================
// TIMER COMPLETADO
// ==========================================

function onTimerComplete(): void {
  // Reproducir sonido
  playNotificationSound();

  // Vibrar (si está disponible)
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 200]);
  }

  // Mostrar notificación
  showNotification('Tiempo de descanso terminado!');

  // Cerrar banner después de 2 segundos
  setTimeout(() => {
    const banner = document.getElementById('restTimerBanner');
    if (banner) {
      banner.classList.remove('active');
    }
    restTimeRemaining = 0;
    pintarBarraFierro();
  }, 2000);
}

// ==========================================
// SONIDO DE NOTIFICACIÓN
// ==========================================

function playNotificationSound(): void {
  try {
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.5
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.log('Audio notification not available');
  }
}

// ==========================================
// NOTIFICACIÓN DEL SISTEMA
// ==========================================

function showNotification(message: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('GymMate', {
      body: message,
      icon: '/icon-192.png',
    });
  }
}

// ==========================================
// INICIALIZAR EVENT LISTENERS
// ==========================================

export function initializeTimerListeners(): void {
  // La hoja se monta al abrirse y trae su propia delegacion: enganchar aqui
  // sus botones era enganchar nodos que ya no existen al arrancar.

  // Botón de pausar
  const pauseBtn = document.getElementById('pauseTimer');
  pauseBtn?.addEventListener('click', pauseTimer);

  // Botón de detener
  const stopBtn = document.getElementById('stopTimer');
  stopBtn?.addEventListener('click', stopTimer);



  // El permiso de notificaciones ya NO se pide al arrancar: se pide al empezar
  // un descanso (ver `initializeTimer`), que es un gesto del usuario.
}

function pedirPermisoDeAvisos(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    // iOS fuera de la PWA instalada no tiene Notification
  }
}
