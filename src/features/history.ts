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
} from '@/utils/storage';
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

        session.ejercicios.forEach((ej) => {
          if (ej.volumen > 0) {
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
          }
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
  imported: number;
  duplicates: number;
  descartadas: number;
  cardio: number;
  perfil: number;
  medidas: number;
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
    perfil[campo] = CAMPOS_NUMERICOS_PERFIL.has(campo) ? Number.parseFloat(bruto) || 0 : bruto;
    campos++;
  }
  if (campos > 0) saveProfile(perfil as unknown as import('@/types').ProfileData);
  return campos;
}

function importarMedidas(filas: string[]): number {
  if (filas.length < 2) return 0;
  const cabecera = parseCSVLine(filas[0]).map((c) => c.trim());
  if (cabecera[0]?.toLowerCase() !== 'fecha') return 0;
  const existentes = getBodyMeasurements();
  const dias = new Set(existentes.map((m) => claveDiaDe(m.date)));
  let nuevas = 0;
  for (const linea of filas.slice(1)) {
    const v = parseCSVLine(linea);
    if (v.length < 2 || !v[0].trim()) continue;
    if (dias.has(claveDiaDe(v[0]))) continue;
    const medida: Record<string, unknown> = { date: v[0].trim() };
    cabecera.slice(1).forEach((campo, i) => {
      const bruto = (v[i + 1] ?? '').trim();
      if (bruto === '') return;
      const n = Number.parseFloat(bruto);
      medida[campo] = Number.isNaN(n) ? bruto : n;
    });
    existentes.push(medida as unknown as import('@/types').BodyMeasurement);
    dias.add(claveDiaDe(v[0]));
    nuevas++;
  }
  if (nuevas > 0) {
    existentes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveBodyMeasurements(existentes);
  }
  return nuevas;
}

export function importFromCSV(
  file: File
): Promise<ResultadoImport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
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
        const medidasNuevas = importarMedidas(secciones.get('MEDIDAS CORPORALES') ?? []);

        // Un CSV de quien solo hace cardio no tiene seccion de pesas, y se
        // rechazaba culpando al archivo que la propia app habia generado.
        const hayAlgo =
          filasDePesas.length > 0 || sesionesCardio.length > 0 || camposPerfil > 0 || medidasNuevas > 0;
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
        for (const sesion of sesionesCardio) {
          const clave = claveDeSesion(sesion.savedAt || sesion.date, sesion.grupo);
          if (existingKeys.has(clave)) {
            duplicates++;
            continue;
          }
          existingKeys.add(clave);
          newSessions.push(sesion);
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
            volumenTotal: firstRow.volumenTotalSesion || sessionRows.reduce((sum, r) => sum + r.volumen, 0),
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

        resolve({
          imported: newSessions.length,
          duplicates,
          descartadas,
          cardio: sesionesCardio.length,
          perfil: camposPerfil,
          medidas: medidasNuevas,
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
      if (result.descartadas > 0) {
        avisos.push(
          `${result.descartadas} ${
            result.descartadas === 1 ? 'fila con fecha ilegible' : 'filas con fecha ilegible'
          }`
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
