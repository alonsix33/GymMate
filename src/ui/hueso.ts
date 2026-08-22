/**
 * FIERRO · secciones Hueso — lo que YA PASÓ.
 *
 *   HI-01  Historial: sesiones por mes, con CSV de entrada y de salida.
 *   HI-02  Detalle de sesión: metricas contra la anterior y set a set.
 *   PR-01  Récords: 1RM estimado y barra de zonas contra tu pico.
 *   G-01   Gráficos: volumen por sesión, distribución muscular y por ejercicio.
 *
 * Los graficos son SVG a mano, como en los mockups: nada de chart.js.
 */
import { getHistory, getPRs } from '@/utils/storage';
import { cifra, cifraDecimal } from '@/utils/formato';
import { formatearTiempo } from '@/utils/cardio-calc';
import { calculate1RM } from '@/utils/calculations';
import { getSessionXP, estimateOneRM } from '@/features/gamification';
import {
  distribucionMuscular,
  estadoDeZona,
  fechaDe,
  mediaMovil,
  pesoActual,
  picoDe,
  polilinea,
  posicionEnZonas,
  repartirCien,
  serieDeVolumen,
  sesionesCon,
  tituloDeMes,
  claveDeMes,
  zonaDe,
  type Rango,
} from '@/utils/zonas';
import { partirNombreDeGrupo } from '@/ui/workout-view';
import type { ExerciseData, HistorySession } from '@/types';

/**
 * Pico del ejercicio: el mayor entre lo que dice el historial y lo que dice el
 * record guardado. Un CSV importado guarda el PR sin la sesion que lo marco,
 * y una sesion recien guardada puede superar al record antes de que se
 * actualice: mirar solo uno de los dos deja la barra y la etiqueta contando
 * historias distintas.
 */
/** Los modos con su nombre de pantalla, no la clave interna. */
const NOMBRE_MODO_CARDIO: Record<string, string> = {
  tabata: 'Tabata',
  emom: 'EMOM',
  amrap: 'AMRAP',
  circuit: 'Circuito',
  pyramid: 'Pirámide',
  custom: 'Personalizado',
};

function picoReal(nombre: string, historial: HistorySession[]): number {
  return Math.max(picoDe(nombre, historial) ?? 0, getPRs()[nombre]?.peso ?? 0);
}

