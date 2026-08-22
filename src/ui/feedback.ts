/**
 * FIERRO · F-01 — Toasts, confirmacion destructiva y estados de sync.
 *
 * Reemplaza todos los alert()/confirm() del navegador. Nada aqui bloquea el
 * hilo ni espera red: confirmarDestructivo devuelve una promesa que resuelve
 * al tocar, y si el usuario cierra el velo resuelve false.
 */

// --------------------------------------------------------------------------
// Contenedores
// --------------------------------------------------------------------------

const ID_TOASTS = 'fierroToasts';

function contenedorToasts(): HTMLElement {
  let el = document.getElementById(ID_TOASTS);
  if (!el) {
    el = document.createElement('div');
    el.id = ID_TOASTS;
    el.className = 'f-toasts f-root';
    // Los toasts anuncian resultados: el lector de pantalla debe leerlos sin
    // robar el foco de lo que la persona estuviera haciendo.
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

// --------------------------------------------------------------------------
// Toasts
// --------------------------------------------------------------------------

export type TipoToast = 'exito' | 'aviso';

export interface OpcionesToast {
  titulo: string;
  detalle?: string;
  tipo?: TipoToast;
  /** Etiqueta mono a la derecha, p.ej. "VER" o "DETALLE". */
  accion?: { etiqueta: string; alTocar: () => void };
  /** Milisegundos en pantalla. 0 = no se va solo. */
  duracion?: number;
}

const DURACION_POR_DEFECTO = 4000;

function quitar(toast: HTMLElement): void {
  toast.remove();
}

export function mostrarToast(opciones: OpcionesToast): () => void {
  const { titulo, detalle, tipo, accion, duracion = DURACION_POR_DEFECTO } = opciones;
  const cont = contenedorToasts();

  const toast = document.createElement('div');
  toast.className = 'f-toast';

  if (tipo) {
    const icono = document.createElement('div');
    icono.className = `f-toast__icono f-toast__icono--${tipo === 'exito' ? 'exito' : 'aviso'}`;
    // Glifo decorativo: el texto del toast ya dice lo que paso.
    icono.setAttribute('aria-hidden', 'true');
    icono.textContent = tipo === 'exito' ? '✓' : '!';
    toast.appendChild(icono);
  }

  const texto = document.createElement('div');
  texto.className = 'f-toast__texto';
  const t = document.createElement('span');
  t.className = 'f-toast__titulo';
  t.textContent = titulo;
  texto.appendChild(t);
  if (detalle) {
    const d = document.createElement('span');
    d.className = 'f-toast__detalle';
    d.textContent = detalle;
    texto.appendChild(d);
  }
  toast.appendChild(texto);

  if (accion) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'f-toast__accion';
    boton.textContent = accion.etiqueta;
    boton.addEventListener('click', () => {
      quitar(toast);
      accion.alTocar();
    });
    toast.appendChild(boton);
  }

  cont.appendChild(toast);

  let temporizador = 0;
  if (duracion > 0) temporizador = window.setTimeout(() => quitar(toast), duracion);

  return () => {
    if (temporizador) clearTimeout(temporizador);
    quitar(toast);
  };
}

/**
 * Toast con deshacer y cuenta atras visible.
 *
 * El patron por defecto es OPTIMISTA: quien llama ya ejecuto el borrado y pasa
 * en `alDeshacer` como revertirlo. Se eligio asi porque sobrevive a una
 * recarga a mitad de la cuenta atras: lo borrado ya esta escrito y no queda un
 * estado a medias.
 *
 * `alExpirar` existe para el patron contrario (borrar solo al expirar) y hoy
 * NO lo usa nadie. Si algun dia se usa, hay que consolidar tambien en
 * `beforeunload` o una recarga se comera la accion.
 */
export function mostrarToastDeshacer(opciones: {
  titulo: string;
  segundos?: number;
  alDeshacer: () => void;
  alExpirar?: () => void;
}): void {
  const { titulo, segundos = 5, alDeshacer, alExpirar } = opciones;
  const cont = contenedorToasts();

  const toast = document.createElement('div');
  toast.className = 'f-toast';

  const texto = document.createElement('div');
  texto.className = 'f-toast__texto';
  const t = document.createElement('span');
  t.className = 'f-toast__titulo';
  t.textContent = titulo;
  texto.appendChild(t);
  toast.appendChild(texto);

  let restan = segundos;
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'f-toast__deshacer';
  boton.textContent = `DESHACER · ${restan}`;
  toast.appendChild(boton);
  cont.appendChild(toast);

  const intervalo = window.setInterval(() => {
    restan -= 1;
    if (restan <= 0) {
      clearInterval(intervalo);
      quitar(toast);
      alExpirar?.();
      return;
    }
    boton.textContent = `DESHACER · ${restan}`;
  }, 1000);

  boton.addEventListener('click', () => {
    clearInterval(intervalo);
    quitar(toast);
    alDeshacer();
  });
}

// --------------------------------------------------------------------------
// Confirmacion destructiva
// --------------------------------------------------------------------------

export interface OpcionesConfirmar {
  /** Interno: lo pone confirmarAccion() para usar el primario en vez del rojo. */
  __primario?: boolean;
  titulo: string;
  /** Describe la perdida con datos: "42 minutos y 6 sets registrados." */
  cuerpo: string;
  /** Etiqueta del boton rojo. Va SIEMPRE a la derecha. */
  confirmar: string;
  /** Etiqueta del secundario. Va a la izquierda. */
  cancelar?: string;
}

/** Como se cerro la hoja. Cancelar y descartar NO son lo mismo: hay flujos
 *  donde "cancelar" tiene consecuencias y "me equivoque de dedo" no debe
 *  tenerlas. */
export type RespuestaHoja = 'confirmar' | 'cancelar' | 'descartado';

/** Solo puede haber una hoja viva. Sin esto, un doble tap abria una segunda
 *  con un indice congelado de antes del await y se borraba el item
 *  equivocado. */
/**
 * Mientras una hoja esta abierta, el resto de la pagina queda fuera del
 * recorrido de teclado y de los lectores de pantalla. Sin esto, dos
 * tabuladores desde el boton de cerrar y ya estabas navegando la home por
 * detras del velo, con la hoja declarandose `aria-modal`.
 *
 * Devuelve la funcion que lo deshace y devuelve el foco a donde estaba.
 */
export function atraparFoco(velo: HTMLElement): () => void {
  const previo = document.activeElement as HTMLElement | null;
  const inertados: HTMLElement[] = [];
  for (const hijo of Array.from(document.body.children)) {
    if (hijo === velo || !(hijo instanceof HTMLElement)) continue;
    if (hijo.inert) continue;
    hijo.inert = true;
    inertados.push(hijo);
  }
  return () => {
    for (const el of inertados) el.inert = false;
    if (previo && document.contains(previo)) previo.focus?.({ preventScroll: true });
  };
}

let hojaAbierta = false;

/**
 * Bottom sheet de confirmacion, con las tres salidas distinguidas:
 *   'confirmar'  el boton de la derecha
 *   'cancelar'   el secundario de la izquierda
 *   'descartado' tocar fuera, Escape, o una hoja ya abierta
 */
export function preguntar(opciones: OpcionesConfirmar): Promise<RespuestaHoja> {
  const { titulo, cuerpo, confirmar, cancelar = 'Cancelar', __primario = false } = opciones;

  if (hojaAbierta) return Promise.resolve('descartado');
  hojaAbierta = true;

  return new Promise<RespuestaHoja>((resolver) => {
    const velo = document.createElement('div');
    velo.className = 'f-scrim f-root';

    const sheet = document.createElement('div');
    sheet.className = 'f-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    // El foco va a la hoja, no al secundario: enfocarlo pintaba el anillo
    // Fragua sobre "Seguir entrenando" en la pantalla cuyo proposito es
    // justamente que la destructiva no sea la primaria Fragua.
    sheet.tabIndex = -1;

    const handle = document.createElement('div');
    handle.className = 'f-sheet__handle';
    sheet.appendChild(handle);

    const bloque = document.createElement('div');
    bloque.style.display = 'flex';
    bloque.style.flexDirection = 'column';
    bloque.style.gap = '4px';

    const h = document.createElement('span');
    h.className = 'f-sheet__titulo';
    h.id = 'fierroConfirmTitulo';
    h.textContent = titulo;
    sheet.setAttribute('aria-labelledby', h.id);
    bloque.appendChild(h);

    const p = document.createElement('span');
    p.className = 'f-sheet__cuerpo';
    p.textContent = cuerpo;
    bloque.appendChild(p);
    sheet.appendChild(bloque);

    const botones = document.createElement('div');
    botones.className = 'f-sheet__botones';

    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'f-btn f-btn--secundario';
    btnCancelar.textContent = cancelar;

    const btnConfirmar = document.createElement('button');
    btnConfirmar.type = 'button';
    btnConfirmar.className = `f-btn ${__primario ? 'f-btn--primario' : 'f-btn--destructivo'}`;
    btnConfirmar.textContent = confirmar;

    // El destructivo SIEMPRE a la derecha del par.
    botones.appendChild(btnCancelar);
    botones.appendChild(btnConfirmar);
    sheet.appendChild(botones);
    velo.appendChild(sheet);

    const foco = document.activeElement as HTMLElement | null;

    let liberar: (() => void) | null = null;
    const cerrar = (resultado: RespuestaHoja) => {
      document.removeEventListener('keydown', alTeclear);
      velo.remove();
      hojaAbierta = false;
      liberar?.();
      liberar = null;
      // El foco solo vuelve si su elemento sigue en el documento: tras un
      // borrado confirmado, el boton que lo abrio ya no existe.
      if (foco && document.contains(foco)) foco.focus?.();
      resolver(resultado);
    };

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar('descartado');
    };

    btnCancelar.addEventListener('click', () => cerrar('cancelar'));
    btnConfirmar.addEventListener('click', () => cerrar('confirmar'));
    velo.addEventListener('click', (e) => {
      if (e.target === velo) cerrar('descartado');
    });
    document.addEventListener('keydown', alTeclear);

    document.body.appendChild(velo);
    liberar = atraparFoco(velo);
    sheet.focus();
  });
}

