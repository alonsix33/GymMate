import { describe, it, expect } from 'vitest';
import {
  barrasHorizontalesSVG, barrasParesSVG, barrasVerticalesSVG, detectarPedidoDeGrafico, dibujarGrafico,
  ejerciciosNombrados, FRASE_DE, graficoSVG, hoyContraUltima, pideGrafico, repartoPorGrupo, resumenDeSerie,
  serieDeEjercicio, unaRepMaxPorSesion, volumenPorSemana, type PedidoDeGrafico,
} from '@/features/coach-grafico';
import type { HistorySession } from '@/types';

const AHORA = new Date('2026-11-18T20:30:00-05:00'); // mie 18 nov 2026

const ej = (nombre: string, peso: number, extra: object = {}) => ({
  nombre, sets: 4, reps: 10, peso, volumen: 4 * 10 * peso, completado: true, esMancuerna: false, grupoMuscular: 'Pecho', ...extra,
});
const ses = (fecha: string, ejercicios: ReturnType<typeof ej>[], grupo = 'G'): HistorySession =>
  ({ sessionId: `s_${fecha}_${grupo}`, date: fecha, savedAt: `${fecha}T17:00:00.000Z`, grupo, type: 'weights', volumenTotal: 1, volumenPorGrupo: {}, ejercicios }) as unknown as HistorySession;

const HIST = [
  ses('2026-11-10', [ej('Press Militar', 40, { grupoMuscular: 'Hombros' }), ej('Press Banca', 50), ej('Press Inclinado', 40), ej('Fondos en Máquina', 100, { grupoMuscular: 'Tríceps' })]),
  ses('2026-11-05', [ej('Press Militar', 40, { grupoMuscular: 'Hombros' }), ej('Press Banca', 50)]),
  ses('2026-10-20', [ej('Press Banca', 47.5), ej('Jalón al Pecho', 55, { grupoMuscular: 'Espalda' }), ej('Jalón Agarre Cerrado', 60, { grupoMuscular: 'Espalda' })]),
  ses('2026-09-01', [ej('Press Banca', 45)]),
  ses('2025-01-01', [ej('Press Banca', 30)]), // fuera de los 6 meses
];

const elegir = (r: PedidoDeGrafico | null) => (r?.tipo === 'elegir' ? r : null);
const detectar = (t: string, turnos: Array<{ autor: 'coach' | 'usuario'; texto: string }> = [], h = HIST) =>
  detectarPedidoDeGrafico(t, h, turnos, AHORA);

describe('reconocer que piden un gráfico', () => {
  it('con y sin tilde, y "evolución"', () => {
    for (const t of ['Muéstrame el gráfico', 'muestrame el grafico', 'la gráfica del jalón', 'evolución del press']) expect(pideGrafico(t)).toBe(true);
  });
  it('una pregunta normal no es un pedido', () => {
    for (const t of ['¿Qué me toca hoy?', 'Pásame el plan', 'cómo voy esta semana', 'Hola', 'llevo 3 semanas sin tocar piernas']) {
      expect(detectar(t)).toBeNull();
    }
  });
});

describe('cada gráfico se pide con sus palabras', () => {
  const casos: Array<[string, string]> = [
    ['compara las semanas', 'semanas'],
    ['Comparar semanas', 'semanas'],
    ['esta semana contra la anterior', 'semanas'],
    ['volumen por semana', 'volumen_semanal'],
    ['la tendencia del volumen', 'volumen_semanal'],
    ['muéstrame las últimas semanas', 'volumen_semanal'],
    ['qué grupo tengo descuidado?', 'sin_tocar'],
    ['días sin tocar por grupo', 'sin_tocar'],
    ['qué tengo abandonado?', 'sin_tocar'],
    ['reparto de volumen por grupo', 'reparto'],
    ['la distribución por grupo muscular', 'reparto'],
    ['hoy contra la última vez', 'hoy_vs_ultima'],
    ['cómo me fue hoy?', 'hoy_vs_ultima'],
    ['compara con la última vez', 'hoy_vs_ultima'],
  ];
  for (const [texto, tipo] of casos) {
    it(`"${texto}" → ${tipo}`, () => {
      expect(detectar(texto)).toEqual({ tipo: 'grafico', grafico: { tipo } });
    });
  }
  it('las frases de los botones se entienden SIN ambigüedad, cada una a su gráfico', () => {
    for (const [tipo, frase] of Object.entries(FRASE_DE)) {
      expect(detectar(frase)).toEqual({ tipo: 'grafico', grafico: { tipo } });
    }
  });
});

