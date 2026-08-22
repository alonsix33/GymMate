import type { ExerciseData, HistorySession } from '@/types';
import { getHistory, getPR } from '@/utils/storage';
import { getStreakInfo, getCurrentLevelProgress } from '@/features/gamification';
import { siguienteCarga, formatearPeso } from '@/utils/insights';

// ==========================================
// COACH MESSAGE TYPES
// ==========================================

type CoachMessageType = 'info' | 'tip' | 'pr-alert' | 'pr-close' | 'success' | 'motivation' | 'streak';

interface CoachMessage {
  type: CoachMessageType;
  message: string;
  subtext?: string;
}

// ==========================================
// COACH STATE
// ==========================================

let sessionStartTime: number | null = null;
let lastTipTime: number = 0;
const TIP_INTERVAL = 120000; // 2 minutes between tips

// Message priority system - higher priority messages persist longer
// Priority levels: pr-alert (5) > success (4) > pr-close (3) > streak (3) > motivation (2) > tip (1) > info (0)
const MESSAGE_PRIORITY: Record<CoachMessageType, number> = {
  'pr-alert': 5,
  'success': 4,
  'pr-close': 3,
  'streak': 3,
  'motivation': 2,
  'tip': 1,
  'info': 0,
};

// How long each message type should persist (in ms) before being overwritten by lower priority
const MESSAGE_DISPLAY_TIME: Record<CoachMessageType, number> = {
  'pr-alert': 8000,
  'success': 5000,
  'pr-close': 6000,
  'streak': 5000,
  'motivation': 5000,
  'tip': 4000,
  'info': 0, // info can be overwritten immediately
};

let currentMessageType: CoachMessageType | null = null;
let currentMessageTimestamp: number = 0;

const TIPS = [
  'Recuerda mantener una buena técnica en cada repetición.',
  'Respira: exhala en el esfuerzo, inhala en la bajada.',
  'Mantén el core activado para proteger tu espalda.',
  'Si te sientes muy fatigado, reduce el peso.',
  'Hidrátate entre series para mantener el rendimiento.',
  'El rango completo de movimiento maximiza las ganancias.',
  'Controla la fase excéntrica (bajada) para más estímulo.',
  'Escucha a tu cuerpo, descansa si lo necesitas.',
];

// ==========================================
// MESSAGE BUILDERS
// ==========================================

/**
 * El sistema prohibe el color por categoria y la iconografia en cuadros de
 * color, asi que del "config" de cada tipo solo sobrevive el tipo: sirve para
 * la prioridad y la caducidad, no para pintar.
 */
function getMessageConfig(type: CoachMessageType): Omit<CoachMessage, 'message' | 'subtext'> {
  return { type };
}

// ==========================================
// COACH ENGINE
// ==========================================

export function initCoachSession(): void {
  sessionStartTime = Date.now();
  lastTipTime = Date.now();
  // Reset message priority state
  currentMessageType = null;
  currentMessageTimestamp = 0;
}

export function updateCoachOnSessionLoad(groupName: string, ejercicios: ExerciseData[]): void {
  initCoachSession();

  // Check for active streak
  const streak = getStreakInfo();
  const levelProgress = getCurrentLevelProgress();

  if (streak.current >= 3) {
    showCoachMessage({
      ...getMessageConfig('streak'),
      message: `Racha de ${streak.current} días seguidos.`,
      subtext: `Nivel ${levelProgress.level} · ${Math.round(levelProgress.percentage)}% hacia el siguiente`,
    });
    return;
  }

  // "Última sesión de este grupo: N kg. ¿Lo superamos hoy?" ya la escribe la
  // propia pantalla al pintarse [REF Pantallas:162]. Repetirla aqui la pisaba
  // con una version peor (nombre completo del grupo, "kg" pegado al numero).
  const history = getHistory();
  const tieneHistorialDelGrupo = history.some(
    (s: HistorySession) => s.type !== 'cardio' && s.grupo === groupName && (s.volumenTotal || 0) > 0
  );
  if (tieneHistorialDelGrupo) return;

  const exerciseCount = ejercicios.length;
  showCoachMessage({
    ...getMessageConfig('info'),
    message: `${exerciseCount} ejercicios en esta rutina. Registra sets, reps y peso.`,
  });
}

/**
 * @param picoPrevio  El PR que habia ANTES de esta sesion. El estado se
 *   actualiza en cuanto se teclea un peso mayor, asi que leer `getPR` aqui
 *   devolvia el peso recien tecleado: "PR nuevo" no se disparaba nunca y el
 *   coach presentaba lo que acabas de levantar como tu marca anterior.
 */
