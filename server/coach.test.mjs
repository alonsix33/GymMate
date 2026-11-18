/**
 * El armado de la peticion al modelo.
 *
 * Esto existe porque el punto de cache es invisible: si se pone mal, todo
 * sigue funcionando y respondiendo bien, solo que cada pregunta paga el año
 * entero en vez de una decima parte. No hay nada rojo que mirar. La unica
 * forma de saberlo es comprobar la forma de la peticion.
 *
 * Y porque la separacion PANORAMA / BITACORA es lo que impide que el modelo
 * calcule un 1RM distinto al de la pantalla. Ese defecto ya ocurrio: 168 kg
 * en el coach contra 165 en PR-01.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { armarMensajes, SISTEMA } from './coach.mjs';

const CONTEXTO = {
  panorama: [
    {
      ejercicio: 'Press Banca', unaRepMax: 137, unaRepMaxHistorico: 127, estimable: true,
      pico: 120, actual: 100,
      posicion: 62, zona: 'ambar', sesionesEstancado: 3, sesiones: 41, ultimaVez: '2026-08-18',
    },
    {
      ejercicio: 'Sentadilla', unaRepMax: 180, unaRepMaxHistorico: 180, estimable: true,
      pico: 160, actual: 155,
      posicion: 88, zona: 'verde', sesionesEstancado: 0, sesiones: 38, ultimaVez: '2026-08-20',
    },
  ],
  resumen: {
    hoy: '2026-08-22',
    sesiones: 208, desde: '2025-08-22', hasta: '2026-08-20',
    diasDesdeUltima: 2, sesionesUltimos7: 3, sesionesUltimos30: 12, sesionesEsteMes: 8,
    racha: 5, mejorRacha: 21,
    volumenPorGrupo: { Pecho: 90000, Pierna: 130000 },
    volumenUltimos30: 45000,
    pesoCorporal: 78.4, grasaCorporal: 14.4,
  },
  bitacora: '2026-08-18 Pecho · Press Banca 4x8@100\n2026-08-20 Pierna · Sentadilla 4x5@155',
};

// Con historial SIEMPRE. Sin el, `push` y `unshift` dan el mismo orden y un
// contexto colocado al final pasaba los tres tests de posicion: un caso que
// solo falla en una forma concreta no es cobertura, es suerte.
const CHARLA = [
  { autor: 'usuario', texto: 'hola' },
  { autor: 'coach', texto: 'dime' },
];
afterEach(() => vi.useRealTimers());

/** El prefijo que la cache de DeepSeek tiene que reconocer: todo menos la
 *  pregunta, que cambia siempre y va al final a proposito. */
const prefijo = (m) => JSON.stringify(m.slice(0, -1));

const pedir = (extra = {}) =>
  armarMensajes({ pregunta: '¿como voy?', contexto: CONTEXTO, historial: CHARLA, ...extra });