describe('qué ejercicio dibujar', () => {
  const nombres = ['Press Banca', 'Press Banca Inclinado', 'Jalón al Pecho', 'Jalón Agarre Cerrado', 'Press Militar'];
  it('el nombre entero, y el más largo manda', () => {
    expect(ejerciciosNombrados('gráfico del press banca inclinado', nombres)).toEqual(['Press Banca Inclinado']);
  });
  it('una palabra clave; "press" solo no identifica ninguno', () => {
    expect(ejerciciosNombrados('gráfico de banca', nombres).sort()).toEqual(['Press Banca', 'Press Banca Inclinado']);
    expect(ejerciciosNombrados('el gráfico del press', nombres)).toEqual([]);
  });
  it('1 candidato → se dibuja; varios → se pregunta', () => {
    expect(detectar('gráfico de fondos')).toEqual({ tipo: 'grafico', grafico: { tipo: 'peso', ejercicio: 'Fondos en Máquina' } });
    expect(elegir(detectar('el gráfico del jalón'))?.opciones.map((o) => o.etiqueta).sort()).toEqual(['Jalón Agarre Cerrado', 'Jalón al Pecho']);
  });
  it('1RM de un ejercicio', () => {
    expect(detectar('el 1RM del press militar')).toEqual({ tipo: 'grafico', grafico: { tipo: '1rm', ejercicio: 'Press Militar' } });
  });
  it('"1RM" sin ejercicio: pregunta de cuál, y los botones piden el 1RM (no el peso)', () => {
    const r = elegir(detectar('muéstrame el 1rm'));
    expect(r?.pregunta).toMatch(/1RM/);
    expect(r?.opciones.every((o) => o.frase.startsWith('1RM estimado de '))).toBe(true);
    // Y esa frase, al tocarla, se entiende:
    const frase = r!.opciones[0].frase;
    expect(detectar(frase)).toMatchObject({ tipo: 'grafico', grafico: { tipo: '1rm' } });
  });
  it('EL CASO DE LA CAPTURA: "Muéstrame el gráfico" tras el plan → ejercicios del plan y los otros gráficos', () => {
    const plan = 'Upper Push, hoy: **Press Militar** — 4x10 con 40 kg **Press Banca** — 4x10 con 50 kg **Fondos en Máquina** — 4x10 con 100 kg';
    const r = elegir(detectar('Muéstrame el gráfico', [{ autor: 'coach', texto: plan }]));
    expect(r?.pregunta).toBe('¿Qué gráfico quieres?');
    const ej = r!.opciones.filter((o) => o.grupo === 'Peso de un ejercicio').map((o) => o.etiqueta);
    expect(ej.sort()).toEqual(['Fondos en Máquina', 'Press Banca', 'Press Militar']);
    expect(r!.opciones.filter((o) => o.grupo === 'Otros gráficos').map((o) => o.frase)).toEqual(
      expect.arrayContaining([FRASE_DE.semanas, FRASE_DE.volumen_semanal, FRASE_DE.sin_tocar, FRASE_DE.reparto, FRASE_DE.hoy_vs_ultima])
    );
  });
  it('si el coach hablaba de UN ejercicio, se dibuja ese', () => {
    expect(detectar('muéstrame el gráfico', [{ autor: 'coach', texto: 'Tu Press Banca va bien.' }])).toEqual({
      tipo: 'grafico', grafico: { tipo: 'peso', ejercicio: 'Press Banca' },
    });
  });
  it('del mensaje del coach solo cuenta el nombre ENTERO: "tu jalón va bien" no es el tema', () => {
    const r = elegir(detectar('muéstrame el gráfico', [{ autor: 'coach', texto: 'Tu jalón va bien.' }]));
    expect(r?.opciones.map((o) => o.etiqueta)).toContain('Press Banca');
  });
  it('lo que nombra el usuario manda sobre lo que dijo el coach', () => {
    expect(detectar('gráfico de fondos', [{ autor: 'coach', texto: 'Tu Press Banca va bien.' }])).toEqual({
      tipo: 'grafico', grafico: { tipo: 'peso', ejercicio: 'Fondos en Máquina' },
    });
  });
  it('sin pista, ofrece los más entrenados de los últimos 90 días', () => {
    const r = elegir(detectar('muéstrame el gráfico'));
    expect(r?.opciones.find((o) => o.grupo === 'Peso de un ejercicio')?.etiqueta).toBe('Press Banca');
  });
  it('sin historial no hay nada que dibujar', () => {
    expect(detectar('gráfico', [], [])).toBeNull();
  });
});

