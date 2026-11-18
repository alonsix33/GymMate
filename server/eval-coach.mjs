/**
 * Evaluacion del coach: 18 dialogos con reglas COMPROBABLES.
 *
 * Dos usos:
 *   node server/eval-coach.mjs            -> comprueba los comprobadores: cada
 *                                            caso trae una respuesta BUENA que
 *                                            tiene que pasar y las MALAS (las que
 *                                            el coach dio de verdad en el
 *                                            incidente del 13-nov) que tienen que
 *                                            fallar. Sin red, sin clave.
 *   node server/eval-coach.mjs --modelo   -> corre los 18 dialogos contra el
 *                                            modelo REAL (hace falta COACH_API_KEY)
 *                                            y aplica las mismas reglas.
 *
 * Una regla que no se puede comprobar con codigo no esta aqui: el tono "se
 * siente bien" no se mide, pero si se miden sus sintomas (gritos, reproches,
 * largo, frases vetadas, preguntas de cierre, fechas en formato maquina).
 */
import { armarMensajes, claveDelModelo } from './coach.mjs';

// ---------------------------------------------------------------- el contexto
const CONTEXTO = {
  panorama: [
    { ejercicio: 'Jalón al Pecho', unaRepMax: 73, unaRepMaxHistorico: 73, estimable: true, pico: 55, actual: 57.5, zona: 'verde', sesionesEstancado: 0, sesiones: 20, ultimaVez: '2026-11-13' },
    { ejercicio: 'Press Banca', unaRepMax: 60, unaRepMaxHistorico: 63, estimable: true, pico: 47.5, actual: 45, zona: 'ambar', sesionesEstancado: 4, sesiones: 18, ultimaVez: '2026-11-05' },
    { ejercicio: 'Hip Thrust', unaRepMax: 73, unaRepMaxHistorico: 73, estimable: true, pico: 55, actual: 55, zona: 'verde', sesionesEstancado: 1, sesiones: 15, ultimaVez: '2026-11-10' },
  ],
  resumen: {
    hoy: 'vie 13 nov', sesiones: 92, desde: '2025-12-06', hasta: '2026-11-13',
    diasDesdeUltima: 0, sesionesUltimos7: 3, sesionesUltimos30: 12, sesionesEsteMes: 9,
    racha: 4, mejorRacha: 9, volumenPorGrupo: { Espalda: 90000, Piernas: 130000 }, volumenUltimos30: 98000,
    pesoCorporal: 78.4, grasaCorporal: null,
  },
  bitacora: 'jue 13 nov · Espalda + Bíceps · Jalón al Pecho 4x10@57.5; Remo en Máquina 4x10@60\nmié 5 nov · Espalda + Bíceps · Jalón al Pecho 4x10@55',
  estado: {
    datosAl: 'vie 13 nov 2026 22:14 (America/Lima)',
    hoy: { etiqueta: 'vie 13 nov', entrenado: true, sesion: { grupos: ['Espalda + Bíceps'], series: [{ nombre: 'Jalón al Pecho', sets: 4, reps: 10, peso: 57.5 }] } },
    ayer: { etiqueta: 'jue 12 nov', sesion: null },
    ultimaSesion: { etiqueta: 'vie 13 nov', diasDesde: 0 },
    sugerenciaDeHoy: null,
    volumenSemana: { comparable: true, actualKg: 41200, anteriorKg: 36500, cambioPct: 13 },
    revisionDeHoy: {
      ejercicios: [{ ejercicio: 'Jalón al Pecho', hoy: { sets: 4, reps: 10, peso: 57.5 }, antes: { etiqueta: 'mié 5 nov', sets: 4, reps: 10, peso: 55 }, cambio: 'subió', difKg: 2.5 }],
      faltan: [],
    },
    outliersSospechosos: [{ ejercicio: 'Extensión de Tríceps en Polea', peso: 60, etiqueta: 'dom 14 dic', mejorOtro: 60 }],
  },
};
const SUGERENCIA = { ...CONTEXTO, estado: { ...CONTEXTO.estado, hoy: { etiqueta: 'sáb 14 nov', entrenado: false }, revisionDeHoy: null, sugerenciaDeHoy: { grupo: 'Piernas + Glúteos', motivo: 'llevas 6 días sin piernas' } } };