function escapar(texto: string): string {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

/** "vie, 17 abr" — como el mockup. */
function fechaCorta(fecha: Date): string {
  const dia = fecha.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
  const mes = fecha.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return `${dia}, ${fecha.getDate()} ${mes}`;
}

/** "52:40" a partir de dos instantes; null si la sesion no los tiene. */
export function duracionDe(sesion: HistorySession & { startedAt?: string }): string | null {
  if (!sesion.startedAt || !sesion.savedAt) return null;
  const ini = new Date(sesion.startedAt).getTime();
  const fin = new Date(sesion.savedAt).getTime();
  if (Number.isNaN(ini) || Number.isNaN(fin) || fin <= ini) return null;
  const s = Math.round((fin - ini) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(seg)}` : `${m}:${dos(seg)}`;
}

function cabecera(titulo: string, extra = '', clase = ''): string {
  return `
    <header class="f-hueso__header">
      <div class="f-hueso__fila-titulo ${clase}">
        <span class="f-hueso__titulo">${escapar(titulo)}</span>
        ${extra}
      </div>
    </header>
  `;
}

// --------------------------------------------------------------------------
// HI-01 · Historial
// --------------------------------------------------------------------------

/** Indice de la sesion abierta en HI-02, o null si se ve la lista. */
let sesionAbierta: number | null = null;

export function abrirDetalle(indice: number | null): void {
  sesionAbierta = indice;
}

export function detalleAbierto(): number | null {
  return sesionAbierta;
}

function filaDeSesion(sesion: HistorySession, indice: number): string {
  const fecha = fechaCorta(fechaDe(sesion));
  if (sesion.type === 'cardio') {
    // Los nombres son los que GUARDA cardio.ts: `roundsCompleted` y
    // `totalTime`. Leyendo `rounds`/`duration` la fila salia sin rondas y con
    // un guion donde va el tiempo.
    const stats = sesion.stats;
    const cuantas = stats?.roundsCompleted ?? 0;
    const rondas = cuantas ? `${cuantas} ${cuantas === 1 ? 'ronda' : 'rondas'}` : '';
    const segundos = stats?.totalTime ?? 0;
    const tiempo = segundos ? formatearTiempo(segundos) : '—';
    return `
      <button type="button" class="f-hist__fila" data-hueso="detalle" data-indice="${indice}">
        <span class="f-hist__hiit">HIIT</span>
        <span class="f-hist__textos">
          <span class="f-hist__nombre">${escapar(NOMBRE_MODO_CARDIO[sesion.mode ?? ''] ?? 'Cardio')}</span>
          <span class="f-hist__sub">${fecha}${rondas ? ` · ${rondas}` : ''}</span>
        </span>
        <span class="f-hist__cifra">${tiempo}</span>
      </button>
    `;
  }
  const cuantos = (sesion.ejercicios ?? []).filter((e) => e.volumen > 0).length;
  // "Piernas + Glúteos", no "GRUPO 1 - Piernas + Glúteos": el prefijo de
  // grupo no aporta nada en una lista y roba la mitad de la linea.
  const nombre = partirNombreDeGrupo(sesion.grupo || 'Sesión').titulo;
  return `
    <button type="button" class="f-hist__fila" data-hueso="detalle" data-indice="${indice}">
      <span class="f-hist__textos">
        <span class="f-hist__nombre">${escapar(nombre)}</span>
        <span class="f-hist__sub">${fecha} · ${cuantos} ${cuantos === 1 ? 'ejercicio' : 'ejercicios'}</span>
      </span>
      <span class="f-hist__cifra">${cifra(sesion.volumenTotal || 0)}</span>
    </button>
  `;
}

function vacioHistorial(): string {
  return `
    <div class="f-vacio-hueso">
      <span class="f-vacio-hueso__label">HISTORIAL VACÍO</span>
      <span class="f-vacio-hueso__titulo">Aquí vivirá cada sesión que guardes.</span>
      <div class="f-vacio-hueso__acciones">
        <button type="button" class="f-btn-hueso" data-hueso="primera">Primera sesión</button>
        <button type="button" class="f-btn-hueso f-btn-hueso--secundario" data-hueso="importar">Importar CSV</button>
      </div>
    </div>
  `;
}

export function renderHistorial(contenedor: HTMLElement): void {
  const historial = getHistory();
  if (sesionAbierta !== null && historial[sesionAbierta]) {
    contenedor.innerHTML = renderDetalle(historial, sesionAbierta);
    return;
  }
  sesionAbierta = null;

  const acciones = `
    <button type="button" class="f-hueso__accion" data-hueso="exportar" aria-label="Exportar historial a CSV">CSV ↓</button>
    <button type="button" class="f-hueso__accion" data-hueso="importar" aria-label="Importar historial desde CSV">CSV ↑</button>
  `;

  if (historial.length === 0) {
    contenedor.innerHTML = `
      <div class="f-hueso f-root">
        ${cabecera('HISTORIAL', acciones)}
        <div class="f-hueso__cuerpo">${vacioHistorial()}</div>
      </div>
    `;
    return;
  }

  // Agrupadas por mes, en el orden en que llegan (mas reciente primero). La
  // clave YYYY-MM corta los bloques; el titulo visible es el nombre del mes.
  // Por CLAVE de mes, no por rachas consecutivas: con el historial desordenado
  // (lo provoca cualquier sesion con fecha rara) salia "AGOSTO / JULIO /
  // AGOSTO", el mismo mes partido en dos bloques.
  const porMes = new Map<string, { titulo: string; filas: string[] }>();
  historial.forEach((sesion, i) => {
    const fecha = fechaDe(sesion);
    const clave = claveDeMes(fecha);
    const bloque = porMes.get(clave) ?? { titulo: tituloDeMes(fecha), filas: [] };
    bloque.filas.push(filaDeSesion(sesion, i));
    porMes.set(clave, bloque);
  });
  const bloques = [...porMes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, bloque]) => {
      const cuenta = bloque.filas.length;
      return `<span class="f-hueso__mes">${escapar(bloque.titulo)} · ${cuenta} ${
        cuenta === 1 ? 'SESIÓN' : 'SESIONES'
      }</span>${bloque.filas.join('')}`;
    });

  contenedor.innerHTML = `
    <div class="f-hueso f-root">
      ${cabecera('HISTORIAL', acciones)}
      <div class="f-hueso__cuerpo">${bloques.join('')}</div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// HI-02 · Detalle de sesión
// --------------------------------------------------------------------------

/** Sesion anterior del MISMO grupo, para el "vs. anterior". */
function anteriorDelGrupo(historial: HistorySession[], indice: number): HistorySession | null {
  const actual = historial[indice];
  for (let i = indice + 1; i < historial.length; i++) {
    const s = historial[i];
    if (s.type === 'cardio') continue;
    if (s.grupo === actual.grupo && (s.volumenTotal || 0) > 0) return s;
  }
  return null;
}

/**
 * @param sobreHueso  true en las cards blancas, donde el README manda los
 *   tonos oscuros (#3F8F5F / #B5443F). En el header, que es Carbon, van los
 *   colores de zona planos: el verde oscuro sobre #0B0C0F baja el contraste
 *   de 7.90 a 4.94.
 */
function claseDeDelta(valor: number, sobreHueso = true): string {
  if (valor > 0) return sobreHueso ? 'f-verde-hueso' : 'f-verde';
  if (valor < 0) return sobreHueso ? 'f-rojo-hueso' : 'f-rojo';
  return '';
}

/** El mismo signo en toda la app: U+2212, no el guion de teclado. */
function signo(valor: number): string {
  return valor > 0 ? '+' : valor < 0 ? '−' : '';
}

function cardDeEjercicio(ejercicio: ExerciseData, historial: HistorySession[], indice: number): string {
  const pico = picoReal(ejercicio.nombre, historial) || ejercicio.peso;
  // Sets del historial: el modelo guarda un solo peso y unas reps por
  // ejercicio, no set a set. Se dibuja lo que EXISTE: una barra por set con
  // el mismo peso, que es lo que se registro.
  const filas = Array.from({ length: Math.max(0, ejercicio.sets) }, (_, i) => {
    const ancho = pico > 0 ? Math.min(100, (ejercicio.peso / pico) * 100) : 0;
    const esPR = ejercicio.peso >= pico && pico > 0;
    return `
      <div class="f-set">
        <span class="f-set__indice">${i + 1}</span>
        <span class="f-set__reps">${ejercicio.reps} reps</span>
        <div class="f-set__pista"><div class="f-set__relleno${
          esPR ? ' f-set__relleno--pr' : ''
        }" style="width:${ancho.toFixed(1)}%"></div></div>
        <span class="f-set__kg">${cifraDecimal(ejercicio.peso)} kg</span>
      </div>
    `;
  }).join('');

  // Comparacion contra la vez anterior del mismo ejercicio.
  const apariciones = sesionesCon(ejercicio.nombre, historial.slice(indice));
  const anterior = apariciones[1]?.ejercicio ?? null;
  const deltaKg = anterior ? ejercicio.peso - anterior.peso : 0;
  const delta = anterior
    ? `<span class="f-detalle__delta ${claseDeDelta(deltaKg)}">${signo(deltaKg)}${cifraDecimal(
        Math.abs(deltaKg)
      )} kg</span>`
    : '';
  const badge = ejercicio.peso >= pico && pico > 0 ? 'PR' : '';

  return `
    <article class="f-hueso__card">
      <div class="f-detalle__cabecera">
        <div class="f-detalle__identidad">
          <div class="f-detalle__nombre">${escapar(ejercicio.nombre)}</div>
          <div class="f-detalle__meta">${escapar(ejercicio.grupoMuscular)} · ${cifra(
            ejercicio.volumen
          )} kg</div>
        </div>
        ${delta}
      </div>
      <div class="f-detalle__sets">${filas}</div>
      <div class="f-detalle__pie">
        <span class="f-detalle__pie-texto">${ejercicio.sets}×${ejercicio.reps} · ${cifraDecimal(
          ejercicio.peso
        )} kg</span>
        ${badge ? `<span class="f-detalle__pie-badge f-verde-hueso">${badge}</span>` : ''}
      </div>
    </article>
  `;
}

/**
 * HI-02 de una sesion de CARDIO. El detalle de pesas no le sirve: enseñaba
 * "VOLUMEN 0 kg", "SETS 0", cero cards y al pie una nota sobre barras de kg.
 * Se enseña lo que esa sesion SI tiene.
 */
function renderDetalleCardio(sesion: HistorySession, indice: number): string {
  const stats = sesion.stats;
  const fecha = fechaCorta(fechaDe(sesion));
  const modo = NOMBRE_MODO_CARDIO[sesion.mode ?? ''] ?? 'Cardio';
  const xp = getSessionXP(sesion.sessionId);
  const metricas: Array<{ label: string; valor: string; xp?: boolean }> = [
    { label: 'TIEMPO', valor: formatearTiempo(stats?.totalTime ?? 0) },
    { label: 'TRABAJO', valor: formatearTiempo(stats?.workTime ?? 0) },
    { label: 'RONDAS', valor: String(stats?.roundsCompleted ?? 0) },
  ];
  if (xp !== null) metricas.push({ label: 'XP', valor: `+${cifra(xp)}`, xp: true });

  return `
    <div class="f-hueso f-root">
      <header class="f-hueso__header">
        <div class="f-hueso__fila-titulo">
          <button type="button" class="f-hueso__volver" data-hueso="volver-lista" aria-label="Volver al historial">←</button>
          <div class="f-sesion__titulos">
            <span class="f-sesion__titulo">${escapar(modo).toUpperCase()}</span>
            <span class="f-sesion__sub">${escapar(fecha)}</span>
          </div>
          <button type="button" class="f-hueso__accion" data-hueso="borrar" data-indice="${indice}" aria-label="Eliminar esta sesión">⋯</button>
        </div>
        <div class="f-detalle__metricas">
          ${metricas
            .map(
              (m) => `
            <div class="f-metrica-hueso">
              <span class="f-metrica-hueso__label">${m.label}</span>
              <span class="f-metrica-hueso__cifra${
                m.xp ? ' f-metrica-hueso__cifra--xp' : ''
              }">${escapar(m.valor)}</span>
            </div>`
            )
            .join('')}
        </div>
      </header>
      <div class="f-hueso__cuerpo">
        <article class="f-hueso__card">
          <div class="f-detalle__pie">
            <span class="f-detalle__pie-texto">Descanso</span>
            <span>${formatearTiempo(stats?.restTime ?? 0)}</span>
          </div>
          <div class="f-detalle__pie">
            <span class="f-detalle__pie-texto">Kcal estimadas</span>
            <span>~${cifra(stats?.calories ?? 0)}</span>
          </div>
        </article>
      </div>
    </div>
  `;
}

function renderDetalle(historial: HistorySession[], indice: number): string {
  if (historial[indice]?.type === 'cardio') {
    return renderDetalleCardio(historial[indice], indice);
  }
  const sesion = historial[indice];
  const fecha = fechaCorta(fechaDe(sesion));
  const duracion = duracionDe(sesion);
  const rpe = sesion.rpe?.value;
  const { titulo, prefijo } = partirNombreDeGrupo(sesion.grupo || 'Sesión');
  const sub = [prefijo || null, fecha, duracion, rpe !== undefined ? `RPE ${rpe}` : null]
    .filter(Boolean)
    .join(' · ');

  const anterior = anteriorDelGrupo(historial, indice);
  const volumen = sesion.volumenTotal || 0;
  const variacion =
    anterior && (anterior.volumenTotal || 0) > 0
      ? Math.round(((volumen - anterior.volumenTotal) / anterior.volumenTotal) * 100)
      : null;
  const sets = (sesion.ejercicios ?? []).reduce((t, e) => t + (e.sets || 0), 0);
  const xp = getSessionXP(sesion.sessionId);

  const metricas = `
    <div class="f-detalle__metricas">
      <div class="f-metrica-hueso f-metrica-hueso--ancha">
        <span class="f-metrica-hueso__label">VOLUMEN</span>
        <span class="f-metrica-hueso__cifra">${cifra(volumen)} <span class="f-metrica-hueso__unidad">kg</span></span>
      </div>
      ${
        variacion === null
          ? ''
          : `<div class="f-metrica-hueso">
               <span class="f-metrica-hueso__label">VS. ANTERIOR</span>
               <span class="f-metrica-hueso__cifra ${claseDeDelta(variacion, false)}">${signo(
                 variacion
               )}${Math.abs(variacion)}%</span>
             </div>`
      }
      <div class="f-metrica-hueso">
        <span class="f-metrica-hueso__label">SETS</span>
        <span class="f-metrica-hueso__cifra">${sets}</span>
      </div>
      ${
        xp === null
          ? ''
          : `<div class="f-metrica-hueso">
               <span class="f-metrica-hueso__label">XP</span>
               <span class="f-metrica-hueso__cifra f-metrica-hueso__cifra--xp">+${cifra(xp)}</span>
             </div>`
      }
    </div>
  `;

  const cards = (sesion.ejercicios ?? [])
    .filter((e) => e.volumen > 0)
    .map((e) => cardDeEjercicio(e, historial, indice))
    .join('');

  return `
    <div class="f-hueso f-root">
      <header class="f-hueso__header">
        <div class="f-hueso__fila-titulo">
          <button type="button" class="f-hueso__volver" data-hueso="volver-lista" aria-label="Volver al historial">←</button>
          <div class="f-sesion__titulos">
            <span class="f-sesion__titulo">${escapar(titulo).toUpperCase()}</span>
            <span class="f-sesion__sub">${escapar(sub)}</span>
          </div>
          <button type="button" class="f-hueso__accion" data-hueso="borrar" data-indice="${indice}" aria-label="Eliminar esta sesión">⋯</button>
        </div>
        ${metricas}
      </header>
      <div class="f-hueso__cuerpo">
        ${cards}
        <p class="f-hueso__nota">El largo de cada barra = kg del set relativo al mejor set histórico del ejercicio. El set PR se pinta en Fragua.</p>
      </div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// PR-01 · Récords
// --------------------------------------------------------------------------

function barraDeZonas(posicion: number, estado: string, pico: number): string {
  return `
    <div class="f-zonas">
      <div class="f-zonas__pista">
        <div class="f-zonas__roja"></div>
        <div class="f-zonas__ambar"></div>
        <div class="f-zonas__verde"></div>
        <div class="f-zonas__marcador" data-zona-pos="${(posicion / 100).toFixed(4)}"></div>
      </div>
      <div class="f-zonas__pie">
        <span>${escapar(estado)}</span>
        <span>PICO ${cifraDecimal(pico)} KG</span>
      </div>
    </div>
  `;
}

export function renderRecords(contenedor: HTMLElement): void {
  const historial = getHistory();
  const prs = getPRs();
  const nombres = Object.keys(prs).sort(
    (a, b) => new Date(prs[b].date).getTime() - new Date(prs[a].date).getTime()
  );

  const extra = `<span class="f-hueso__subtitulo">1RM estimado vs. tu pico</span>`;

  if (nombres.length === 0) {
    contenedor.innerHTML = `
      <div class="f-hueso f-root">
        ${cabecera('RÉCORDS', extra, 'f-hueso__fila-titulo--baseline')}
        <div class="f-hueso__cuerpo">
          <div class="f-vacio-hueso">
            <span class="f-vacio-hueso__label">RÉCORDS SIN DATOS</span>
            <span class="f-vacio-hueso__titulo">Aquí vivirá cada marca que batas.</span>
            <div class="f-vacio-hueso__acciones">
              <button type="button" class="f-btn-hueso" data-hueso="primera">Primera sesión</button>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const cards = nombres
    .map((nombre) => {
      const pr = prs[nombre];
      // El pico es el mayor de los dos: el historial puede no tener la sesion
      // del record (un CSV importado guarda el PR y no la sesion), y el
      // record puede quedarse corto si la sesion es mas nueva.
      const pico = picoReal(nombre, historial);
      // Sin sesiones de ese ejercicio en el historial no hay "actual" que
      // enseñar: la barra decia "SIN DATOS" con el marcador clavado al 100%,
      // dos cifras contando historias distintas en la misma barra.
      const actual = pesoActual(nombre, historial);
      const rm = calculate1RM(nombre);
      // Si el historial no tiene el ejercicio, calculate1RM no puede estimar
      // nada: se estima con el propio record en vez de enseñar el peso crudo
      // bajo el rotulo "1RM estimado".
      const estimado = rm ? Number(rm.average) : estimateOneRM(pr.peso, pr.reps) || pr.peso;
      const detalle = `${pr.sets}×${pr.reps} · ${cifraDecimal(pr.peso)} kg`;
      if (actual === null) {
        return `
          <article class="f-hueso__card">
            <div class="f-pr__cabecera">
              <div class="f-pr__identidad">
                <div class="f-pr__nombre">${escapar(nombre)}</div>
                <div class="f-pr__detalle">${detalle}</div>
              </div>
              <span class="f-pr__cifra">${cifraDecimal(estimado)} <span class="f-pr__unidad">kg</span></span>
            </div>
            <p class="f-graf__nota">Sin sesiones recientes de este ejercicio: complétalo una vez y estrena su barra de zonas.</p>
          </article>
        `;
      }
      const posicion = pico > 0 ? posicionEnZonas(actual / pico) : 0;
      return `
        <article class="f-hueso__card">
          <div class="f-pr__cabecera">
            <div class="f-pr__identidad">
              <div class="f-pr__nombre">${escapar(nombre)}</div>
              <div class="f-pr__detalle">${detalle}</div>
            </div>
            <span class="f-pr__cifra">${cifraDecimal(estimado)} <span class="f-pr__unidad">kg</span></span>
          </div>
          ${barraDeZonas(posicion, estadoDeZona(nombre, historial, pico), pico)}
        </article>
      `;
    })
    .join('');

  contenedor.innerHTML = `
    <div class="f-hueso f-root">
      ${cabecera('RÉCORDS', extra, 'f-hueso__fila-titulo--baseline')}
      <div class="f-hueso__cuerpo">${cards}</div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// G-01 · Gráficos
// --------------------------------------------------------------------------

let rangoActivo: Rango = 'mes';
let ejercicioActivo: string | null = null;

export function fijarRango(rango: Rango): void {
  rangoActivo = rango;
}

export function fijarEjercicio(nombre: string): void {
  ejercicioActivo = nombre;
}

const RANGOS: Array<{ id: Rango; texto: string }> = [
  { id: 'dia', texto: 'Día' },
  { id: 'semana', texto: 'Semana' },
  { id: 'mes', texto: 'Mes' },
  { id: 'todo', texto: 'Todo' },
];

const VENTANA_MEDIA = 5;

export function renderGraficos(contenedor: HTMLElement): void {
  const historial = getHistory();
  const pesas = historial.filter((s) => s.type !== 'cardio' && (s.volumenTotal || 0) > 0);

  if (pesas.length === 0) {
    contenedor.innerHTML = `
      <div class="f-hueso f-root">
        ${cabecera('GRÁFICOS')}
        <div class="f-hueso__cuerpo">
          <div class="f-vacio-hueso">
            <span class="f-vacio-hueso__label">GRÁFICOS · SIN PUNTOS</span>
            <span class="f-vacio-hueso__titulo">Un punto todavía no es una curva. A la segunda sesión, esto se convierte en línea.</span>
            <div class="f-vacio-hueso__acciones">
              <button type="button" class="f-btn-hueso" data-hueso="primera">Primera sesión</button>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const segmentado = `
    <div class="f-segmentado" role="group" aria-label="Rango temporal">
      ${RANGOS.map(
        (r) =>
          `<button type="button" class="f-segmentado__item" data-hueso="rango" data-rango="${r.id}" aria-pressed="${
            r.id === rangoActivo
          }">${r.texto}</button>`
      ).join('')}
    </div>
  `;

  contenedor.innerHTML = `
    <div class="f-hueso f-root">
      ${cabecera('GRÁFICOS')}
      <div class="f-hueso__cuerpo f-hueso__cuerpo--graficos">
        ${segmentado}
        ${cardVolumen(historial)}
        ${cardDistribucion(historial)}
        ${cardPorEjercicio(historial)}
      </div>
    </div>
  `;
}

/**
 * El mockup rotula esta card "VOLUMEN POR SESIÓN" con el toggle en "Mes", que
 * no puede ser las dos cosas: si el toggle agrupa por mes, cada punto es un
 * mes. La etiqueta sigue al agrupamiento — un rotulo que miente es peor que
 * uno que se aparta del mockup. PREGUNTA ABIERTA para el dueño del diseño.
 */
const ETIQUETA_VOLUMEN: Record<Rango, string> = {
  dia: 'VOLUMEN POR DÍA',
  semana: 'VOLUMEN POR SEMANA',
  mes: 'VOLUMEN POR MES',
  todo: 'VOLUMEN POR SESIÓN',
};

function cardVolumen(historial: HistorySession[]): string {
  const serie = serieDeVolumen(historial, rangoActivo);
  const valores = serie.map((p) => p.volumen);
  const maximo = Math.max(...valores, 1);
  const media = mediaMovil(valores, VENTANA_MEDIA);
  const linea = polilinea(valores, maximo);
  const lineaMedia = polilinea(media, maximo);
  const primera = serie[0]?.etiqueta ?? '';
  const ultima = serie.at(-1)?.etiqueta ?? '';

  // Un solo punto no es una curva: el mockup lo dice con todas las letras
  // en O-02, y una polilinea de un punto no dibuja nada.
  if (serie.length === 1) {
    return `
      <div class="f-vacio-hueso">
        <span class="f-vacio-hueso__label">GRÁFICOS · UN SOLO PUNTO</span>
        <div class="f-vacio-hueso__grafico">
          <svg viewBox="0 0 120 44" width="120" height="44" aria-hidden="true">
            <line x1="0" y1="38" x2="120" y2="38" stroke="var(--hueso-200)" stroke-width="1"></line>
            <circle cx="14" cy="22" r="4" fill="var(--accent)"></circle>
            <line x1="26" y1="22" x2="120" y2="22" stroke="var(--hueso-300)" stroke-width="1.5" stroke-dasharray="3 4"></line>
          </svg>
          <span class="f-vacio-hueso__texto">Un punto todavía no es una curva. A la segunda sesión, esto se convierte en línea.</span>
        </div>
      </div>
    `;
  }

  return `
    <section class="f-graf">
      <div class="f-graf__cabecera">
        <span class="f-graf__label">${ETIQUETA_VOLUMEN[rangoActivo]}</span>
        <span class="f-graf__max">máx ${cifra(maximo)}</span>
      </div>
      <svg class="f-graf__svg" viewBox="0 0 320 110" preserveAspectRatio="none" role="img" aria-label="Volumen por sesión">
        <polyline class="f-graf__linea" points="${linea}" vector-effect="non-scaling-stroke"></polyline>
        ${lineaMedia ? `<polyline class="f-graf__media" points="${lineaMedia}" vector-effect="non-scaling-stroke"></polyline>` : ''}
      </svg>
      <div class="f-graf__pie">
        <span>${escapar(primera.toUpperCase())}</span>
        <!-- La leyenda solo aparece si la linea existe: con menos de
             ${VENTANA_MEDIA} puntos no hay media movil que nombrar. -->
        <span>${lineaMedia ? `— MEDIA MÓVIL ×${VENTANA_MEDIA}` : ''}</span>
        <span>${escapar(ultima.toUpperCase())}</span>
      </div>
    </section>
  `;
}

function cardDistribucion(historial: HistorySession[]): string {
  const dist = distribucionMuscular(historial);
  if (dist.length === 0) return '';
  // El ancho es el porcentaje REAL, no el relativo al mayor: normalizando al
  // mayor, tres grupos al 33% salian con tres barras llenas identicas.
  // Y los enteros se reparten por resto mayor para que sumen 100: tres
  // "33%" que suman 99 los ve cualquiera.
  const enteros = repartirCien(dist.map((d) => d.porcentaje));
  const filas = dist
    .map(
      (d, i) => `
        <div class="f-dist">
          <span class="f-dist__nombre">${escapar(d.musculo)}</span>
          <div class="f-dist__pista"><div class="f-dist__relleno" style="width:${d.porcentaje.toFixed(
            1
          )}%"></div></div>
          <span class="f-dist__pct">${enteros[i]}%</span>
        </div>
      `
    )
    .join('');
  return `
    <section class="f-graf">
      <span class="f-graf__label">DISTRIBUCIÓN MUSCULAR · VOLUMEN HISTÓRICO</span>
      ${filas}
    </section>
  `;
}

/** Ejercicios con al menos una aparicion, de mas reciente a mas antigua. */
export function ejerciciosDelHistorial(historial: HistorySession[]): string[] {
  const vistos: string[] = [];
  for (const sesion of historial) {
    if (sesion.type === 'cardio') continue;
    for (const e of sesion.ejercicios ?? []) {
      if (e.volumen > 0 && !vistos.includes(e.nombre)) vistos.push(e.nombre);
    }
  }
  return vistos;
}

function cardPorEjercicio(historial: HistorySession[]): string {
  const disponibles = ejerciciosDelHistorial(historial);
  if (disponibles.length === 0) return '';
  const nombre = ejercicioActivo && disponibles.includes(ejercicioActivo) ? ejercicioActivo : disponibles[0];
  const pico = picoReal(nombre, historial);
  const actual = pesoActual(nombre, historial) ?? 0;
  const ratio = pico > 0 ? actual / pico : 0;
  const variacion = pico > 0 ? Math.round((actual / pico - 1) * 100) : 0;
  const opciones = disponibles
    .map((n) => `<option value="${escapar(n)}"${n === nombre ? ' selected' : ''}>${escapar(n)}</option>`)
    .join('');

  return `
    <section class="f-graf">
      <div class="f-graf__cabecera f-graf__cabecera--centro">
        <span class="f-graf__label">POR EJERCICIO</span>
        <select class="f-graf__selector" data-hueso="ejercicio" aria-label="Elegir ejercicio">${opciones}</select>
      </div>
      <div class="f-graf__actual">
        <span class="f-graf__actual-cifra">${cifraDecimal(actual)} <span class="f-graf__actual-unidad">kg actual</span></span>
        <span class="f-graf__delta ${variacion < 0 ? 'f-rojo-hueso' : 'f-verde-hueso'}">${
          variacion >= 0 ? '+' : '−'
        }${Math.abs(variacion)}% vs pico</span>
      </div>
      ${barraDeZonas(posicionEnZonas(ratio), estadoDeZona(nombre, historial, pico), pico)}
      <p class="f-graf__nota">Actual = tu mejor set de las últimas 3 sesiones. Zonas relativas a tu pico histórico: roja &lt;70%, ámbar 70–95%, verde 95%+ (territorio PR).</p>
    </section>
  `;
}

/**
 * El marcador entra desde 0 hasta su posicion (~600ms ease-out). Se aplica
 * despues de pintar, en el siguiente frame: puesto en el HTML, el navegador
 * no tiene un estado inicial del que animar.
 */
export function animarZonas(contenedor: HTMLElement): void {
  const marcadores = contenedor.querySelectorAll<HTMLElement>('.f-zonas__marcador');
  requestAnimationFrame(() => {
    marcadores.forEach((m) => {
      m.style.setProperty('--t', m.dataset.zonaPos ?? '0');
    });
  });
}

export { zonaDe };