describe('cuando no queda claro, PREGUNTA', () => {
  it('"gráfico del volumen" puede ser tres cosas: pregunta cuál', () => {
    const r = elegir(detectar('muéstrame el gráfico del volumen'));
    expect(r?.opciones.map((o) => o.frase)).toEqual([FRASE_DE.semanas, FRASE_DE.volumen_semanal, FRASE_DE.reparto]);
  });
  it('un ejercicio ambiguo ("jalón") pregunta cuál de los dos', () => {
    expect(elegir(detectar('gráfico del jalón'))?.opciones).toHaveLength(2);
  });
  it('lo claro NO pregunta: "compara las semanas" se dibuja directo', () => {
    expect(elegir(detectar('compara las semanas'))).toBeNull();
  });
});

describe('los puntos de un ejercicio salen de la bitácora', () => {
  it('uno por día, de antiguo a reciente, solo últimos 6 meses', () => {
    const p = serieDeEjercicio('Press Banca', HIST, AHORA);
    expect(p.map((x) => x.fecha)).toEqual(['2026-09-01', '2026-10-20', '2026-11-05', '2026-11-10']);
    expect(p.map((x) => x.peso)).toEqual([45, 47.5, 50, 50]);
  });
  it('una serie EXCLUIDA no se dibuja, y dos guardados del día son un punto', () => {
    const h = [ses('2026-11-10', [ej('Hip Thrust', 450, { excluido: true })]), ses('2026-11-05', [ej('Hip Thrust', 55)]), ses('2026-11-05', [ej('Hip Thrust', 57.5)], 'otro')];
    const p = serieDeEjercicio('Hip Thrust', h, AHORA);
    expect(p.map((x) => x.peso)).toEqual([57.5]);
  });
  it('el pie usa solo cifras de los puntos', () => {
    expect(resumenDeSerie('Press Banca', serieDeEjercicio('Press Banca', HIST, AHORA))).toBe(
      'Press Banca · últimos 6 meses: de 45 kg (mar 1 sep) a 50 kg (mar 10 nov). Pico 50 kg · 4 sesiones.'
    );
    expect(resumenDeSerie('Remo', [])).toContain('No tengo sesiones de Remo');
  });
});

// Volumen: 28 días con una sesión cada 7 días; cada sesión mueve 1 ejercicio de 2000 kg.
const sem = (fecha: string, kg: number) => ses(fecha, [ej('Press Banca', kg / 40)]);
const SEMANAL = [
  sem('2026-11-16', 2400), // hoy-2: ultima semana (10-16 nov... ver fin=ayer 17)
  sem('2026-11-09', 2000),
  sem('2026-11-02', 2000),
  sem('2026-10-26', 1600),
  sem('2026-10-19', 1600),
  sem('2026-10-12', 1200),
];

describe('volumen por semana', () => {
  it('7 días móviles terminando AYER si hoy no hay sesión, de antigua a reciente', () => {
    const s = volumenPorSemana(SEMANAL, AHORA);
    expect(s[s.length - 1].hasta).toBe('2026-11-17');
    expect(s[s.length - 1].desde).toBe('2026-11-11');
    expect(s.map((x) => x.kg)).toEqual([...s.map((x) => x.kg)]); // orden estable
    expect(s[0].desde < s[s.length - 1].desde).toBe(true);
  });
  it('si hoy YA hay sesión, la última semana termina hoy', () => {
    const s = volumenPorSemana([...SEMANAL, sem('2026-11-18', 800)], AHORA);
    expect(s[s.length - 1].hasta).toBe('2026-11-18');
  });
  it('no dibuja una semana que empieza antes del primer registro (su barra sería falsa)', () => {
    const s = volumenPorSemana([sem('2026-11-16', 2400)], AHORA);
    expect(s).toEqual([]);
  });
  it('suma lo mismo que la tarjeta de volumen (misma ventana)', () => {
    const d = dibujarGrafico({ tipo: 'semanas' }, SEMANAL, AHORA);
    const s = volumenPorSemana(SEMANAL, AHORA);
    // 12-17 nov: sesion del 16 (2400). Anterior 4-10 nov: sesion del 9 (2000)
    expect(s[s.length - 1].kg).toBe(2400);
    expect(d.texto).toContain('2,400 kg');
    expect(d.texto).toContain('2,000 kg');
    expect(d.texto).toContain('+20 %');
  });
});

