/**
 * FIERRO · H-01 — Inicio.
 *
 * Recrea la pantalla del mockup: saludo y fecha, racha, card del coach,
 * heatmap de consistencia, nivel con mapa muscular, banner de borrador,
 * rutinas, mis rutinas y la entrada a cardio.
 *
 * Todo el color y la tipografia salen de las clases f-* y de tokens.css.
 * Los valores de geometria llevan su [REF] a la linea del mockup.
 */
import { getHistory, getCustomWorkouts, getProfile } from '@/utils/storage';
import { checkForExistingDraft } from '@/state/session';
import { trainingGroups } from '@/data/training-groups';
import { generateInsight, type Insight } from '@/utils/insights';
import {
  getCurrentLevel,
  getCurrentTitle,
  getCurrentLevelProgress,
  getMuscleRanks,
  getStreakInfo,
} from '@/features/gamification';
import { renderMapaFierro, colorDeRango } from '@/ui/gamification/muscle-map';
import { construirHeatmap, type CeldaHeatmap, type Heatmap } from '@/utils/heatmap';
import { cifra } from '@/utils/formato';
import type { GamificationMuscleGroup } from '@/types/gamification';

const DIA_MS = 24 * 60 * 60 * 1000;

// --------------------------------------------------------------------------
// Utilidades de texto
// --------------------------------------------------------------------------

