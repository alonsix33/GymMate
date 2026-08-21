/**
 * Heatmap de consistencia — la firma de FIERRO.
 *
 * Reglas (README, "Interactions & Behavior" 1):
 *   - 1 celda = 1 dia. 16 semanas x 7 dias.
 *   - Valor del dia = suma del volumen (kg) de todas sus sesiones de PESAS.
 *   - Color = cuartil de ese valor dentro de los dias CON entrenamiento de los
 *     ultimos 6 MESES del propio usuario. No hay escala absoluta: 2,000 kg
 *     puede ser Q4 para una persona y Q1 para otra.
 *   - 0 = sin sesion de pesas.
 *   - Dia de solo cardio: anillo, sin relleno, y NO entra en los cuartiles
 *     (no compite en kg).
 *   - Huecos de 14 dias o mas se senalan aparte.
 *
 * Logica pura, sin DOM: se puede probar sola.
 */
import type { HistorySession } from '@/types';

export const SEMANAS_VISIBLES = 16;
export const DIAS_POR_SEMANA = 7;
/** Ventana sobre la que se calculan los cuartiles. */
export const MESES_DE_REFERENCIA = 6;
/** A partir de aqui, un hueco se senala. */
export const DIAS_HUECO = 14;

export interface CeldaHeatmap {
  /** YYYY-MM-DD */
  fecha: string;
  /** kg de pesas sumados ese dia */
  volumen: number;
  /** 0 = sin pesas · 1..4 = cuartil dentro del propio historial */
  cuartil: 0 | 1 | 2 | 3 | 4;
  soloCardio: boolean;
  esHoy: boolean;
  /** true si cae fuera de la ventana visible por delante de hoy */
  futuro: boolean;
}

export interface Hueco {
  dias: number;
  /** indices de celda (0..111) que abarca, para dibujar el subrayado */
  desde: number;
  hasta: number;
}