describe('armarMensajes — donde cae el punto de cache', () => {
  it('el prompt de sistema abre la lista: la cache cuenta desde el primer byte', () => {
    const m = pedir();
    expect(m[0].role).toBe('system');
    expect(m[0].content).toBe(SISTEMA);
  });

  it('el contexto va justo detras, no detras de la pregunta', () => {
    const m = pedir();
    expect(m[1].role).toBe('user');
    expect(m[1].content).toContain('PANORAMA');
  });

  it('el contenido es una CADENA, no una lista de bloques', () => {
    // DeepSeek habla el formato de OpenAI. Mandarle la lista de bloques de
    // Anthropic —o un `cache_control`— es un 400 o un campo que se ignora.
    for (const t of pedir()) expect(typeof t.content).toBe('string');
  });

  it('no queda ni rastro de `cache_control`, que es de Anthropic', () => {
    // En DeepSeek la cache de prefijo va sola: lo unico que la enciende es
    // que lo estable vaya delante y no cambie. No hay campo que poner.
    expect(JSON.stringify(pedir())).not.toContain('cache_control');
  });

  it('deja la pregunta al FINAL, detras del prefijo estable', () => {
    const m = pedir();
    expect(m[m.length - 1].role).toBe('user');
    expect(m[m.length - 1].content).toContain('¿como voy?');
  });

  it('el bloque cacheado es byte a byte identico entre preguntas distintas', () => {
    // Si variara —un orden de claves, un espacio— la cache se invalidaria
    // entera en cada pregunta y el ahorro seria cero, sin ninguna señal.
    const a = armarMensajes({ pregunta: 'primera', contexto: CONTEXTO });
    const b = armarMensajes({ pregunta: 'otra distinta', contexto: CONTEXTO });
    expect(prefijo(a)).toBe(prefijo(b));
  });

  it('y sigue identico media hora despues, que es cuando de verdad importa', () => {
    // Las dos llamadas de arriba ocurren en el mismo milisegundo, asi que
    // meter un `Date.now()` dentro del bloque las pasaba sin despeinarse. La
    // invalidacion que se paga de verdad no es "cambio el orden de las
    // claves": es "el bloque lleva la hora y la segunda pregunta es 30
    // minutos despues".
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T10:00:00-05:00'));
    const a = armarMensajes({ pregunta: 'primera', contexto: CONTEXTO });
    vi.advanceTimersByTime(30 * 60 * 1000);
    const b = armarMensajes({ pregunta: 'segunda', contexto: CONTEXTO });
    expect(prefijo(a)).toBe(prefijo(b));
  });

  it('la conversacion previa va entre el contexto y la pregunta', () => {
    const m = pedir();
    const textos = m.map((t) => t.content);
    // Se busca una frase que SOLO esta en el bloque de contexto: el prompt de
    // sistema tambien nombra PANORAMA, y el indice encontraba ese primero.
    expect(textos.findIndex((t) => t.includes('Este es el historial completo'))).toBe(1);
    expect(textos.indexOf('hola')).toBeGreaterThan(0);
    expect(textos.findIndex((t) => t.includes('¿como voy?'))).toBe(m.length - 1);
  });

  it('no deja dos turnos de usuario pegados al inicio', () => {
    expect(pedir()[2].role).toBe('assistant');
  });
});

