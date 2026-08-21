import { Chart, registerables } from 'chart.js';
import { getHistory } from '@/utils/storage';
import { getWeekNumber, formatShortDate } from '@/utils/calculations';
import { THEME_COLORS } from '@/constants';
import { normalizeExerciseName } from '@/utils/exercise-normalizer';

// Registrar todos los componentes de Chart.js
Chart.register(...registerables);

// ==========================================
// VARIABLES DE GRÁFICOS
// ==========================================

let volumeTrendChart: Chart | null = null;
let muscleDistributionChart: Chart | null = null;
let weightProgressChart: Chart | null = null;
let weeklyComparisonChart: Chart | null = null;

// ==========================================
// CONFIGURACIÓN BASE DE CHART.JS
// ==========================================

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: THEME_COLORS.text.secondary,
        font: {
          // Canvas no hereda el stack CSS: sin fallback explicito, si el
          // woff2 no esta la leyenda sale en serif mientras el resto es sans.
          family: "'Instrument Sans', system-ui, sans-serif",
        },
      },
    },
  },
  scales: {
    x: {
      ticks: {
        color: THEME_COLORS.text.muted,
      },
      grid: {
        color: 'rgba(255, 255, 255, 0.05)',
      },
    },
    y: {
      ticks: {
        color: THEME_COLORS.text.muted,
      },
      grid: {
        color: 'rgba(255, 255, 255, 0.05)',
      },
    },
  },
};

// ==========================================
// INICIALIZAR GRÁFICOS
// ==========================================

export function initializeCharts(): void {
  // Destruir gráficos existentes
  if (volumeTrendChart) volumeTrendChart.destroy();
  if (muscleDistributionChart) muscleDistributionChart.destroy();
  if (weightProgressChart) weightProgressChart.destroy();
  if (weeklyComparisonChart) weeklyComparisonChart.destroy();

  const history = getHistory();

  if (history.length === 0) {
    showNoDataMessage();
    return;
  }

  // Crear gráficos
  createVolumeTrendChart(history);
  createMuscleDistributionChart(history);
  populateExerciseDropdown(history);
  createWeeklyComparisonChart(history);
}

function showNoDataMessage(): void {
  const containers = [
    'volumeTrendChart',
    'muscleDistributionChart',
    'weightProgressChart',
    'weeklyComparisonChart',
  ];

  containers.forEach((id) => {
    const container = document.getElementById(id)?.parentElement;
    if (container) {
      container.innerHTML = `
        <p class="text-text-secondary text-center py-8">
          No hay datos suficientes para mostrar gráficos.
          Completa algunos entrenamientos primero.
        </p>
      `;
    }
  });
}

// ==========================================
// GRÁFICO DE TENDENCIA DE VOLUMEN
// ==========================================

// Calculate moving average
function calculateMovingAverage(data: number[], window: number): (number | null)[] {
  return data.map((_, index) => {
    if (index < window - 1) return null;
    const slice = data.slice(index - window + 1, index + 1);
    return slice.reduce((a, b) => a + b, 0) / window;
  });
}

function createVolumeTrendChart(history: ReturnType<typeof getHistory>): void {
  const ctx = document.getElementById('volumeTrendChart') as HTMLCanvasElement;
  if (!ctx) return;

  // Filtrar solo sesiones de pesas
  const weightSessions = history
    .filter((s) => s.type !== 'cardio' && s.volumenTotal > 0)
    .slice(0, 30)
    .reverse();

  if (weightSessions.length === 0) return;

  const dates = weightSessions.map((s) =>
    formatShortDate(s.savedAt || s.date)
  );
  const volumes = weightSessions.map((s) => s.volumenTotal);
  const movingAvg = calculateMovingAverage(volumes, 5);

  // Calculate stats
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const maxVolume = Math.max(...volumes);
  const trend = volumes.length > 1 ?
    ((volumes[volumes.length - 1] - volumes[0]) / volumes[0] * 100).toFixed(1) : 0;

  volumeTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Volumen Total (kg)',
          data: volumes,
          borderColor: THEME_COLORS.accent,
          backgroundColor: `${THEME_COLORS.accent}15`,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: THEME_COLORS.accent,
        },
        {
          label: 'Media móvil (5 sesiones)',
          data: movingAvg,
          borderColor: THEME_COLORS.status.warning,
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          tension: 0.4,
          pointRadius: 0,
        },
      ],
    },
    options: {
      ...baseChartOptions,
      plugins: {
        ...baseChartOptions.plugins,
        legend: {
          display: true,
          labels: {
            color: THEME_COLORS.text.secondary,
          },
        },
        tooltip: {
          callbacks: {
            afterBody: function() {
              return [
                `Promedio: ${avgVolume.toFixed(0)} kg`,
                `Máximo: ${maxVolume} kg`,
                `Tendencia: ${trend}%`
              ];
            }
          }
        }
      },
    },
  });
}

// ==========================================
// GRÁFICO DE DISTRIBUCIÓN MUSCULAR
// ==========================================

