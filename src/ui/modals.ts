import { icon, refreshIcons } from '@/utils/icons';

/* El modal de animacion de ejercicio se retiro con FIERRO: la guia del
   ejercicio es ahora la hoja W-04 (src/ui/session-screens.ts), que ademas
   trae PR y ultima vez. */

// ==========================================
// MODAL DE CONFIRMACIÓN
// ==========================================

export function showConfirmModal(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
): void {
  const modal = document.createElement('div');
  modal.className = `
    fixed inset-0 bg-black/50 backdrop-blur-sm z-50
    flex items-center justify-center p-4
    animate-fade-in
  `;
  modal.id = 'confirmModal';

  modal.innerHTML = `
    <div class="bg-dark-surface border border-dark-border rounded-xl p-6 max-w-sm w-full">
      <div class="flex items-center gap-3 mb-4">
        ${icon('warning', 'lg', 'text-status-warning')}
        <h3 class="text-lg font-bold text-text-primary">${title}</h3>
      </div>
      <p class="text-text-secondary mb-6">${message}</p>
      <div class="flex gap-3">
        <button
          id="confirmModalCancel"
          class="flex-1 py-2 px-4 bg-dark-bg border border-dark-border rounded-lg
                 text-text-secondary hover:text-text-primary active:scale-95 transition-all"
        >
          Cancelar
        </button>
        <button
          id="confirmModalConfirm"
          class="flex-1 py-2 px-4 bg-accent hover:bg-accent-hover text-white
                 font-semibold rounded-lg active:scale-95 transition-all"
        >
          Confirmar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  refreshIcons();

  // Event listeners
  const cancelBtn = document.getElementById('confirmModalCancel');
  const confirmBtn = document.getElementById('confirmModalConfirm');

  cancelBtn?.addEventListener('click', () => {
    modal.remove();
    onCancel?.();
  });

  confirmBtn?.addEventListener('click', () => {
    modal.remove();
    onConfirm();
  });

  // Cerrar al hacer clic fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      onCancel?.();
    }
  });
}

// ==========================================
// TOAST / NOTIFICACIÓN
// ==========================================

export function showToast(
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info'
): void {
  const icons = {
    success: 'success',
    error: 'error',
    warning: 'warning',
    info: 'info',
  };

  const colors = {
    success: 'border-status-success bg-status-success/10',
    error: 'border-status-error bg-status-error/10',
    warning: 'border-status-warning bg-status-warning/10',
    info: 'border-status-info bg-status-info/10',
  };

  const iconColors = {
    success: 'text-status-success',
    error: 'text-status-error',
    warning: 'text-status-warning',
    info: 'text-status-info',
  };

  const toast = document.createElement('div');
  toast.className = `
    fixed bottom-20 left-4 right-4 mx-auto max-w-sm
    ${colors[type]} border rounded-xl p-4
    flex items-center gap-3
    animate-slide-up z-50
  `;

  toast.innerHTML = `
    ${icon(icons[type], 'md', iconColors[type])}
    <p class="text-text-primary text-sm flex-1">${message}</p>
    <button onclick="this.parentElement.remove()" class="text-text-muted hover:text-text-primary">
      ${icon('close', 'sm')}
    </button>
  `;

  document.body.appendChild(toast);
  refreshIcons();

  // Auto-eliminar después de 4 segundos
  setTimeout(() => {
    toast.classList.add('animate-fade-in');
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================
// INDICADOR DE CAMBIOS SIN GUARDAR
// ==========================================

export function showUnsavedIndicator(): void {
  const indicator = document.getElementById('unsavedIndicator');
  if (indicator) {
    indicator.classList.remove('hidden');
    indicator.classList.add('animate-slide-down');
  }
}

export function hideUnsavedIndicator(): void {
  const indicator = document.getElementById('unsavedIndicator');
  if (indicator) {
    indicator.classList.add('hidden');
  }
}

// ==========================================
// INDICADOR DE GUARDADO EXITOSO
// ==========================================

export function showSavedIndicator(): void {
  const indicator = document.getElementById('savedIndicator');
  if (indicator) {
    indicator.classList.remove('hidden');
    indicator.classList.add('animate-slide-down');

    setTimeout(() => {
      indicator.classList.add('hidden');
    }, 2000);
  }
}

// ==========================================
// INICIALIZAR MODALES
// ==========================================

export function initializeModals(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('confirmModal')?.remove();
    }
  });
}
