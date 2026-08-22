// ==========================================
// SISTEMA DE NORMALIZACIÓN DE EJERCICIOS
// ==========================================
// Maneja alias y variaciones de nombres para que el sistema
// reconozca ejercicios como el mismo aunque tengan nombres diferentes

// Mapa de nombres canónicos (nombre normalizado -> nombre oficial)
const EXERCISE_ALIASES: Record<string, string> = {
  // ==========================================
  // PIERNAS
  // ==========================================

  // Prensa variaciones
  'prensa': 'Prensa de Piernas',
  'prensa de piernas': 'Prensa de Piernas',
  'press de piernas': 'Prensa de Piernas',
  'leg press': 'Prensa de Piernas',

  // Extensión de cuádriceps variaciones
  'extensión de cuádriceps': 'Extensión de Cuádriceps',
  'extension de cuadriceps': 'Extensión de Cuádriceps',
  'extensión de cuadriceps': 'Extensión de Cuádriceps',
  'extension de cuádriceps': 'Extensión de Cuádriceps',
  'leg extension': 'Extensión de Cuádriceps',
  'cuadriceps': 'Extensión de Cuádriceps',

  // Sentadilla variaciones
  'sentadilla': 'Sentadilla',
  'squat': 'Sentadilla',
  'sentadillas': 'Sentadilla',

  // Sentadilla Hack
  'sentadilla hack': 'Sentadilla Hack',
  'hack squat': 'Sentadilla Hack',

  // Sentadilla Sumo
  'sentadilla sumo': 'Sentadilla Sumo',
  'sumo squat': 'Sentadilla Sumo',

  // Sentadilla Búlgara
  'sentadilla bulgara': 'Sentadilla Búlgara',
  'sentadilla búlgara': 'Sentadilla Búlgara',
  'bulgarian split squat': 'Sentadilla Búlgara',
  'split squat': 'Sentadilla Búlgara',

  // Sentadilla Goblet
  'sentadilla goblet': 'Sentadilla Goblet',
  'goblet squat': 'Sentadilla Goblet',

  // Zancadas
  'zancadas con barra': 'Zancadas con Barra',
  'lunges barra': 'Zancadas con Barra',
  'zancadas con mancuernas': 'Zancadas con Mancuernas',
  'lunges mancuernas': 'Zancadas con Mancuernas',
  'zancadas': 'Zancadas con Mancuernas',
  'lunges': 'Zancadas con Mancuernas',

  // Aductora variaciones
  'aductora': 'Aductora Máquina',
  'aductora maquina': 'Aductora Máquina',
  'aductora máquina': 'Aductora Máquina',
  'aducciones': 'Aductora Máquina',
  'aducción': 'Aductora Máquina',
  'aduccion': 'Aductora Máquina',

  // Step Ups
  'step ups': 'Step Ups',
  'step up': 'Step Ups',
  'subidas al banco': 'Step Ups',

  // Curl Femoral
  'curl femoral tumbado': 'Curl Femoral Tumbado',
  'curl femoral acostado': 'Curl Femoral Tumbado',
  'lying leg curl': 'Curl Femoral Tumbado',
  'curl femoral sentado': 'Curl Femoral Sentado',
  'seated leg curl': 'Curl Femoral Sentado',
  'curl femoral': 'Curl Femoral Tumbado',

  // Gemelos / Pantorrillas
  'elevación de talones (gemelos)': 'Elevación de Talones (Gemelos)',
  'elevacion de talones': 'Elevación de Talones (Gemelos)',
  'calf raises': 'Elevación de Talones (Gemelos)',
  'gemelos de pie': 'Elevación de Talones (Gemelos)',
  'gemelos sentado': 'Gemelos Sentado',
  'seated calf raises': 'Gemelos Sentado',
  'prensa de gemelos': 'Prensa de Gemelos',
  'calf press': 'Prensa de Gemelos',

  // ==========================================
  // GLÚTEOS
  // ==========================================

  // Abductora variaciones
  'abductora': 'Abductora Máquina',
  'abductora maquina': 'Abductora Máquina',
  'abductora máquina': 'Abductora Máquina',
  'abducción': 'Abductora Máquina',
  'abduccion': 'Abductora Máquina',
  'abducciones': 'Abductora Máquina',

  // Patada de glúteo
  'patada de glúteo en máquina': 'Patada de Glúteo en Máquina',
  'patada de gluteo en maquina': 'Patada de Glúteo en Máquina',
  'glute kickback': 'Patada de Glúteo en Máquina',
  'kickback glúteo': 'Patada de Glúteo en Máquina',
  'patada de glúteo en polea': 'Patada de Glúteo en Polea',
  'patada de gluteo en polea': 'Patada de Glúteo en Polea',
  'cable kickback': 'Patada de Glúteo en Polea',

  // RDL variaciones
  'rdl': 'RDL / Peso Muerto Rumano',
  'peso muerto rumano': 'RDL / Peso Muerto Rumano',
  'rdl / peso muerto rumano': 'RDL / Peso Muerto Rumano',
  'romanian deadlift': 'RDL / Peso Muerto Rumano',

  // Hip Thrust variaciones
  'hip thrust': 'Hip Thrust',
  'hip thrust (core lift)': 'Hip Thrust',
  'empuje de cadera': 'Hip Thrust',

  // Peso Muerto variaciones
  'peso muerto convencional': 'Peso Muerto Convencional',
  'peso muerto': 'Peso Muerto Convencional',
  'deadlift': 'Peso Muerto Convencional',
  'peso muerto sumo': 'Peso Muerto Sumo',
  'sumo deadlift': 'Peso Muerto Sumo',

  // Buenos Días
  'buenos días': 'Buenos Días',
  'buenos dias': 'Buenos Días',
  'good mornings': 'Buenos Días',

  // Puente de Glúteo
  'puente de glúteo': 'Puente de Glúteo',
  'puente de gluteo': 'Puente de Glúteo',
  'glute bridge': 'Puente de Glúteo',

  // Abducción en polea
  'abducción en polea': 'Abducción en Polea',
  'abduccion en polea': 'Abducción en Polea',
  'cable abduction': 'Abducción en Polea',

  // ==========================================
  // PECHO
  // ==========================================

  // Press de pecho variaciones
  'press de pecho': 'Press Banca',
  'press banca': 'Press Banca',
  'press banco': 'Press Banca',
  'bench press': 'Press Banca',

  // Press Inclinado
  'press inclinado': 'Press Inclinado',
  'incline press': 'Press Inclinado',
  'press ligero o máquinas': 'Press Inclinado',
  'press ligero o maquinas': 'Press Inclinado',

  // Press Mancuernas
  'press banca mancuernas': 'Press Banca Mancuernas',
  'press mancuernas': 'Press Banca Mancuernas',
  'dumbbell press': 'Press Banca Mancuernas',
  'press inclinado mancuernas': 'Press Inclinado Mancuernas',
  'incline dumbbell press': 'Press Inclinado Mancuernas',

  // Press Declinado
  'press declinado': 'Press Declinado',
  'decline press': 'Press Declinado',

  // Aperturas
  'aperturas con mancuernas': 'Aperturas con Mancuernas',
  'aperturas mancuernas': 'Aperturas con Mancuernas',
  'dumbbell flyes': 'Aperturas con Mancuernas',
  'flyes': 'Aperturas con Mancuernas',
  'aperturas en polea': 'Aperturas en Polea',
  'cable flyes': 'Aperturas en Polea',

  // Cruce de poleas
  'cruce de poleas bajo': 'Cruce de Poleas Bajo',
  'cruce de poleas': 'Cruce de Poleas Bajo',
  'cable crossover': 'Cruce de Poleas Bajo',

  // Press en máquina
  'press en máquina': 'Press en Máquina',
  'press en maquina': 'Press en Máquina',
  'chest press machine': 'Press en Máquina',

  // Flexiones
  'flexiones': 'Flexiones',
  'push ups': 'Flexiones',
  'pushups': 'Flexiones',
  'lagartijas': 'Flexiones',

  // Fondos pecho
  'fondos en paralelas (pecho)': 'Fondos en Paralelas (Pecho)',
  'fondos pecho': 'Fondos en Paralelas (Pecho)',
  'chest dips': 'Fondos en Paralelas (Pecho)',

  // ==========================================
  // ESPALDA
  // ==========================================

  // Jalón variaciones
  'jalón pecho': 'Jalón al Pecho',
  'jalon pecho': 'Jalón al Pecho',
  'jalón al pecho': 'Jalón al Pecho',
  'jalon al pecho': 'Jalón al Pecho',
  'lat pulldown': 'Jalón al Pecho',
  'pulldown': 'Jalón al Pecho',

  // Jalón agarre cerrado
  'jalón agarre cerrado': 'Jalón Agarre Cerrado',
  'jalon agarre cerrado': 'Jalón Agarre Cerrado',
  'close grip pulldown': 'Jalón Agarre Cerrado',

  // Jalón tras nuca
  'jalón tras nuca': 'Jalón Tras Nuca',
  'jalon tras nuca': 'Jalón Tras Nuca',
  'behind neck pulldown': 'Jalón Tras Nuca',

  // Remo variaciones
  'remo con barra': 'Remo con Barra',
  'barbell row': 'Remo con Barra',
  'remo en máquina': 'Remo en Máquina',
  'remo en maquina': 'Remo en Máquina',
  'remo sentado': 'Remo en Máquina',
  'seated row': 'Remo en Máquina',
  'cable row': 'Remo en Polea Baja',
  'remo en polea baja': 'Remo en Polea Baja',
  'remo en polea': 'Remo en Polea Baja',
  'remo t-bar': 'Remo T-Bar',
  't-bar row': 'Remo T-Bar',
  'remo en máquina hammer': 'Remo en Máquina Hammer',
  'remo en maquina hammer': 'Remo en Máquina Hammer',
  'hammer row': 'Remo en Máquina Hammer',
  'remo mancuerna': 'Remo Mancuerna',
  'dumbbell row': 'Remo Mancuerna',

  // Pull-Over
  'pull-over en polea': 'Pull-Over en Polea',
  'pullover en polea': 'Pull-Over en Polea',
  'straight arm pulldown': 'Pull-Over en Polea',
  'pull-over con mancuerna': 'Pull-Over con Mancuerna',
  'pullover con mancuerna': 'Pull-Over con Mancuerna',
  'dumbbell pullover': 'Pull-Over con Mancuerna',

  // Dominadas
  'dominadas': 'Dominadas',
  'pull ups': 'Dominadas',
  'pullups': 'Dominadas',
  'dominadas agarre neutro': 'Dominadas Agarre Neutro',
  'neutral grip pullups': 'Dominadas Agarre Neutro',

  // Encogimientos
  'encogimientos de hombros': 'Encogimientos de Hombros',
  'encogimientos': 'Encogimientos de Hombros',
  'shrugs': 'Encogimientos de Hombros',

  // ==========================================
  // HOMBROS
  // ==========================================

  // Press militar variaciones
  'press militar': 'Press Militar',
  'overhead press': 'Press Militar',
  'ohp': 'Press Militar',

  // Press Arnold
  'press arnold': 'Press Arnold',
  'arnold press': 'Press Arnold',

  // Press mancuernas sentado
  'press mancuernas sentado': 'Press Mancuernas Sentado',
  'seated dumbbell press': 'Press Mancuernas Sentado',

  // Elevación lateral variaciones
  'elevación lateral': 'Elevación Lateral',
  'elevacion lateral': 'Elevación Lateral',
  'lateral raise': 'Elevación Lateral',
  'elevación lateral en polea': 'Elevación Lateral en Polea',
  'elevacion lateral en polea': 'Elevación Lateral en Polea',
  'cable lateral raise': 'Elevación Lateral en Polea',

  // Elevación frontal variaciones
  'elevación frontal': 'Elevación Frontal / Y-Raise',
  'elevacion frontal': 'Elevación Frontal / Y-Raise',
  'y-raise': 'Elevación Frontal / Y-Raise',
  'elevación frontal / y-raise': 'Elevación Frontal / Y-Raise',
  'elevacion frontal / y-raise': 'Elevación Frontal / Y-Raise',
  'front raise': 'Elevación Frontal / Y-Raise',

  // Pájaros
  'pájaros (rear delts)': 'Pájaros (rear delts)',
  'pajaros': 'Pájaros (rear delts)',
  'rear delt fly': 'Pájaros (rear delts)',
  'pájaros en máquina': 'Pájaros en Máquina',
  'pajaros en maquina': 'Pájaros en Máquina',
  'reverse pec deck': 'Pájaros en Máquina',
  'vuelos inversos en banco': 'Vuelos Inversos en Banco',
  'reverse fly': 'Vuelos Inversos en Banco',

  // Face Pull
  'face pull': 'Face Pull',
  'face pulls': 'Face Pull',

  // Remo al mentón
  'remo al mentón': 'Remo al Mentón',
  'remo al menton': 'Remo al Mentón',
  'upright row': 'Remo al Mentón',

  // ==========================================
  // BÍCEPS
  // ==========================================

  // Curl Martillo variaciones
  'curl martillo': 'Curl Martillo',
  'hammer curl': 'Curl Martillo',
  'curl martillo cross-body': 'Curl Martillo Cross-body',
  'curl martillo crossbody': 'Curl Martillo Cross-body',
  'curl martillo cross body': 'Curl Martillo Cross-body',
  'cross body hammer curl': 'Curl Martillo Cross-body',

  // Curl con Barra
  'curl barra': 'Curl con Barra',
  'curl con barra': 'Curl con Barra',
  'barbell curl': 'Curl con Barra',
  'curl con barra z': 'Curl con Barra Z',
  'curl barra z': 'Curl con Barra Z',
  'ez bar curl': 'Curl con Barra Z',

  // Curl Mancuernas
  'curl mancuernas alterno': 'Curl Mancuernas Alterno',
  'curl alterno': 'Curl Mancuernas Alterno',
  'alternating dumbbell curl': 'Curl Mancuernas Alterno',

  // Curl Concentrado
  'curl concentrado': 'Curl Concentrado',
  'concentration curl': 'Curl Concentrado',

  // Curl Inclinado
  'curl en banco inclinado': 'Curl en Banco Inclinado',
  'curl inclinado': 'Curl en Banco Inclinado',
  'incline curl': 'Curl en Banco Inclinado',

  // Curl en Polea
  'curl en polea': 'Curl en Polea',
  'cable curl': 'Curl en Polea',

  // Curl Predicador
  'curl predicador': 'Curl Predicador',
  'preacher curl': 'Curl Predicador',
  'curl scott': 'Curl Predicador',

  // Curl Spider
  'curl spider': 'Curl Spider',
  'spider curl': 'Curl Spider',

  // ==========================================
  // TRÍCEPS
  // ==========================================

  // Fondos variaciones
  'fondos en paralelas': 'Fondos en Máquina',
  'fondos en máquina': 'Fondos en Máquina',
  'fondos en maquina': 'Fondos en Máquina',
  'extensión o fondos': 'Fondos en Máquina',
  'extension o fondos': 'Fondos en Máquina',
  'dips': 'Fondos en Máquina',
  'fondos en banco': 'Fondos en Banco',
  'bench dips': 'Fondos en Banco',

  // Extensión Tríceps
  'tríceps aislado': 'Extensión de Tríceps en Polea',
  'triceps aislado': 'Extensión de Tríceps en Polea',
  'tríceps cuerda': 'Extensión de Tríceps en Polea',
  'triceps cuerda': 'Extensión de Tríceps en Polea',
  'extensión de tríceps en polea': 'Extensión de Tríceps en Polea',
  'extension de triceps en polea': 'Extensión de Tríceps en Polea',
  'tricep pushdown': 'Extensión de Tríceps en Polea',
  'pushdown': 'Extensión de Tríceps en Polea',
  'extensión tríceps con cuerda': 'Extensión Tríceps con Cuerda',
  'rope pushdown': 'Extensión Tríceps con Cuerda',
  'extensión polea invertida': 'Extensión Polea Invertida',
  'reverse grip pushdown': 'Extensión Polea Invertida',

  // Press Francés
  'press francés': 'Press Francés',
  'press frances': 'Press Francés',
  'skull crushers': 'Press Francés',
  'press francés con mancuernas': 'Press Francés con Mancuernas',
  'dumbbell skull crushers': 'Press Francés con Mancuernas',

  // Extensión Overhead
  'extensión tríceps overhead': 'Extensión Tríceps Overhead',
  'extension triceps overhead': 'Extensión Tríceps Overhead',
  'overhead tricep extension': 'Extensión Tríceps Overhead',

  // Patada de Tríceps
  'patada de tríceps': 'Patada de Tríceps',
  'patada de triceps': 'Patada de Tríceps',
  'tricep kickback': 'Patada de Tríceps',
  'kickback tríceps': 'Patada de Tríceps',

  // Press Cerrado
  'press cerrado': 'Press Cerrado',
  'close grip bench press': 'Press Cerrado',

  // ==========================================
  // CORE / ABDOMINALES
  // ==========================================

  // Abdominales variaciones
  'abs en máquina': 'Abdominales en Máquina',
  'abs en maquina': 'Abdominales en Máquina',
  'abdominales en máquina': 'Abdominales en Máquina',
  'abdominales en maquina': 'Abdominales en Máquina',
  'abdominales': 'Abdominales en Máquina',
  'ab crunch machine': 'Abdominales en Máquina',

  // Crunch en polea
  'crunch en polea': 'Crunch en Polea',
  'cable crunch': 'Crunch en Polea',

  // Elevación de piernas
  'elevación de piernas colgado': 'Elevación de Piernas Colgado',
  'elevacion de piernas colgado': 'Elevación de Piernas Colgado',
  'hanging leg raise': 'Elevación de Piernas Colgado',
  'elevación de rodillas colgado': 'Elevación de Rodillas Colgado',
  'hanging knee raise': 'Elevación de Rodillas Colgado',

  // Russian Twist
  'russian twist': 'Russian Twist',
  'twist ruso': 'Russian Twist',

  // Leñador
  'leñador en polea': 'Leñador en Polea',
  'lenador en polea': 'Leñador en Polea',
  'cable woodchop': 'Leñador en Polea',
  'woodchop': 'Leñador en Polea',

  // Ab Rollout
  'ab rollout': 'Ab Rollout',
  'rueda abdominal': 'Ab Rollout',

  // Crunch Bicicleta
  'crunch bicicleta': 'Crunch Bicicleta',
  'bicycle crunch': 'Crunch Bicicleta',

  // Dead Bug
  'dead bug': 'Dead Bug',

  // Pallof Press
  'pallof press': 'Pallof Press',
  'anti rotation': 'Pallof Press',
};