export function updateCoachOnExerciseUpdate(
  ejercicio: ExerciseData,
  _index: number,
  _allExercises: ExerciseData[],
  picoPrevio?: number | null
): void {
  const guardado = getPR(ejercicio.nombre);
  const pr = picoPrevio != null && picoPrevio > 0
    ? { ...(guardado ?? { sets: 0, reps: 0, volumen: 0, date: '' }), peso: picoPrevio }
    : guardado;

  if (pr && ejercicio.peso > 0) {
    const prWeight = pr.peso;
    const currentWeight = ejercicio.peso;
    const percentage = (currentWeight / prWeight) * 100;

    // NEW PR!
    if (currentWeight > prWeight) {
      showCoachMessage({
        ...getMessageConfig('pr-alert'),
        message: `PR nuevo en ${ejercicio.nombre}: ${formatearPeso(currentWeight)} kg.`,
        subtext: `Tu marca anterior: ${formatearPeso(prWeight)} kg`,
      });
      return;
    }

    // Close to PR (90% or more)
    if (percentage >= 90 && percentage < 100) {
      // La voz dice el peso objetivo, nunca cuanto falta.
      const objetivo = siguienteCarga(prWeight, ejercicio.esMancuerna);
      showCoachMessage({
        ...getMessageConfig('pr-close'),
        message: `Levanta ${formatearPeso(objetivo)} kg en ${ejercicio.nombre} y es PR nuevo.`,
        subtext: `Tu mejor marca: ${formatearPeso(prWeight)} kg`,
      });
      return;
    }
  }

  // Show last session data for this exercise if available
  const history = getHistory();
  for (const session of history) {
    if (session.type === 'cardio' || !session.ejercicios) continue;

    const histExercise = session.ejercicios.find(
      (e: ExerciseData) => e.nombre === ejercicio.nombre && e.volumen > 0
    );

    if (histExercise) {
      showCoachMessage({
        ...getMessageConfig('info'),
        message: `${ejercicio.nombre}: última vez ${histExercise.sets}×${histExercise.reps} con ${formatearPeso(
          histExercise.peso
        )} kg.`,
        subtext: pr ? `Tu mejor marca: ${formatearPeso(pr.peso)} kg` : undefined,
      });
      return;
    }
  }

  // Check if it's time for a tip
  maybeShowTip();
}

export function updateCoachOnExerciseComplete(
  ejercicio: ExerciseData,
  completedCount: number,
  totalCount: number
): void {
  const remaining = totalCount - completedCount;

  if (remaining === 0) {
    showCoachMessage({
      ...getMessageConfig('success'),
      message: 'Todos los ejercicios completados.',
      subtext: 'Guarda la sesión para que cuente.',
    });
  } else if (remaining <= 2) {
    showCoachMessage({
      // 'success', no 'motivation': con menos prioridad que el mensaje
      // anterior se quedaba sin salir, y la nota volvia a la linea de
      // apertura como si el usuario no hubiera hecho nada.
      ...getMessageConfig('success'),
      message: remaining === 1 ? 'Queda 1 ejercicio.' : `Quedan ${remaining} ejercicios.`,
    });
  } else {
    showCoachMessage({
      ...getMessageConfig('success'),
      message: `${ejercicio.nombre} completado.`,
      subtext: `${completedCount} de ${totalCount} ejercicios`,
    });
  }
}

function maybeShowTip(): void {
  const now = Date.now();

  if (now - lastTipTime > TIP_INTERVAL) {
    lastTipTime = now;
    const randomTip = TIPS[Math.floor(Math.random() * TIPS.length)];

    showCoachMessage({
      ...getMessageConfig('tip'),
      message: randomTip,
    });
  }
}

/**
 * El mockup de W-01 deja UN solo hueco para el coach: la nota bajo la
 * cabecera. Ahi escribe esto. Sin iconos, sin colores por tipo y sin
 * animacion de pulso: el sistema no los permite. La prioridad y la caducidad
 * de los mensajes se conservan tal cual estaban.
 */
export function showCoachMessage(config: CoachMessage): void {
  const nota = document.querySelector<HTMLElement>('.f-sesion__coach');
  if (!nota) return;

  const now = Date.now();
  const newPriority = MESSAGE_PRIORITY[config.type];

  if (currentMessageType !== null) {
    const currentPriority = MESSAGE_PRIORITY[currentMessageType];
    const currentDisplayTime = MESSAGE_DISPLAY_TIME[currentMessageType];
    const timeSinceLastMessage = now - currentMessageTimestamp;

    // No pisar un mensaje de mas prioridad hasta que caduque.
    if (currentPriority > newPriority && timeSinceLastMessage < currentDisplayTime) {
      return;
    }
  }

  currentMessageType = config.type;
  currentMessageTimestamp = now;

  nota.hidden = false;
  nota.textContent = config.message;
  if (config.subtext) {
    const sub = document.createElement('span');
    sub.className = 'f-sesion__coach-sub';
    sub.textContent = config.subtext;
    nota.appendChild(sub);
  }
}

// ==========================================
// HELPER: Get session stats
// ==========================================

export function getSessionDuration(): number {
  if (!sessionStartTime) return 0;
  return Math.floor((Date.now() - sessionStartTime) / 60000); // minutes
}