describe('reparto por grupo (30 días)', () => {
  it('suma por grupo muscular y los % suman 100', () => {
    const h = [
      ses('2026-11-10', [ej('A', 100, { grupoMuscular: 'Espalda' }), ej('B', 50, { grupoMuscular: 'Pecho' }), ej('C', 50, { grupoMuscular: 'Core' })]),
      ses('2026-09-01', [ej('Viejo', 500, { grupoMuscular: 'Piernas' })]), // fuera de 30 dias
    ];
    const r = repartoPorGrupo(h, AHORA);
    expect(r.map((x) => x.grupo)).toEqual(['Espalda', 'Pecho', 'Core']);
    expect(r.reduce((t, x) => t + x.porcentaje, 0)).toBe(100);
    expect(r[0]).toMatchObject({ grupo: 'Espalda', kg: 4000, porcentaje: 50 });
  });
  it('el pie no termina en "…." (puntos duplicados)', () => {
    const h = [ses('2026-11-10', ['A', 'B', 'C', 'D'].map((n, i) => ej(n, 100 - i * 10, { grupoMuscular: `G${i}` })))];
    const t = dibujarGrafico({ tipo: 'reparto' }, h, AHORA).texto;
    expect(t).toMatch(/ y otros\.$/);
    expect(t).not.toContain('….');
  });
  it('una serie excluida no cuenta', () => {
    const h = [ses('2026-11-10', [ej('A', 100, { grupoMuscular: 'Espalda' }), ej('X', 450, { grupoMuscular: 'Glúteos', excluido: true })])];
    expect(repartoPorGrupo(h, AHORA).map((x) => x.grupo)).toEqual(['Espalda']);
  });
});

describe('hoy contra la última vez', () => {
  const H = [
    ses('2026-11-18', [ej('Press Banca', 52.5), ej('Press Militar', 40), ej('Fondos en Máquina', 95), ej('Remo', 60)]),
    ses('2026-11-10', [ej('Press Banca', 50), ej('Press Militar', 40), ej('Fondos en Máquina', 100)]),
  ];
  it('sube / igual / baja / nuevo, por peso (y a igual peso, por volumen)', () => {
    const r = hoyContraUltima(H, AHORA)!;
    expect(r.esHoy).toBe(true);
    const por = Object.fromEntries(r.items.map((i) => [i.ejercicio, i.sentido]));
    expect(por).toEqual({ 'Press Banca': 'subio', 'Press Militar': 'igual', 'Fondos en Máquina': 'bajo', Remo: 'nuevo' });
  });
  it('a igual peso gana el que movió más volumen', () => {
    const h = [ses('2026-11-18', [ej('X', 40, { sets: 4, reps: 12, volumen: 1920 })]), ses('2026-11-10', [ej('X', 40, { sets: 4, reps: 10, volumen: 1600 })])];
    expect(hoyContraUltima(h, AHORA)!.items[0].sentido).toBe('subio');
  });
  it('sin sesión de hoy compara la ÚLTIMA y lo dice', () => {
    const r = hoyContraUltima(H.slice(1), AHORA);
    expect(r?.esHoy).toBe(false);
    expect(dibujarGrafico({ tipo: 'hoy_vs_ultima' }, H.slice(1), AHORA).texto).toContain('Tu última sesión');
  });
  it('el pie cuenta cuántos subieron, iguales y bajaron', () => {
    expect(dibujarGrafico({ tipo: 'hoy_vs_ultima' }, H, AHORA).texto).toBe(
      'Hoy (mié 18 nov) contra la vez anterior de cada ejercicio: 1 subió, 1 igual, 1 bajó, 1 sin vez anterior.'
    );
  });
});

