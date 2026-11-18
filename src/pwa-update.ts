/**
 * Actualizacion automatica de la PWA.
 *
 * El problema, reproducido en Chromium: `skipWaiting` + `clientsClaim` activan
 * el service worker nuevo enseguida, pero la ventana ABIERTA sigue ejecutando
 * el JavaScript que ya tiene en memoria y nadie la recarga. En iOS una PWA de
 * la pantalla de inicio casi nunca se cierra del todo (se suspende y se
 * reanuda), y ademas nadie llamaba a `registration.update()`: sin navegacion,
 * Safari no pregunta si hay version nueva. Resultado: semanas con el bundle
 * viejo (asteriscos de markdown sin renderizar en el chat del coach).
 *
 * Lo que hace esto:
 *   1. Busca version nueva al abrir, al volver a primer plano y cada 30 min.
 *   2. Cuando el worker nuevo toma el control, recarga SOLO si no hay un
 *      entrenamiento en curso. Si lo hay, avisa y espera a que el usuario toque
 *      ACTUALIZAR (o a que termine: terminar ya recarga la pagina).
 *   3. Antes de recargar vuelca el borrador: lo tecleado en los ultimos 15 s no
 *      se pierde.
 *
 * Los datos viven en localStorage y una recarga no los toca.
 */
import { sessionData, guardarBorradorSiHayCambios } from '@/state/session';
import { getDraft } from '@/utils/storage';
import { mostrarToast } from '@/ui/feedback';

export const CADA_MS = 30 * 60 * 1000;

/** Hay algo que una recarga interrumpiria: series en pantalla o un borrador con series. */
export function hayEntrenamientoEnCurso(): boolean {
  try {
    return sessionData.volumenTotal > 0 || (getDraft()?.volumenTotal ?? 0) > 0;
  } catch {
    return false;
  }
}

export interface DecisionDeActualizacion {
  /** La pagina ya estaba controlada por un worker (no es la primera instalacion). */
  teniaControl: boolean;
  entrenando: boolean;
  recargar: () => void;
  avisar: (alTocar: () => void) => void;
}

/**
 * Que hacer cuando el worker nuevo toma el control. Separado para poder
 * probarlo: la primera instalacion NO recarga (no hay version vieja que
 * reemplazar) y un entrenamiento en curso NUNCA se recarga solo.
 */
export function alTomarControlLaVersionNueva(d: DecisionDeActualizacion): 'ignorada' | 'recargada' | 'avisada' {
  if (!d.teniaControl) return 'ignorada';
  if (!d.entrenando) {
    d.recargar();
    return 'recargada';
  }
  d.avisar(d.recargar);
  return 'avisada';
}

let registro: ServiceWorkerRegistration | undefined;

/** Pregunta si hay version nueva. Devuelve false si no se pudo preguntar. */
export async function buscarActualizacion(): Promise<boolean> {
  if (!registro) return false;
  try {
    await registro.update();
    return true;
  } catch {
    // Sin red: se reintenta en la proxima ocasion.
    return false;
  }
}

export function iniciarActualizaciones(): void {
  if (!('serviceWorker' in navigator)) return;

  const teniaControl = !!navigator.serviceWorker.controller;
  let recargando = false;
  const recargar = () => {
    if (recargando) return;
    recargando = true;
    guardarBorradorSiHayCambios();
    location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    alTomarControlLaVersionNueva({
      teniaControl,
      entrenando: hayEntrenamientoEnCurso(),
      recargar,
      avisar: (alTocar) =>
        mostrarToast({
          titulo: 'Hay una versión nueva',
          detalle: 'Tu entrenamiento se conserva.',
          accion: { etiqueta: 'ACTUALIZAR', alTocar },
          // No se va solo: el usuario esta a media serie y lo toca cuando pueda.
          duracion: 0,
        }),
    });
  });

  const registrar = async () => {
    try {
      // `updateViaCache: 'none'`: el navegador no puede servir sw.js desde su
      // cache HTTP al comprobar si hay version nueva.
      registro = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      void buscarActualizacion();
      setInterval(() => void buscarActualizacion(), CADA_MS);
    } catch {
      // Sin service worker la app sigue funcionando: solo pierde el modo offline.
    }
  };
  if (document.readyState === 'complete') void registrar();
  else window.addEventListener('load', () => void registrar());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void buscarActualizacion();
  });
}