/** Atajo booleano para el caso comun: solo importa si se confirmo. */
export function confirmarDestructivo(opciones: OpcionesConfirmar): Promise<boolean> {
  return preguntar(opciones).then((r) => r === 'confirmar');
}

/**
 * Confirmacion NO destructiva: misma hoja, pero el boton afirmativo es el
 * primario Fragua, no el rojo. Pintar de rojo una accion que no pierde nada
 * es mentirle al usuario, y el rojo deja de significar algo.
 */
export function confirmarAccion(opciones: OpcionesConfirmar): Promise<boolean> {
  return preguntar({ ...opciones, __primario: true }).then((r) => r === 'confirmar');
}

// --------------------------------------------------------------------------
// Puente para el codigo legacy que aun llama por onclick=""
// --------------------------------------------------------------------------

declare global {
  interface Window {
    fierroFeedback: {
      mostrarToast: typeof mostrarToast;
      mostrarToastDeshacer: typeof mostrarToastDeshacer;
      confirmarDestructivo: typeof confirmarDestructivo;
      confirmarAccion: typeof confirmarAccion;
      preguntar: typeof preguntar;
    };
  }
}

export function inicializarFeedback(): void {
  window.fierroFeedback = { mostrarToast, mostrarToastDeshacer, confirmarDestructivo, confirmarAccion, preguntar };
}
