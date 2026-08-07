import { describe, it, expect, beforeEach } from 'vitest';
import { importFromCSV, escapeCSV } from '../features/history';
import { getHistory } from '../utils/storage';

// ==========================================
// HELPERS
// ==========================================

const HEADER =
  'Fecha,Grupo,Ejercicio,Sets,Reps,Peso (kg),Es Mancuerna,Grupo Muscular,Volumen,Completado,Volumen Total Sesión';

function csvRow(fields: (string | number)[]): string {
  return fields.join(',');
}

function buildCSV(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

function csvFile(content: string): File {
  return new File([content], 'export.csv', { type: 'text/csv' });
}

beforeEach(() => {
  localStorage.clear();
});

// ==========================================
// HIST-02 — Fusión incorrecta de sesiones distintas del mismo día/grupo
// ==========================================

describe('importFromCSV (HIST-02) — sesiones distintas del mismo día y grupo', () => {
  it('no fusiona dos sesiones reales del mismo día y grupo con distinto volumen total', async () => {
    const csv = buildCSV([
      csvRow(['09/03/2026', 'Pecho', 'Press Banca', 3, 10, 50, 'No', 'Pecho', 1500, 'Sí', 1500]),
      csvRow(['09/03/2026', 'Pecho', 'Press Inclinado', 4, 8, 40, 'No', 'Pecho', 1280, 'Sí', 1280]),
    ]);

    const result = await importFromCSV(csvFile(csv));

    expect(result.imported).toBe(2);
    expect(result.duplicates).toBe(0);

    const history = getHistory();
    expect(history.length).toBe(2);
    // Cada sesión debe conservar su propio volumen, ninguno se pierde ni se subestima
    const volumes = history.map((s) => s.volumenTotal).sort((a, b) => a - b);
    expect(volumes).toEqual([1280, 1500]);
  });

  it('sí reconoce como duplicado un re-import exacto de una sesión ya existente', async () => {
    // Mismo formato que produce exportToCSV() vía toLocaleDateString('es-ES')
    // (sin ceros a la izquierda) — así el dedup compara fechas en el mismo formato.
    const csv = buildCSV([
      csvRow(['9/3/2026', 'Pecho', 'Press Banca', 3, 10, 50, 'No', 'Pecho', 1500, 'Sí', 1500]),
    ]);

    const first = await importFromCSV(csvFile(csv));
    expect(first.imported).toBe(1);

    const second = await importFromCSV(csvFile(csv));
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(getHistory().length).toBe(1);
  });

  it('suma correctamente el volumen de todas las filas agrupadas en una sesión', async () => {
    const csv = buildCSV([
      csvRow(['11/03/2026', 'Piernas', 'Sentadilla', 4, 8, 80, 'No', 'Piernas', 2560, 'Sí', 3960]),
      csvRow(['11/03/2026', 'Piernas', 'Prensa', 3, 12, 100, 'No', 'Piernas', 3600, 'Sí', 3960]),
    ]);

    const result = await importFromCSV(csvFile(csv));
    expect(result.imported).toBe(1);

    const [session] = getHistory();
    // 2560 + 3600 = 6160, no el valor de una sola fila (3960)
    expect(session.volumenTotal).toBe(6160);
    expect(session.ejercicios.length).toBe(2);
  });
});

// ==========================================
// HIST-03 — Validación de rangos/tipos al importar
// ==========================================

describe('importFromCSV (HIST-03) — validación de rangos y tipos', () => {
  it('rechaza filas con sets, reps o peso fuera de rango, importando solo las válidas', async () => {
    const csv = buildCSV([
      csvRow(['09/03/2026', 'Pecho', 'Press Banca', 3, 10, 50, 'No', 'Pecho', 1500, 'Sí', 1500]),
      csvRow(['09/03/2026', 'Piernas', 'Sentadilla', 0, 10, 50, 'No', 'Piernas', 0, 'No', 1500]), // sets inválido
      csvRow(['09/03/2026', 'Biceps', 'Curl', 3, 10, 99999, 'No', 'Biceps', 999990, 'Sí', 999990]), // peso inválido
      csvRow(['09/03/2026', 'Core', 'Plancha', 3, 500, 20, 'No', 'Core', 30000, 'Sí', 999990]), // reps inválido
    ]);

    const result = await importFromCSV(csvFile(csv));

    expect(result.imported).toBe(1);
    expect(result.rejected).toBe(3);
    expect(result.rejectedDetails.some((d) => d.includes('sets inválido'))).toBe(true);
    expect(result.rejectedDetails.some((d) => d.includes('peso inválido'))).toBe(true);
    expect(result.rejectedDetails.some((d) => d.includes('reps inválido'))).toBe(true);

    // Las filas rechazadas no se guardan con valores en 0 en vez de rechazarse
    const history = getHistory();
    expect(history.length).toBe(1);
    expect(history[0].ejercicios.length).toBe(1);
    expect(history[0].ejercicios[0].nombre).toBe('Press Banca');
  });

  it('rechaza filas con nombre de ejercicio vacío sin descartar las filas válidas', async () => {
    const csv = buildCSV([
      csvRow(['09/03/2026', 'Pecho', 'Press Banca', 3, 10, 50, 'No', 'Pecho', 1500, 'Sí', 1500]),
      csvRow(['09/03/2026', 'Pecho', '', 3, 10, 50, 'No', 'Pecho', 1500, 'Sí', 2000]),
    ]);

    const result = await importFromCSV(csvFile(csv));
    expect(result.imported).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.rejectedDetails.some((d) => d.includes('falta el nombre del ejercicio'))).toBe(true);
  });

  it('rechaza el archivo completo si ninguna fila es válida', async () => {
    const csv = buildCSV([
      csvRow(['09/03/2026', 'Pecho', '', 3, 10, 50, 'No', 'Pecho', 1500, 'Sí', 1500]),
    ]);

    await expect(importFromCSV(csvFile(csv))).rejects.toThrow(
      'No se encontraron datos válidos en el archivo'
    );
  });
});

