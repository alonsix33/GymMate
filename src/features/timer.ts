
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

// ==========================================
// ABRIR MODAL DE TIMER
// ==========================================

export function openRestTimerModal(): void {
  const modal = document.getElementById('restTimerModal');
  if (modal) {
    modal.classList.add('active');
  }
}

export function closeRestTimerModal(): void {
  const modal = document.getElementById('restTimerModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// ==========================================
// INICIAR TIMER
// ==========================================

export function initializeTimer(seconds: number): void {
  restTimeRemaining = seconds;
  isPaused = false;

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

  restTimer = setInterval(() => {
    if (!isPaused) {
      restTimeRemaining--;
      updateTimerDisplay();

      if (restTimeRemaining <= 0) {
        clearInterval(restTimer!);
        restTimer = null;
        onTimerComplete();
      }
    }
  }, 1000);
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
  isPaused = !isPaused;
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
  // Botón de cerrar modal
  const closeRestModal = document.getElementById('closeRestModal');
  closeRestModal?.addEventListener('click', closeRestTimerModal);

  // Botones de tiempo
  document.querySelectorAll('.rest-time-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const seconds = parseInt((btn as HTMLElement).dataset.seconds || '60');
      initializeTimer(seconds);
    });
  });

  // Botón de pausar
  const pauseBtn = document.getElementById('pauseTimer');
  pauseBtn?.addEventListener('click', pauseTimer);

  // Botón de detener
  const stopBtn = document.getElementById('stopTimer');
  stopBtn?.addEventListener('click', stopTimer);

  // Cerrar modal al hacer clic fuera
  const modal = document.getElementById('restTimerModal');
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeRestTimerModal();
    }
  });

  // Pedir permiso de notificaciones
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