const AVISO = { autor: 'coach', origen: 'app', texto: 'Tu volumen subió 13% esta semana', cifras: '41.200 kg vs 36.500 kg' };

// ----------------------------------------------------------------- las reglas
export const VETADAS = [
  'es un techo', 'ahí sigue la deuda', 'eso no se arregla solo', 'no lo dejes', 'dale un día fijo',
  'no lo voy a repetir', 'no es mío', 'no es mía', 'ya te dije', 'como te dije',
];
const MAYUSCULAS_OK = new Set(['PR', 'RPE', 'RM', 'PRS', 'RDL', 'EMOM', 'AMRAP', 'RÉCORDS']);

export const REGLAS = {
  sinFechaMaquina: (t) => !/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}-\d{1,2}\b/.test(t) || 'fecha en formato de maquina',
  sinExclamaciones: (t) => !/!/.test(t) || 'tiene exclamaciones',
  sinGritos: (t) => {
    const g = (t.match(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g) ?? []).filter((w) => !MAYUSCULAS_OK.has(w));
    return g.length === 0 || `palabras en mayusculas: ${g.join(', ')}`;
  },
  sinFrasesVetadas: (t) => {
    const x = VETADAS.find((v) => t.toLowerCase().includes(v));
    return !x || `frase vetada: "${x}"`;
  },
  corto: (t) => {
    const n = t.split(/(?<=[.?!])\s+|\n+/).filter((s) => s.trim()).length;
    return n <= 7 || `${n} frases (maximo 7)`;
  },
  sinDisculpas: (t) => !/perdona|disculp|me equivoqu|lo siento/i.test(t) || 'pide perdon o se explica de mas',
  sinPreguntaFinal: (t) => !t.trim().endsWith('?') || 'cierra con una pregunta',
};

/** Todos los numeros de la respuesta tienen que ser UNO de los que hay en el
 *  contexto o en la pregunta (comparacion de numero entero, no de subcadena:
 *  el "9" de "9 dias" no se justifica con el "9" de "9000 kg"). Los digitos
 *  sueltos solo cuentan con unidad ("9 dias"): "4x10" o "2 series" no. */
export function numerosInventados(texto, contexto, pregunta) {
  const norm = (n) => String(Number(n.replace(/\./g, (m, off, str) => (/\.\d{3}\b/.test(str.slice(off)) && !/[.,]\d{1,2}\b/.test(str.slice(off)) ? '' : '.')).replace(',', '.')));
  const fuente = new Set(((JSON.stringify(contexto) + ' ' + pregunta).match(/\d+(?:[.,]\d+)?/g) ?? []).map(norm));
  const crudo = JSON.stringify(contexto) + ' ' + pregunta;
  // Con unidad: el contexto tiene que traer ESE numero con ESA unidad.
  // Solo tiempo (dias/semanas): es lo que el modelo cuenta mal. Las ventanas
  // de 7 y 30 dias son las del propio resumen.
  const sueltos = [...texto.matchAll(/(?<![\d.,])(\d)\s*(días|dias|semanas)\b/g)]
    .filter((m) => m[1] !== '7' && !new RegExp(`(?<![\\d.,])${m[1]}\\s*${m[2]}`, 'i').test(crudo))
    .map((m) => m[1]);
  const todos = (texto.match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => n.length >= 2 || /[.,]/.test(n));
  return [...todos.filter((n) => !fuente.has(norm(n))), ...sueltos];
}

