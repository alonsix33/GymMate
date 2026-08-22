import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CoachRemoto } from '@/features/coach-ia';
import { saveHistory } from '@/utils/storage';
import type { HistorySession } from '@/types';

/**
 * El CABLE: que lo que se calcula acabe de verdad dentro de la peticion.
 *
 * Faltaba, y era el hueco mas caro de todos. Las dos mitades estaban
 * probadas por separado —`contextoCompleto()` en un test y `armarMensajes()`
 * en otro, con un objeto escrito a mano— pero que estuvieran UNIDAS no lo
 * comprobaba nada. Cambiar `contexto: contextoCompleto()` por `contexto:
 * null` en `CoachRemoto.responder` dejaba las 272 pruebas y las 8 puertas en
 * verde, y la app volvia a responder "no tengo datos" con un año de datos al
 * lado: exactamente el defecto que todo esto vino a arreglar.
 *
 * Aqui se espia `fetch` y se mira el cuerpo que sale.
 */

function sesion(nombre: string, peso: number, reps: number, dias: number): HistorySession {
  const h = new Date();
  const d = new Date(h.getFullYear(), h.getMonth(), h.getDate() - dias, 19, 0);
  return {
    sessionId: `s_${nombre}_${dias}`, date: d.toISOString(), savedAt: d.toISOString(),
    grupo: 'Pecho', type: 'weights', volumenTotal: peso * reps * 3,
    volumenPorGrupo: { Pecho: peso * reps * 3 },
    ejercicios: [{
      nombre, sets: 3, reps, peso, volumen: peso * reps * 3, completado: true,
      esMancuerna: false, grupoMuscular: 'Pecho',
    }],
  } as unknown as HistorySession;
}

/** Un `fetch` de mentira que guarda lo que le mandan y devuelve un stream. */
function espiar() {
  const visto: { cuerpo: unknown; url: string; cabeceras: Record<string, string> }[] = [];
  const falso = vi.fn(async (url: string, init: RequestInit) => {
    visto.push({
      url: String(url),
      cuerpo: JSON.parse(String(init.body)),
      cabeceras: init.headers as Record<string, string>,
    });
    return {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('ok')); c.close(); },
      }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', falso);
  return visto;
}

async function preguntar(pregunta: string) {
  const coach = new CoachRemoto('https://api.example', 'un-token');
  const trozos: string[] = [];
  for await (const t of coach.responder(pregunta, [])) trozos.push(t);
  return trozos.join('');
}

beforeEach(() => {
  localStorage.clear();
  saveHistory([
    sesion('Press Banca', 100, 12, 3),
    sesion('Press Banca', 100, 12, 10),
    sesion('Press Banca', 100, 12, 17),
    sesion('Press Banca', 120, 2, 45),
    sesion('Sentadilla', 150, 5, 4),
  ]);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CoachRemoto · el contexto llega de verdad al servidor', () => {
  it('manda el contexto, no null', async () => {
    const visto = espiar();
    await preguntar('¿como voy?');
    const cuerpo = visto[0].cuerpo as { contexto: { panorama: unknown[] } | null };
    expect(cuerpo.contexto).not.toBeNull();
    expect(cuerpo.contexto!.panorama.length).toBeGreaterThan(0);
  });

  it('el panorama que viaja tiene TODOS los ejercicios, no solo el nombrado', async () => {
    const visto = espiar();
    await preguntar('¿como voy en Press Banca?');
    const c = (visto[0].cuerpo as { contexto: { panorama: { ejercicio: string }[] } }).contexto;
    expect(c.panorama.map((e) => e.ejercicio).sort()).toEqual(['Press Banca', 'Sentadilla']);
  });

  it('la bitacora viaja con las sesiones dentro', async () => {
    const visto = espiar();
    await preguntar('¿que hice?');
    const c = (visto[0].cuerpo as { contexto: { bitacora: string } }).contexto;
    expect(c.bitacora).toContain('Press Banca 3x12@100');
    expect(c.bitacora.split('\n').length).toBe(5);
  });

  it('una pregunta que no nombra ningun ejercicio TAMBIEN lleva el contexto', async () => {
    // Este es el caso que antes se iba de vacio: `datosPara` no encontraba
    // nada y no viajaba ni un numero.
    const visto = espiar();
    await preguntar('¿como va mi mes?');
    const cuerpo = visto[0].cuerpo as { datos: unknown; contexto: unknown };
    expect(cuerpo.datos).toBeNull();
    expect(cuerpo.contexto).not.toBeNull();
  });

  it('el bloque `datos` sale del MISMO panorama, no de otra cuenta', async () => {
    // `datosPara` leia el historial entero y `contextoCompleto` filtra a 12
    // meses: para un ejercicio con el pico fuera de la ventana, los dos
    // bloques viajaban en el mismo mensaje con cifras distintas.
    const visto = espiar();
    await preguntar('¿como voy en Press Banca?');
    const { datos, contexto } = visto[0].cuerpo as {
      datos: { ejercicio: string; unaRepMax: number };
      contexto: { panorama: { ejercicio: string; unaRepMax: number }[] };
    };
    const fila = contexto.panorama.find((e) => e.ejercicio === 'Press Banca');
    expect(datos).toEqual(fila);
  });

  it('va al endpoint correcto y con el token en la cabecera', async () => {
    const visto = espiar();
    await preguntar('hola');
    expect(visto[0].url).toBe('https://api.example/api/coach');
    expect(visto[0].cabeceras.Authorization).toBe('Bearer un-token');
  });

  it('sin ninguna sesion manda contexto null en vez de un bloque de ceros', async () => {
    localStorage.clear();
    const visto = espiar();
    await preguntar('hola');
    expect((visto[0].cuerpo as { contexto: unknown }).contexto).toBeNull();
  });

  it('devuelve el texto que llega en streaming', async () => {
    espiar();
    expect(await preguntar('hola')).toBe('ok');
  });
});
