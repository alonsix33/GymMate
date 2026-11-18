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
  borrarConversacion,
  guardarConversacion,
  guardarCola,
  leerCola,
  leerConversacion,
  type DatoDeEjercicio,
  type TurnoCoach,
} from '@/features/coach-ia';
import { cifra, escapar, taparNavegacion } from '@/utils/formato';
import { markdownBasico } from '@/utils/markdown';
import { esSaludo, saludoDe, ATAJOS } from '@/features/coach-saludo';
import { construirEstado } from '@/features/coach-estado';
import { getHistory } from '@/utils/storage';
import { detectarPedidoDeGrafico, dibujarGrafico, type GraficoDelTurno, type Opcion } from '@/features/coach-grafico';
import { buscarSeries, excluirSeries, parsearMarcaDeExclusion } from '@/features/exclusiones';
import { confirmarDestructivo, mostrarToast } from '@/ui/feedback';


const ID = 'fierroCoach';
let turnos: TurnoCoach[] = [];
let estado: 'listo' | 'pensando' | 'escribiendo' = 'listo';
let parcial = '';
let hayError = false;
/** true cuando la pregunta ni siquiera se pudo guardar en la cola. */
let colaFallo = false;
/**
 * Token del turno en vuelo. Cerrar el coach a media respuesta y volver a
 * preguntar dejaba DOS `for await` acumulando sobre el mismo `parcial`: la
 * primera respuesta salia con los trozos duplicados e intercalados y la
 * segunda truncada, y asi se persistian las dos.
 */
let turnoActivo = 0;
/** Lo que el usuario lleva escrito. Cada `render()` reconstruye el <input> y
 *  le borraba el texto y el foco a media escritura. */
let borrador = '';
/** Un modelo colgado dejaba el compositor deshabilitado para siempre, y la
 *  unica salida era cerrar y reabrir — el gesto que corrompia el turno. */
const TIMEOUT_MS = 30000;

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

/**
 * El componente de datos: la barra de zonas de PR-01, con su misma escala.
 *
 * OJO con el rotulo. PR-01 estima el 1RM sobre la MEJOR serie del historial;
 * aqui se estima sobre la serie actual (el mejor peso de las ultimas tres
 * sesiones), que es de lo que el coach esta hablando. Con un usuario por
 * debajo de su pico las dos cifras divergen mucho —231 kg alli, 173 aqui— y
 * las dos tarjetas escriben el mismo "PICO 200 KG" al lado. Un rotulo
 * identico para dos cuentas distintas es de las cosas que mas rapido tumban la
 * confianza en TODAS las cifras, asi que cuando difieren se dice ACTUAL.
 */
function bloqueDeDatos(d: DatoDeEjercicio): string {
  return `
    <div class="f-coach__dato">
      <div class="f-coach__dato-fila">
        <span class="f-coach__dato-label">${escapar(d.ejercicio.toUpperCase())} · 1RM EST. ${
          d.actual < d.pico ? 'ACTUAL' : ''
        }</span>
        <span class="f-coach__dato-cifra">${cifra(d.unaRepMax)} <span class="f-coach__dato-unidad">kg</span></span>
      </div>
      <div class="f-zonas f-zonas--coach">
        <div class="f-zonas__pista">
          <div class="f-zonas__roja"></div>
          <div class="f-zonas__ambar"></div>
          <div class="f-zonas__verde"></div>
          <div class="f-zonas__marcador" data-zona="${(d.posicion / 100).toFixed(4)}"></div>
        </div>
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

function botonDeExclusion(c: { ejercicio: string; fecha?: string; peso?: number }): string {
  const series = buscarSeries(c).filter((x) => !x.excluida);
  const que = series.map((x) => `${x.ejercicio} ${x.sets}x${x.reps}@${x.peso}`).join(' · ');
  return `<button type="button" class="f-btn f-btn--secundario f-btn--medida" data-coach="excluir"
      data-ejercicio="${escapar(c.ejercicio)}" data-fecha="${escapar(c.fecha ?? '')}" data-peso="${escapar(
        c.peso === undefined ? '' : String(c.peso)
      )}">Marcar como no hecho · ${escapar(que)}</button>`;
}

/** El gráfico se dibuja AL PINTAR, con la bitácora de ese momento. Los turnos
 *  de la primera versión guardaban solo `{ ejercicio }`: era el de peso. */