/**
 * Convierte un nombre a Title Case (primera letra de cada palabra en mayúscula)
 */
function toTitleCase(str: string): string {
  // La primera LETRA de cada palabra, no el primer caracter: con
  // `charAt(0).toUpperCase()` un nombre entrecomillado como `Press "Militar"`
  // volvia como `Press "militar"` —la comilla no se puede poner en mayuscula—
  // y el usuario veia su ejercicio renombrado en minuscula.
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.replace(/\p{L}/u, (c) => c.toUpperCase()))
    .join(' ');
}

/**
 * Normaliza un nombre de ejercicio para que variaciones del mismo
 * ejercicio sean reconocidas como iguales.
 *
 * @param name - Nombre del ejercicio (puede ser cualquier variación)
 * @returns Nombre canónico/oficial del ejercicio
 */
export function normalizeExerciseName(name: string): string {
  if (!name) return name;

  // Convertir a minúsculas para buscar en el mapa
  const lowercaseName = name.toLowerCase().trim();

  // Buscar en alias
  if (EXERCISE_ALIASES[lowercaseName]) {
    return EXERCISE_ALIASES[lowercaseName];
  }

  // Si no hay alias, normalizar a Title Case para consistencia
  // Esto hace que "curl martillo" y "Curl Martillo" sean iguales
  return toTitleCase(name.trim());
}

