import { claveDiaDe, hoyLocal } from '@/utils/fecha';
import type { HistorySession } from '@/types';
import { cifra } from '@/utils/formato';
import { confirmarDestructivo, mostrarToast } from '@/ui/feedback';
import {
  getHistory,
  deleteFromHistory,
  getPRs,
  saveHistory,
  updatePR,
  getProfile,
  saveProfile,
  getBodyMeasurements,
  saveBodyMeasurements,
  getCustomWorkouts,
  saveCustomWorkouts,
  savePRs,
} from '@/utils/storage';
import type { CustomWorkout } from '@/utils/storage';
import { renderHistorial, renderRecords, abrirDetalle, animarZonas } from '@/ui/hueso';
import { normalizeExerciseName } from '@/utils/exercise-normalizer';

// ==========================================
// CARGAR HISTORIAL
// ==========================================

export function loadHistory(): void {
  const contenedor = document.getElementById('fierroHistorial');
  if (!contenedor) return;
  renderHistorial(contenedor);
  if (contenedor.dataset.enganchado !== 'si') {
    // Delegacion: un solo listener que sobrevive a cada repintado.
    contenedor.addEventListener('click', alTocarHistorial);
    contenedor.dataset.enganchado = 'si';
  }
}

function alTocarHistorial(evento: Event): void {
  const objetivo = (evento.target as HTMLElement)?.closest<HTMLElement>('[data-hueso]');
  if (!objetivo) return;
  const indice = Number(objetivo.dataset.indice);
  switch (objetivo.dataset.hueso) {
    case 'detalle':
      abrirDetalle(indice);
      loadHistory();
      break;
    case 'volver-lista':
      abrirDetalle(null);
      loadHistory();
      break;
    case 'borrar':
      void deleteHistoryItem(indice).then(() => {
        abrirDetalle(null);
        loadHistory();
      });
      break;
    case 'exportar':
      exportToCSV();
      break;
    case 'importar':
      triggerCSVImport();
      break;
    case 'primera':
      void import('@/ui/navigation').then(({ showHome }) => showHome());
      break;
  }
}

// ==========================================
// ELIMINAR DEL HISTORIAL
// ==========================================

/**
 * Dos sesiones son la misma si coinciden en lo que las identifica. El
 * sessionId manda cuando existe; el historial importado de CSV no lo tiene, y
 * entonces valen la fecha exacta, el grupo y el volumen.
 */
function mismaSesion(a: HistorySession, b: HistorySession): boolean {
  if (a === b) return true;
  if (a.sessionId && b.sessionId) return a.sessionId === b.sessionId;
  return (
    (a.savedAt ?? a.date) === (b.savedAt ?? b.date) &&
    a.grupo === b.grupo &&
    (a.volumenTotal ?? 0) === (b.volumenTotal ?? 0) &&
    a.type === b.type
  );
}

export async function deleteHistoryItem(index: number): Promise<void> {
  // La identidad se captura ANTES del await: si entre la pregunta y la
  // respuesta cambia el historial, el indice ya apunta a otra sesion y se
  // borraria una que nadie senalo.
  const sesion = getHistory()[index];
  if (!sesion) return;
  const detalle = `${sesion.grupo ?? 'Sesión'} · ${cifra(sesion.volumenTotal ?? 0)} kg.`;
  const eliminar = await confirmarDestructivo({
    titulo: '¿Eliminar este entrenamiento?',
    // Los PRs no se recalculan al borrar del historial: decir que "deja de
    // contar para tus récords" seria falso.
    cuerpo: `${detalle} Sale del historial.`,
    cancelar: 'Conservar',
    confirmar: 'Eliminar',
  });
  if (!eliminar) return;
  // Se busca por CONTENIDO, no por identidad de objeto: getHistory() reparsea
  // el JSON en cada llamada, asi que `indexOf` sobre una lista nueva devolvia
  // -1 SIEMPRE y el guardia se tragaba todos los borrados en silencio.
  const actual = getHistory();
  const real = actual.findIndex((s) => mismaSesion(s, sesion));
  if (real === -1) {
    mostrarToast({ tipo: 'aviso', titulo: 'Ese entrenamiento ya no está' });
    loadHistory();
    return;
  }
  deleteFromHistory(real);
  loadHistory();
  mostrarToast({ tipo: 'exito', titulo: 'Entrenamiento eliminado' });
}

// ==========================================
// CARGAR PRs
// ==========================================

