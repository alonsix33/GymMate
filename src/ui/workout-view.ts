/**
 * FIERRO · W-01 — Sesion activa.
 *
 * Recrea la pantalla del mockup: cabecera con cronometro, nota del coach de
 * sesion, las tres metricas, la card del ejercicio en curso con sus steppers,
 * los ya completados con su fila de RPE, los opcionales, la barra de descanso,
 * el volumen por musculo y el pie.
 *
 * Reglas que NO estan en el mockup y si en el README:
 *   - RPE por ejercicio: chips 5-9 + "omitir" al marcar ✓. Un tap y se
 *     colapsa. Nunca un slider mientras se levanta (eso es W-02).
 *   - La card del ejercicio NUNCA muestra foto; la foto vive en la guia W-04.
 *
 * El repintado es quirurgico a proposito: la pantalla tiene inputs vivos y
 * un cronometro que corre. Repintar entera cada segundo le robaria el foco al
 * usuario a mitad de escribir un peso.
 */
import { sessionData } from '@/state/session';
import { getHistory, getPR } from '@/utils/storage';
import { cifra } from '@/utils/formato';
import type { ExerciseData, HistorySession } from '@/types';

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

function escapar(texto: string): string {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

/** "42:10" · pasa a "1:02:40" cuando la sesion cruza la hora. */
export function reloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dosCifras = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dosCifras(m)}:${dosCifras(seg)}` : `${m}:${dosCifras(seg)}`;
}

/** "mié 13 ago" — como el mockup, abreviado y en minusculas. */
function fechaCorta(hoy: Date): string {
  const dia = hoy.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
  const mes = hoy.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return `${dia} ${hoy.getDate()} ${mes}`;
}

/**
 * "GRUPO 1" a partir de "GRUPO 1 - Piernas + Glúteos", y el resto como
 * titular. Las rutinas propias no llevan prefijo: entonces no hay subtitulo
 * de grupo y solo queda la fecha.
 */
export function partirNombreDeGrupo(nombre: string): { titulo: string; prefijo: string } {
  const guion = nombre.indexOf(' - ');
  if (guion === -1) return { titulo: nombre, prefijo: '' };
  return { titulo: nombre.slice(guion + 3), prefijo: nombre.slice(0, guion) };
}

/**
 * Intensidad del ejercicio. El mockup pinta el badge; el dato que lo decide no
 * existe en el repo, asi que se deriva de la regla YA aprobada de zonas
 * (README 5): % del pico historico del propio usuario.
 *   SUAVE <70% · MODERADA 70-95% · INTENSA 95%+
 * Sin pico no hay badge: antes que inventar una intensidad, no se enseña.
 * PREGUNTA ABIERTA para el dueño del diseño: ¿es esta la regla que quieres?
 */
export function intensidadDe(peso: number, pico: number | null): 'suave' | 'moderada' | 'intensa' | null {
  if (!pico || pico <= 0 || peso <= 0) return null;
  const ratio = peso / pico;
  if (ratio >= 0.95) return 'intensa';
  if (ratio >= 0.7) return 'moderada';
  return 'suave';
}

const ETIQUETA_INTENSIDAD: Record<'suave' | 'moderada' | 'intensa', string> = {
  suave: 'SUAVE',
  moderada: 'MODERADA',
  intensa: 'INTENSA',
};

/** Ultima vez que se hizo este ejercicio, con sets, reps y peso. */
export function ultimaVezDe(
  nombre: string,
  historial: HistorySession[]
): { sets: number; reps: number; peso: number } | null {
  for (const sesion of historial) {
    if (sesion.type === 'cardio') continue;
    const ej = (sesion.ejercicios ?? []).find((e) => e.nombre === nombre && e.volumen > 0);
    if (ej) return { sets: ej.sets, reps: ej.reps, peso: ej.peso };
  }
  return null;
}

/** Volumen de la ultima sesion registrada de este mismo grupo. */
export function ultimoVolumenDelGrupo(grupo: string, historial: HistorySession[]): number | null {
  for (const sesion of historial) {
    if (sesion.type === 'cardio') continue;
    if (sesion.grupo === grupo && (sesion.volumenTotal || 0) > 0) return sesion.volumenTotal;
  }
  return null;
}

// --------------------------------------------------------------------------
// Bloques
// --------------------------------------------------------------------------

/**
 * El cronometro es tambien la entrada al temporizador de descanso.
 *
 * PROVISIONAL, y hay que preguntarlo: FEATURES describe un "boton rapido en
 * cada ejercicio" para el descanso, y W-01 dibuja la barra DESCANSO pero
 * ningun disparador. Sin esto la funcion se quedaba sin ningun camino, que el
 * contrato prohibe. Cuelga del cronometro para no añadir un pixel que el
 * mockup no tenga.
 */
function bloqueCabecera(ahora: Date): string {
  const { titulo, prefijo } = partirNombreDeGrupo(sessionData.grupo || '');
  const sub = prefijo ? `${escapar(prefijo)} · ${fechaCorta(ahora)}` : fechaCorta(ahora);
  return `
    <div class="f-sesion__cabecera">
      <button type="button" class="f-sesion__volver" data-sesion="volver" aria-label="Volver al inicio">←</button>
      <div class="f-sesion__titulos">
        <span class="f-sesion__titulo">${escapar(titulo).toUpperCase()}</span>
        <span class="f-sesion__sub">${sub}</span>
      </div>
      <button
        type="button"
        class="f-sesion__crono"
        id="fierroCrono"
        data-sesion="descanso"
        aria-label="Tiempo de sesión — abrir temporizador de descanso"
      >${reloj(segundosDeSesion(ahora))}</button>
    </div>
  `;
}

export function segundosDeSesion(ahora: Date = new Date()): number {
  if (!sessionData.startedAt) return 0;
  const inicio = new Date(sessionData.startedAt).getTime();
  if (Number.isNaN(inicio)) return 0;
  return Math.max(0, Math.round((ahora.getTime() - inicio) / 1000));
}

/**
 * La nota del coach. El mockup deja UN solo hueco aqui, asi que este nodo es
 * a la vez el mensaje de apertura ("Última sesión de este grupo: N kg") y el
 * sitio donde escribe el coach durante la sesion. Si no hay sesion previa de
 * este grupo el nodo existe pero va oculto: una caja con borde y sin texto no
 * dice nada.
 */
function bloqueCoach(historial: HistorySession[]): string {
  const anterior = ultimoVolumenDelGrupo(sessionData.grupo || '', historial);
  if (anterior === null) {
    return `<div class="f-sesion__coach" id="fierroCoach" role="note" hidden></div>`;
  }
  return `
    <div class="f-sesion__coach" id="fierroCoach" role="note">
      Última sesión de este grupo: <span class="f-sesion__dato">${cifra(anterior)} kg</span>. ¿Lo superamos hoy?
    </div>
  `;
}

function bloqueMetricas(): string {
  const ejercicios = sessionData.ejercicios;
  const completados = ejercicios.filter((e) => e.completado).length;
  const sets = ejercicios.reduce((t, e) => t + (e.sets || 0), 0);
  return `
    <div class="f-sesion__metricas">
      <div class="f-metrica f-metrica--protagonista">
        <span class="f-metrica__label">VOLUMEN</span>
        <span class="f-metrica__cifra" id="fierroVolumenTotal">${cifra(
          sessionData.volumenTotal
        )} <span class="f-metrica__unidad">kg</span></span>
      </div>
      <div class="f-metrica">
        <span class="f-metrica__label">COMPLETADOS</span>
        <span class="f-metrica__cifra">${completados}<span class="f-metrica__total">/${ejercicios.length}</span></span>
      </div>
      <div class="f-metrica">
        <span class="f-metrica__label">SETS</span>
        <span class="f-metrica__cifra">${sets}</span>
      </div>
    </div>
  `;
}

function stepper(campo: 'sets' | 'reps' | 'peso', etiqueta: string, indice: number, valor: number): string {
  const id = `${campo}-${indice}`;
  const paso = campo === 'peso' ? '0.5' : '1';
  const modo = campo === 'peso' ? 'decimal' : 'numeric';
  return `
    <div class="f-stepper-campo">
      <label class="f-stepper-campo__label" for="${id}">${etiqueta}</label>
      <div class="f-stepper f-stepper--sesion">
        <button type="button" class="f-stepper__btn" data-sesion="menos" data-campo="${campo}" data-indice="${indice}" aria-label="Bajar ${etiqueta.toLowerCase()}">−</button>
        <input
          class="f-stepper__valor"
          id="${id}"
          type="number"
          inputmode="${modo}"
          step="${paso}"
          min="0"
          value="${valor || ''}"
          placeholder="0"
          data-sesion="valor"
          data-campo="${campo}"
          data-indice="${indice}"
        />
        <button type="button" class="f-stepper__btn" data-sesion="mas" data-campo="${campo}" data-indice="${indice}" aria-label="Subir ${etiqueta.toLowerCase()}">+</button>
      </div>
    </div>
  `;
}

export function nivelDeIntensidad(ejercicio: ExerciseData): 'suave' | 'moderada' | 'intensa' | null {
  const pr = getPR(ejercicio.nombre);
  return intensidadDe(ejercicio.peso, pr?.peso ?? null);
}

function badgeIntensidad(ejercicio: ExerciseData, indice: number): string {
  const nivel = nivelDeIntensidad(ejercicio);
  const clase = nivel ? `f-badge f-badge--sesion f-badge--${nivel}` : 'f-badge f-badge--sesion';
  const texto = nivel ? ETIQUETA_INTENSIDAD[nivel] : '';
  // El nodo existe siempre: la intensidad cambia con cada peso que se teclea y
  // se parchea en sitio, sin repintar la card en la que se esta escribiendo.
  return `<span class="${clase}" id="intensidad-${indice}" ${nivel ? '' : 'hidden'}>${texto}</span>`;
}

/** Parche en sitio del badge tras cambiar el peso. */
export function refrescarIntensidad(indice: number, ejercicio: ExerciseData): void {
  const el = document.getElementById(`intensidad-${indice}`);
  if (!el) return;
  const nivel = nivelDeIntensidad(ejercicio);
  el.className = nivel ? `f-badge f-badge--sesion f-badge--${nivel}` : 'f-badge f-badge--sesion';
  el.textContent = nivel ? ETIQUETA_INTENSIDAD[nivel] : '';
  el.hidden = !nivel;
}

function cardActiva(ejercicio: ExerciseData, indice: number, historial: HistorySession[]): string {
  const ultima = ultimaVezDe(ejercicio.nombre, historial);
  const meta = ultima
    ? `${escapar(ejercicio.grupoMuscular).toUpperCase()} · Última vez: ${ultima.sets}×${ultima.reps} · ${cifra(
        ultima.peso
      )} kg`
    : escapar(ejercicio.grupoMuscular).toUpperCase();
  const etiquetaPeso = ejercicio.esMancuerna ? 'KG ×1' : 'KG';
  return `
    <div class="f-ejercicio" id="ejercicio-${indice}">
      <div class="f-ejercicio__cuerpo">
        <div class="f-ejercicio__cabecera">
          <div class="f-ejercicio__identidad">
            <span class="f-ejercicio__nombre-fila">
              <button type="button" class="f-ejercicio__nombre" data-sesion="guia" data-indice="${indice}">${escapar(
                ejercicio.nombre
              )}</button>
              <button type="button" class="f-ejercicio__info" data-sesion="guia" data-indice="${indice}" aria-label="Ver guía de ${escapar(
                ejercicio.nombre
              )}">i</button>
            </span>
            <span class="f-ejercicio__meta">${meta}</span>
          </div>
          ${badgeIntensidad(ejercicio, indice)}
          <button type="button" class="f-ejercicio__check" data-sesion="completar" data-indice="${indice}" aria-pressed="false" aria-label="Marcar ${escapar(
            ejercicio.nombre
          )} como completado"></button>
        </div>
        <div class="f-steppers">
          ${stepper('sets', 'SETS', indice, ejercicio.sets)}
          ${stepper('reps', 'REPS', indice, ejercicio.reps)}
          ${stepper('peso', etiquetaPeso, indice, ejercicio.peso)}
        </div>
        <div class="f-ejercicio__pie">
          <span class="f-ejercicio__pie-label">Volumen del ejercicio</span>
          <span class="f-ejercicio__pie-cifra" id="volumen-${indice}">${
            ejercicio.volumen > 0 ? `${cifra(ejercicio.volumen)} kg` : '—'
          }</span>
        </div>
      </div>
    </div>
  `;
}

function filaRPE(ejercicio: ExerciseData, indice: number): string {
  // Colapsada: ya se contesto. Se enseña el valor, no la fila entera.
  if (ejercicio.rpe !== undefined) {
    return `
      <div class="f-rpe-fila">
        <span class="f-rpe-fila__label">ESFUERZO</span>
        <button type="button" class="f-rpe-chip" data-sesion="rpe-abrir" data-indice="${indice}" aria-pressed="true">${ejercicio.rpe}</button>
      </div>
    `;
  }
  const chips = [5, 6, 7, 8, 9]
    .map(
      (v) =>
        `<button type="button" class="f-rpe-chip" data-sesion="rpe" data-indice="${indice}" data-valor="${v}" aria-pressed="false">${v}</button>`
    )
    .join('');
  return `
    <div class="f-rpe-fila">
      <span class="f-rpe-fila__label" id="rpe-label-${indice}">¿ESFUERZO?</span>
      ${chips}
      <button type="button" class="f-rpe-omitir" data-sesion="rpe-omitir" data-indice="${indice}">omitir</button>
    </div>
  `;
}

function cardHecha(ejercicio: ExerciseData, indice: number): string {
  const detalle = `${ejercicio.sets}×${ejercicio.reps} · ${cifra(ejercicio.peso)} kg · ${cifra(
    ejercicio.volumen
  )} kg`;
  return `
    <div class="f-hecho" id="ejercicio-${indice}">
      <div class="f-hecho__fila">
        <button type="button" class="f-hecho__check" data-sesion="completar" data-indice="${indice}" aria-pressed="true" aria-label="Desmarcar ${escapar(
          ejercicio.nombre
        )}">✓</button>
        <div class="f-hecho__textos">
          <button type="button" class="f-hecho__nombre" data-sesion="guia" data-indice="${indice}">${escapar(
            ejercicio.nombre
          )}</button>
          <span class="f-hecho__detalle">${detalle}</span>
        </div>
      </div>
      ${filaRPE(ejercicio, indice)}
    </div>
  `;
}

function cardOpcional(ejercicio: ExerciseData, indice: number): string {
  return `
    <div class="f-opcional" id="ejercicio-${indice}">
      <button type="button" class="f-opcional__check" data-sesion="activar-opcional" data-indice="${indice}" aria-label="Añadir ${escapar(
        ejercicio.nombre
      )} a la sesión"></button>
      <button type="button" class="f-opcional__nombre" data-sesion="guia" data-indice="${indice}">${escapar(
        ejercicio.nombre
      )}</button>
      <span class="f-badge f-badge--sesion f-badge--contorno">OPCIONAL</span>
    </div>
  `;
}

function bloqueVolumenPorMusculo(): string {
  const porGrupo = sessionData.volumenPorGrupo ?? {};
  const filas = Object.entries(porGrupo)
    .filter(([, kg]) => kg > 0)
    .sort((a, b) => b[1] - a[1]);
  if (filas.length === 0) return '';
  const mayor = filas[0][1];
  const cuerpo = filas
    .map(([musculo, kg], i) => {
      const ancho = Math.round((kg / mayor) * 100);
      const clase = i === 0 ? 'f-volumen__relleno f-volumen__relleno--mayor' : 'f-volumen__relleno';
      return `
        <div class="f-volumen__fila">
          <span class="f-volumen__musculo">${escapar(musculo)}</span>
          <span class="f-volumen__kg">${cifra(kg)} kg</span>
        </div>
        <div class="f-volumen__pista"><div class="${clase}" style="width:${ancho}%"></div></div>
      `;
    })
    .join('');
  return `<div class="f-volumen" role="group" aria-label="Volumen por músculo">${cuerpo}</div>`;
}

// --------------------------------------------------------------------------
// Pantalla
// --------------------------------------------------------------------------

/** Indices de los ejercicios que el usuario ya activo desde "opcionales". */
const opcionalesActivos = new Set<number>();

export function activarOpcional(indice: number): void {
  opcionalesActivos.add(indice);
}

export function reiniciarOpcionales(): void {
  opcionalesActivos.clear();
}

/**
 * Cuantos ejercicios son obligatorios. Se guarda al cargar la rutina: el
 * borrador no distingue obligatorios de opcionales, y sin este dato al
 * reanudar todos parecian obligatorios.
 */
let obligatorios = 0;

export function fijarObligatorios(cuantos: number): void {
  obligatorios = cuantos;
}

export function contarObligatorios(): number {
  return obligatorios;
}

export function renderSesion(contenedor: HTMLElement, ahora: Date = new Date()): void {
  const ejercicios = sessionData.ejercicios;
  if (ejercicios.length === 0) {
    contenedor.innerHTML = '';
    return;
  }
  const historial = getHistory();
  const limite = obligatorios > 0 ? obligatorios : ejercicios.length;

  const principales: string[] = [];
  const opcionales: string[] = [];
  ejercicios.forEach((ejercicio, i) => {
    const esOpcional = i >= limite;
    if (esOpcional && !opcionalesActivos.has(i) && !ejercicio.completado && ejercicio.volumen === 0) {
      opcionales.push(cardOpcional(ejercicio, i));
      return;
    }
    principales.push(
      ejercicio.completado ? cardHecha(ejercicio, i) : cardActiva(ejercicio, i, historial)
    );
  });

  const separador =
    opcionales.length > 0
      ? `<div class="f-separador"><span class="f-separador__label">OPCIONALES</span><div class="f-separador__linea"></div></div>`
      : '';

  contenedor.innerHTML = `
    <div class="f-sesion f-root">
      ${bloqueCabecera(ahora)}
      ${bloqueCoach(historial)}
      ${bloqueMetricas()}
      ${principales.join('')}
      ${separador}
      ${opcionales.join('')}
      <div id="fierroDescanso"></div>
      ${bloqueVolumenPorMusculo()}
      <button type="button" class="f-btn f-btn--primario f-btn--bloque" data-sesion="guardar">Guardar entrenamiento</button>
      <div class="f-sesion__autosave" id="fierroAutosave" role="status" aria-live="polite"></div>
      <button type="button" class="f-btn f-btn--secundario f-btn--bloque" data-sesion="terminar">Terminar sesión</button>
    </div>
  `;
}
