/**
 * Registro de errores del telefono.
 *
 * Un error sin capturar solo existia en la consola de un navegador que nadie
 * abre en un iPhone: la app "se quedaba rara" y no quedaba rastro. Aqui se
 * guardan los ultimos 20 en localStorage, con fecha, para poder copiarlos desde
 * PERFIL y mandarlos. No sale nada del telefono por su cuenta.
 */
const CLAVE = 'gymmate_errores';
const MAX = 20;
const MAX_TEXTO = 400;

export interface ErrorRegistrado {
  fecha: string;
  origen: string;
  mensaje: string;
}

export function erroresRecientes(): ErrorRegistrado[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

function comoTexto(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? ' @ ' + e.stack.split('\n')[1]?.trim() : ''}`;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function registrarError(e: unknown, origen: string): void {
  try {
    const lista = erroresRecientes();
    lista.push({ fecha: new Date().toISOString(), origen, mensaje: comoTexto(e).slice(0, MAX_TEXTO) });
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(-MAX)));
  } catch {
    // Sin sitio para el registro: el error original sigue su camino.
  }
}

export function textoDeErrores(): string {
  return erroresRecientes()
    .map((x) => `${x.fecha} [${x.origen}] ${x.mensaje}`)
    .join('\n');
}

let instalado = false;
export function instalarRegistroDeErrores(): void {
  if (instalado) return;
  instalado = true;
  window.addEventListener('error', (ev) => registrarError(ev.error ?? ev.message, 'error'));
  window.addEventListener('unhandledrejection', (ev) => registrarError((ev as PromiseRejectionEvent).reason, 'promesa'));
}