function escapar(texto: string): string {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

/** "MIÉ 13 AGO" — como el mockup: abreviado y en mayusculas. */
function fechaTitular(hoy: Date): string {
  const dia = hoy.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
  const mes = hoy.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return `${dia} ${hoy.getDate()} ${mes}`.toUpperCase();
}

function saludo(hoy: Date): string {
  const h = hoy.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** "hace 3 días" / "hoy" / "ayer". */
function haceCuanto(fechaISO: string, hoy: Date): string {
  const dias = Math.floor((hoy.getTime() - new Date(`${fechaISO.slice(0, 10)}T00:00:00`).getTime()) / DIA_MS);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/**
 * Envuelve en Fragua el fragmento destacado del mensaje del coach: el dato,
 * nunca la frase entera.
 */
function mensajeConDato(insight: Insight): string {
  const texto = escapar(insight.message);
  if (!insight.destacado) return texto;
  const dato = escapar(insight.destacado);
  const i = texto.indexOf(dato);
  if (i === -1) return texto;
  return (
    texto.slice(0, i) +
    `<span style="color:var(--accent)">${dato}</span>` +
    texto.slice(i + dato.length)
  );
}

// --------------------------------------------------------------------------
// Bloques
// --------------------------------------------------------------------------

function bloqueCabecera(hoy: Date, racha: number): string {
  const perfil = getProfile();
  const nombre = perfil.name ? `, ${escapar(perfil.name)}` : '';
  return `
    <div class="f-home__cabecera">
      <div class="f-home__saludo">
        <span class="f-home__hola">${saludo(hoy)}${nombre}</span>
        <span class="f-home__fecha">${fechaTitular(hoy)}</span>
      </div>
      ${racha > 0 ? `<span class="f-home__racha">RACHA ${racha}</span>` : ''}
    </div>
  `;
}

function bloqueCoach(insight: Insight): string {
  return `
    <section class="f-home__coach" aria-label="Mensaje del coach">
      <div class="f-label">COACH</div>
      <p class="f-home__coach-mensaje">${mensajeConDato(insight)}</p>
      ${insight.subtext ? `<p class="f-home__coach-contexto">${escapar(insight.subtext)}</p>` : ''}
    </section>
  `;
}

function celdaHeatmap(celda: CeldaHeatmap): string {
  const clases = ['f-heat__celda'];
  if (celda.soloCardio) clases.push('f-heat__celda--cardio');
  // El mockup de H-01 no anima la celda de hoy; solo la de O-01 lo hace.
  // [REF :55 sin atributo animation, frente a :1276 con el]
  const relleno = celda.soloCardio ? '' : ` style="background:var(--heat-${celda.cuartil === 0 ? '0' : 'q' + celda.cuartil})"`;
  const titulo = celda.soloCardio
    ? `${celda.fecha}: solo cardio`
    : celda.volumen > 0
      ? `${celda.fecha}: ${cifra(celda.volumen)} kg`
      : `${celda.fecha}: sin entrenar`;
  return `<div class="${clases.join(' ')}"${relleno} title="${titulo}"></div>`;
}

function bloqueHeatmap(mapa: Heatmap): string {
  const columnas = mapa.semanas
    .map((semana) => `<div class="f-heat__semana">${semana.map(celdaHeatmap).join('')}</div>`)
    .join('');

  const hueco = mapa.huecoMayor
    ? `<span class="f-heat__hueco">← hueco de ${mapa.huecoMayor.dias} días</span>`
    : '<span></span>';

  const escala = [0, 1, 2, 3, 4]
    .map((q) => `<div class="f-heat__muestra" style="background:var(--heat-${q === 0 ? '0' : 'q' + q})"></div>`)
    .join('');

  return `
    <section class="f-home__heatmap" aria-label="Heatmap de consistencia">
      <div class="f-home__heatmap-cabecera">
        <span class="f-home__seccion">Últimas 16 semanas</span>
        <span class="f-home__heatmap-conteo f-num"><b>${mapa.entrenos}</b> entrenos</span>
      </div>
      <div class="f-heat">${columnas}</div>
      <div class="f-home__heatmap-pie">
        ${hueco}
        <div class="f-heat__leyenda">
          <span>0</span>
          ${escala}
          <span class="f-heat__leyenda-q4">Q4</span>
          <div class="f-heat__muestra f-heat__muestra--cardio"></div>
          <span class="f-heat__leyenda-cardio">cardio</span>
        </div>
      </div>
      <p class="f-home__heatmap-nota">1 celda = 1 día (suma de sus sesiones). El tono = cuartil del volumen del día dentro de TU historial de 6 meses. Solo cardio = anillo, no compite en kg.</p>
    </section>
  `;
}

function bloqueNivel(): string {
  const rangos = getMuscleRanks();
  const progreso = getCurrentLevelProgress();
  const titulo = getCurrentTitle();

  // Se agrupa POR RANGO, no por grupo muscular: el mockup une "Piernas ·
  // Glúteos" en una sola fila porque los dos estan en Oro, y deja "Core" solo
  // porque es el unico en Hierro. Tomar "el mejor grupo y el peor" daba dos
  // filas identicas en cuanto dos grupos empataban.
  const entradas = Object.entries(rangos) as [GamificationMuscleGroup, { rank: string }][];
  const porRango = new Map<string, GamificationMuscleGroup[]>();
  for (const [grupo, datos] of entradas) {
    const lista = porRango.get(datos.rank) ?? [];
    lista.push(grupo);
    porRango.set(datos.rank, lista);
  }
  const rangosPresentes = [...porRango.keys()].sort(
    (a, b) => ORDEN_RANGOS.indexOf(b) - ORDEN_RANGOS.indexOf(a)
  );
  // Con todos los grupos en el mismo rango, dos filas iguales no dicen nada:
  // se muestra una sola.
  const aMostrar =
    rangosPresentes.length > 1
      ? [rangosPresentes[0], rangosPresentes[rangosPresentes.length - 1]]
      : rangosPresentes;

  const filas = aMostrar
    .map((rango) => {
      const grupos = (porRango.get(rango) ?? []).map((g) => NOMBRE_GRUPO[g] ?? g);
      return `
        <div class="f-home__rango">
          <span>${grupos.join(' · ')}</span>
          <span style="color:${colorDeRango(rango)};font-weight:var(--w-600)">${nombreDeRango(rango)}</span>
        </div>`;
    })
    .join('');

  const pct = Math.max(0, Math.min(100, progreso.percentage));

  return `
    <section class="f-home__nivel" aria-label="Nivel y rangos">
      ${renderMapaFierro(rangos)}
      <div class="f-home__nivel-datos">
        <div class="f-home__nivel-titulo">
          <span class="f-home__nivel-numero">NIVEL ${getCurrentLevel()}</span>
          <span class="f-home__nivel-sub f-num">${escapar(titulo.full)} · ${cifra(progreso.currentXP)} / ${cifra(progreso.maxXP)} XP</span>
        </div>
        <div class="f-barra"><div class="f-barra__relleno" style="width:${pct}%"></div></div>
        <div class="f-home__rangos">${filas}</div>
        <button type="button" class="f-home__enlace" data-accion="progreso">Ver progreso completo →</button>
      </div>
    </section>
  `;
}

/** Los rangos se guardan sin tilde en el estado; el README los escribe con
 *  ella ("Campeón", "Simétrico") y es lo que ve el usuario. */
const RANGO_VISIBLE: Record<string, string> = {
  Campeon: 'Campeón',
  Simetrico: 'Simétrico',
};
export function nombreDeRango(rango: string): string {
  return RANGO_VISIBLE[rango] ?? rango;
}

const ORDEN_RANGOS = [
  'Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Esmeralda', 'Diamante', 'Campeon', 'Simetrico',
];

const NOMBRE_GRUPO: Partial<Record<GamificationMuscleGroup, string>> = {
  pecho: 'Pecho',
  espalda: 'Espalda',
  hombros: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  core: 'Core',
  gluteos: 'Glúteos',
  piernas: 'Piernas',
};

function bloqueBorrador(hoy: Date): string {
  const { hasDraft, draft } = checkForExistingDraft();
  if (!hasDraft || !draft) return '';
  const total = draft.ejercicios?.length ?? 0;
  const hechos = draft.ejercicios?.filter((e) => e.completado).length ?? 0;
  const guardado = draft.savedAt ? haceCuanto(new Date(draft.savedAt).toISOString(), hoy) : null;
  const cuando = guardado ? `Borrador guardado ${guardado}` : 'Borrador guardado';
  return `
    <section class="f-home__borrador" aria-label="Sesión en curso">
      <div class="f-home__borrador-texto">
        <span class="f-home__borrador-titulo">Sesión en curso — ${escapar(draft.grupo || 'Entrenamiento')}</span>
        <span class="f-home__borrador-sub">${cuando} · ${hechos}/${total} ejercicios</span>
      </div>
      <button type="button" class="f-home__continuar" data-accion="continuar">Continuar</button>
      <button type="button" class="f-home__descartar" data-accion="descartar" aria-label="Descartar la sesión">✕</button>
    </section>
  `;
}

function bloqueRutinas(hoy: Date): string {
  const historial = getHistory();
  const ultimaPorGrupo = new Map<string, string>();
  for (const sesion of historial) {
    if (sesion.type === 'cardio' || !sesion.grupo) continue;
    if (!ultimaPorGrupo.has(sesion.grupo)) ultimaPorGrupo.set(sesion.grupo, sesion.date);
  }

  const filas = Object.entries(trainingGroups)
    .map(([id, grupo], i) => {
      // Solo los principales: el mockup cuenta 6 para el GRUPO 1, que tiene
      // 6 principales y 2 opcionales. Los opcionales no entran. [REF :1577]
      const cuenta = grupo.ejercicios?.length ?? 0;
      const ultima = ultimaPorGrupo.get(grupo.nombre);
      return `
        <button type="button" class="f-home__rutina" data-grupo="${escapar(id)}">
          <span class="f-home__rutina-texto">
            <span class="f-home__rutina-grupo">GRUPO ${i + 1}</span>
            <span class="f-home__rutina-nombre">${escapar(grupo.nombre.replace(/^GRUPO \d+\s*-\s*/, ''))}</span>
          </span>
          <span class="f-home__rutina-meta f-num">${cuenta} ejercicios<br>${ultima ? haceCuanto(ultima, hoy) : 'sin registrar'}</span>
          <span class="f-home__chevron">›</span>
        </button>`;
    })
    .join('');

  return `
    <section class="f-home__seccion-bloque" aria-label="Rutinas">
      <div class="f-home__seccion-cabecera">
        <span class="f-home__seccion">Rutinas</span>
        <span class="f-home__seccion-meta">${Object.keys(trainingGroups).length} predefinidas</span>
      </div>
      ${filas}
    </section>
  `;
}

function bloqueMisRutinas(): string {
  const propias = getCustomWorkouts();
  if (propias.length === 0) return '';
  const filas = propias
    .map(
      (rutina) => `
        <div class="f-home__propia">
          <button type="button" class="f-home__propia-nombre" data-custom-workout="${escapar(rutina.id)}">${escapar(rutina.nombre)}</button>
          <span class="f-home__propia-meta">${rutina.ejercicios?.length ?? 0} ejercicios</span>
          <button type="button" class="f-home__eliminar" data-eliminar-rutina="${escapar(rutina.id)}">Eliminar</button>
        </div>`
    )
    .join('');
  return `
    <section class="f-home__seccion-bloque" aria-label="Mis rutinas">
      <span class="f-home__seccion">Mis rutinas</span>
      ${filas}
    </section>
  `;
}

function bloqueCardio(): string {
  return `
    <button type="button" class="f-home__cardio" data-accion="cardio">
      <span class="f-home__cardio-texto">
        <span class="f-home__cardio-titulo">Cardio &amp; HIIT</span>
        <span class="f-home__cardio-sub">Tabata · EMOM · AMRAP · Circuito · Pirámide</span>
      </span>
      <span class="f-badge f-badge--intensa f-badge--h01">6 MODOS</span>
    </button>
  `;
}

// --------------------------------------------------------------------------
// Render
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// O-01 — Home sin datos. "El vacio es el tablero": ni ilustraciones tristes
// ni "No hay datos", siempre con la accion siguiente a la vista.
// --------------------------------------------------------------------------

function heatmapVacio(hoy: Date): string {
  const mapa = construirHeatmap([], hoy);
  const columnas = mapa.semanas
    .map(
      (semana) =>
        `<div class="f-heat__semana">${semana
          .map((c) => `<div class="f-heat__celda f-heat__celda--vacio${c.esHoy ? ' f-heat__celda--hoy-vacio' : ''}"></div>`)
          .join('')}</div>`
    )
    .join('');
  return `
    <section class="f-home__heatmap" aria-label="Heatmap de consistencia">
      <div class="f-home__heatmap-cabecera">
        <span class="f-home__seccion">Tus 16 semanas</span>
        <span class="f-home__vacio-meta">empiezan hoy</span>
      </div>
      <div class="f-heat">${columnas}</div>
      <p class="f-home__vacio-nota">La celda de hoy late esperándote. Nada de ilustraciones tristes: el vacío es el tablero.</p>
    </section>
  `;
}

/**
 * El mockup dice "Elige una rutina abajo — 6 ejercicios, ~45 min."
 * El repo no guarda duracion por rutina ni por ejercicio (solo CardioConfig
 * tiene duration), y en O-01 no hay historial del que estimarla. Se omite el
 * tiempo en vez de inventar una metrica. PREGUNTA ABIERTA al dueno del diseno.
 */
function renderHomeVacio(contenedor: HTMLElement, hoy: Date): void {
  const grupos = Object.entries(trainingGroups);
  const [idPrimero, primero] = grupos[0];
  const segundo = grupos[1];
  const rangos = getMuscleRanks();
  const enHierro = Object.values(rangos).filter((r) => r.rank === 'Hierro').length;

  contenedor.className = 'f-root f-home';
  contenedor.innerHTML = `
    <div class="f-home__saludo">
      <span class="f-home__hola">${saludo(hoy)}</span>
      <span class="f-home__fecha">SESIÓN 0</span>
    </div>

    <section class="f-home__coach" aria-label="Mensaje del coach">
      <div class="f-label">COACH</div>
      <p class="f-home__coach-mensaje">Tu primera sesión enciende la primera celda. Elige una rutina abajo — ${primero.ejercicios.length} ejercicios.</p>
    </section>

    ${heatmapVacio(hoy)}

    <section class="f-home__nivel" aria-label="Rangos">
      ${renderMapaFierro(rangos, { ancho: 72, alto: 144, vacio: true })}
      <div class="f-home__nivel-datos">
        <span class="f-home__vacio-titulo">${enHierro} GRUPOS EN HIERRO</span>
        <span class="f-home__vacio-texto">Todos empiezan abajo. Cada sesión alimenta el rango del músculo que trabajas — el mapa se enciende contigo.</span>
      </div>
    </section>

    <section class="f-home__seccion-bloque" aria-label="Empieza por aquí">
      <span class="f-home__seccion">Empieza por aquí</span>
      <button type="button" class="f-home__rutina f-home__rutina--recomendada" data-grupo="${escapar(idPrimero)}">
        <span class="f-home__rutina-texto">
          <span class="f-home__rutina-grupo f-home__rutina-grupo--recomendada">RECOMENDADA PARA EMPEZAR</span>
          <span class="f-home__rutina-nombre">${escapar(primero.nombre.replace(/^GRUPO \d+\s*-\s*/, ''))}</span>
        </span>
        <span class="f-home__rutina-meta f-num">${primero.ejercicios.length} ejercicios</span>
        <span class="f-home__chevron f-home__chevron--acento">›</span>
      </button>
      ${
        segundo
          ? `<button type="button" class="f-home__rutina" data-grupo="${escapar(segundo[0])}">
               <span class="f-home__rutina-nombre" style="flex:1">${escapar(segundo[1].nombre.replace(/^GRUPO \d+\s*-\s*/, ''))}</span>
               <span class="f-home__rutina-meta f-num">${segundo[1].ejercicios.length} ejercicios</span>
               <span class="f-home__chevron">›</span>
             </button>`
          : ''
      }
      <button type="button" class="f-home__importar" data-accion="importar">
        <span>¿Vienes de otra app? Importa tu historial</span>
        <span class="f-home__importar-accion">CSV ↑</span>
      </button>
    </section>
  `;
}

export function renderHome(contenedor: HTMLElement, hoy: Date = new Date()): void {
  const historial = getHistory();
  const borrador = checkForExistingDraft();
  // O-01 solo si no hay NADA. Con un borrador vivo, quien esta a mitad de su
  // primera sesion veria "SESIÓN 0" y perderia el boton de continuar.
  if (historial.length === 0 && !borrador.hasDraft) {
    renderHomeVacio(contenedor, hoy);
    return;
  }
  const mapa = construirHeatmap(historial, hoy);
  const hasDraft = borrador.hasDraft;
  void hasDraft;
  const racha = getStreakInfo();

  const ultimaSesion = historial.find((s) => s.type !== 'cardio');
  const diasDesdeUltima = ultimaSesion
    ? Math.floor((hoy.getTime() - new Date(`${ultimaSesion.date.slice(0, 10)}T00:00:00`).getTime()) / DIA_MS)
    : 999;

  // El banner de borrador ya dice que hay una sesion sin terminar, y esta
  // justo debajo. Si ademas el coach lo repite, se pierde el unico hueco de
  // mensaje que tiene la pantalla — que es lo que enseña el mockup: banner de
  // borrador Y coach hablando de otra cosa [REF Pantallas:41-45 con :89-96].
  // El README pone "borrador" como maxima prioridad del coach; el mockup lo
  // contradice. PREGUNTA ABIERTA; se sigue el mockup, que es la verdad visual.
  const insight = generateInsight(false, {
    totalWorkouts: historial.filter((s) => s.type !== 'cardio').length,
    streak: racha.current,
    daysSinceLastWorkout: diasDesdeUltima,
  });

  contenedor.className = 'f-root f-home';
  contenedor.innerHTML = [
    bloqueCabecera(hoy, racha.current),
    bloqueCoach(insight),
    bloqueHeatmap(mapa),
    bloqueNivel(),
    bloqueBorrador(hoy),
    bloqueRutinas(hoy),
    bloqueMisRutinas(),
    bloqueCardio(),
  ].join('');
}