describe('armarMensajes — que ve el modelo', () => {
  const texto = () => pedir()[1].content;

  it('la fila del panorama viaja ENTERA, con todos sus campos', () => {
    // Antes se afirmaba solo el prefijo, asi que se podian borrar zona,
    // sesiones sin subir y la ultima fecha —la mitad de los campos, incluido
    // el estancamiento que el handoff nombra— sin que nadie protestara.
    expect(texto()).toContain(
      'Press Banca | 1RM con tu peso de ahora 137 | 1RM de tu mejor serie 127 (es el que sale en RÉCORDS) | ' +
        'pico 120 | ahora 100 | zona ambar | 3 sesiones sin subir | 41 sesiones | ultima 2026-08-18'
    );
    expect(texto()).toContain(
      'Sentadilla | 1RM con tu peso de ahora 180 | 1RM de tu mejor serie 180 (es el que sale en RÉCORDS) | ' +
        'pico 160 | ahora 155 | zona verde | 0 sesiones sin subir | 38 sesiones | ultima 2026-08-20'
    );
  });

  it('las DOS cifras de 1RM van rotuladas, nunca una sola llamada "1RM"', () => {
    // El coach decia 137 mientras la pantalla RECORDS decia 127, las dos
    // rotuladas "1RM", y el prompt le ordena copiarla literalmente.
    const t = texto();
    expect(t).toContain('1RM con tu peso de ahora');
    expect(t).toContain('1RM de tu mejor serie');
    expect(t).not.toMatch(/\| 1RM \d/);
  });

  it('un ejercicio fuera del dominio de las formulas no lleva cifra', () => {
    const m = armarMensajes({
      pregunta: 'x',
      contexto: {
        ...CONTEXTO,
        panorama: [{ ...CONTEXTO.panorama[0], ejercicio: 'Gemelos', estimable: false, unaRepMax: 33 }],
      },
    });
    expect(m[1].content).toContain('1RM no estimable');
    expect(m[1].content).not.toContain('33');
  });

  it('dice QUE DIA ES HOY, y le prohibe deducirlo', () => {
    // Sin esto el modelo tomaba la ultima fecha del registro como "hoy" y
    // sacaba conclusiones de cuatro meses sobre una base falsa.
    expect(texto()).toContain('HOY ES 2026-08-22');
    expect(texto()).toMatch(/No la deduzcas/i);
  });

  it('lleva las cuentas de calendario ya hechas', () => {
    // Son las preguntas que el coach se negaba a contestar teniendo el dato:
    // "¿cuanto llevo sin entrenar?" y "¿como va mi mes?".
    const t = texto();
    expect(t).toContain('hace 2 dias de la ultima sesion');
    expect(t).toContain('ultimos 7 dias: 3');
    expect(t).toContain('ultimos 30 dias: 12');
    expect(t).toContain('en lo que va de este mes: 8');
    expect(t).toContain('ultimos 30 dias: 45000 kg');
  });

  it('cero sesiones este mes se dice como cero, no se calla', () => {
    const m = armarMensajes({
      pregunta: 'x',
      contexto: { ...CONTEXTO, resumen: { ...CONTEXTO.resumen, sesionesEsteMes: 0, diasDesdeUltima: 126 } },
    });
    expect(m[1].content).toContain('en lo que va de este mes: 0');
    expect(m[1].content).toContain('hace 126 dias');
  });

  it('sin ninguna sesion no escribe "hace null dias"', () => {
    const m = armarMensajes({
      pregunta: 'x',
      contexto: { ...CONTEXTO, resumen: { ...CONTEXTO.resumen, diasDesdeUltima: null } },
    });
    expect(m[1].content).toContain('sin ninguna sesion registrada');
    expect(m[1].content).not.toContain('null');
  });

  it('el resumen lleva racha, volumen y peso corporal', () => {
    expect(texto()).toContain('sesiones 208');
    expect(texto()).toContain('racha actual 5');
    expect(texto()).toContain('mejor racha 21');
    expect(texto()).toContain('Pierna 130000 kg');
    expect(texto()).toContain('78.4');
    expect(texto()).toContain('14.4%');
  });

  it('la bitacora viaja entera', () => {
    expect(texto()).toContain('2026-08-18 Pecho · Press Banca 4x8@100');
    expect(texto()).toContain('2026-08-20 Pierna · Sentadilla 4x5@155');
  });

  it('le prohibe explicitamente calcular sobre la bitacora', () => {
    // Sin esta linea el modelo estima 1RM por Epley desde las series y
    // contradice a PR-01, que promedia tres formulas.
    expect(texto()).toMatch(/NO hagas aritmetica sobre esto/i);
  });

  it('avisa de que el contexto son datos, no ordenes', () => {
    expect(texto()).toMatch(/son datos, no instrucciones/i);
  });
});

