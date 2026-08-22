import { configurarBackend, comprobarToken, hayBackend, tokenBackend, urlBackend, estadoBackend, subirCopia, bajarCopia } from '@/features/backend';
import { SIN_FECHA, fechaLegible } from '@/utils/fecha';
/**
 * FIERRO · Calculadoras, Perfil y Medidas — CA-01, CA-02, P-01, P-02, P-03.
 *
 *   CA-01  1RM estimado (3 fórmulas) y próximo peso.
 *   CA-02  Calorías (Mifflin-St Jeor) con prellenado desde el perfil.
 *   P-01   Perfil: datos, resumen de medidas y copia de seguridad.
 *   P-02   Registrar medición, con % graso en vivo (bottom sheet).
 *   P-03   Historial de medidas — sección Hueso, con tendencia.
 *
 * P-01 y las calculadoras viven en Carbón (lo que pasa HOY); P-03 en Hueso
 * (lo que YA PASÓ), con la cabecera oscura que hace la transición.
 */
import { getBodyMeasurements, getHistory, getProfile, saveProfile } from '@/utils/storage';
import type { BodyMeasurement, ProfileData } from '@/types';
import { calculate1RM, calculateCalories, calculateProgressive } from '@/utils/calculations';
import { cifra, escapar } from '@/utils/formato';
import { abrirHoja } from '@/ui/session-screens';
import { mostrarToast, confirmarDestructivo } from '@/ui/feedback';
import {
  GRASA_AMBAR_HASTA,
  GRASA_VERDE_HASTA,
  GRASA_ESCALA_MAX,
  cambioDePerimetros,
  cuantasMedidas,
  etiquetaDeExtremo,
  grasaNavy,
  ordenadas,
  pieDePerimetros,
  polilineaDe,
  posicionGrasa,
  resumenDeMediciones,
  serieDeMedidas,
  ultimaMedida,
  zonaDeGrasa,
} from '@/utils/perfil-calc';


/** Un solo listener por contenedor, que sobrevive a los repintados. */
function enganchar(el: HTMLElement, manejador: (accion: HTMLElement) => void): void {
  if (el.dataset.enganchadoPerfil === 'si') return;
  el.addEventListener('click', (e) => {
    const objetivo = (e.target as HTMLElement)?.closest<HTMLElement>('[data-perfil]');
    if (objetivo) manejador(objetivo);
  });
  el.dataset.enganchadoPerfil = 'si';
}

// ==========================================
// CA-01 / CA-02 · CALCULADORAS
// ==========================================

/** Las tres pestañas del control segmentado, literales del mockup. */
const PESTANAS = [
  { id: 'rm', etiqueta: '1RM' },
  { id: 'calorias', etiqueta: 'Calorías' },
  { id: 'progresivo', etiqueta: 'Progresivo' },
] as const;
type Pestana = (typeof PESTANAS)[number]['id'];

let pestanaActiva: Pestana = 'rm';
let ejercicio1RM = '';
let ejercicioProgresivo = '';

