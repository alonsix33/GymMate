/**
 * Lo del chat que NO necesita al modelo: el saludo, los atajos y cuanto hilo se
 * manda. Un "Hola" respondido con una auditoria de la bitacora es lo que mas
 * molestaba; y arrastrar 12 turnos de dias anteriores arrastraba su tono.
 */
import type { EstadoCoach } from '@/features/coach-estado';
import type { TurnoCoach } from '@/features/coach-ia';
import { claveDiaLima } from '@/utils/fecha';

const SALUDOS = /^(hola+|buenas?|buenos dias|buenas (tardes|noches)|hey+|ey|que tal|como estas|saludos)( coach)?$/;

function plano(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¡!¿?.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Un mensaje que es SOLO un saludo (no "hola, ¿cómo voy en...?"). */
export function esSaludo(texto: string): boolean {
  return SALUDOS.test(plano(texto));
}

export function saludoDe(e: EstadoCoach): string {
  const hoy = e.hoy.entrenado
    ? `Hoy ya entrenaste (${e.hoy.grupos.join(' + ') || 'sesión registrada'}).`
    : e.ultimaSesion
      ? `Tu última sesión fue ${e.ultimaSesion.diasDesde === 0 ? 'hoy' : `hace ${e.ultimaSesion.diasDesde} ${e.ultimaSesion.diasDesde === 1 ? 'día' : 'días'}`}.`
      : 'Aún no tienes sesiones registradas.';
  return `Hola. Hoy es ${e.hoy.etiqueta}. ${hoy}\n¿Qué quieres revisar?`;
}

export const MAX_TURNOS_ENVIADOS = 6;

/** El hilo que viaja al modelo: solo lo de HOY (dia de Lima) y como mucho 6. */
export function turnosDeHoy(
  turnos: TurnoCoach[],
  ahora: Date
): { enviados: TurnoCoach[]; omitidos: number } {
  const hoy = claveDiaLima(ahora);
  const deHoy = turnos.filter((t) => claveDiaLima(new Date(t.fecha)) === hoy);
  const enviados = deHoy.slice(-MAX_TURNOS_ENVIADOS);
  return { enviados, omitidos: turnos.length - enviados.length };
}

/** Frases que el reconocedor de peticiones entiende sin ambiguedad. */
export const ATAJOS: Array<{ etiqueta: string; frase: string }> = [
  { etiqueta: '¿Qué toca hoy?', frase: '¿Qué toca hoy?' },
  { etiqueta: 'Revisar mi sesión', frase: 'Revisa mi sesión de hoy' },
  { etiqueta: '¿Cómo voy esta semana?', frase: '¿Cómo voy esta semana?' },
];
