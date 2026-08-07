import { getHistory, deleteFromHistory, getPRs, saveHistory, updatePR } from '@/utils/storage';
import { renderHistoryItem, renderPRItem, refreshIcons } from '@/ui/components';
import { icon } from '@/utils/icons';
import { normalizeExerciseName } from '@/utils/exercise-normalizer';
import {
  MAX_REASONABLE_PESO,
  MAX_REASONABLE_SETS,
  MAX_REASONABLE_REPS,
} from '@/constants';

// ==========================================
// CARGAR HISTORIAL
// ==========================================

export function loadHistory(): void {
  const history = getHistory();
  const historyList = document.getElementById('historyList');

  if (!historyList) return;

  if (history.length === 0) {
    historyList.innerHTML = `
      <div class="text-center py-8">
        ${icon('history', 'xl', 'text-text-muted mb-3 mx-auto')}
        <p class="text-text-secondary">No hay entrenamientos guardados aún</p>
        <p class="text-text-muted text-sm mt-1">Completa tu primer entrenamiento para verlo aquí</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  let html = '';
  history.forEach((session, index) => {
    html += renderHistoryItem(session, index);
  });

  historyList.innerHTML = html;
  refreshIcons();
}

// ==========================================
// ELIMINAR DEL HISTORIAL
// ==========================================

export function deleteHistoryItem(index: number): void {
  if (confirm('¿Eliminar este entrenamiento del historial?')) {
    deleteFromHistory(index);
    loadHistory();
  }
}

// ==========================================
// CARGAR PRs
// ==========================================

export function loadPRs(): void {
  const prs = getPRs();
  const prsList = document.getElementById('prsList');

  if (!prsList) return;

  const prEntries = Object.entries(prs);

  if (prEntries.length === 0) {
    prsList.innerHTML = `
      <div class="text-center py-8">
        ${icon('trophy', 'xl', 'text-text-muted mb-3 mx-auto')}
        <p class="text-text-secondary">Registra tus primeros entrenamientos para ver tus PRs</p>
        <p class="text-text-muted text-sm mt-1">Los récords personales se guardan automáticamente</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  // Ordenar por fecha (más reciente primero)
  prEntries.sort((a, b) => {
    return new Date(b[1].date).getTime() - new Date(a[1].date).getTime();
  });

  let html = '';
  prEntries.forEach(([nombre, data]) => {
    html += renderPRItem(nombre, data);
  });

  prsList.innerHTML = html;
  refreshIcons();
}

// ==========================================
// EXPORTAR A CSV (reemplaza xlsx por seguridad)
// ==========================================

export function escapeCSV(value: string | number): string {
  let str = String(value);

  // Neutralizar CSV/Excel Formula Injection: si el valor empieza con un
  // caracter que Excel/Sheets interpreta como inicio de fórmula (=,+,-,@,
  // tab o retorno de carro), anteponer un apóstrofe para forzar texto plano
  // (mitigación estándar de OWASP).
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escapar comillas dobles y envolver en comillas si contiene caracteres especiales
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV(): void {
  const history = getHistory();

  if (history.length === 0) {
    alert('No hay datos para exportar');
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

  if (rows.length === 0) {
    alert('No hay datos para exportar');
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
  link.setAttribute('download', `GymMate_Historial_${new Date().toISOString().split('T')[0]}.csv`);
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

function parseSpanishDate(dateStr: string): string {
  // Formato esperado: DD/MM/YYYY o D/M/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}T12:00:00.000Z`;
  }
  // Si ya está en formato ISO, devolverlo
  return dateStr;
}

export function importFromCSV(
  file: File
): Promise<{ imported: number; duplicates: number; rejected: number; rejectedDetails: string[] }> {
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

        // Verificar headers
        const headers = parseCSVLine(lines[0]);
        const expectedHeaders = ['Fecha', 'Grupo', 'Ejercicio', 'Sets', 'Reps', 'Peso (kg)'];
        const hasValidHeaders = expectedHeaders.every(h =>
          headers.some(header => header.toLowerCase().includes(h.toLowerCase().split(' ')[0]))
        );

        if (!hasValidHeaders) {
          reject(new Error('El archivo CSV no tiene el formato correcto de GymMate'));
          return;
        }

        // Parsear filas, validando tipos y rangos razonables antes de aceptarlas
        const rows: ParsedCSVRow[] = [];
        const rejectedDetails: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const rowNumber = i + 1; // +1 por la fila de encabezado

          if (values.length < 10) {
            rejectedDetails.push(`Fila ${rowNumber}: faltan columnas`);
            continue;
          }

          const ejercicio = values[2]?.trim();
          if (!ejercicio) {
            rejectedDetails.push(`Fila ${rowNumber}: falta el nombre del ejercicio`);
            continue;
          }

          const sets = parseInt(values[3], 10);
          if (!Number.isFinite(sets) || sets <= 0 || sets > MAX_REASONABLE_SETS) {
            rejectedDetails.push(`Fila ${rowNumber} (${ejercicio}): sets inválido ("${values[3]}")`);
            continue;
          }

          const reps = parseInt(values[4], 10);
          if (!Number.isFinite(reps) || reps <= 0 || reps > MAX_REASONABLE_REPS) {
            rejectedDetails.push(`Fila ${rowNumber} (${ejercicio}): reps inválido ("${values[4]}")`);
            continue;
          }

          const peso = parseFloat(values[5]);
          if (!Number.isFinite(peso) || peso <= 0 || peso > MAX_REASONABLE_PESO) {
            rejectedDetails.push(`Fila ${rowNumber} (${ejercicio}): peso inválido ("${values[5]}")`);
            continue;
          }

          rows.push({
            fecha: values[0],
            grupo: values[1],
            ejercicio,
            sets,
            reps,
            peso,
            esMancuerna: values[6]?.toLowerCase() === 'sí' || values[6]?.toLowerCase() === 'si',
            grupoMuscular: values[7] || 'Core',
            volumen: parseFloat(values[8]) || 0,
            completado: values[9]?.toLowerCase() === 'sí' || values[9]?.toLowerCase() === 'si',
            volumenTotalSesion: parseFloat(values[10]) || 0,
          });
        }

        if (rows.length === 0) {
          reject(new Error('No se encontraron datos válidos en el archivo'));
          return;
        }

        // Agrupar por fecha + grupo + volumen total de sesión para reconstruir sesiones.
        // Incluir el volumen total en la clave (no solo fecha+grupo) evita fusionar dos
        // sesiones reales distintas del mismo día y grupo muscular en una sola: cada
        // sesión original lleva su propio "Volumen Total Sesión" repetido en sus filas,
        // así que dos sesiones distintas casi nunca coinciden en ese valor.
        const sessionMap = new Map<string, ParsedCSVRow[]>();
        rows.forEach(row => {
          const key = `${row.fecha}|${row.grupo}|${row.volumenTotalSesion}`;
          if (!sessionMap.has(key)) {
            sessionMap.set(key, []);
          }
          sessionMap.get(key)!.push(row);
        });

        // Construir sesiones
        const existingHistory = getHistory();
        const existingKeys = new Set(
          existingHistory.map(s => {
            const date = new Date(s.savedAt || s.date).toLocaleDateString('es-ES');
            return `${date}|${s.grupo}|${s.volumenTotal}`;
          })
        );

        const newSessions: import('@/types').HistorySession[] = [];
        let duplicates = 0;

        sessionMap.forEach((sessionRows, key) => {
          // Verificar si ya existe (misma fecha + grupo + volumen total = ya importada)
          if (existingKeys.has(key)) {
            duplicates++;
            return;
          }

          const firstRow = sessionRows[0];
          const isoDate = parseSpanishDate(firstRow.fecha);

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
            // Sumar siempre las filas del grupo (nunca tomar solo el valor de la
            // primera fila) para no subestimar el volumen si el agrupado incluyera
            // más de un origen.
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

        resolve({
          imported: newSessions.length,
          duplicates,
          rejected: rejectedDetails.length,
          rejectedDetails,
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

      let message = `¡Importación completada!\n\n`;
      message += `✅ ${result.imported} entrenamiento(s) importado(s)`;
      if (result.duplicates > 0) {
        message += `\n⚠️ ${result.duplicates} duplicado(s) omitido(s)`;
      }
      if (result.rejected > 0) {
        message += `\n❌ ${result.rejected} fila(s) rechazada(s) por datos inválidos:`;
        const preview = result.rejectedDetails.slice(0, 5);
        preview.forEach(detail => {
          message += `\n   • ${detail}`;
        });
        if (result.rejectedDetails.length > preview.length) {
          message += `\n   • ...y ${result.rejectedDetails.length - preview.length} más`;
        }
      }

      alert(message);

      // Recargar historial si estamos en esa pestaña
      loadHistory();
      loadPRs();
    } catch (error) {
      alert('Error: ' + (error as Error).message);
    }
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

