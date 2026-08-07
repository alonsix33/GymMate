// ==========================================
// ICONOS SVG DE GRUPOS MUSCULARES
// Usando IconScout SVGs con colores originales
// ==========================================

/**
 * Mapeo de nombres de músculos a archivos de IconScout
 * Los archivos están en public/Muscle Icons/ con colores originales profesionales
 */
const MUSCLE_ICON_FILES: Record<string, string> = {
  chest: 'Chest Muscle.svg',
  back: 'Back Muscle.svg',
  shoulders: 'Shoulder muscle.svg',
  biceps: 'Biceps muscle.svg',
  triceps: 'Triceps muscle.svg',
  legs: 'Quadriceps.svg',
  glutes: 'Glutes.svg',
  core: 'Abdominals (core).svg',
};

/**
 * Normaliza el nombre del músculo para buscar el icono
 */
function normalizeMuscle(muscle: string): string {
  const normalized = muscle.toLowerCase().replace(/[áéíóú]/g, (match) => {
    const map: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };
    return map[match] || match;
  });

  const muscleMap: Record<string, string> = {
    pecho: 'chest',
    espalda: 'back',
    hombros: 'shoulders',
    biceps: 'biceps',
    triceps: 'triceps',
    piernas: 'legs',
    cuadriceps: 'legs',
    quadriceps: 'legs',
    gluteos: 'glutes',
    core: 'core',
    abdominales: 'core',
    abs: 'core',
  };

  return muscleMap[normalized] || normalized;
}

/**
 * Obtiene la URL del icono SVG para un músculo
 * @param muscle - Nombre del músculo
 * @returns URL del archivo SVG o null si no existe
 */
export function getMuscleIconUrl(muscle: string): string | null {
  const key = normalizeMuscle(muscle);
  const filename = MUSCLE_ICON_FILES[key];
  if (!filename) return null;
  return `/Muscle Icons/${filename}`;
}

/**
 * Genera un icono de músculo usando <img>
 * Muestra los iconos con sus colores originales profesionales
 *
 * @param muscle - Nombre del músculo
 * @param size - Tamaño en pixels (default 24)
 * @param className - Clases CSS adicionales
 */
export function muscleIcon(
  muscle: string,
  size: number = 24,
  className: string = ''
): string {
  const url = getMuscleIconUrl(muscle);

  if (!url) {
    // Fallback: icono genérico de dumbbell
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="muscle-icon ${className}" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="2" y="10" width="4" height="4" rx="1"/>
      <rect x="18" y="10" width="4" height="4" rx="1"/>
      <line x1="6" y1="12" x2="18" y2="12"/>
      <rect x="6" y="8" width="2" height="8" rx="0.5"/>
      <rect x="16" y="8" width="2" height="8" rx="0.5"/>
    </svg>`;
  }

  return `<img
    src="${url}"
    width="${size}"
    height="${size}"
    class="muscle-icon ${className}"
    alt="${muscle}"
    style="object-fit: contain;"
  />`;
}

/**
 * Iconos específicos para los grupos de entrenamiento
 */
const GROUP_ICON_MAP: Record<string, string> = {
  grupo1: 'legs',      // Piernas + Glúteos
  grupo2: 'chest',     // Upper Push (Pecho + Hombros + Tríceps)
  grupo3: 'legs',      // Piernas Quad Dominante
  grupo4: 'back',      // Espalda + Bíceps
  grupo5: 'shoulders', // Hombro + Tríceps
};

/**
 * Renderiza un icono de grupo de entrenamiento
 * @param groupId - ID del grupo (grupo1, grupo2, etc.)
 * @param size - Tamaño en pixels (default 24)
 * @param className - Clases CSS adicionales
 */
export function groupIcon(
  groupId: string,
  size: number = 24,
  className: string = ''
): string {
  const muscle = GROUP_ICON_MAP[groupId] || 'legs';
  return muscleIcon(muscle, size, className);
}