/** Ejercicios con peso registrado, que son los unicos que se pueden calcular. */
function ejerciciosConPeso(): string[] {
  const set = new Set<string>();
  for (const sesion of getHistory()) {
    for (const ej of sesion.ejercicios ?? []) {
      if (ej.peso > 0) set.add(ej.nombre);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

function segmentado(): string {
  return `
    <div class="f-seg-carbon" role="tablist" aria-label="Calculadoras">
      ${PESTANAS.map(
        (p) => `
        <button type="button" role="tab" aria-selected="${p.id === pestanaActiva}"
          class="f-seg-carbon__item${p.id === pestanaActiva ? ' f-seg-carbon__item--activo' : ''}"
          data-perfil="pestana" data-pestana="${p.id}">${p.etiqueta}</button>`
      ).join('')}
    </div>
  `;
}

/** "mejor: 60 kg × 8" — el detalle que el mockup pone en la fila de ejercicio. */
function mejorSerieDe(nombre: string): string {
  const r = calculate1RM(nombre);
  return r ? `mejor: ${cifra(r.bestPerformance.peso)} kg × ${r.bestPerformance.reps}` : 'sin registro';
}

/** La fila "Press Banca · mejor: 60 kg × 8 ▾" del mockup. */
function filaDeEjercicio(nombre: string, detalle: string, accion: string): string {
  return `
    <button type="button" class="f-selector-fila" data-perfil="${accion}">
      <span class="f-selector-fila__nombre">${escapar(nombre || 'Elige un ejercicio')}</span>
      <span class="f-selector-fila__detalle">${escapar(detalle)} ▾</span>
    </button>
  `;
}

function panel1RM(): string {
  const disponibles = ejerciciosConPeso();
  if (disponibles.length === 0) {
    return vacio(
      'Todavía no hay ningún ejercicio con peso registrado.',
      'Completa una sesión con kg y aquí aparecerá tu 1RM estimado.'
    );
  }
  if (!ejercicio1RM || !disponibles.includes(ejercicio1RM)) ejercicio1RM = disponibles[0];

  const r = calculate1RM(ejercicio1RM);
  if (!r) {
    return (
      filaDeEjercicio(ejercicio1RM, 'sin registros', 'elegir-1rm') +
      vacio(
        'Ese ejercicio no tiene ninguna serie con peso.',
        'Regístralo una vez y el 1RM se estima solo.'
      )
    );
  }

  const mejor = `mejor: ${cifra(r.bestPerformance.peso)} kg × ${r.bestPerformance.reps}`;
  return `
    ${filaDeEjercicio(ejercicio1RM, mejor, 'elegir-1rm')}
    <section class="f-calc-card">
      <div class="f-calc-card__cabecera">
        <span class="f-calc-card__label">1RM ESTIMADO · PROMEDIO DE 3 FÓRMULAS</span>
        <span class="f-cifra f-calc-card__cifra">${r.average} <span class="f-cifra__unidad">kg</span></span>
      </div>
      <div class="f-calc-filas">
        <div class="f-calc-fila"><span class="f-calc-fila__label">Epley</span><span class="f-calc-fila__valor">${r.epley} kg</span></div>
        <div class="f-calc-fila"><span class="f-calc-fila__label">Brzycki</span><span class="f-calc-fila__valor">${r.brzycki} kg</span></div>
        <div class="f-calc-fila f-calc-fila--ultima"><span class="f-calc-fila__label">Lombardi</span><span class="f-calc-fila__valor">${r.lombardi} kg</span></div>
      </div>
    </section>
  `;
}

/** "185" y no "185.0": el mockup pinta enteros cuando lo son. */
function sinDecimalSobrante(valor: string): string {
  const n = Number.parseFloat(valor);
  return Number.isInteger(n) ? String(n) : valor;
}

function panelProgresivo(): string {
  const disponibles = ejerciciosConPeso();
  if (disponibles.length === 0) {
    return vacio(
      'Todavía no hay ningún ejercicio con peso registrado.',
      'Completa una sesión con kg y aquí verás tu próximo peso.'
    );
  }
  if (!ejercicioProgresivo || !disponibles.includes(ejercicioProgresivo)) {
    ejercicioProgresivo = disponibles[0];
  }

  const r = calculateProgressive(ejercicioProgresivo);
  if (!r) {
    return (
      filaDeEjercicio(ejercicioProgresivo, 'sin récord', 'elegir-progresivo') +
      vacio(
        'Ese ejercicio todavía no tiene récord.',
        'En cuanto marques uno, aquí sale el siguiente peso.'
      )
    );
  }

  const opciones = [
    { valor: r.conservative, nombre: 'Conservador', destacada: false },
    { valor: r.moderate, nombre: 'Moderado', destacada: true },
    { valor: r.aggressive, nombre: 'Agresivo', destacada: false },
  ];

  return `
    ${/* El mismo detalle que la pestaña 1RM ("mejor: 60 kg × 8", literal del
         mockup). Poner aqui la clasificacion interna ("tren inferior") junto a
         un chevron hacia parecer que el desplegable elegia el tren, y no
         añadia nada que no diga ya el rotulo de abajo. */ ''}
    ${filaDeEjercicio(ejercicioProgresivo, mejorSerieDe(ejercicioProgresivo), 'elegir-progresivo')}
    <div class="f-proximo">
      <span class="f-campo__label f-campo__label--corto">PRÓXIMO PESO · ${escapar(
        ejercicioProgresivo.toUpperCase()
      )} (PR ${cifra(r.current)} KG)</span>
      <div class="f-proximo__opciones">
        ${opciones
          .map(
            (o) => `
          <div class="f-proximo__opcion${o.destacada ? ' f-proximo__opcion--destacada' : ''}">
            <span class="f-proximo__cifra">${sinDecimalSobrante(o.valor)}</span>
            <span class="f-proximo__nombre">${o.nombre}</span>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;
}

/** Los cuatro campos de CA-02, literales del mockup (`calInputs`). */
const CAMPOS_CALORIAS = [
  { id: 'edad', label: 'EDAD', tipo: 'number' as const },
  { id: 'sexo', label: 'SEXO', tipo: 'sexo' as const },
  { id: 'peso', label: 'PESO (KG)', tipo: 'number' as const },
  { id: 'altura', label: 'ALTURA (CM)', tipo: 'number' as const },
];

interface DatosCalorias {
  edad: number;
  sexo: 'male' | 'female';
  peso: number;
  altura: number;
  actividad: number;
}
let datosCalorias: DatosCalorias | null = null;

function edadDe(nacimiento: string): number | null {
  if (!nacimiento) return null;
  const n = new Date(nacimiento);
  if (Number.isNaN(n.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) edad--;
  return edad >= 0 && edad < 120 ? edad : null;
}

function datosDesdeElPerfil(): DatosCalorias {
  const p = getProfile();
  return {
    edad: edadDe(p.birthdate ?? '') ?? 0,
    sexo: p.gender === 'female' ? 'female' : 'male',
    peso: p.weight ?? 0,
    altura: p.height ?? 0,
    actividad: p.activity ?? 1.55,
  };
}

function panelCalorias(): string {
  const d = datosCalorias ?? datosDesdeElPerfil();
  datosCalorias = d;

  const valorDe = (id: string): string => {
    if (id === 'sexo') return d.sexo === 'female' ? 'Femenino' : 'Masculino';
    const n = id === 'edad' ? d.edad : id === 'peso' ? d.peso : d.altura;
    return n > 0 ? String(n) : '';
  };

  const campos = CAMPOS_CALORIAS.map((c) => {
    const control =
      c.tipo === 'sexo'
        ? `<button type="button" class="f-campo__caja f-campo__caja--elegible" data-perfil="sexo">
             <span>${valorDe('sexo')}</span><span class="f-campo__chevron">▾</span>
           </button>`
        : `<input class="f-campo__caja" type="number" inputmode="numeric" min="0"
             value="${valorDe(c.id)}" placeholder="—" data-perfil-campo="${c.id}"
             aria-label="${escapar(c.label)}" />`;
    return `
      <div class="f-campo">
        <span class="f-campo__label f-campo__label--corto">${c.label}</span>
        ${control}
      </div>`;
  }).join('');

  const completos = d.edad > 0 && d.peso > 0 && d.altura > 0;
  const resultado = completos
    ? (() => {
        const r = calculateCalories(d.edad, d.sexo, d.peso, d.altura, d.actividad);
        return `
        <section class="f-calc-card">
          <div class="f-calc-card__cabecera f-calc-card__cabecera--fila">
            <span class="f-calc-card__label">TDEE · MANTENIMIENTO</span>
            <span class="f-cifra f-calc-card__cifra f-calc-card__cifra--media">${cifra(
              r.tdee
            )} <span class="f-cifra__unidad">kcal</span></span>
          </div>
          <div class="f-calc-filas">
            <div class="f-calc-fila"><span class="f-calc-fila__label">BMR (basal)</span><span class="f-calc-fila__valor">${cifra(
              r.bmr
            )} kcal</span></div>
            <div class="f-calc-fila"><span class="f-calc-fila__label">Déficit −20%</span><span class="f-calc-fila__valor f-calc-fila__valor--verde">${cifra(
              r.deficit
            )} kcal</span></div>
            <div class="f-calc-fila f-calc-fila--ultima"><span class="f-calc-fila__label">Superávit +20%</span><span class="f-calc-fila__valor f-calc-fila__valor--ambar">${cifra(
              r.surplus
            )} kcal</span></div>
          </div>
        </section>`;
      })()
    : vacio(
        'Faltan datos para el cálculo.',
        'Edad, peso y altura: con los tres, el gasto sale solo.'
      );

  return `
    <div class="f-calc-rejilla">${campos}</div>
    <button type="button" class="f-btn f-btn--terciario-caja" data-perfil="prellenar">Prellenar desde mi perfil</button>
    ${resultado}
  `;
}

function vacio(titulo: string, detalle: string): string {
  return `
    <div class="f-vacio-bloque">
      <span class="f-vacio-bloque__titulo">${escapar(titulo)}</span>
      <span class="f-vacio-bloque__detalle">${escapar(detalle)}</span>
    </div>
  `;
}

export function renderCalculadoras(contenedor: HTMLElement): void {
  const cuerpo =
    pestanaActiva === 'rm' ? panel1RM() : pestanaActiva === 'calorias' ? panelCalorias() : panelProgresivo();

  contenedor.innerHTML = `
    <div class="f-calc f-root">
      <div class="f-calc__cabecera">
        <button type="button" class="f-sesion__volver" data-perfil="volver" aria-label="Volver">←</button>
        <span class="f-calc__titulo">CALCULADORAS</span>
      </div>
      ${segmentado()}
      ${cuerpo}
    </div>
  `;
  enganchar(contenedor, (el) => alTocarPerfil(el, contenedor));
  contenedor.querySelectorAll<HTMLInputElement>('[data-perfil-campo]').forEach((input) => {
    input.addEventListener('input', () => {
      if (!datosCalorias) return;
      const n = Number.parseFloat(input.value) || 0;
      const campo = input.dataset.perfilCampo as 'edad' | 'peso' | 'altura';
      datosCalorias[campo] = n;
      renderCalculadoras(contenedor);
      // Devolver el foco al campo que se estaba escribiendo.
      const vuelto = contenedor.querySelector<HTMLInputElement>(`[data-perfil-campo="${campo}"]`);
      vuelto?.focus();
      vuelto?.setSelectionRange(vuelto.value.length, vuelto.value.length);
    });
  });
}

// ==========================================
// P-01 · PERFIL
// ==========================================

/** Los cinco niveles de actividad, con el multiplicador que usa Mifflin. */
const ACTIVIDADES: Array<{ valor: number; nombre: string }> = [
  { valor: 1.2, nombre: 'Sedentario' },
  { valor: 1.375, nombre: 'Ligero (1-3 días/semana)' },
  { valor: 1.55, nombre: 'Moderado (3-5 días/semana)' },
  { valor: 1.725, nombre: 'Activo (6-7 días/semana)' },
  { valor: 1.9, nombre: 'Muy activo' },
];

function nombreDeActividad(valor: number): string {
  return ACTIVIDADES.find((a) => a.valor === valor)?.nombre ?? ACTIVIDADES[2].nombre;
}

/** La barra de zonas de % graso: verde 40%, ámbar 30%, roja el resto, sobre
 *  una escala de 0 a 35. El marcador anima desde 0, como en PR-01. */
function barraDeGrasa(pct: number): string {
  const verde = (GRASA_VERDE_HASTA / GRASA_ESCALA_MAX) * 100;
  const ambar = ((GRASA_AMBAR_HASTA - GRASA_VERDE_HASTA) / GRASA_ESCALA_MAX) * 100;
  return `
    <div class="f-grasa">
      <div class="f-grasa__fila">
        <span class="f-grasa__label">% grasa (Navy)</span>
        <span class="f-grasa__cifra f-grasa__cifra--${zonaDeGrasa(pct)}">${pct.toFixed(1)}%</span>
      </div>
      <div class="f-grasa__pista">
        <div class="f-grasa__tramo f-grasa__tramo--verde" style="width:${verde.toFixed(2)}%"></div>
        <div class="f-grasa__tramo f-grasa__tramo--ambar" style="width:${ambar.toFixed(2)}%"></div>
        <div class="f-grasa__tramo f-grasa__tramo--roja"></div>
        <div class="f-grasa__marcador" data-grasa="${posicionGrasa(pct).toFixed(2)}"></div>
      </div>
    </div>
  `;
}

function tarjetaDeMedidas(): string {
  const medidas = getBodyMeasurements();
  const ultima = ultimaMedida(medidas);

  if (!ultima) {
    return `
      <section class="f-card-perfil">
        <div class="f-card-perfil__cabecera">
          <span class="f-card-perfil__titulo">Medidas corporales</span>
        </div>
        ${vacio(
          'Todavía no has registrado ninguna medición.',
          'La primera fija el punto de partida: sin ella no hay tendencia que enseñar.'
        )}
        <div class="f-card-perfil__acciones">
          <button type="button" class="f-btn f-btn--secundario f-btn--medida" data-perfil="medir">Registrar medición</button>
        </div>
      </section>
    `;
  }

  const fechaUltima = fechaLegible(ultima.date);
  const fecha = fechaUltima
    ? fechaUltima.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : SIN_FECHA;
  const resumen: Array<[string, number | undefined]> = [
    ['PESO', ultima.weight],
    ['PECHO', ultima.chest],
    ['CINTURA', ultima.waist],
    ['BRAZO', ultima.armRight],
  ];
  const perfil = getProfile();
  const grasa =
    ultima.bodyFat ??
    grasaNavy(ultima, perfil.height ?? 0, perfil.gender === 'female' ? 'female' : 'male');

  return `
    <section class="f-card-perfil">
      <div class="f-card-perfil__cabecera">
        <span class="f-card-perfil__titulo">Medidas corporales</span>
        <span class="f-card-perfil__meta">última: ${escapar(fecha)}</span>
      </div>
      <div class="f-medidas-resumen">
        ${resumen
          .map(
            ([label, valor]) => `
          <div class="f-medidas-resumen__celda">
            <span class="f-medidas-resumen__label">${label}</span>
            <span class="f-medidas-resumen__cifra">${
              typeof valor === 'number' ? escapar(valor.toFixed(label === 'PESO' ? 1 : 0)) : '—'
            }</span>
          </div>`
          )
          .join('')}
      </div>
      ${
        grasa === null
          ? `<span class="f-card-perfil__nota">Para el % graso hacen falta cintura, cuello y tu altura en el perfil.</span>`
          : barraDeGrasa(grasa)
      }
      <div class="f-card-perfil__acciones">
        <button type="button" class="f-btn f-btn--secundario f-btn--medida" data-perfil="medir">Registrar medición</button>
        <button type="button" class="f-btn f-btn--medida f-btn--tenue" data-perfil="ver-medidas">Ver historial</button>
      </div>
    </section>
  `;
}

export function renderPerfil(contenedor: HTMLElement): void {
  const p = getProfile();
  const campos: Array<{ id: keyof ProfileData; label: string; ancho: 'full' | 'medio'; tipo: string }> = [
    { id: 'name', label: 'NOMBRE', ancho: 'full', tipo: 'text' },
    { id: 'weight', label: 'PESO (KG)', ancho: 'medio', tipo: 'number' },
    { id: 'height', label: 'ALTURA (CM)', ancho: 'medio', tipo: 'number' },
  ];

  contenedor.innerHTML = `
    <div class="f-perfil f-root">
      <span class="f-perfil__titulo">PERFIL</span>
      <div class="f-perfil__rejilla">
        ${campos
          .map(
            (c) => `
          <div class="f-campo${c.ancho === 'full' ? ' f-campo--ancho' : ''}">
            <span class="f-campo__label f-campo__label--corto">${c.label}</span>
            <input class="f-campo__caja" type="${c.tipo}" ${
              c.tipo === 'number' ? 'inputmode="decimal" min="0"' : 'autocomplete="name"'
            }
              value="${escapar(String(p[c.id] ?? ''))}" placeholder="—"
              data-perfil-dato="${c.id}" aria-label="${escapar(c.label)}" />
          </div>`
          )
          .join('')}
        <div class="f-campo f-campo--ancho">
          <span class="f-campo__label f-campo__label--corto">FECHA DE NACIMIENTO</span>
          <input class="f-campo__caja" type="date" value="${escapar(p.birthdate ?? '')}"
            data-perfil-dato="birthdate" aria-label="Fecha de nacimiento" />
        </div>
        <div class="f-campo f-campo--ancho">
          <span class="f-campo__label f-campo__label--corto">SEXO</span>
          <button type="button" class="f-campo__caja f-campo__caja--elegible" data-perfil="sexo-perfil">
            <span>${p.gender === 'female' ? 'Femenino' : 'Masculino'}</span>
            <span class="f-campo__chevron">▾</span>
          </button>
        </div>
        <div class="f-campo f-campo--ancho">
          <span class="f-campo__label f-campo__label--corto">NIVEL DE ACTIVIDAD</span>
          <button type="button" class="f-campo__caja f-campo__caja--elegible" data-perfil="actividad">
            <span>${escapar(nombreDeActividad(p.activity ?? 1.55))}</span>
            <span class="f-campo__chevron">▾</span>
          </button>
        </div>
      </div>
      <button type="button" class="f-btn f-btn--primario f-btn--bloque" data-perfil="guardar">Guardar perfil</button>
      ${tarjetaDeMedidas()}
      <section class="f-card-perfil">
        <span class="f-card-perfil__titulo">Copia de seguridad</span>
        <span class="f-card-perfil__cuerpo">El CSV se lleva todo: historial, cardio, perfil, medidas, récords, rutinas, ejercicios propios, tu progresión y la conversación del coach.</span>
        <div class="f-card-perfil__acciones">
          <button type="button" class="f-btn f-btn--primario f-btn--medida" data-perfil="exportar">Exportar todo</button>
          <button type="button" class="f-btn f-btn--secundario f-btn--medida" data-perfil="importar">Importar CSV</button>
        </div>
      </section>
      ${tarjetaDeServidor()}
      <div class="f-perfil__puente" role="group" aria-label="Otras secciones">
        <button type="button" class="f-btn f-btn--secundario f-btn--medida" data-perfil="records">Récords</button>
        <button type="button" class="f-btn f-btn--secundario f-btn--medida" data-perfil="graficos">Gráficos</button>
        <button type="button" class="f-btn f-btn--secundario f-btn--medida" data-perfil="calculadoras">Calculadoras</button>
      </div>
    </div>
  `;
  enganchar(contenedor, (el) => alTocarPerfil(el, contenedor));
  animarGrasa(contenedor);

  // Si hay token y todavia no se sabe nada del servidor, se pregunta AHORA.
  // Sin esto la tarjeta pintaba "comprobando…" y no comprobaba nada: una
  // promesa que el render hacia y no cumplia.
  if (estadoServidor === null && hayBackend()) void comprobarServidor();
}

/**
 * Servidor. NO esta en el mockup del handoff: el handoff describe una app
 * offline-first sin backend, y esta puerta existe porque el backend se pidio
 * despues. Por eso no inventa ni un componente: es la misma
 * `.f-card-perfil` con el mismo campo y los mismos botones que el resto de
 * P-01, y sin backend configurado se lee como lo que es —algo apagado— en vez
 * de pedir atencion.
 */
/**
 * Lo ultimo que se supo del servidor.
 *
 * Existe porque la tarjeta pintaba "comprobando…" siempre que hubiera token, y
 * NADA comprobaba al renderizar: era una promesa que el render hacia y no
 * cumplia, asi que la marca se quedaba clavada ahi para siempre. Y encima
 * `Conectar` escribia el estado bueno y despues llamaba a `renderPerfil`, que
 * lo borraba. El toast decia "conectado · copia en postgres" al lado de una
 * marca que decia "comprobando…".
 *
 * Ahora el estado vive fuera del DOM: sobrevive al re-render y se pinta solo.
 */
let estadoServidor: string | null = null;

/**
 * Pregunta de verdad y deja la marca en su sitio.
 *
 * En dos pasos porque `/api/salud` NO exige token: si solo se mirara eso, un
 * token mal escrito pintaria "conectado" en verde. Y engancha el coach aqui,
 * no solo al arrancar la app, porque si no la pantalla decia "coach con
 * modelo" mientras contestaba el del telefono.
 */
async function comprobarServidor(): Promise<void> {
  if (!hayBackend()) {
    estadoServidor = 'sin conectar';
    return pintarEstadoServidor();
  }
  estadoServidor = 'comprobando…';
  pintarEstadoServidor();

  const e = await estadoBackend();
  if (!e) {
    estadoServidor = 'no responde';
    return pintarEstadoServidor();
  }
  if ((await comprobarToken()) === 'token') {
    estadoServidor = 'token inválido';
    return pintarEstadoServidor();
  }
  if (e.coach) {
    const { CoachRemoto, usarAdaptador } = await import('@/features/coach-ia');
    usarAdaptador(new CoachRemoto(urlBackend(), tokenBackend()));
    estadoServidor = 'conectado · coach con modelo';
  } else {
    estadoServidor = 'conectado · coach en local';
  }
  pintarEstadoServidor();
}

function pintarEstadoServidor(): void {
  const marca = document.getElementById('perfilServidorEstado');
  if (marca) marca.textContent = estadoServidor ?? '';
}

function tarjetaDeServidor(): string {
  const token = tokenBackend();
  const url = urlBackend();
  return `
    <section class="f-card-perfil">
      <div class="f-card-perfil__cabecera">
        <span class="f-card-perfil__titulo">Servidor</span>
        <span class="f-card-perfil__meta" id="perfilServidorEstado">${escapar(
          estadoServidor ?? (token ? 'comprobando…' : 'sin conectar')
        )}</span>
      </div>
      <span class="f-card-perfil__cuerpo">Guarda una copia fuera del teléfono y enciende el coach con modelo. Sin esto la app funciona igual, entera y sin red.</span>
      <div class="f-campo">
        <label class="f-campo__label" for="perfilBackendToken">TOKEN</label>
        <input class="f-campo__caja" type="password" id="perfilBackendToken" autocomplete="off"
          value="${escapar(token)}" placeholder="el GYMMATE_TOKEN de tu servicio" aria-label="Token del servidor" />
      </div>
      <div class="f-campo">
        <label class="f-campo__label" for="perfilBackendUrl">URL</label>
        <input class="f-campo__caja" type="url" id="perfilBackendUrl" autocomplete="off" inputmode="url"
          value="${escapar(url)}" placeholder="https://gymmate.up.railway.app" aria-label="URL del servidor" />
      </div>
      <div class="f-card-perfil__acciones">
        <button type="button" class="f-btn f-btn--secundario f-btn--medida" data-perfil="conectar">Conectar</button>
        <button type="button" class="f-btn f-btn--medida f-btn--tenue" data-perfil="subir" ${token ? '' : 'disabled'}>Subir copia</button>
        <button type="button" class="f-btn f-btn--medida f-btn--tenue" data-perfil="bajar" ${token ? '' : 'disabled'}>Restaurar</button>
      </div>
    </section>
  `;
}

/** El marcador entra desde 0, como la barra de zonas de PR-01. */
function animarGrasa(raiz: HTMLElement): void {
  requestAnimationFrame(() => {
    raiz.querySelectorAll<HTMLElement>('[data-grasa]').forEach((m) => {
      m.style.setProperty('--t', String(Number(m.dataset.grasa) / 100));
    });
  });
}

// ==========================================
// P-02 · REGISTRAR MEDIDA (bottom sheet, % graso en vivo)
// ==========================================

/** Los ocho campos del mockup (`medidas`), en su orden y con su rótulo. */
const CAMPOS_MEDIDA: Array<{ claves: Array<keyof BodyMeasurement>; label: string }> = [
  { claves: ['weight'], label: 'PESO (KG)' },
  { claves: ['neck'], label: 'CUELLO (CM)' },
  { claves: ['chest'], label: 'PECHO (CM)' },
  { claves: ['waist'], label: 'CINTURA (CM)' },
  { claves: ['hips'], label: 'CADERA (CM)' },
  { claves: ['armLeft', 'armRight'], label: 'BRAZO IZQ/DER' },
  { claves: ['thighLeft', 'thighRight'], label: 'MUSLO IZQ/DER' },
];

function abrirHojaDeMedida(alGuardar: () => void): void {
  const perfil = getProfile();
  const medidas = getBodyMeasurements();
  const previa = ultimaMedida(medidas);

  // Se arranca desde la ultima medicion: casi nada cambia entre una y otra, y
  // reescribir ocho numeros para mover uno es la forma de que no se registre.
  const borrador: Record<string, number | undefined> = {};
  for (const { claves } of CAMPOS_MEDIDA) {
    for (const c of claves) borrador[c] = previa?.[c] as number | undefined;
  }
  if (perfil.weight && borrador.weight === undefined) borrador.weight = perfil.weight;

  const campoHTML = ({ claves, label }: (typeof CAMPOS_MEDIDA)[number]) => `
    <div class="f-campo">
      <span class="f-campo__label f-campo__label--corto">${label}</span>
      <div class="f-campo__par">
        ${claves
          .map(
            (c) => `<input class="f-campo__caja" type="number" inputmode="decimal" min="0" step="0.1"
              value="${borrador[c] ?? ''}" placeholder="—" data-medida="${c}"
              aria-label="${escapar(label)}${claves.length > 1 ? (c.endsWith('Left') ? ' izquierdo' : ' derecho') : ''}" />`
          )
          .join('')}
      </div>
    </div>`;

  const fechaTexto = `Hoy, ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')}`;

  const velo = abrirHoja(`
    <div class="f-sheet f-sheet--medida" role="dialog" aria-modal="true" aria-label="Nueva medición">
      <div class="f-sheet__handle" aria-hidden="true"></div>
      <div class="f-sheet__fila-titulo">
        <span class="f-sheet__titulo">Nueva medición</span>
        <span class="f-sheet__meta">una por día — hoy sobrescribe</span>
      </div>
      <div class="f-medida-rejilla">
        ${CAMPOS_MEDIDA.map(campoHTML).join('')}
        <div class="f-campo">
          <span class="f-campo__label f-campo__label--corto">FECHA</span>
          <div class="f-campo__caja f-campo__caja--fija">${escapar(fechaTexto)}</div>
        </div>
      </div>
      <div class="f-grasa-vivo">
        <span class="f-grasa-vivo__label">% grasa calculado en vivo</span>
        <span class="f-grasa-vivo__cifra" id="grasaEnVivo">—</span>
      </div>

      <button type="button" class="f-btn f-btn--primario f-btn--bloque" data-guardar-medida>Guardar medición</button>
    </div>
  `);
  if (!velo) return;

  const leer = (): BodyMeasurement => {
    const m: Record<string, unknown> = { date: new Date().toISOString() };
    velo.querySelectorAll<HTMLInputElement>('[data-medida]').forEach((i) => {
      const n = Number.parseFloat(i.value);
      if (Number.isFinite(n) && n > 0) m[i.dataset.medida as string] = n;
    });
    return m as unknown as BodyMeasurement;
  };

  const refrescarGrasa = () => {
    const cifraEl = velo.querySelector<HTMLElement>('#grasaEnVivo');
    if (!cifraEl) return;
    const actual = leer();
    const pct = grasaNavy(actual, perfil.height ?? 0, perfil.gender === 'female' ? 'female' : 'male');
    if (pct === null) {
      // Sin los tres datos no hay estimacion: se dice, no se pinta un cero.
      cifraEl.textContent = '—';
      cifraEl.className = 'f-grasa-vivo__cifra f-grasa-vivo__cifra--vacio';
      cifraEl.title = 'Hacen falta cintura, cuello y tu altura en el perfil.';
      return;
    }
    cifraEl.textContent = `${pct.toFixed(1)}%`;
    cifraEl.className = `f-grasa-vivo__cifra f-grasa-vivo__cifra--${zonaDeGrasa(pct)}`;
    cifraEl.title = '';
  };

  velo.querySelectorAll<HTMLInputElement>('[data-medida]').forEach((i) => {
    i.addEventListener('input', refrescarGrasa);
  });
  refrescarGrasa();

  velo.querySelector<HTMLElement>('[data-guardar-medida]')?.addEventListener('click', () => {
    const medida = leer();
    if (cuantasMedidas(medida) === 0) {
      mostrarToast({
        tipo: 'aviso',
        titulo: 'No hay nada que guardar',
        detalle: 'Escribe al menos una medida.',
      });
      return;
    }
    const pct = grasaNavy(medida, perfil.height ?? 0, perfil.gender === 'female' ? 'female' : 'male');
    if (pct !== null) medida.bodyFat = pct;

    void import('@/utils/storage').then(({ addBodyMeasurement }) => {
      addBodyMeasurement(medida);
      // El peso del perfil sigue al de la medicion: los rangos musculares se
      // calculan contra el peso corporal, y dos pesos distintos dan dos
      // verdades distintas.
      if (medida.weight && medida.weight !== perfil.weight) {
        guardarPerfil({
          name: perfil.name ?? '',
          birthdate: perfil.birthdate ?? '',
          gender: perfil.gender ?? 'male',
          height: perfil.height ?? 0,
          activity: perfil.activity ?? 1.55,
          weight: medida.weight,
        });
      }
      velo.querySelector<HTMLElement>('[data-cerrar]')?.click();
      velo.remove();
      mostrarToast({ tipo: 'exito', titulo: 'Medición guardada' });
      alGuardar();
    });
  });
}

/**
 * Guarda el perfil y RECALCULA los rangos si el peso corporal cambio.
 *
 * README §6: "El recálculo se dispara al cambiar peso corporal (fix del bug
 * onBodyweightChange)". El ratio de cada rango es 1RM / peso corporal, asi que
 * sin esto el usuario cambiaba su peso y los rangos seguian contando contra el
 * anterior.
 */
function guardarPerfil(nuevo: ProfileData): void {
  const antes = getProfile();
  saveProfile(nuevo);
  if ((antes.weight ?? 0) !== (nuevo.weight ?? 0) && (nuevo.weight ?? 0) > 0) {
    // `onBodyweightChange` existia desde siempre y NO lo llamaba nadie: ese es
    // literalmente el bug que el README nombra. El usuario cambiaba su peso y
    // los rangos seguian contando contra el anterior.
    void import('@/features/gamification').then((g) => g.onBodyweightChange(nuevo.weight ?? 0));
  }
}

// ==========================================
// P-03 · HISTORIAL DE MEDIDAS (Hueso)
// ==========================================

export function renderHistorialDeMedidas(contenedor: HTMLElement): void {
  const medidas = getBodyMeasurements();
  const orden = ordenadas(medidas);

  if (orden.length === 0) {
    contenedor.innerHTML = `
      <div class="f-hueso f-root">
        ${cabeceraHueso('MEDIDAS', '')}
        <div class="f-hueso__cuerpo">
          ${vacio(
            'Todavía no hay mediciones.',
            'Registra la primera desde tu perfil y aquí empieza la tendencia.'
          )}
        </div>
      </div>
    `;
    enganchar(contenedor, (el) => alTocarPerfil(el, contenedor));
    return;
  }

  const perfil = getProfile();
  const genero = perfil.gender === 'female' ? 'female' : 'male';
  const grasaDe = (m: BodyMeasurement) =>
    m.bodyFat ?? grasaNavy(m, perfil.height ?? 0, genero) ?? null;

  const pesos = serieDeMedidas(medidas, (m) => m.weight, 70);
  const grasas = serieDeMedidas(medidas, grasaDe, 54);
  const cambios = cambioDePerimetros(medidas);
  const pie = pieDePerimetros(cambios);

  const viejo = orden[orden.length - 1];
  const nuevo = orden[0];
  const deltaPeso =
    typeof nuevo.weight === 'number' && typeof viejo.weight === 'number'
      ? Math.round((nuevo.weight - viejo.weight) * 10) / 10
      : null;
  // Con una fecha ilegible esto daba NaN, y `Math.max(1, NaN)` sigue siendo
  // NaN: la pantalla escribia "−1.0 EN NaN MESES" y "PERÍMETROS · CAMBIO NaN
  // MESES" al lado de las filas que ya decian "—".
  const desde = fechaLegible(viejo.date);
  const hasta = fechaLegible(nuevo.date);
  const meses =
    desde && hasta
      ? Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
      : null;
  const periodo = meses === null ? SIN_FECHA : `${meses} ${meses === 1 ? 'MES' : 'MESES'}`;

  contenedor.innerHTML = `
    <div class="f-hueso f-root">
      ${cabeceraHueso('MEDIDAS', resumenDeMediciones(medidas))}
      <div class="f-hueso__cuerpo">
        ${
          pesos.length >= 2
            ? `
        <section class="f-hueso__card">
          <div class="f-hueso__fila-titulo f-hueso__fila-titulo--baseline">
            <span class="f-hueso__mes">PESO CORPORAL · KG</span>
            <span class="f-medidas__cifra">${nuevo.weight?.toFixed(1) ?? '—'}${
                deltaPeso !== null && deltaPeso !== 0
                  ? ` <span class="f-medidas__delta f-medidas__delta--${
                      deltaPeso < 0 ? 'verde' : 'neutro'
                    }">${deltaPeso < 0 ? '−' : '+'}${Math.abs(deltaPeso).toFixed(1)} EN ${periodo}</span>`
                  : ''
              }</span>
          </div>
          <svg viewBox="0 0 320 90" width="100%" height="90" role="img" aria-label="Tendencia de peso corporal">
            <polyline points="${polilineaDe(pesos.map((p) => ({ ...p, y: p.y + 10 })))}"
              fill="none" stroke="var(--hueso-ink)" stroke-width="2" stroke-linejoin="round"></polyline>
            ${pesos
              .map(
                (p) =>
                  `<circle cx="${p.x}" cy="${p.y + 10}" r="3" fill="var(--bg-hueso)" stroke="var(--hueso-ink)" stroke-width="1.5"></circle>`
              )
              .join('')}
          </svg>
          <div class="f-medidas__eje">
            <span>${escapar(etiquetaDeExtremo(pesos[0]?.fecha, pesos[0]?.valor ?? null))}</span>
            <span>${escapar(etiquetaDeExtremo(pesos[pesos.length - 1]?.fecha, pesos[pesos.length - 1]?.valor ?? null))}</span>
          </div>
        </section>`
            : ''
        }
        ${
          grasas.length >= 2
            ? `
        <section class="f-hueso__card">
          <div class="f-hueso__fila-titulo f-hueso__fila-titulo--baseline">
            <span class="f-hueso__mes">% GRASA · NAVY</span>
            <span class="f-medidas__cifra f-medidas__cifra--ambar">${grasas[
              grasas.length - 1
            ].valor.toFixed(1)}%</span>
          </div>
          <svg viewBox="0 0 320 70" width="100%" height="70" role="img" aria-label="Tendencia de % graso">
            <polyline points="${polilineaDe(grasas.map((p) => ({ ...p, y: p.y + 8 })))}"
              fill="none" stroke="var(--zona-ambar)" stroke-width="2" stroke-linejoin="round"></polyline>
          </svg>
          <div class="f-medidas__eje">
            <span>${escapar(etiquetaDeExtremo(grasas[0]?.fecha, grasas[0]?.valor ?? null))}</span>
            <span>ZONA SALUDABLE 14–20%</span>
          </div>
        </section>`
            : ''
        }
        ${
          cambios.length > 0
            ? `
        <section class="f-hueso__card">
          <span class="f-hueso__mes">PERÍMETROS · CAMBIO ${periodo}</span>
          ${cambios
            .map(
              (c) => `
            <div class="f-perimetro">
              <span class="f-perimetro__nombre">${escapar(c.nombre)}</span>
              <span class="f-perimetro__valor">${c.valor}</span>
              <div class="f-perimetro__pista">
                <div class="f-perimetro__barra f-perimetro__barra--${c.hacia}${
                  c.deseable ? '' : ' f-perimetro__barra--mal'
                }" style="width:${c.ancho}%"></div>
                <div class="f-perimetro__centro" aria-hidden="true"></div>
              </div>
              <span class="f-perimetro__delta${
                c.deseable ? ' f-perimetro__delta--bien' : ' f-perimetro__delta--mal'
              }">${c.delta > 0 ? '+' : c.delta < 0 ? '−' : ''}${Math.abs(c.delta)}</span>
            </div>`
            )
            .join('')}
          ${pie ? `<span class="f-medidas__pie">${escapar(pie)}</span>` : ''}
        </section>`
            : ''
        }
        <div class="f-registro">
          <span class="f-hueso__mes">REGISTRO</span>
          ${orden
            .map((m) => {
              const g = grasaDe(m);
              const n = cuantasMedidas(m);
              const detalle = [
                typeof m.weight === 'number' ? `${m.weight.toFixed(1)} kg` : null,
                g !== null ? `${g.toFixed(1)}%` : null,
                `${n} ${n === 1 ? 'medida' : 'medidas'}`,
              ]
                .filter(Boolean)
                .join(' · ');
              return `
              <div class="f-registro__fila">
                <span class="f-registro__fecha">${escapar(
                  fechaLegible(m.date)?.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '') ?? SIN_FECHA
                )}</span>
                <span class="f-registro__detalle">${escapar(detalle)}</span>
                <button type="button" class="f-registro__borrar" data-perfil="borrar-medida"
                  data-fecha="${escapar(m.date)}" aria-label="Eliminar la medición del ${escapar(
                    fechaLegible(m.date)?.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) ?? SIN_FECHA
                  )}">✕</button>
              </div>`;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;
  enganchar(contenedor, (el) => alTocarPerfil(el, contenedor));
}

/** El header oscuro que hace la transicion a Hueso, el mismo de HI-01/PR-01. */
function cabeceraHueso(titulo: string, meta: string): string {
  return `
    <div class="f-hueso__header">
      <div class="f-hueso__fila-titulo">
        <button type="button" class="f-hueso__volver" data-perfil="volver-perfil" aria-label="Volver al perfil">←</button>
        <span class="f-hueso__titulo">${escapar(titulo)}</span>
        ${meta ? `<span class="f-hueso__subtitulo">${escapar(meta)}</span>` : ''}
      </div>
    </div>
  `;
}

// ==========================================
// DELEGACIÓN
// ==========================================

/** Hoja de eleccion generica: la usan sexo y nivel de actividad. */
function elegirDeLista(
  titulo: string,
  opciones: Array<{ valor: string; etiqueta: string }>,
  alElegir: (valor: string) => void
): void {
  const velo = abrirHoja(`
    <div class="f-sheet f-sheet--lista" role="dialog" aria-modal="true" aria-label="${escapar(titulo)}">
      <div class="f-sheet__handle" aria-hidden="true"></div>
      <span class="f-sheet__titulo">${escapar(titulo)}</span>
      <div class="f-sheet__opciones">
        ${opciones
          .map(
            (o) =>
              `<button type="button" class="f-sheet__opcion" data-opcion="${escapar(o.valor)}">${escapar(
                o.etiqueta
              )}</button>`
          )
          .join('')}
      </div>
      <button type="button" class="f-btn f-btn--secundario f-btn--hoja" data-cerrar>Cerrar</button>
    </div>
  `);
  velo?.querySelectorAll<HTMLElement>('[data-opcion]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.opcion ?? '';
      velo.querySelector<HTMLElement>('[data-cerrar]')?.click();
      velo.remove();
      alElegir(v);
    })
  );
}

/** Lee los campos de P-01 tal y como estan en pantalla. */
function perfilDesdeLaPantalla(raiz: HTMLElement): ProfileData {
  const p = getProfile();
  const leer = (id: string) => raiz.querySelector<HTMLInputElement>(`[data-perfil-dato="${id}"]`)?.value;
  return {
    name: leer('name') ?? p.name ?? '',
    birthdate: leer('birthdate') ?? p.birthdate ?? '',
    gender: p.gender ?? 'male',
    weight: Number.parseFloat(leer('weight') ?? '') || 0,
    height: Number.parseFloat(leer('height') ?? '') || 0,
    activity: p.activity ?? 1.55,
  };
}

function alTocarPerfil(el: HTMLElement, contenedor: HTMLElement): void {
  const accion = el.dataset.perfil;
  switch (accion) {
    case 'conectar': {
      const token = (document.getElementById('perfilBackendToken') as HTMLInputElement | null)?.value ?? '';
      const url = (document.getElementById('perfilBackendUrl') as HTMLInputElement | null)?.value ?? '';
      // Una URL sin `https://` es RELATIVA: mandaria la instantanea y el
      // token contra el propio dominio de Netlify. Se corta antes de guardar.
      if (!configurarBackend(token, url)) {
        mostrarToast({
          tipo: 'aviso',
          titulo: 'Esa dirección no sirve',
          detalle: 'Tiene que empezar por https:// y ser un dominio completo.',
        });
        break;
      }
      void (async () => {
        await comprobarServidor();
        // El toast dice lo mismo que la marca, no otra cosa: antes uno decia
        // "conectado" y la otra seguia en "comprobando…".
        if (estadoServidor === 'no responde') {
          mostrarToast({
            tipo: 'aviso',
            titulo: 'El servidor no responde',
            detalle: 'Si tienes datos, revisa la URL y ORIGEN_PERMITIDO en Railway. La app funciona igual sin él.',
          });
          return;
        }
        if (estadoServidor === 'token inválido') {
          mostrarToast({
            tipo: 'aviso',
            titulo: 'El token no coincide',
            detalle: 'El servidor responde, pero no acepta ese token. Cópialo de Railway → Variables → GYMMATE_TOKEN.',
          });
          return;
        }
        const e = await estadoBackend();
        mostrarToast({
          tipo: (e?.avisos?.length ?? 0) > 0 ? 'aviso' : 'exito',
          titulo: 'Servidor conectado',
          detalle: e?.avisos?.length ? e.avisos.join(' · ') : `Copia en ${e?.almacenamiento}.`,
        });
      })();
      break;
    }

    case 'subir':
      void subirCopia().then((r) =>
        mostrarToast(
          r.ok
            ? { tipo: 'exito' as const, titulo: 'Copia subida' }
            : { tipo: 'aviso' as const, titulo: 'No se pudo subir la copia', detalle: r.error }
        )
      );
      break;

    case 'bajar':
      void confirmarDestructivo({
        titulo: '¿Restaurar desde el servidor?',
        cuerpo: 'Lo que hay en este teléfono se reemplaza por la última copia guardada. Exporta un CSV antes si no estás seguro.',
        cancelar: 'Cancelar',
        confirmar: 'Restaurar',
      }).then(async (sigue) => {
        if (!sigue) return;
        const r = await bajarCopia();
        if (!r.ok) {
          mostrarToast({ tipo: 'aviso', titulo: 'No se pudo restaurar', detalle: r.error });
          return;
        }
        const { fusionarGamificacion } = await import('@/features/gamification');
        fusionarGamificacion();
        mostrarToast({ tipo: 'exito', titulo: `Restaurado · ${r.claves} bloques`, detalle: 'Recargando…' });
        window.setTimeout(() => window.location.reload(), 900);
      });
      break;

    case 'pestana':
      pestanaActiva = (el.dataset.pestana as Pestana) ?? 'rm';
      renderCalculadoras(contenedor);
      break;

    case 'elegir-1rm':
    case 'elegir-progresivo': {
      const lista = ejerciciosConPeso().map((n) => ({ valor: n, etiqueta: n }));
      if (lista.length === 0) return;
      elegirDeLista('Elige un ejercicio', lista, (v) => {
        if (accion === 'elegir-1rm') ejercicio1RM = v;
        else ejercicioProgresivo = v;
        renderCalculadoras(contenedor);
      });
      break;
    }

    case 'sexo':
      elegirDeLista(
        'Sexo',
        [
          { valor: 'male', etiqueta: 'Masculino' },
          { valor: 'female', etiqueta: 'Femenino' },
        ],
        (v) => {
          if (datosCalorias) datosCalorias.sexo = v === 'female' ? 'female' : 'male';
          renderCalculadoras(contenedor);
        }
      );
      break;

    case 'sexo-perfil':
      elegirDeLista(
        'Sexo',
        [
          { valor: 'male', etiqueta: 'Masculino' },
          { valor: 'female', etiqueta: 'Femenino' },
        ],
        (v) => {
          guardarPerfil({ ...perfilDesdeLaPantalla(contenedor), gender: v === 'female' ? 'female' : 'male' });
          renderPerfil(contenedor);
        }
      );
      break;

    case 'actividad':
      elegirDeLista(
        'Nivel de actividad',
        ACTIVIDADES.map((a) => ({ valor: String(a.valor), etiqueta: a.nombre })),
        (v) => {
          guardarPerfil({ ...perfilDesdeLaPantalla(contenedor), activity: Number.parseFloat(v) || 1.55 });
          renderPerfil(contenedor);
        }
      );
      break;

    case 'prellenar': {
      datosCalorias = datosDesdeElPerfil();
      renderCalculadoras(contenedor);
      const faltan = datosCalorias.edad <= 0 || datosCalorias.peso <= 0 || datosCalorias.altura <= 0;
      mostrarToast(
        faltan
          ? {
              tipo: 'aviso',
              titulo: 'Tu perfil está incompleto',
              // Se dice QUE falta, no "algo salió mal".
              detalle: 'Completa fecha de nacimiento, peso y altura en Perfil.',
            }
          : { tipo: 'exito', titulo: 'Datos traídos de tu perfil' }
      );
      break;
    }

    case 'guardar':
      guardarPerfil(perfilDesdeLaPantalla(contenedor));
      renderPerfil(contenedor);
      mostrarToast({ tipo: 'exito', titulo: 'Perfil guardado' });
      break;

    case 'medir':
      abrirHojaDeMedida(() => renderPerfil(contenedor));
      break;

    case 'ver-medidas':
      irA('medidas');
      break;

    case 'borrar-medida': {
      const fecha = el.dataset.fecha ?? '';
      void import('@/ui/feedback').then(async ({ confirmarDestructivo }) => {
        const bajas = await confirmarDestructivo({
          titulo: '¿Eliminar esta medición?',
          cuerpo: `La medición del ${
            fechaLegible(fecha)?.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) ?? SIN_FECHA
          } sale del historial y deja de contar para la tendencia.`,
          cancelar: 'Conservar',
          confirmar: 'Eliminar',
        });
        if (!bajas) return;
        const { deleteMeasurement } = await import('@/utils/storage');
        deleteMeasurement(fecha);
        renderHistorialDeMedidas(contenedor);
        mostrarToast({ tipo: 'exito', titulo: 'Medición eliminada' });
      });
      break;
    }

    case 'exportar':
      void import('@/features/history').then(({ exportToCSV }) => exportToCSV());
      break;

    case 'importar':
      void import('@/features/history').then(({ triggerCSVImport }) => triggerCSVImport());
      break;

    case 'records':
      irA('records');
      break;
    case 'graficos':
      irA('graficos');
      break;
    case 'calculadoras':
      irA('calculadoras');
      break;
    case 'volver':
    case 'volver-perfil':
      irA('perfil');
      break;
  }
}

/** Navegacion entre las pantallas de este modulo. La resuelve main.ts, que es
 *  quien conoce los contenedores. */
type DestinoPerfil = 'perfil' | 'medidas' | 'calculadoras' | 'records' | 'graficos';
let navegar: ((destino: DestinoPerfil) => void) | null = null;

export function registrarNavegacionDePerfil(fn: (destino: DestinoPerfil) => void): void {
  navegar = fn;
}

function irA(destino: DestinoPerfil): void {
  navegar?.(destino);
}