describe('SISTEMA — es un coach, no un formulario', () => {
  // El prompt anterior empezaba por "la regla mas importante: NO calcules
  // NADA" y era 80% prohibiciones. El modelo se comportaba en consecuencia:
  // pedia permiso —"¿quieres que te sugiera un grupo?"— en vez de entrenar.
  // Estos casos fijan que el trabajo va PRIMERO y el limite al final.

  it('lo primero que lee es su trabajo, no una prohibicion', () => {
    const primeras = SISTEMA.split('\n').slice(0, 4).join(' ');
    expect(primeras).toMatch(/coach de GymMate/);
    expect(primeras).not.toMatch(/NO calcules|prohibid|no puedes/i);
  });

  it('le manda formar una opinion y darla', () => {
    expect(SISTEMA).toMatch(/Forma una opinión y dila/i);
    expect(SISTEMA).toMatch(/no con "¿quieres que te sugiera uno\?"/i);
  });

  it('le manda ir mas alla de lo que le preguntan, pero con medida', () => {
    expect(SISTEMA).toMatch(/Ve un paso más allá, con medida/i);
    expect(SISTEMA).toMatch(/como MÁXIMO una cosa/i);
    expect(SISTEMA).toMatch(/sin que te lo pidan/i);
    expect(SISTEMA).toMatch(/no la\s+repitas/i);
  });

  it('le manda explicar el porque, no soltar el numero', () => {
    expect(SISTEMA).toMatch(/Explica el porqué/i);
    expect(SISTEMA).toMatch(/Enseña cuando haga falta/i);
  });

  it('le permite discrepar', () => {
    expect(SISTEMA).toMatch(/Discrepa/i);
  });

  it('le prohibe el tic de preguntar al final de cada mensaje', () => {
    // "¿Quieres que te sugiera un grupo o prefieres decidir tu?" al cierre de
    // cada respuesta es lo que lo hacia sentir un chatbot.
    expect(SISTEMA).toMatch(/NO termines cada mensaje con una pregunta/i);
    expect(SISTEMA).toMatch(/Propón y calla/i);
  });

  it('deja claro que cruzar y sacar conclusiones NO es pedir permiso', () => {
    expect(SISTEMA).toMatch(/no una licencia que tengas que pedir/i);
  });

  it('los limites se enuncian UNA vez y al final, no como identidad', () => {
    const pos = SISTEMA.indexOf('Dos límites');
    expect(pos).toBeGreaterThan(SISTEMA.length / 3);
    expect(SISTEMA.match(/Dos límites/g)).toHaveLength(1);
  });

  it('limite 1: los numeros y las fechas los pone la app y el modelo los COPIA', () => {
    expect(SISTEMA).toMatch(/los COPIAS/);
    expect(SISTEMA).toMatch(/No cuentas días/);
    expect(SISTEMA).toMatch(/no deduces el día de la semana/);
    expect(SISTEMA).toMatch(/Si no la\s+recibiste, dices que no la tienes/);
    expect(SISTEMA).toMatch(/dos números para lo mismo\s+destruyen la confianza/i);
  });

  it('un solo formato de fecha, y los dos que fallaron prohibidos por su nombre', () => {
    expect(SISTEMA).toMatch(/SOLO como "jue 12\s+nov"/);
    expect(SISTEMA).toMatch(/nunca 12-11 ni 2026-11-12/);
  });

  it('limite 2: el grupo de hoy lo decide la app y el modelo no lo cambia', () => {
    expect(SISTEMA).toMatch(/SUGERENCIA DE HOY/);
    expect(SISTEMA).toMatch(/no lo cambias porque suene mejor/);
    expect(SISTEMA).toMatch(/si el usuario\s+pregunta de nuevo dices el mismo/);
  });

  it('si hoy ya entreno, resume lo hecho y NO propone plan', () => {
    expect(SISTEMA).toMatch(/hoy ya entrenó, resumes\s+lo que hizo y no propones plan/);
  });

  it('no atribuye al usuario frases que no estan en la conversacion', () => {
    expect(SISTEMA).toMatch(/Solo le citas frases que estén en esta conversación/);
    expect(SISTEMA).toMatch(/no te entendí, ¿qué quieres decir\?/);
  });

  it('ante una contradiccion con el registro pregunta, y pide la marca exacta', () => {
    expect(SISTEMA).toMatch(/¿lo marco como no hecho\?/);
    expect(SISTEMA).toMatch(/\[\[excluir\|Nombre del ejercicio\|vie 13 nov\]\]/);
    expect(SISTEMA).toMatch(/Mientras no confirme,\s+el registro manda/);
  });

  it('responde PRIMERO lo que le preguntaron, y corto', () => {
    expect(SISTEMA).toMatch(/Responde PRIMERO lo que te preguntó/);
    expect(SISTEMA).toMatch(/empieza por sí o no/);
    expect(SISTEMA).toMatch(/de dos a cinco frases/);
  });

  it('sin sermones ni frases de efecto, y sin el ejemplo que el modelo copiaba', () => {
    expect(SISTEMA).toMatch(/Sin sermones, sin frases de efecto/);
    expect(SISTEMA).toMatch(/sin regañar/);
    // "es un techo" salia en cada respuesta porque el propio prompt lo usaba de ejemplo.
    expect(SISTEMA.match(/es un techo/g)).toHaveLength(1); // solo como ejemplo PROHIBIDO
  });

  it('cuando le corrigen, una linea y sigue', () => {
    expect(SISTEMA).toMatch(/Si te corrige, una línea y sigues/);
    expect(SISTEMA).toMatch(/Sin pedir\s+perdón/);
  });

  it('no se repite a si mismo', () => {
    expect(SISTEMA).toMatch(/No repitas lo que ya dijiste/);
  });

  it('y sigue siendo un coach: la frontera NO le quita el criterio', () => {
    expect(SISTEMA).toMatch(/Cruzar, comparar, ordenar, buscar patrones/);
    expect(SISTEMA).toMatch(/no una licencia que tengas que pedir/i);
  });
});