// ==========================================
// Importación válida de punta a punta
// ==========================================

describe('importFromCSV — caso feliz', () => {
  it('importa un CSV válido completo sin rechazos ni duplicados', async () => {
    const csv = buildCSV([
      csvRow(['10/03/2026', 'Espalda', 'Remo', 4, 8, 60, 'No', 'Espalda', 1920, 'Sí', 1920]),
    ]);

    const result = await importFromCSV(csvFile(csv));

    expect(result.imported).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.duplicates).toBe(0);

    const [session] = getHistory();
    expect(session.grupo).toBe('Espalda');
    expect(session.volumenTotal).toBe(1920);
    expect(session.ejercicios[0].nombre).toBe('Remo');
    expect(session.ejercicios[0].sets).toBe(4);
    expect(session.ejercicios[0].peso).toBe(60);
  });

  it('rechaza un archivo con encabezados incorrectos', async () => {
    const badCsv = 'A,B,C\n1,2,3';
    await expect(importFromCSV(csvFile(badCsv))).rejects.toThrow(
      'El archivo CSV no tiene el formato correcto de GymMate'
    );
  });
});

// ==========================================
// HIST-01 — CSV/Excel Formula Injection
// ==========================================

describe('escapeCSV (HIST-01) — neutralización de fórmulas', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1234', "'+1234"],
    ['-1234', "'-1234"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
  ])('antepone un apóstrofe a un valor que empieza con %s', (input, expected) => {
    expect(escapeCSV(input)).toBe(expected);
  });

  it('no modifica texto normal', () => {
    expect(escapeCSV('Press Banca')).toBe('Press Banca');
  });

  it('no modifica números normales', () => {
    expect(escapeCSV(1500)).toBe('1500');
  });

  it('compone correctamente con el escape de comillas/wrap existente', () => {
    const result = escapeCSV('=HYPERLINK("evil")');
    // Al contener comillas dobles, el campo completo queda envuelto entre comillas
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
    // El apóstrofe neutralizador debe quedar justo antes del "=" original
    expect(result).toContain("'=HYPERLINK");
    // Las comillas internas se duplican (escape CSV estándar)
    expect(result).toContain('""evil""');
  });

  it('neutraliza un nombre de ejercicio malicioso exportado con caracteres especiales', () => {
    const result = escapeCSV('=cmd|\'/C calc\'!A1');
    expect(result.startsWith("'=cmd")).toBe(true);
  });
});