function bloqueDeGrafico(g: GraficoDelTurno | { ejercicio: string }): string {
  const grafico: GraficoDelTurno = 'tipo' in g ? g : { tipo: 'peso', ejercicio: g.ejercicio };
  const { svg } = dibujarGrafico(grafico, getHistory(), new Date());
  return svg ? `<div class="f-coach__grafico">${svg}</div>` : '';
}

function opcionesDeGrafico(opciones: Array<string | Opcion>): string {
  const lista: Opcion[] = opciones.map((o) => (typeof o === 'string' ? { etiqueta: o, frase: `Gráfico de ${o}` } : o));
  // Agrupadas (con su titulo) en el orden en que llegan; sin grupo, todas juntas.
  const grupos = new Map<string, Opcion[]>();
  for (const o of lista) grupos.set(o.grupo ?? '', [...(grupos.get(o.grupo ?? '') ?? []), o]);
  const botones = (os: Opcion[]) =>
    `<div class="f-coach__opciones">${os
      .map(
        (o) =>
          `<button type="button" class="f-btn f-btn--secundario f-btn--medida" data-coach="grafico" data-frase="${escapar(o.frase)}">${escapar(o.etiqueta)}</button>`
      )
      .join('')}</div>`;
  return `<div class="f-coach__elegir" role="group" aria-label="Elegir gráfico">${[...grupos.entries()]
    .map(([g, os]) => `${g ? `<span class="f-coach__elegir-titulo">${escapar(g)}</span>` : ''}${botones(os)}`)
    .join('')}</div>`;
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
  // La marca [[excluir|...]] no se ve: se convierte en un boton, y solo si
  // coincide con una serie real del registro.
  const { limpio, criterio } = parsearMarcaDeExclusion(t.texto);
  const sello = `${t.origen === 'app' ? 'AVISO DE LA APP' : 'COACH'}${
    esHoy
      ? ` · HOY ${String(hora.getHours()).padStart(2, '0')}:${String(hora.getMinutes()).padStart(2, '0')}`
      : ` · ${hora.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '').toUpperCase()}`
  }`;
  return `
    <div class="f-coach__turno">
      <span class="f-coach__sello">${escapar(sello)}</span>
      <div class="f-coach__card">
        <div class="f-coach__texto f-coach__md">${markdownBasico(limpio)}</div>
        ${criterio ? botonDeExclusion(criterio) : ''}
        ${t.grafico ? bloqueDeGrafico(t.grafico) : ''}
        ${t.opciones?.length ? opcionesDeGrafico(t.opciones) : ''}
        ${t.dato ? bloqueDeDatos(t.dato) : ''}
      </div>
    </div>
  `;
}