describe('armarMensajes — forma inesperada del contexto', () => {
  // `textoDeContexto` no validaba: un panorama que no fuera array daba 500
  // con el mensaje de la excepcion en el cuerpo.
  it('un panorama que no es lista no revienta', () => {
    expect(() => armarMensajes({ pregunta: 'x', contexto: { panorama: {}, resumen: {}, bitacora: '' } }))
      .not.toThrow();
  });

  it('una bitacora que no es texto tampoco', () => {
    expect(() => armarMensajes({ pregunta: 'x', contexto: { panorama: [], resumen: {}, bitacora: 42 } }))
      .not.toThrow();
  });

  it('un resumen ausente tampoco', () => {
    expect(() => armarMensajes({ pregunta: 'x', contexto: { panorama: [], bitacora: '' } })).not.toThrow();
  });
});

describe('armarMensajes — casos vacios', () => {
  it('sin contexto no inventa un bloque vacio', () => {
    const m = armarMensajes({ pregunta: 'hola' });
    expect(m).toHaveLength(2);
    expect(m[0].role).toBe('system');
    expect(m[1].content).toBe('hola');
  });

  it('un panorama vacio lo dice, en vez de dejar una lista en blanco', () => {
    const m = armarMensajes({
      pregunta: 'hola',
      contexto: { ...CONTEXTO, panorama: [] },
    });
    expect(m[1].content).toContain('ningun ejercicio');
  });

  it('una bitacora vacia tambien', () => {
    const m = armarMensajes({ pregunta: 'hola', contexto: { ...CONTEXTO, bitacora: '' } });
    expect(m[1].content).toContain('(vacia)');
  });

  it('sin peso corporal no escribe "null"', () => {
    const m = armarMensajes({
      pregunta: 'hola',
      contexto: { ...CONTEXTO, resumen: { ...CONTEXTO.resumen, pesoCorporal: null, grasaCorporal: null } },
    });
    expect(m[1].content).toContain('peso corporal: sin registrar');
    expect(m[1].content).not.toContain('null');
  });

  it('descarta turnos con forma rara en vez de mandarlos', () => {
    const m = armarMensajes({
      pregunta: 'hola',
      historial: [{ autor: 'usuario', texto: 'bien' }, null, { autor: 'otro', texto: 'x' }, { autor: 'coach' }],
    });
    expect(m).toHaveLength(3);
    expect(m[1].content).toBe('bien');
  });
});

describe('armarMensajes — avisos de la app (tarjetas que NO dijo el coach)', () => {
  const AVISO = {
    autor: 'coach', origen: 'app', texto: 'Tu volumen subió 13% esta semana',
    cifras: '7 días: 41.200 kg · 7 anteriores: 36.500 kg',
  };

  it('un aviso de la app no viaja como si lo hubiera dicho el asistente', () => {
    const m = pedir({ historial: [...CHARLA, AVISO] });
    const comoAsistente = m.filter((x) => x.role === 'assistant').map((x) => x.content);
    expect(comoAsistente.some((c) => c.includes('volumen subió'))).toBe(false);
  });

  it('va en la ultima pregunta, con sus cifras de origen, como AVISOS DE LA APP', () => {
    const m = pedir({ historial: [...CHARLA, AVISO] });
    const ultimo = m[m.length - 1].content;
    expect(ultimo).toContain('AVISOS DE LA APP');
    expect(ultimo).toContain('Tu volumen subió 13%');
    expect(ultimo).toContain('41.200 kg');
    expect(ultimo.startsWith('¿como voy?')).toBe(true);
  });

  it('sin avisos no cambia nada: el prefijo cacheable queda igual', () => {
    const sin = pedir();
    const con = pedir({ historial: [...CHARLA, AVISO] });
    expect(prefijo(con).startsWith(prefijo(sin).slice(0, -1))).toBe(true);
    expect(sin[sin.length - 1].content).toBe('¿como voy?');
  });

  it('un turno normal del coach sigue siendo del asistente', () => {
    const m = pedir();
    expect(m.some((x) => x.role === 'assistant' && x.content === 'dime')).toBe(true);
  });
});