/**
 * Compara dos nombres de ejercicios para determinar si son el mismo
 */
export function isSameExercise(name1: string, name2: string): boolean {
  return normalizeExerciseName(name1) === normalizeExerciseName(name2);
}

/**
 * Migra PRs antiguos a nombres normalizados
 */
export function migratePRsToNormalizedNames(prs: Record<string, unknown>): Record<string, unknown> {
  const migratedPRs: Record<string, unknown> = {};

  for (const [exerciseName, prData] of Object.entries(prs)) {
    const normalizedName = normalizeExerciseName(exerciseName);

    // Si ya existe un PR con el nombre normalizado, mantener el mejor
    if (migratedPRs[normalizedName]) {
      const existingPR = migratedPRs[normalizedName] as { weight?: number };
      const newPR = prData as { weight?: number };

      // Mantener el PR con mayor peso
      if ((newPR.weight || 0) > (existingPR.weight || 0)) {
        migratedPRs[normalizedName] = prData;
      }
    } else {
      migratedPRs[normalizedName] = prData;
    }
  }

  return migratedPRs;
}

/**
 * Migra historial a nombres normalizados
 */
export function migrateHistoryExerciseNames<T extends { ejercicios?: Array<{ nombre: string }> }>(
  history: T[]
): T[] {
  return history.map(session => {
    if (session.ejercicios) {
      return {
        ...session,
        ejercicios: session.ejercicios.map(ejercicio => ({
          ...ejercicio,
          nombre: normalizeExerciseName(ejercicio.nombre),
        })),
      };
    }
    return session;
  });
}