export function loadPRs(): void {
  const contenedor = document.getElementById('fierroRecords');
  if (!contenedor) return;
  renderRecords(contenedor);
  animarZonas(contenedor);
  if (contenedor.dataset.enganchado !== 'si') {
    contenedor.addEventListener('click', (e) => {
      const objetivo = (e.target as HTMLElement)?.closest<HTMLElement>('[data-hueso="primera"]');
      if (objetivo) void import('@/ui/navigation').then(({ showHome }) => showHome());
    });
    contenedor.dataset.enganchado = 'si';
  }
}

// ==========================================
// EXPORTAR A CSV (reemplaza xlsx por seguridad)
// ==========================================

function escapeCSV(value: string | number): string {
  const str = String(value);
  // Escapar comillas dobles y envolver en comillas si contiene caracteres especiales
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV(): void {
  const history = getHistory();

  if (history.length === 0) {
    mostrarToast({
      tipo: 'aviso',
      titulo: 'Todavía no hay sesiones que exportar',
      detalle: 'Guarda un entrenamiento y el CSV se genera solo.',
    });
    return;
  }

  // Separar sesiones por tipo
  const weightSessions = history.filter(s => s.type !== 'cardio' && s.ejercicios);
  const cardioSessions = history.filter(s => s.type === 'cardio');

  const rows: string[][] = [];

  // ==========================================
  // SECCIÓN 1: ENTRENAMIENTOS DE PESAS
  // ==========================================
  if (weightSessions.length > 0) {
    rows.push(['=== ENTRENAMIENTOS DE PESAS ===']);
    rows.push([
      'Fecha',
      'Grupo',
      'Ejercicio',
      'Sets',
      'Reps',
      'Peso (kg)',
      'Es Mancuerna',
      'Grupo Muscular',
      'Volumen',
      'Completado',
      'Volumen Total Sesión',
    ]);

    weightSessions.forEach((session) => {
      if (session.ejercicios && Array.isArray(session.ejercicios)) {
        const fecha = new Date(session.savedAt || session.date).toLocaleDateString('es-ES');
        const grupo = session.grupo;
        const volumenTotalSesion = session.volumenTotal;

        // Todos los ejercicios, tambien los de volumen 0. El filtro
        // `if (ej.volumen > 0)` tiraba los sets registrados y no completados:
        // 80 ejercicios salian 40, y el `volumenPorGrupo` que el importador
        // rehace desde estas filas perdia grupos enteros —el mapa muscular y
        // el heatmap cambiaban al restaurar—.
        session.ejercicios.forEach((ej) => {
          rows.push([
            fecha,
            grupo,
            ej.nombre,
            String(ej.sets),
            String(ej.reps),
            String(ej.peso),
            ej.esMancuerna ? 'Sí' : 'No',
            ej.grupoMuscular,
            String(ej.volumen),
            ej.completado ? 'Sí' : 'No',
            String(volumenTotalSesion),
          ]);
        });
      }
    });

    rows.push([]); // Línea en blanco
  }

  // ==========================================
  // SECCIÓN 2: SESIONES DE CARDIO
  // ==========================================
  if (cardioSessions.length > 0) {
    rows.push(['=== SESIONES DE CARDIO ===']);
    rows.push([
      'Fecha',
      'Modo',
      'Tiempo Total (seg)',
      'Tiempo Trabajo (seg)',
      'Tiempo Descanso (seg)',
      'Rondas Completadas',
      'Calorías Estimadas',
    ]);

    cardioSessions.forEach((session) => {
      const fecha = new Date(session.savedAt || session.date).toLocaleDateString('es-ES');
      const stats = session.stats;

      if (stats) {
        const modeNames: Record<string, string> = {
          tabata: 'Tabata',
          emom: 'EMOM',
          amrap: 'AMRAP',
          circuit: 'Circuito',
          pyramid: 'Pirámide',
          custom: 'Personalizado',
          fortime: 'For Time',
        };
        const modeName = modeNames[session.mode || 'custom'] || session.mode || 'Cardio';

        rows.push([
          fecha,
          modeName,
          String(stats.totalTime || 0),
          String(stats.workTime || 0),
          String(stats.restTime || 0),
          String(stats.roundsCompleted || 0),
          String(stats.calories || 0),
        ]);
      }
    });
  }

  // ==========================================
  // SECCIÓN 3: PERFIL  (cambio aprobado nº2 del README: el backup deja de
  // cubrir solo el historial)
  // ==========================================
  const perfil = getProfile();
  if (Object.keys(perfil).length > 0) {
    rows.push([]);
    rows.push(['=== PERFIL ===']);
    rows.push(['Campo', 'Valor']);
    for (const [campo, valor] of Object.entries(perfil)) {
      if (valor === undefined || valor === null || valor === '') continue;
      rows.push([campo, String(valor)]);
    }
  }

  // ==========================================
  // SECCIÓN 4: MEDIDAS CORPORALES
  // ==========================================
  const medidas = getBodyMeasurements();
  if (medidas.length > 0) {
    rows.push([]);
    rows.push(['=== MEDIDAS CORPORALES ===']);
    const campos = [...new Set(medidas.flatMap((m) => Object.keys(m)))].filter((c) => c !== 'date');
    rows.push(['Fecha', ...campos]);
    for (const medida of medidas) {
      const registro = medida as unknown as Record<string, unknown>;
      rows.push([
        String(registro.date ?? ''),
        ...campos.map((c) => (registro[c] === undefined ? '' : String(registro[c]))),
      ]);
    }
  }

  // ==========================================
  // SECCIÓN 5: RÉCORDS
  // Se reconstruian desde las filas de pesas, asi que un PR mas viejo que la
  // ventana de historial (MAX_HISTORY_ITEMS) se perdia al restaurar, y al que
  // sobrevivia se le reescribia la fecha con la de la sesion que lo produjo.
  // ==========================================
  const records = getPRs();
  const nombresPR = Object.keys(records);
  if (nombresPR.length > 0) {
    rows.push([]);
    rows.push(['=== RÉCORDS ===']);
    rows.push(['Ejercicio', 'Peso (kg)', 'Sets', 'Reps', 'Volumen', 'Fecha']);
    for (const nombre of nombresPR) {
      const pr = records[nombre];
      rows.push([
        nombre,
        String(pr.peso ?? 0),
        String(pr.sets ?? 0),
        String(pr.reps ?? 0),
        String(pr.volumen ?? 0),
        String(pr.date ?? ''),
      ]);
    }
  }

  // ==========================================
  // SECCIÓN 6: RUTINAS PROPIAS
  // El builder (B-01) las guarda en `gymmate_custom_workouts` y el CSV no las
  // llevaba: restaurar borraba las rutinas construidas a mano mientras P-01
  // promete que "es la copia con la que se recupera todo".
  // ==========================================
  const rutinas = getCustomWorkouts();
  if (rutinas.length > 0) {
    rows.push([]);
    rows.push(['=== RUTINAS PROPIAS ===']);
    rows.push(['Id', 'Rutina', 'Creada', 'Ejercicio', 'Es Mancuerna', 'Grupo Muscular', 'Opcional']);
    for (const rutina of rutinas) {
      const filas: Array<[import('@/types').Exercise, boolean]> = [
        ...(rutina.ejercicios ?? []).map((e) => [e, false] as [import('@/types').Exercise, boolean]),
        ...(rutina.opcionales ?? []).map((e) => [e, true] as [import('@/types').Exercise, boolean]),
      ];
      for (const [ej, opcional] of filas) {
        rows.push([
          rutina.id,
          rutina.nombre,
          rutina.createdAt ?? '',
          ej.nombre,
          ej.esMancuerna ? 'Sí' : 'No',
          ej.grupoMuscular,
          opcional ? 'Sí' : 'No',
        ]);
      }
    }
  }

  if (rows.length === 0) {
    mostrarToast({
      tipo: 'aviso',
      titulo: 'Todavía no hay sesiones que exportar',
      detalle: 'Guarda un entrenamiento y el CSV se genera solo.',
    });
    return;
  }

  // Generar CSV con BOM para Excel
  const BOM = '\uFEFF';
  const csvContent = BOM + rows.map(row => row.map(escapeCSV).join(',')).join('\n');

  // Crear blob y descargar
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `GymMate_Historial_${hoyLocal()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Mantener compatibilidad con el nombre anterior
export const exportToExcel = exportToCSV;

// ==========================================
// IMPORTAR DESDE CSV
// ==========================================

interface ParsedCSVRow {
  fecha: string;
  grupo: string;
  ejercicio: string;
  sets: number;
  reps: number;
  peso: number;
  esMancuerna: boolean;
  grupoMuscular: string;
  volumen: number;
  completado: boolean;
  volumenTotalSesion: number;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

/** DD/MM/YYYY o D/M/YYYY -> ISO. `null` si la fecha no se puede leer. */
function parseSpanishDate(dateStr: string): string | null {
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    const iso = `${year}-${month}-${day}T12:00:00.000Z`;
    return Number.isNaN(new Date(iso).getTime()) ? null : iso;
  }
  // Puede venir ya en ISO de otra exportacion.
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Clave de deduplicacion. El CSV trae "10/08/2026" y el historial guarda un
 * ISO: comparar el texto crudo contra `toLocaleDateString` no coincidia nunca
 * —ni siquiera consigo mismo, porque el locale no pone el cero delante— y se
 * podia importar el mismo fichero cuatro veces seguidas.
 */
function claveDeSesion(iso: string, grupo: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `?|${grupo}`;
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
  return `${dia}|${grupo}`;
}

/**
 * Parte el CSV en sus secciones "=== NOMBRE ===".
 *
 * El importador leia SOLO las filas de pesas y cortaba en el siguiente
 * marcador, asi que el cardio, el perfil y las medidas que el exportador si
 * escribe se tiraban en silencio detras de un toast verde de exito — y un CSV
 * de alguien que solo hace cardio se rechazaba con "no tiene el formato
 * correcto de GymMate", culpando al archivo que la propia app genero.
 */
export interface ResultadoImport {
  /** Sesiones de pesas ANADIDAS (no parseadas). */
  imported: number;
  duplicates: number;
  descartadas: number;
  /** Sesiones de cardio ANADIDAS. El toast reportaba las parseadas y decia
   *  "2 de cardio" cuando habia entrado cero. */
  cardio: number;
  /** Campos de perfil que CAMBIARON. Antes se anunciaba "perfil" aunque el
   *  archivo trajera exactamente lo que ya habia. */
  perfil: number;
  medidas: number;
  medidasIlegibles: number;
  records: number;
  rutinas: number;
}

function partirEnSecciones(lines: string[]): Map<string, string[]> {
  const secciones = new Map<string, string[]>();
  let actual = 'PESAS_SUELTO';
  secciones.set(actual, []);
  for (const linea of lines) {
    const marcador = linea.trim().match(/^===\s*(.+?)\s*===$/);
    if (marcador) {
      actual = marcador[1].toUpperCase();
      if (!secciones.has(actual)) secciones.set(actual, []);
      continue;
    }
    secciones.get(actual)!.push(linea);
  }
  return secciones;
}

/** Nombre visible de modo -> clave interna. `fortime` se conserva de solo
 *  lectura: hay backups viejos que lo traen y perderlos seria peor que
 *  admitir un modo que ya no se puede crear. */
const MODO_DESDE_NOMBRE: Record<string, string> = {
  tabata: 'tabata',
  emom: 'emom',
  amrap: 'amrap',
  circuito: 'circuit',
  'pirámide': 'pyramid',
  piramide: 'pyramid',
  personalizado: 'custom',
  'for time': 'fortime',
};

function importarCardio(filas: string[]): HistorySession[] {
  const sesiones: HistorySession[] = [];
  for (const linea of filas) {
    const v = parseCSVLine(linea);
    if (v.length < 7) continue;
    if (v[0].toLowerCase().startsWith('fecha')) continue; // cabecera
    const iso = parseSpanishDate(v[0]);
    if (!iso) continue;
    const modo = MODO_DESDE_NOMBRE[(v[1] || '').trim().toLowerCase()];
    if (!modo) continue;
    const num = (x: string) => Number.parseInt(x, 10) || 0;
    sesiones.push({
      type: 'cardio',
      mode: modo as HistorySession['mode'],
      date: iso,
      savedAt: iso,
      sessionId: `imported_cardio_${iso}_${modo}`,
      grupo: `Cardio - ${(v[1] || 'Cardio').toUpperCase()}`,
      ejercicios: [],
      volumenTotal: 0,
      volumenPorGrupo: {},
      stats: {
        totalTime: num(v[2]),
        workTime: num(v[3]),
        restTime: num(v[4]),
        roundsCompleted: num(v[5]),
        calories: num(v[6]),
      },
    });
  }
  return sesiones;
}

/** Campos numericos del perfil. El resto entra como texto. */
const CAMPOS_NUMERICOS_PERFIL = new Set(['weight', 'height', 'activity']);

function importarPerfil(filas: string[]): number {
  const perfil: Record<string, string | number> = { ...getProfile() };
  let campos = 0;
  for (const linea of filas) {
    const v = parseCSVLine(linea);
    if (v.length < 2) continue;
    const campo = v[0].trim();
    if (!campo || campo.toLowerCase() === 'campo') continue;
    const bruto = v[1].trim();
    if (!bruto) continue;
    const valor = CAMPOS_NUMERICOS_PERFIL.has(campo) ? Number.parseFloat(bruto) || 0 : bruto;
    // Solo cuenta si CAMBIA algo: el toast anunciaba "perfil" tambien cuando el
    // archivo traia exactamente lo que ya estaba guardado.
    if (perfil[campo] === valor) continue;
    perfil[campo] = valor;
    campos++;
  }
  if (campos > 0) saveProfile(perfil as unknown as import('@/types').ProfileData);
  return campos;
}

/**
 * La fecha de una medida se guarda en ISO, pero el CSV puede traerla en
 * formato espanol si alguien lo edito en Excel. Devuelve null si no hay forma
 * de leerla: la fila se descarta y se cuenta, en vez de entrar y pintarse
 * como "Invalid Date".
 */
function fechaDeMedida(bruto: string): string | null {
  const t = bruto.trim();
  if (!t) return null;
  // OJO con el orden: probar `new Date(t)` PRIMERO leia `03/08/2026` como el 8
  // de MARZO, porque V8 interpreta `M/D/Y`. La seccion de pesas del mismo
  // archivo lo lee como 3 de agosto con `parseSpanishDate`, asi que el mismo
  // CSV daba dos meses distintos segun la seccion: en P-03 una fila caia en
  // agosto y la de al lado en marzo, y la linea de tendencia salia falsa.
  // `parseSpanishDate` ya cae en `new Date()` cuando no hay tres partes con
  // barra, asi que el ISO del backup propio sigue entrando igual.
  return parseSpanishDate(t);
}

function importarMedidas(filas: string[]): { nuevas: number; ilegibles: number } {
  const nada = { nuevas: 0, ilegibles: 0 };
  if (filas.length < 2) return nada;
  const cabecera = parseCSVLine(filas[0]).map((c) => c.trim());
  if (cabecera[0]?.toLowerCase() !== 'fecha') return nada;
  const existentes = getBodyMeasurements();
  const dias = new Set(existentes.map((m) => claveDiaDe(m.date)));
  let nuevas = 0;
  let ilegibles = 0;
  for (const linea of filas.slice(1)) {
    const v = parseCSVLine(linea);
    if (v.length < 2 || !v[0].trim()) continue;
    // Las pesas ya filtraban la fecha ilegible; las medidas no, y una fila con
    // basura en la primera columna se pintaba como "Invalid Date" en P-03 y en
    // el aria-label del boton de borrar.
    const cuando = fechaDeMedida(v[0]);
    if (!cuando) { ilegibles++; continue; }
    if (dias.has(claveDiaDe(cuando))) continue;
    const medida: Record<string, unknown> = { date: cuando };
    cabecera.slice(1).forEach((campo, i) => {
      const bruto = (v[i + 1] ?? '').trim();
      if (bruto === '') return;
      const n = Number.parseFloat(bruto);
      medida[campo] = Number.isNaN(n) ? bruto : n;
    });
    existentes.push(medida as unknown as import('@/types').BodyMeasurement);
    dias.add(claveDiaDe(cuando));
    nuevas++;
  }
  if (nuevas > 0) {
    existentes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveBodyMeasurements(existentes);
  }
  return { nuevas, ilegibles };
}

/**
 * Los records que el CSV trae explicitos MANDAN sobre los que se reconstruyen
 * desde las filas de pesas: conservan su fecha real y sobreviven aunque la
 * sesion que los produjo ya se haya salido de la ventana de historial.
 */
function importarRecords(filas: string[]): number {
  if (filas.length < 2) return 0;
  const cabecera = parseCSVLine(filas[0]).map((c) => c.trim().toLowerCase());
  if (!cabecera[0]?.startsWith('ejercicio')) return 0;
  const actuales = getPRs();
  let entraron = 0;
  for (const linea of filas.slice(1)) {
    const v = parseCSVLine(linea);
    if (v.length < 6 || !v[0].trim()) continue;
    const peso = Number.parseFloat(v[1]) || 0;
    if (peso <= 0) continue;
    const clave = normalizeExerciseName(v[0].trim());
    const previo = actuales[clave];
    if (previo && previo.peso >= peso) continue;
    actuales[clave] = {
      peso,
      sets: Number.parseInt(v[2], 10) || 0,
      reps: Number.parseInt(v[3], 10) || 0,
      volumen: Number.parseFloat(v[4]) || 0,
      date: fechaDeMedida(v[5]) ?? new Date().toISOString(),
    };
    entraron++;
  }
  if (entraron > 0) savePRs(actuales);
  return entraron;
}

/** Rutinas del builder (B-01). Se dedupican por id. */
function importarRutinas(filas: string[]): number {
  if (filas.length < 2) return 0;
  const cabecera = parseCSVLine(filas[0]).map((c) => c.trim().toLowerCase());
  if (cabecera[0] !== 'id' || cabecera[1] !== 'rutina') return 0;
  const existentes = getCustomWorkouts();
  const ids = new Set(existentes.map((r) => r.id));
  const enConstruccion = new Map<string, CustomWorkout>();
  for (const linea of filas.slice(1)) {
    const v = parseCSVLine(linea);
    if (v.length < 7 || !v[0].trim() || !v[3].trim()) continue;
    const id = v[0].trim();
    if (ids.has(id)) continue;
    if (!enConstruccion.has(id)) {
      enConstruccion.set(id, {
        id,
        nombre: v[1].trim() || 'Rutina',
        createdAt: fechaDeMedida(v[2]) ?? new Date().toISOString(),
        isCustom: true,
        ejercicios: [],
        opcionales: [],
      });
    }
    const rutina = enConstruccion.get(id)!;
    const ejercicio = {
      nombre: v[3].trim(),
      esMancuerna: v[4]?.toLowerCase() === 'sí' || v[4]?.toLowerCase() === 'si',
      grupoMuscular: (v[5]?.trim() || 'Core') as import('@/types').MuscleGroup,
    };
    const esOpcional = v[6]?.toLowerCase() === 'sí' || v[6]?.toLowerCase() === 'si';
    (esOpcional ? rutina.opcionales : rutina.ejercicios).push(ejercicio);
  }
  if (enConstruccion.size === 0) return 0;
  saveCustomWorkouts([...existentes, ...enConstruccion.values()]);
  return enConstruccion.size;
}

export function importFromCSV(
  file: File
): Promise<ResultadoImport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        // Remover BOM si existe
        const cleanContent = content.replace(/^\uFEFF/, '');
        const lines = cleanContent.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          reject(new Error('El archivo CSV está vacío o no tiene datos'));
          return;
        }

        // El CSV que exporta la app empieza por "=== ENTRENAMIENTOS DE PESAS
        // ===", asi que mirar solo la primera linea rechazaba el propio
        // backup de la app: no habia forma de exportar e importar de vuelta.
        const expectedHeaders = ['Fecha', 'Grupo', 'Ejercicio', 'Sets', 'Reps', 'Peso (kg)'];
        const esCabeceraDePesas = (linea: string) => {
          const headers = parseCSVLine(linea);
          return expectedHeaders.every((h) =>
            headers.some((header) => header.toLowerCase().includes(h.toLowerCase().split(' ')[0]))
          );
        };
        const secciones = partirEnSecciones(lines);
        const bloqueDePesas = secciones.get('ENTRENAMIENTOS DE PESAS') ?? secciones.get('PESAS_SUELTO') ?? [];
        const iCabecera = bloqueDePesas.findIndex(esCabeceraDePesas);
        const filasDePesas = iCabecera === -1 ? [] : bloqueDePesas.slice(iCabecera + 1);

        // Las otras tres secciones que el exportador escribe. Antes se tiraban
        // en silencio: el backup era de ida y vuelta solo para las pesas.
        const sesionesCardio = importarCardio(secciones.get('SESIONES DE CARDIO') ?? []);
        const camposPerfil = importarPerfil(secciones.get('PERFIL') ?? []);
        const medidas = importarMedidas(secciones.get('MEDIDAS CORPORALES') ?? []);
        const medidasNuevas = medidas.nuevas;
        const recordsNuevos = importarRecords(secciones.get('RÉCORDS') ?? secciones.get('RECORDS') ?? []);
        const rutinasNuevas = importarRutinas(secciones.get('RUTINAS PROPIAS') ?? []);

        // Un CSV de quien solo hace cardio no tiene seccion de pesas, y se
        // rechazaba culpando al archivo que la propia app habia generado.
        const hayAlgo =
          filasDePesas.length > 0 ||
          sesionesCardio.length > 0 ||
          camposPerfil > 0 ||
          medidasNuevas > 0 ||
          recordsNuevos > 0 ||
          rutinasNuevas > 0;
        if (!hayAlgo) {
          reject(new Error('El archivo CSV no tiene el formato correcto de GymMate'));
          return;
        }

        // Parsear filas
        const rows: ParsedCSVRow[] = [];
        let descartadas = 0;
        for (const linea of filasDePesas) {
          const values = parseCSVLine(linea);
          if (values.length >= 10) {
            // Una fecha ilegible no puede entrar: se colaba tal cual y a la
            // siguiente recarga la app se quedaba en blanco con un
            // "Invalid time value" sin capturar.
            if (!parseSpanishDate(values[0])) {
              descartadas++;
              continue;
            }
            rows.push({
              fecha: values[0],
              grupo: values[1],
              ejercicio: values[2],
              sets: parseInt(values[3]) || 0,
              reps: parseInt(values[4]) || 0,
              peso: parseFloat(values[5]) || 0,
              esMancuerna: values[6]?.toLowerCase() === 'sí' || values[6]?.toLowerCase() === 'si',
              grupoMuscular: values[7] || 'Core',
              volumen: parseFloat(values[8]) || 0,
              completado: values[9]?.toLowerCase() === 'sí' || values[9]?.toLowerCase() === 'si',
              volumenTotalSesion: parseFloat(values[10]) || 0,
            });
          }
        }

        // Agrupar por fecha + grupo para reconstruir sesiones. La clave se
        // normaliza a YYYY-MM-DD para que coincida con la del historial.
        const sessionMap = new Map<string, ParsedCSVRow[]>();
        rows.forEach(row => {
          const iso = parseSpanishDate(row.fecha);
          if (!iso) return;
          const key = claveDeSesion(iso, row.grupo);
          if (!sessionMap.has(key)) {
            sessionMap.set(key, []);
          }
          sessionMap.get(key)!.push(row);
        });

        // Construir sesiones
        const existingHistory = getHistory();
        const existingKeys = new Set(
          existingHistory.map((s) => claveDeSesion(s.savedAt || s.date, s.grupo))
        );

        const newSessions: import('@/types').HistorySession[] = [];
        let duplicates = 0;

        // El cardio pasa por la MISMA deduplicacion que las pesas.
        let cardioAnadido = 0;
        for (const sesion of sesionesCardio) {
          const clave = claveDeSesion(sesion.savedAt || sesion.date, sesion.grupo);
          if (existingKeys.has(clave)) {
            duplicates++;
            continue;
          }
          existingKeys.add(clave);
          newSessions.push(sesion);
          cardioAnadido++;
        }

        sessionMap.forEach((sessionRows, key) => {
          // Verificar si ya existe
          if (existingKeys.has(key)) {
            duplicates++;
            return;
          }

          const firstRow = sessionRows[0];
          // Ya se valido al filtrar las filas: aqui no puede ser null.
          const isoDate = parseSpanishDate(firstRow.fecha) as string;

          // Calcular volumen por grupo muscular
          const volumenPorGrupo: Record<string, number> = {};
          sessionRows.forEach(row => {
            const grupo = row.grupoMuscular;
            volumenPorGrupo[grupo] = (volumenPorGrupo[grupo] || 0) + row.volumen;
          });

          const session: import('@/types').HistorySession = {
            date: isoDate,
            savedAt: isoDate,
            sessionId: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            grupo: firstRow.grupo,
            type: 'weights',
            // La suma de las filas, SIEMPRE. `volumenTotalSesion` es el total
            // de UNA sesion, y la clave de agrupacion es `dia|grupo`: dos
            // sesiones del mismo grupo el mismo dia caen en el mismo grupo y
            // la fusionada declaraba 4.000 kg donde el usuario levanto 8.800.
            // Esa es la cifra grande de HI-02 y la que alimenta el heatmap.
            volumenTotal: sessionRows.reduce((sum, r) => sum + r.volumen, 0),
            volumenPorGrupo,
            ejercicios: sessionRows.map(row => ({
              nombre: row.ejercicio,
              sets: row.sets,
              reps: row.reps,
              peso: row.peso,
              esMancuerna: row.esMancuerna,
              grupoMuscular: row.grupoMuscular as import('@/types').MuscleGroup,
              volumen: row.volumen,
              completado: row.completado,
            })),
          };

          newSessions.push(session);
        });

        // Agregar nuevas sesiones al historial
        if (newSessions.length > 0) {
          const updatedHistory = [...newSessions, ...existingHistory];
          // Ordenar por fecha (más reciente primero)
          updatedHistory.sort((a, b) => {
            const dateA = new Date(a.savedAt || a.date).getTime();
            const dateB = new Date(b.savedAt || b.date).getTime();
            return dateB - dateA;
          });
          saveHistory(updatedHistory);

          // Actualizar PRs con los datos importados
          const currentPRs = getPRs();
          newSessions.forEach(session => {
            session.ejercicios.forEach(ejercicio => {
              if (ejercicio.volumen > 0) {
                const normalizedName = normalizeExerciseName(ejercicio.nombre);
                const currentPR = currentPRs[normalizedName];
                if (!currentPR || ejercicio.peso > currentPR.peso) {
                  updatePR(ejercicio.nombre, {
                    peso: ejercicio.peso,
                    sets: ejercicio.sets,
                    reps: ejercicio.reps,
                    volumen: ejercicio.volumen,
                    date: session.savedAt || session.date,
                  });
                  // Actualizar el objeto local para comparaciones posteriores
                  currentPRs[normalizedName] = {
                    peso: ejercicio.peso,
                    sets: ejercicio.sets,
                    reps: ejercicio.reps,
                    volumen: ejercicio.volumen,
                    date: session.savedAt || session.date,
                  };
                }
              }
            });
          });
        }

        // Restaurar un backup en un navegador limpio dejaba la gamificacion en
        // cero: `initGamification()` ya habia corrido y creado el estado vacio,
        // asi que la migracion desde historial no se volvia a disparar y la
        // home decia "NIVEL 1 · 0 XP" con 38 entrenos en el heatmap.
        //
        // FUSIONAR, no reinicializar. `reinitGamification()` rederiva desde
        // cero, y eso le quitaba al usuario el XP de los hitos de racha, el
        // escalon real de sus PRs, los ascensos de rango y su mejor racha:
        // importar UNA sesion vieja le bajaba el nivel. Ninguna cifra puede
        // bajar por importar un archivo.
        if (newSessions.length > 0) {
          try {
            const { fusionarGamificacion } = await import('@/features/gamification');
            fusionarGamificacion();
          } catch (e) {
            console.warn('No se pudo actualizar la gamificacion tras importar', e);
          }
        }

        resolve({
          imported: newSessions.length - cardioAnadido,
          duplicates,
          descartadas,
          cardio: cardioAnadido,
          perfil: camposPerfil,
          medidas: medidasNuevas,
          medidasIlegibles: medidas.ilegibles,
          records: recordsNuevos,
          rutinas: rutinasNuevas,
        });
      } catch (error) {
        reject(new Error('Error al procesar el archivo CSV: ' + (error as Error).message));
      }
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo'));
    };

    reader.readAsText(file, 'UTF-8');
  });
}

export function triggerCSVImport(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.style.display = 'none';

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const result = await importFromCSV(file);

      const avisos: string[] = [];
      if (result.duplicates > 0) {
        avisos.push(
          `${result.duplicates} ${result.duplicates === 1 ? 'duplicada omitida' : 'duplicadas omitidas'}`
        );
      }
      if (result.descartadas + result.medidasIlegibles > 0) {
        const ilegibles = result.descartadas + result.medidasIlegibles;
        avisos.push(
          `${ilegibles} ${ilegibles === 1 ? 'fila con fecha ilegible' : 'filas con fecha ilegible'}`
        );
      }
      // Lo recuperado se dice entero: el toast hablaba solo de las filas de
      // pesas mientras el cardio, el perfil y las medidas se tiraban.
      const recuperado: string[] = [];
      if (result.cardio > 0) {
        recuperado.push(`${result.cardio} de cardio`);
      }
      if (result.perfil > 0) {
        recuperado.push('perfil');
      }
      if (result.medidas > 0) {
        recuperado.push(
          `${result.medidas} ${result.medidas === 1 ? 'medición' : 'mediciones'}`
        );
      }
      if (result.records > 0) {
        recuperado.push(`${result.records} ${result.records === 1 ? 'récord' : 'récords'}`);
      }
      if (result.rutinas > 0) {
        recuperado.push(`${result.rutinas} ${result.rutinas === 1 ? 'rutina' : 'rutinas'}`);
      }

      mostrarToast({
        tipo: avisos.length > 0 ? 'aviso' : 'exito',
        titulo: `CSV importado: ${result.imported} ${result.imported === 1 ? 'sesión' : 'sesiones'}`,
        detalle: [recuperado.join(' · '), avisos.join(' · ')].filter(Boolean).join(' · ') || undefined,
      });

      // Recargar historial si estamos en esa pestaña
      loadHistory();
      loadPRs();
      // Y la home: la accion de importar vive EN la home (H-01/O-01). Sin
      // esto, importar 2 sesiones dejaba la pantalla diciendo "SESIÓN 0 · tu
      // primera sesión enciende la primera celda".
      const { renderizarHome } = await import('@/ui/navigation');
      renderizarHome();
    } catch (error) {
      mostrarToast({
        tipo: 'aviso',
        titulo: 'El CSV no se pudo leer',
        // El mensaje ya viene prefijado con "Error al procesar el archivo
        // CSV:"; repetirlo bajo el titulo era ruido.
        detalle: (error as Error).message.replace(/^Error al procesar el archivo CSV:\s*/, ''),
        duracion: 8000,
      });
    }
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

// ==========================================
// ESTADÍSTICAS RÁPIDAS
// ==========================================
//
// `getQuickStats` se ha borrado. Era una SEGUNDA implementacion de la racha
// —solo pesas, tope de 7 dias, dia UTC— sin un solo llamador en todo el arbol,
// y contradecia a la que si se usa. El README pide una sola: la de
// gamificacion (`calculateCurrentStreak` + `sesionesDeRacha`).