// ---------------------------------------------------------------- los 18 casos
const comunes = ['sinFechaMaquina', 'sinExclamaciones', 'sinGritos', 'sinFrasesVetadas', 'corto'];
export const CASOS = [
  { id: 'saludo', pregunta: 'Hola', reglas: [...comunes, 'sinPreguntaFinal'], buena: 'Hola. Hoy ya entrenaste espalda y subiste a 57.5 en el jalón. Dime qué quieres revisar.', malas: ['Hola. Revisando tu bitácora: el 13-11 hiciste jalón 4x10@57.5, el 05-11 55, y tu volumen subió. ¿Quieres un plan?'] },
  { id: 'que-toca-hoy', pregunta: '¿Qué toca hoy?', contexto: SUGERENCIA, primera: /piernas/i, reglas: [...comunes, 'sinPreguntaFinal'], buena: 'Piernas + Glúteos: llevas 6 días sin piernas. Empieza por la prensa.', malas: ['Hoy deberías descansar, es un techo que no puedes superar. ¿Quieres que te sugiera uno?'] },
  { id: 'que-toca-repetida', pregunta: '¿Qué toca hoy?', contexto: SUGERENCIA, historial: [{ autor: 'usuario', texto: '¿Qué toca hoy?' }, { autor: 'coach', texto: 'Piernas + Glúteos: llevas 6 días sin piernas.' }], primera: /piernas/i, reglas: [...comunes], buena: 'Sigue siendo Piernas + Glúteos, por los 6 días sin piernas.', malas: ['Mejor Espalda hoy.'] },
  { id: 'como-me-fue', pregunta: '¿Cómo me fue hoy?', primera: /jal[oó]n|subi/i, reglas: [...comunes], buena: 'Bien: en el jalón subiste de 55 a 57.5 manteniendo las 4x10.', malas: ['Hoy no hay registro de tu sesión, aunque el jalón sí aparece en la bitácora del 13-11.'] },
  { id: 'ayer', pregunta: '¿Qué hice ayer?', primera: /ayer|no/i, reglas: [...comunes], buena: 'Ayer, jue 12 nov, no tienes sesión registrada.', malas: ['Ayer 12-11 no lo tengo, pero ayer entrenaste espalda.'] },
  { id: 'tarjeta-volumen', pregunta: '¿por qué dice que mi volumen subió 13%?', historial: [AVISO], primera: /13|volumen/i, reglas: [...comunes], buena: 'Porque en los últimos 7 días moviste 41200 kg contra 36500 kg de los 7 anteriores: un 13% más.', malas: ['Eso no lo voy a repetir como si fuera mío, la tarjeta no es mía.'] },
  { id: 'no-hecho', pregunta: 'hoy no hice abdominales', marca: /\[\[excluir\|/, reglas: [...comunes], buena: 'Ok. ¿Lo marco como no hecho?\n[[excluir|Abdominales|vie 13 nov]]', malas: ['Qué raro, en tu registro aparecen. Revisa mejor.'] },
  { id: 'correccion', pregunta: 'no, eso no fue así', historial: [{ autor: 'coach', texto: 'Hoy hiciste espalda.' }], reglas: [...comunes, 'sinPreguntaFinal', 'sinDisculpas'], buena: 'Ok, lo dejo.', malas: ['Perdona, tienes razón, me equivoqué porque la bitácora estaba incompleta y por eso lo interpreté mal, así que de nuevo mis disculpas.'] },
  { id: 'peso-jalon', pregunta: '¿cuánto levanté en el jalón?', primera: /57\.5|57,5/, reglas: [...comunes], buena: 'Hoy 4x10 con 57.5 kg, tu mejor peso hasta ahora.', malas: ['Subiste mucho, casi un 5% más que antes.'] },
  { id: 'estancado', pregunta: '¿estoy estancado en press banca?', primera: /s[ií]|4 sesiones|estanc/i, reglas: [...comunes], buena: 'Sí: 4 sesiones sin subir. Estás en 45 y tu pico es 47.5; baja la carga una semana y vuelve a subir.', malas: ['Venías en 40, es tu pico, súbelo.'] },
  { id: 'dia-de-hoy', pregunta: '¿qué día es hoy?', primera: /vie 13 nov/, reglas: [...comunes], buena: 'Hoy es vie 13 nov.', malas: ['Hoy es 2026-11-13.'] },
  { id: 'sin-tocar', pregunta: '¿cuánto llevo sin entrenar piernas?', reglas: [...comunes], buena: 'Según lo que tengo, tu última sesión fue hoy y la de piernas no la tengo a la mano; dime y lo reviso.', malas: ['Llevas unos 9 días sin piernas.'] },
  { id: 'outlier-60', pregunta: '¿qué pasa con el tríceps en polea de 60?', marca: /\[\[excluir\|/, reglas: [...comunes], buena: 'El 60 del dom 14 dic se ve raro contra tu mejor otro de 60. ¿Lo excluyo?\n[[excluir|Extensión de Tríceps en Polea|dom 14 dic|60]]', malas: ['Eso es un error tuyo, corrígelo.'] },
  { id: '1rm', pregunta: '¿cuál es mi 1RM en press banca?', primera: /60|63/, reglas: [...comunes], buena: 'Con tu peso de ahora, 60 kg; de tu mejor serie, 63 (el de RÉCORDS).', malas: ['Tu 1RM es 70 kg.'] },
  { id: 'semana', pregunta: '¿cómo voy esta semana?', primera: /13|volumen|sesion/i, reglas: [...comunes], buena: 'Bien: 3 sesiones en 7 días y el volumen subió 13% (41200 contra 36500 kg).', malas: ['Tu volumen subió 17% esta semana.'] },
  { id: 'animo', pregunta: 'hoy estoy cansado', reglas: [...comunes, 'sinPreguntaFinal'], buena: 'Es normal, vienes entrenando seguido. Haz lo básico y suma 2 series menos; lo importante es que vayas.', malas: ['NO TE RINDAS, ¡VAMOS CAMPEÓN! ¡TÚ PUEDES!'] },
  { id: 'gracias', pregunta: 'gracias', reglas: [...comunes, 'sinPreguntaFinal'], buena: 'A ti.', malas: ['De nada, ¿quieres que revisemos tu semana completa?'] },
  { id: 'retraso', pregunta: 'llevo una semana sin ir', reglas: [...comunes, 'sinPreguntaFinal'], buena: 'Pasa. Vuelve con piernas y carga un 10% menos; en dos sesiones ya estás donde ibas.', malas: ['Eso no se arregla solo, no lo dejes y dale un día fijo.'] },
];

/** Devuelve la lista de fallos (vacia = pasa). */
export function evaluar(caso, texto) {
  const fallos = [];
  for (const nombre of caso.reglas) {
    const r = REGLAS[nombre](texto);
    if (r !== true) fallos.push(`${nombre}: ${r}`);
  }
  if (caso.primera) {
    const primera = texto.split(/(?<=[.?!])\s+|\n+/)[0] ?? '';
    if (!caso.primera.test(primera)) fallos.push('primera: no responde primero lo que se pregunto');
  }
  if (caso.marca && !caso.marca.test(texto)) fallos.push('marca: falta la marca [[excluir|...]]');
  const inventados = numerosInventados(texto, caso.contexto ?? CONTEXTO, caso.pregunta);
  if (inventados.length) fallos.push(`numeros que no estaban en el contexto: ${inventados.join(', ')}`);
  return fallos;
}

export function peticionDe(caso) {
  return armarMensajes({ pregunta: caso.pregunta, contexto: caso.contexto ?? CONTEXTO, historial: caso.historial ?? [] });
}

// ------------------------------------------------------------------------ CLI
async function contraElModelo() {
  const clave = claveDelModelo();
  if (!clave) {
    console.log('OMITIDO: no hay COACH_API_KEY / ANTHROPIC_API_KEY; las respuestas del modelo real NO se evaluaron.');
    return 0;
  }
  const url = process.env.COACH_URL || 'https://api.deepseek.com/chat/completions';
  let rojos = 0;
  for (const caso of CASOS) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
      body: JSON.stringify({ model: process.env.COACH_MODELO || 'deepseek-v4-flash', messages: peticionDe(caso), max_tokens: 700 }),
    });
    const j = await r.json();
    const texto = j?.choices?.[0]?.message?.content ?? '';
    const fallos = evaluar(caso, texto);
    console.log(`${fallos.length ? 'FALLA' : 'ok   '} ${caso.id}${fallos.length ? ' · ' + fallos.join(' | ') : ''}`);
    if (fallos.length) {
      rojos++;
      console.log('      ' + JSON.stringify(texto.slice(0, 200)));
    }
  }
  console.log(`${CASOS.length - rojos}/${CASOS.length} dialogos pasan con el modelo real`);
  return rojos ? 1 : 0;
}

function comprobarLosComprobadores() {
  let mal = 0;
  for (const caso of CASOS) {
    const f = evaluar(caso, caso.buena);
    if (f.length) { mal++; console.log(`la respuesta BUENA de ${caso.id} no pasa: ${f.join(' | ')}`); }
    for (const m of caso.malas) {
      if (evaluar(caso, m).length === 0) { mal++; console.log(`la respuesta MALA de ${caso.id} PASA: ${JSON.stringify(m)}`); }
    }
  }
  console.log(mal ? `${mal} problemas en los comprobadores` : `${CASOS.length} dialogos: cada buena pasa y cada mala falla`);
  return mal ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes('--modelo') ? await contraElModelo() : comprobarLosComprobadores());
}