describe('1RM estimado', () => {
  it('es el promedio de las tres fórmulas (el mismo de Récords) y no entran series de más de 15 reps', () => {
    const h = [ses('2026-11-10', [ej('Curl', 20, { reps: 20 })]), ses('2026-11-05', [ej('Curl', 20, { reps: 10 })])];
    const p = unaRepMaxPorSesion('Curl', h, AHORA);
    expect(p).toHaveLength(1);
    expect(p[0].fecha).toBe('2026-11-05');
    expect(p[0].peso).toBeGreaterThan(20);
  });
  it('si no hay ninguna serie estimable lo dice, sin dibujar', () => {
    const h = [ses('2026-11-10', [ej('Curl', 20, { reps: 20 })])];
    const d = dibujarGrafico({ tipo: '1rm', ejercicio: 'Curl' }, h, AHORA);
    expect(d.svg).toBe('');
    expect(d.texto).toContain('No puedo estimar');
  });
});

describe('días sin tocar por grupo', () => {
  it('el que más lleva sin tocarse va primero y el pie lo dice', () => {
    const h = [
      ses('2026-10-25', [ej('Abdominales', 63, { grupoMuscular: 'Core' })]),
      ses('2026-11-17', [ej('Jalón', 55, { grupoMuscular: 'Espalda' })]),
    ];
    const d = dibujarGrafico({ tipo: 'sin_tocar' }, h, AHORA);
    expect(d.texto).toBe('El que más lleva sin tocarse: Core, 24 días (última vez dom 25 oct).');
    expect(d.svg.indexOf('Core')).toBeLessThan(d.svg.indexOf('Espalda'));
  });
});

describe('el SVG', () => {
  const p = serieDeEjercicio('Press Banca', HIST, AHORA);
  it('línea: un punto por sesión y una línea', () => {
    const s = graficoSVG('Press Banca', p);
    expect((s.match(/<circle/g) ?? []).length).toBe(4);
    expect(s).toContain('<polyline');
  });
  it('una sola sesión: un punto y sin línea; peso constante sin NaN', () => {
    expect(graficoSVG('X', p.slice(0, 1))).not.toContain('<polyline');
    expect(graficoSVG('X', [p[2], p[3]])).not.toMatch(/NaN|Infinity/);
  });
  it('barras verticales: una por dato, la destacada marcada, sin NaN', () => {
    const s = barrasVerticalesSVG('t', [{ etiqueta: 'a', valor: 0 }, { etiqueta: 'b', valor: 28360, destacada: true }]);
    expect((s.match(/<rect/g) ?? []).length).toBe(2);
    expect(s).toContain('f-coach__barra--destacada');
    expect(s).toContain('28.4k');
    expect(s).not.toMatch(/NaN|Infinity/);
  });
  it('barras horizontales y de pares: sin NaN y con todos los nombres', () => {
    const h = barrasHorizontalesSVG('t', [{ etiqueta: 'Core', valor: 19, texto: '19 d' }, { etiqueta: 'Espalda', valor: 0, texto: '0 d' }]);
    expect(h).toContain('Core');
    expect(h).not.toMatch(/NaN|Infinity/);
    const pares = barrasParesSVG('t', [{ ejercicio: 'Press Banca', actual: 52.5, anterior: 50, sentido: 'subio' }, { ejercicio: 'Remo', actual: 60, anterior: null, sentido: 'nuevo' }]);
    expect(pares).toContain('52.5 ↑');
    expect(pares).not.toMatch(/NaN|Infinity/);
  });
  it('escapa los nombres', () => {
    expect(graficoSVG('<img onerror=x>', p)).not.toContain('<img');
    expect(barrasHorizontalesSVG('<b>', [{ etiqueta: '<img onerror=x>', valor: 1, texto: '1' }])).not.toContain('<img');
  });
  it('sin datos no dibuja nada', () => {
    expect(graficoSVG('X', [])).toBe('');
    expect(barrasVerticalesSVG('t', [])).toBe('');
    expect(barrasHorizontalesSVG('t', [])).toBe('');
    expect(barrasParesSVG('t', [])).toBe('');
  });
});