function render(): void {
  const el = contenedor();
  const teniaFoco = document.activeElement?.id === 'coachEntrada';
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
             <div class="f-coach__texto f-coach__md" id="coachParcial">${markdownBasico(parsearMarcaDeExclusion(parcial).limpio)}<span class="f-coach__cursor" aria-hidden="true"></span></div>
           </div>
         </div>`
      : '',
    hayError
      ? `<div class="f-coach__error">
           <span class="f-coach__error-label">SIN CONEXIÓN</span>
           <span class="f-coach__texto">${
             colaFallo
               ? 'No se pudo conectar con el coach, y tampoco hubo sitio para guardar tu pregunta: vuelve a escribirla.'
               : 'No se pudo conectar con el coach. Tu pregunta quedó guardada — reintenta cuando vuelva la señal.'
           }</span>
           ${
             colaFallo
               ? ''
               : '<button type="button" class="f-btn f-btn--secundario f-btn--medida" data-coach="reintentar">Reintentar</button>'
           }
         </div>`
      : '',
    turnos.length === 0 && estado === 'listo' && !hayError
      ? `<div class="f-vacio-bloque">
           <span class="f-vacio-bloque__titulo">Pregúntale a tus datos.</span>
           <span class="f-vacio-bloque__detalle">Todo lo que has registrado está aquí: pesos, rachas, volumen y récords.</span>
         </div>`
      : '',
    // Los atajos salen mientras no hayas preguntado nada HOY (aunque el hilo
    // traiga el aviso de la app o charla de otros dias).
    estado === 'listo' && !hayError && !turnos.some((t) => t.autor === 'usuario' && new Date(t.fecha).toDateString() === new Date().toDateString())
      ? `<div class="f-coach__atajos">
           ${ATAJOS.map(
             (a) => `<button type="button" class="f-btn f-btn--secundario f-btn--medida" data-coach="grafico" data-frase="${escapar(a.frase)}">${escapar(a.etiqueta)}</button>`
           ).join('')}
         </div>`
      : '',
  ].join('');

  el.innerHTML = `
    <div class="f-coach__cabecera">
      <button type="button" class="f-hueso__volver" data-coach="cerrar" aria-label="Volver">←</button>
      <span class="f-coach__titulo">COACH</span>
      ${
        turnos.length > 0
          ? `<button type="button" class="f-hueso__volver f-coach__nueva" data-coach="nueva"
               aria-label="Empezar una conversación nueva" title="Conversación nueva">✕</button>`
          : ''
      }
    </div>
    <div class="f-coach__hilo" id="coachHilo">${cuerpo}</div>
    ${
      cola.length > 0
        ? `<button type="button" class="f-coach__cola" data-coach="reintentar">${cola.length} ${
            cola.length === 1 ? 'pregunta guardada' : 'preguntas guardadas'
          } · reintentar</button>`
        : ''
    }
    <div class="f-coach__compositor">
      <input class="f-coach__entrada" id="coachEntrada" type="text"
        value="${escapar(borrador)}"
        placeholder="${estado === 'listo' ? 'Pregúntale a tus datos…' : 'Esperando respuesta…'}"
        aria-label="Escribe tu pregunta" ${estado === 'listo' ? '' : 'disabled'} />
      ${
        estado === 'listo'
          ? `<button type="button" class="f-coach__enviar" data-coach="enviar" aria-label="Enviar">↑</button>`
          : // CO-02 dibuja aqui un DETENER destructivo (■), no un enviar
            // apagado: el mockup le pone `cursor:pointer` y borde rojo. Sin
            // el, un modelo lento dejaba el compositor muerto 30 s y la unica
            // salida era cerrar el coach.
            `<button type="button" class="f-coach__enviar f-coach__enviar--detener"
              data-coach="detener" aria-label="Detener la respuesta">■</button>`
      }
    </div>
  `;

  const entrada = el.querySelector<HTMLInputElement>('#coachEntrada');
  if (entrada) {
    entrada.addEventListener('input', () => {
      borrador = entrada.value;
    });
    if (teniaFoco && !entrada.disabled) {
      entrada.focus();
      entrada.setSelectionRange(entrada.value.length, entrada.value.length);
    }
  }
  const hilo = el.querySelector<HTMLElement>('#coachHilo');
  if (hilo) hilo.scrollTop = hilo.scrollHeight;
  requestAnimationFrame(() => {
    el.querySelectorAll<HTMLElement>('[data-zona]').forEach((m) => {
      m.style.setProperty('--t', m.dataset.zona ?? '0');
    });
  });
}

export function abrirCoach(mensajeInicial?: string, cifras?: string): void {
  // Cancela cualquier stream que siguiera vivo de una apertura anterior.
  turnoActivo++;
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
      // Es una tarjeta de la APP, no algo que dijo el modelo.
      origen: 'app',
      ...(cifras ? { cifras } : {}),
      dato: ejercicio ? datosDelEjercicio(ejercicio) ?? undefined : undefined,
    });
    guardarConversacion(turnos);
  }

  contenedor().classList.remove('hidden');
  taparNavegacion(true);
  render();
  document.getElementById('coachEntrada')?.focus();
}

export function cerrarCoach(): void {
  // Cerrar TAMBIEN cancela: el stream en vuelo dejaba de tener pantalla pero
  // seguia acumulando, y al reabrir y preguntar otra vez los dos escribian
  // sobre el mismo texto parcial.
  turnoActivo++;
  estado = 'listo';
  parcial = '';
  document.getElementById(ID)?.classList.add('hidden');
  taparNavegacion(false);
}

async function enviar(): Promise<void> {
  const entrada = document.getElementById('coachEntrada') as HTMLInputElement | null;
  const pregunta = (entrada?.value ?? borrador).trim();
  if (!pregunta || estado !== 'listo') return;
  borrador = '';
  if (entrada) entrada.value = '';
  await preguntar(pregunta);
}

function responderConGrafico(pedido: NonNullable<ReturnType<typeof detectarPedidoDeGrafico>>): void {
  const base = { id: `c_${Date.now()}`, autor: 'coach' as const, fecha: new Date().toISOString() };
  if (pedido.tipo === 'grafico') {
    const { texto } = dibujarGrafico(pedido.grafico, getHistory(), new Date());
    turnos.push({ ...base, texto, grafico: pedido.grafico });
  } else {
    // Poco claro: se pregunta, no se adivina.
    turnos.push({ ...base, texto: pedido.pregunta, opciones: pedido.opciones });
  }
  guardarConversacion(turnos);
  estado = 'listo';
  hayError = false;
  render();
}

async function preguntar(pregunta: string): Promise<void> {
  hayError = false;
  colaFallo = false;
  const previos = turnos.map((t) => ({ autor: t.autor, texto: t.texto }));
  turnos.push({ id: `u_${Date.now()}`, autor: 'usuario', texto: pregunta, fecha: new Date().toISOString() });
  guardarConversacion(turnos);

  // "Muéstrame el gráfico": lo dibuja la app con los datos de la bitácora, sin
  // pasar por el modelo. El modelo no tiene gráficos y no hace falta que sepa
  // pedirlos: así sale siempre igual, al instante y sin inventar ningún punto.
  // Un "Hola" se contesta con un saludo corto, sin pasar por el modelo ni
  // auditar la bitacora.
  if (esSaludo(pregunta)) {
    turnos.push({
      id: `c_${Date.now()}`,
      autor: 'coach',
      texto: saludoDe(construirEstado(getHistory(), { ahora: new Date() })),
      fecha: new Date().toISOString(),
    });
    guardarConversacion(turnos);
    render();
    return;
  }

  const pedido = detectarPedidoDeGrafico(pregunta, getHistory(), previos, new Date());
  if (pedido) {
    responderConGrafico(pedido);
    return;
  }

  // Token de este turno: cualquier stream anterior que siga vivo se descarta
  // en su siguiente `await` en vez de seguir escribiendo sobre `parcial`.
  const mio = ++turnoActivo;
  estado = 'pensando';
  render();

  try {
    const adaptador = adaptadorActual();
    // La aritmetica SIEMPRE en local, pase lo que pase con el modelo.
    const dato = adaptador.datosPara(pregunta) ?? undefined;

    let texto = '';
    parcial = '';
    // OJO: se sigue en 'pensando'. CO-02 dice que el sello "se sostiene hasta
    // el PRIMER TOKEN — sin spinner, sin tres puntos; aguanta los segundos
    // extra de una pregunta larga sin verse roto". Pasar a 'escribiendo' aqui
    // pintaba una card vacia con el cursor parpadeando desde el milisegundo
    // cero, y PENSANDO no llegaba a verse nunca.

    // Un modelo que no responde nunca no puede dejar el compositor muerto.
    const limite = new Promise<never>((_, rechazar) =>
      setTimeout(() => rechazar(new Error('timeout')), TIMEOUT_MS)
    );
    const iterador = adaptador.responder(pregunta, turnos)[Symbol.asyncIterator]();

    for (;;) {
      const paso = await Promise.race([iterador.next(), limite]);
      if (mio !== turnoActivo) return; // otro turno tomo el relevo
      if (paso.done) break;
      texto += paso.value;
      parcial = texto;
      if (estado !== 'escribiendo') {
        // Primer token: aqui, y solo aqui, PENSANDO da paso al streaming.
        estado = 'escribiendo';
        render();
      }
      // Por ID, no por `:last-of-type`: ese pseudo-selector mira el TIPO de
      // elemento (span), no la clase, y cogia el primer turno del hilo.
      const nodo = document.getElementById('coachParcial');
      if (nodo) {
        nodo.innerHTML =
          markdownBasico(parsearMarcaDeExclusion(texto).limpio) +
          '<span class="f-coach__cursor" aria-hidden="true"></span>';
      }
      await new Promise((r) => setTimeout(r, 18));
      if (mio !== turnoActivo) return;
    }

    turnos.push({
      id: `c_${Date.now()}`,
      autor: 'coach',
      texto: texto.trim(),
      fecha: new Date().toISOString(),
      dato,
    });
    guardarConversacion(turnos);
    estado = 'listo';
    parcial = '';
    render();
  } catch {
    if (mio !== turnoActivo) return;
    // La pregunta NO se pierde: queda en cola y se puede reintentar. Y si
    // tampoco cupo en la cola, la pantalla lo dice en vez de prometer que si.
    estado = 'listo';
    parcial = '';
    hayError = true;
    const cola = leerCola();
    colaFallo = cola.includes(pregunta) ? false : !guardarCola([...cola, pregunta]);
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
    case 'detener':
      // Mismo gesto que cerrar: invalida el turno en vuelo sin tirar lo ya
      // escrito, y devuelve el compositor.
      turnoActivo++;
      if (parcial.trim()) {
        turnos.push({ id: `c_${Date.now()}`, autor: 'coach', texto: parcial, fecha: new Date().toISOString() });
      } else if (turnos[turnos.length - 1]?.autor === 'usuario') {
        // Detener ANTES del primer token dejaba la pregunta en el hilo para
        // siempre: sin respuesta, sin error y sin reintento, y sobrevivia a la
        // recarga. Si no llego nada, la pregunta se retira con ella.
        turnos.pop();
      }
      guardarConversacion(turnos);
      estado = 'listo';
      parcial = '';
      render();
      break;
    case 'grafico':
      // Cada boton manda una frase que el reconocedor entiende sin ambiguedad.
      if (estado === 'listo' && el.dataset.frase) await preguntar(el.dataset.frase);
      break;
    case 'excluir': {
      // Primero SE ENSEÑA que cambia, y no se toca nada hasta que confirme: el
      // coach pregunta, el usuario decide, y los datos solo cambian despues.
      const criterio = {
        ejercicio: el.dataset.ejercicio ?? '',
        fecha: el.dataset.fecha || undefined,
        peso: el.dataset.peso ? Number(el.dataset.peso) : undefined,
      };
      const series = buscarSeries(criterio).filter((x) => !x.excluida);
      if (series.length === 0) {
        render();
        return;
      }
      const lista = series.map((x) => `${x.etiqueta} · ${x.ejercicio} ${x.sets}x${x.reps}@${x.peso}`).join('\n');
      const ok = await confirmarDestructivo({
        titulo: criterio.peso !== undefined ? '¿Excluir este peso?' : '¿Marcar como no hecho?',
        cuerpo:
          `Se marcará:\n${lista}\n\n` +
          'No se borra: deja de contar para el pico, el volumen y el estado, y lo puedes restaurar.',
        confirmar: 'Marcar',
      });
      if (!ok) return;
      excluirSeries(criterio, criterio.peso !== undefined ? 'outlier' : 'no_hecho');
      mostrarToast({ tipo: 'exito', titulo: 'Listo, ya no cuenta' });
      render();
      break;
    }
    case 'nueva': {
      // El hilo se pierde de verdad, asi que se pregunta. Y se dice lo que NO
      // se lleva por delante: el historial de entrenamiento no se toca, que es
      // lo primero que uno teme al ver una ✕ roja.
      const seguro = await confirmarDestructivo({
        titulo: '¿Empezar una conversación nueva?',
        cuerpo:
          'Se borra el hilo del coach y las preguntas que quedaron sin enviar. ' +
          'Tu historial de entrenamiento no se toca: el coach sigue viendo tus 12 meses.',
        confirmar: 'Borrar el hilo',
      });
      if (!seguro) return;
      borrarConversacion();
      turnos = [];
      parcial = '';
      hayError = false;
      colaFallo = false;
      estado = 'listo';
      // El turno en vuelo, si lo hay, deja de valer: su respuesta no tiene
      // hilo al que llegar.
      turnoActivo++;
      render();
      mostrarToast({ tipo: 'exito', titulo: 'Conversación nueva' });
      break;
    }
    case 'reintentar': {
      // Se drena la cola ENTERA. Antes solo se reintentaba la ultima pregunta,
      // asi que una que fallaba y luego era seguida por otra que funcionaba se
      // quedaba en localStorage para siempre: el contador la anunciaba en cada
      // apertura y no habia forma de enviarla ni de borrarla.
      const pendientes = leerCola();
      if (pendientes.length === 0) return;
      guardarCola([]);
      for (let k = 0; k < pendientes.length; k++) {
        const pregunta = pendientes[k];
        // El turno del usuario ya esta en el hilo: no se duplica.
        turnos = turnos.filter((t) => !(t.autor === 'usuario' && t.texto === pregunta));
        await preguntar(pregunta);
        if (hayError) {
          // Sigue sin haber señal. `preguntar` ya devolvio ESTA a la cola; las
          // que quedaban detras tambien vuelven, o se perderian al vaciarla.
          const restantes = pendientes.slice(k + 1).filter((p) => !leerCola().includes(p));
          if (restantes.length) guardarCola([...leerCola(), ...restantes]);
          render();
          break;
        }
      }
      break;
    }
  }
}
