/**
 * FIERRO · Coach IA — CO-01, CO-02, CO-03.
 *
 *   CO-01  Conversación, con el componente de datos inline.
 *   CO-02  PENSANDO → streaming con cursor de bloque.
 *   CO-03  Error de red: la pregunta NO se pierde, queda para reintentar.
 *
 * Sin nombre propio ni avatar, como pide el README §15. La aritmetica del
 * componente de datos la calcula `coach-ia.ts` en local: el modelo solo
 * explica, y si el modelo falla las cifras siguen siendo ciertas.
 */
import {
  adaptadorActual,
  datosDelEjercicio,
  ejercicioMencionado,
  guardarConversacion,
  guardarCola,
  leerCola,
  leerConversacion,
  type DatoDeEjercicio,
  type TurnoCoach,
} from '@/features/coach-ia';
import { cifra } from '@/utils/formato';

function escapar(texto: string): string {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

const ID = 'fierroCoach';
let turnos: TurnoCoach[] = [];
let estado: 'listo' | 'pensando' | 'escribiendo' = 'listo';
let parcial = '';
let ultimaPregunta = '';
let hayError = false;

function contenedor(): HTMLElement {
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ID;
    el.className = 'f-coach f-root hidden';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Coach');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const o = (e.target as HTMLElement)?.closest<HTMLElement>('[data-coach]');
      if (o) void alTocar(o);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement)?.id === 'coachEntrada') {
        e.preventDefault();
        void enviar();
      }
    });
  }
  return el;
}

/** El componente de datos: la barra de zonas de PR-01, con su misma escala. */
function bloqueDeDatos(d: DatoDeEjercicio): string {
  return `
    <div class="f-coach__dato">
      <div class="f-coach__dato-fila">
        <span class="f-coach__dato-label">${escapar(d.ejercicio.toUpperCase())} · 1RM EST.</span>
        <span class="f-coach__dato-cifra">${cifra(d.unaRepMax)} <span class="f-coach__dato-unidad">kg</span></span>
      </div>
      <div class="f-zonas">
        <div class="f-zonas__tramo f-zonas__tramo--roja"></div>
        <div class="f-zonas__tramo f-zonas__tramo--ambar"></div>
        <div class="f-zonas__tramo f-zonas__tramo--verde"></div>
        <div class="f-zonas__marcador" data-zona="${(d.posicion / 100).toFixed(4)}"></div>
      </div>
      <div class="f-coach__dato-pie">
        <span>${
          d.sesionesEstancado >= 3
            ? `ESTANCADO ${d.sesionesEstancado} SESIONES`
            : `ACTUAL ${cifra(d.actual)} KG`
        }</span>
        <span>PICO ${cifra(d.pico)} KG</span>
      </div>
    </div>
  `;
}

function turnoHTML(t: TurnoCoach): string {
  if (t.autor === 'usuario') {
    return `<div class="f-coach__usuario${t.pendiente ? ' f-coach__usuario--pendiente' : ''}">${escapar(
      t.texto
    )}</div>`;
  }
  const hora = new Date(t.fecha);
  const hoy = new Date();
  const esHoy = hora.toDateString() === hoy.toDateString();
  const sello = `COACH${
    esHoy
      ? ` · HOY ${String(hora.getHours()).padStart(2, '0')}:${String(hora.getMinutes()).padStart(2, '0')}`
      : ` · ${hora.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '').toUpperCase()}`
  }`;
  return `
    <div class="f-coach__turno">
      <span class="f-coach__sello">${escapar(sello)}</span>
      <div class="f-coach__card">
        <span class="f-coach__texto">${escapar(t.texto)}</span>
        ${t.dato ? bloqueDeDatos(t.dato) : ''}
      </div>
    </div>
  `;
}