function createMuscleDistributionChart(
  history: ReturnType<typeof getHistory>
): void {
  const ctx = document.getElementById(
    'muscleDistributionChart'
  ) as HTMLCanvasElement;
  if (!ctx) return;

  // Agregar volumen por grupo muscular
  const muscleVolumes: Record<string, number> = {};

  history.forEach((session) => {
    if (session.volumenPorGrupo) {
      Object.entries(session.volumenPorGrupo).forEach(([muscle, volume]) => {
        muscleVolumes[muscle] = (muscleVolumes[muscle] || 0) + volume;
      });
    }
  });

  const muscles = Object.keys(muscleVolumes);
  const volumes = Object.values(muscleVolumes);

  if (muscles.length === 0) return;

  const colors = [
    THEME_COLORS.accent,
    THEME_COLORS.status.success,
    THEME_COLORS.status.warning,
    THEME_COLORS.status.error,
    '#8B5CF6',
    '#EC4899',
    '#14B8A6',
    '#F97316',
  ];

  muscleDistributionChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: muscles,
      datasets: [
        {
          data: volumes,
          backgroundColor: colors.slice(0, muscles.length),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: THEME_COLORS.text.secondary,
            padding: 15,
            font: {
              size: 11,
            },
          },
        },
      },
    },
  });
}

// ==========================================
// DROPDOWN DE EJERCICIOS
// ==========================================

function populateExerciseDropdown(
  history: ReturnType<typeof getHistory>
): void {
  const dropdown = document.getElementById(
    'exerciseChartSelect'
  ) as HTMLSelectElement;
  if (!dropdown) return;

  // Obtener ejercicios únicos - normalizar nombres para evitar duplicados
  const exercises = new Set<string>();

  history.forEach((session) => {
    if (session.ejercicios && Array.isArray(session.ejercicios)) {
      session.ejercicios.forEach((ej) => {
        if (ej.peso > 0) {
          // Normalize exercise name to avoid duplicates
          const normalizedName = normalizeExerciseName(ej.nombre);
          exercises.add(normalizedName);
        }
      });
    }
  });

  dropdown.innerHTML = '<option value="">-- Elige un ejercicio --</option>';

  Array.from(exercises)
    .sort()
    .forEach((exercise) => {
      const option = document.createElement('option');
      option.value = exercise;
      option.textContent = exercise;
      dropdown.appendChild(option);
    });

  dropdown.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    if (target.value) {
      createWeightProgressChart(history, target.value);
    }
  });
}

// ==========================================
// GRÁFICO DE PROGRESO DE PESO
// ==========================================

function createWeightProgressChart(
  history: ReturnType<typeof getHistory>,
  exerciseName: string
): void {
  const ctx = document.getElementById(
    'weightProgressChart'
  ) as HTMLCanvasElement;
  if (!ctx) return;

  if (weightProgressChart) {
    weightProgressChart.destroy();
  }

  // Obtener datos del ejercicio
  const exerciseData: { date: string; peso: number; sets: number; reps: number }[] =
    [];

  history
    .slice(0, 30)
    .reverse()
    .forEach((session) => {
      if (session.ejercicios && Array.isArray(session.ejercicios)) {
        // Find exercise by normalized name to match all variations
        const exercise = session.ejercicios.find(
          (ej) => normalizeExerciseName(ej.nombre) === exerciseName
        );
        if (exercise && exercise.peso > 0) {
          exerciseData.push({
            date: formatShortDate(session.savedAt || session.date),
            peso: exercise.peso,
            sets: exercise.sets,
            reps: exercise.reps,
          });
        }
      }
    });

  if (exerciseData.length === 0) {
    const parent = ctx.parentElement;
    if (parent) {
      parent.innerHTML = `
        <p class="text-text-secondary text-center py-8">
          No hay datos para este ejercicio
        </p>
      `;
    }
    return;
  }

  const dates = exerciseData.map((d) => d.date);
  const pesos = exerciseData.map((d) => d.peso);

  weightProgressChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: `Peso (kg) - ${exerciseName}`,
          data: pesos,
          borderColor: THEME_COLORS.status.success,
          backgroundColor: `${THEME_COLORS.status.success}20`,
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      ...baseChartOptions,
      plugins: {
        ...baseChartOptions.plugins,
        tooltip: {
          callbacks: {
            label: function (context) {
              const dataPoint = exerciseData[context.dataIndex];
              return `Peso: ${dataPoint.peso}kg (${dataPoint.sets}x${dataPoint.reps})`;
            },
          },
        },
      },
    },
  });
}

// ==========================================
// GRÁFICO DE COMPARACIÓN SEMANAL
// ==========================================

function createWeeklyComparisonChart(
  history: ReturnType<typeof getHistory>
): void {
  const ctx = document.getElementById(
    'weeklyComparisonChart'
  ) as HTMLCanvasElement;
  if (!ctx) return;

  // Agrupar por semana
  const weeklyData: Record<string, number> = {};

  history.forEach((session) => {
    if (session.type === 'cardio') return;

    const date = new Date(session.savedAt || session.date);
    const week = getWeekNumber(date);
    const weekKey = `Semana ${week}`;

    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = 0;
    }
    weeklyData[weekKey] += session.volumenTotal || 0;
  });

  const weeks = Object.keys(weeklyData).slice(0, 8).reverse();
  const volumes = weeks.map((w) => weeklyData[w]);

  if (weeks.length === 0) return;

  weeklyComparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weeks,
      datasets: [
        {
          label: 'Volumen Semanal',
          data: volumes,
          backgroundColor: '#8B5CF6',
          borderColor: '#7C3AED',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      ...baseChartOptions,
      plugins: {
        ...baseChartOptions.plugins,
        legend: {
          display: true,
          labels: {
            color: THEME_COLORS.text.secondary,
          },
        },
      },
    },
  });
}