export interface Heatmap {
  /** 16 columnas de 7 dias, en orden cronologico */
  semanas: CeldaHeatmap[][];
  /** dias con sesion de pesas dentro de la ventana visible */
  entrenos: number;
  /** el hueco mas largo de la ventana visible, si llega al umbral */
  huecoMayor: Hueco | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD en hora local, no en UTC: toISOString desplaza el dia. */
export function claveDia(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Dia LOCAL de una sesion.
 *
 * El historial trae tres formatos: 'YYYY-MM-DD' derivado de toISOString (o
 * sea UTC), un ISO completo (cardio), y sesiones con `savedAt` ISO completo.
 * Si solo se recorta el 'YYYY-MM-DD' de un valor UTC, quien entrena de noche
 * en UTC-5 ve su sesion pintada en el dia siguiente: el heatmap le dice que
 * entreno hoy cuando lo hizo anoche, y dos sesiones del mismo dia local se
 * parten en dos celdas. Aqui se recupera el instante siempre que exista.
 */
function diaDeSesion(sesion: HistorySession & { savedAt?: string }): string {
  const conHora = [sesion.date, sesion.savedAt].find(
    (v) => typeof v === 'string' && v.length > 10
  );
  if (conHora) {
    const d = new Date(conHora);
    if (!Number.isNaN(d.getTime())) return claveDia(d);
  }
  return String(sesion.date ?? '').slice(0, 10);
}

/**
 * Cuartil por rango medio. Con empates —y en un historial de gimnasio hay
 * muchos— el rango medio reparte de forma estable: si todos los dias valen lo
 * mismo, ninguno es "flojo" ni "el mejor", y caen todos en el medio.
 */
export function cuartilDe(valor: number, distribucion: number[]): 1 | 2 | 3 | 4 {
  const n = distribucion.length;
  if (n === 0) return 1;
  let menores = 0;
  let menoresOIguales = 0;
  for (const v of distribucion) {
    if (v < valor) menores++;
    if (v <= valor) menoresOIguales++;
  }
  const rango = (menores + menoresOIguales) / (2 * n);
  const q = Math.floor(rango * 4) + 1;
  return Math.min(4, Math.max(1, q)) as 1 | 2 | 3 | 4;
}

/** Volumen de pesas y presencia de cardio, dia a dia. */
export function agruparPorDia(historial: HistorySession[]): Map<string, { pesas: number; cardio: boolean }> {
  const dias = new Map<string, { pesas: number; cardio: boolean }>();
  for (const sesion of historial) {
    const dia = diaDeSesion(sesion);
    if (!dia) continue;
    const acumulado = dias.get(dia) ?? { pesas: 0, cardio: false };
    if (sesion.type === 'cardio') acumulado.cardio = true;
    else acumulado.pesas += sesion.volumenTotal || 0;
    dias.set(dia, acumulado);
  }
  return dias;
}

export function construirHeatmap(historial: HistorySession[], hoy: Date = new Date()): Heatmap {
  const dias = agruparPorDia(historial);

  // Ventana de referencia: 6 meses. Solo dias CON pesas entran en la
  // distribucion; un dia de solo cardio no compite en kg.
  // setMonth desde un dia 31 desborda al mes siguiente (31-ago menos 6 meses
  // da 3-mar, no 28-feb). Se ancla al dia 1 antes de restar.
  const inicioReferencia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  inicioReferencia.setMonth(inicioReferencia.getMonth() - MESES_DE_REFERENCIA);
  inicioReferencia.setDate(Math.min(hoy.getDate(), diasDelMes(inicioReferencia)));
  const distribucion: number[] = [];
  for (const [dia, datos] of dias) {
    if (datos.pesas <= 0) continue;
    const fecha = new Date(`${dia}T00:00:00`);
    if (fecha >= inicioReferencia && fecha <= hoy) distribucion.push(datos.pesas);
  }

  // La rejilla termina en la semana de hoy. El domingo cierra la semana, como
  // en el mockup (L M X J V S D).
  const finDeSemana = new Date(hoy);
  const desplazamiento = (7 - diaDeLaSemanaLunes(hoy)) % 7;
  finDeSemana.setDate(finDeSemana.getDate() + desplazamiento);

  const total = SEMANAS_VISIBLES * DIAS_POR_SEMANA;
  const celdas: CeldaHeatmap[] = [];
  const claveHoy = claveDia(hoy);

  for (let i = total - 1; i >= 0; i--) {
    // Calendario, no milisegundos: restar 86.400.000 ms cruza mal las
    // transiciones de horario de verano y llega a duplicar un dia y perder
    // otro (medido: 19 de 300 combinaciones fecha x hora en Madrid).
    const fecha = new Date(
      finDeSemana.getFullYear(),
      finDeSemana.getMonth(),
      finDeSemana.getDate() - i
    );
    const clave = claveDia(fecha);
    const datos = dias.get(clave);
    const volumen = datos?.pesas ?? 0;
    const soloCardio = !!datos?.cardio && volumen <= 0;
    celdas.push({
      fecha: clave,
      volumen,
      cuartil: volumen > 0 ? cuartilDe(volumen, distribucion) : 0,
      soloCardio,
      esHoy: clave === claveHoy,
      futuro: fecha.getTime() > hoy.getTime() && clave !== claveHoy,
    });
  }

  // Huecos: dias consecutivos sin NINGUNA sesion, hasta hoy. Dos matices que
  // cambian el numero:
  //   - Los dias futuros de la semana en curso no son hueco: no han pasado.
  //   - El vacio ANTERIOR a la primera sesion tampoco. Quien empezo hace 20
  //     dias no lleva "89 dias sin entrenar": lleva 20 dias usando la app.
  //     Solo cuenta si ya habia entrenado antes de la ventana visible.
  const primeraCelda = celdas[0].fecha;
  const entrenoAntesDeLaVentana = [...dias.entries()].some(
    ([dia, datos]) => dia < primeraCelda && (datos.pesas > 0 || datos.cardio)
  );
  let huboSesion = entrenoAntesDeLaVentana;

  let huecoMayor: Hueco | null = null;
  let corridaDesde = -1;
  let corrida = 0;
  const cerrar = (hasta: number) => {
    if (corrida >= DIAS_HUECO && (!huecoMayor || corrida > huecoMayor.dias)) {
      huecoMayor = { dias: corrida, desde: corridaDesde, hasta };
    }
    corrida = 0;
    corridaDesde = -1;
  };
  celdas.forEach((celda, i) => {
    if (celda.futuro) {
      cerrar(i - 1);
      return;
    }
    const conSesion = celda.volumen > 0 || celda.soloCardio;
    if (conSesion) {
      cerrar(i - 1);
      huboSesion = true;
    } else if (huboSesion) {
      if (corridaDesde === -1) corridaDesde = i;
      corrida++;
    }
  });
  cerrar(celdas.length - 1);

  const semanas: CeldaHeatmap[][] = [];
  for (let s = 0; s < SEMANAS_VISIBLES; s++) {
    semanas.push(celdas.slice(s * DIAS_POR_SEMANA, (s + 1) * DIAS_POR_SEMANA));
  }

  // El hueco que empieza en el borde de la ventana se extiende hacia atras
  // con el historial real: recortarlo a las 112 celdas hacia que un regreso
  // tras 10 meses se leyera como "109 dias sin entrenar".
  if (huecoMayor && (huecoMayor as Hueco).desde === 0) {
    const ultimoAntes = [...dias.entries()]
      .filter(([dia, d]) => dia < primeraCelda && (d.pesas > 0 || d.cardio))
      .map(([dia]) => dia)
      .sort()
      .pop();
    if (ultimoAntes) {
      const desde = new Date(`${ultimoAntes}T00:00:00`);
      const hasta = new Date(`${celdas[(huecoMayor as Hueco).hasta].fecha}T00:00:00`);
      (huecoMayor as Hueco).dias = Math.round((hasta.getTime() - desde.getTime()) / DIA_MS);
    }
  }

  return {
    semanas,
    // Dias con CUALQUIER sesion: la rejilla marca tambien los de solo cardio,
    // asi que contar solo pesas dejaba al usuario viendo 40 marcas y leyendo
    // "20 entrenos".
    entrenos: celdas.filter((c) => c.volumen > 0 || c.soloCardio).length,
    huecoMayor,
  };
}

function diasDelMes(fecha: Date): number {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}

/** Lunes = 1 … Domingo = 7. */
function diaDeLaSemanaLunes(fecha: Date): number {
  return fecha.getDay() === 0 ? 7 : fecha.getDay();
}