function render(): void {
  const el = contenedor();
  const cola = leerCola();

  const cuerpo = [
    ...turnos.map(turnoHTML),
    estado === 'pensando'
      ? `<div class="f-coach__turno">
           <span class="f-coach__sello f-coach__sello--pensando">PENSANDO</span>
         </div>`
      : '',
    estado === 'escribiendo'
      ? `<div class="f-coach__turno">
           <span class="f-coach__sello">COACH</span>
           <div class="f-coach__card">
             <span class="f-coach__texto">${escapar(parcial)}<span class="f-coach__cursor" aria-hidden="true"></span></span>
           </div>
         </div>`
      : '',
    hayError
      ? `<div class="f-coach__error">
           <span class="f-coach__error-label">SIN CONEXIÓN</span>
           <span class="f-coach__texto">Tu pregunta no se ha perdido: sigue aquí y se envía en cuanto vuelvas a tener conexión.</span>
           <button type="button" class="f-btn f-btn--secundario f-btn--medida" data-coach="reintentar">Reintentar</button>
         </div>`
      : '',
    turnos.length === 0 && estado === 'listo' && !hayError
      ? `<div class="f-vacio-bloque">
           <span class="f-vacio-bloque__titulo">Pregúntale a tus datos.</span>
           <span class="f-vacio-bloque__detalle">Todo lo que has registrado está aquí: pesos, rachas, volumen y récords.</span>
         </div>`
      : '',
  ].join('');

  el.innerHTML = `
    <div class="f-coach__cabecera">
      <button type="button" class="f-hueso__volver" data-coach="cerrar" aria-label="Volver">←</button>
      <span class="f-coach__titulo">COACH</span>
    </div>
    <div class="f-coach__hilo" id="coachHilo">${cuerpo}</div>
    ${
      cola.length > 0
        ? `<span class="f-coach__cola">${cola.length} ${
            cola.length === 1 ? 'pregunta pendiente de enviar' : 'preguntas pendientes de enviar'
          }</span>`
        : ''
    }
    <div class="f-coach__compositor">
      <input class="f-coach__entrada" id="coachEntrada" type="text"
        placeholder="Pregúntale a tus datos…" aria-label="Escribe tu pregunta"
        ${estado === 'listo' ? '' : 'disabled'} />
      <button type="button" class="f-coach__enviar" data-coach="enviar"
        ${estado === 'listo' ? '' : 'disabled'} aria-label="Enviar">↑</button>
    </div>
  `;

  const hilo = el.querySelector<HTMLElement>('#coachHilo');
  if (hilo) hilo.scrollTop = hilo.scrollHeight;
  requestAnimationFrame(() => {
    el.querySelectorAll<HTMLElement>('[data-zona]').forEach((m) => {
      m.style.setProperty('--t', m.dataset.zona ?? '0');
    });
  });
}

export function abrirCoach(mensajeInicial?: string): void {
  turnos = leerConversacion();
  estado = 'listo';
  hayError = false;
  parcial = '';

  // "Estado vacío resuelto de fábrica: tap en el banner de Home abre esta
  // vista con ese mensaje como primer turno." [REF Pantallas, reglas del coach]
  if (mensajeInicial && !turnos.some((t) => t.texto === mensajeInicial)) {
    const ejercicio = ejercicioMencionado(mensajeInicial);
    turnos.push({
      id: `t_${Date.now()}`,
      autor: 'coach',
      texto: mensajeInicial,
      fecha: new Date().toISOString(),
      dato: ejercicio ? datosDelEjercicio(ejercicio) ?? undefined : undefined,
    });
    guardarConversacion(turnos);
  }

  contenedor().classList.remove('hidden');
  render();
  document.getElementById('coachEntrada')?.focus();
}

export function cerrarCoach(): void {
  document.getElementById(ID)?.classList.add('hidden');
}

async function enviar(): Promise<void> {
  const entrada = document.getElementById('coachEntrada') as HTMLInputElement | null;
  const pregunta = entrada?.value.trim() ?? '';
  if (!pregunta || estado !== 'listo') return;
  ultimaPregunta = pregunta;
  if (entrada) entrada.value = '';
  await preguntar(pregunta);
}

async function preguntar(pregunta: string): Promise<void> {
  hayError = false;
  turnos.push({ id: `u_${Date.now()}`, autor: 'usuario', texto: pregunta, fecha: new Date().toISOString() });
  guardarConversacion(turnos);

  estado = 'pensando';
  render();

  try {
    const adaptador = adaptadorActual();
    // La aritmetica SIEMPRE en local, pase lo que pase con el modelo.
    const dato = adaptador.datosPara(pregunta) ?? undefined;

    parcial = '';
    estado = 'escribiendo';
    render();

    for await (const trozo of adaptador.responder(pregunta, turnos)) {
      parcial += trozo;
      const nodo = contenedor().querySelector<HTMLElement>('.f-coach__texto:last-of-type');
      if (nodo) {
        nodo.textContent = parcial;
        nodo.insertAdjacentHTML('beforeend', '<span class="f-coach__cursor" aria-hidden="true"></span>');
      }
      await new Promise((r) => setTimeout(r, 18));
    }

    turnos.push({
      id: `c_${Date.now()}`,
      autor: 'coach',
      texto: parcial.trim(),
      fecha: new Date().toISOString(),
      dato,
    });
    guardarConversacion(turnos);
    estado = 'listo';
    parcial = '';
    render();
  } catch {
    // La pregunta NO se pierde: queda en cola y se puede reintentar.
    estado = 'listo';
    parcial = '';
    hayError = true;
    const cola = leerCola();
    if (!cola.includes(pregunta)) guardarCola([...cola, pregunta]);
    render();
  }
}

async function alTocar(el: HTMLElement): Promise<void> {
  switch (el.dataset.coach) {
    case 'cerrar':
      cerrarCoach();
      break;
    case 'enviar':
      await enviar();
      break;
    case 'reintentar': {
      const cola = leerCola();
      const pregunta = ultimaPregunta || cola[cola.length - 1];
      if (!pregunta) return;
      guardarCola(cola.filter((p) => p !== pregunta));
      // El turno del usuario ya esta en el hilo: no se duplica.
      turnos = turnos.filter((t) => !(t.autor === 'usuario' && t.texto === pregunta));
      await preguntar(pregunta);
      break;
    }
  }
}
