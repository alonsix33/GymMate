// ==========================================
// SANITIZACIÓN DE HTML
// ==========================================

/**
 * Escapa un valor para insertarlo de forma segura dentro de HTML generado
 * vía innerHTML, ya sea como texto o como valor de un atributo entre
 * comillas dobles. Única función de escape reutilizada en toda la app:
 * cualquier dato escrito por el usuario (nombre de ejercicio, de rutina,
 * etc.) debe pasar por aquí antes de interpolarse en una plantilla HTML.
 */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
