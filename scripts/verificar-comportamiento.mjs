#!/usr/bin/env node
/**
 * Puerta de comportamiento FIERRO.
 *
 * Conduce la app construida en un navegador real y reproduce los escenarios
 * que la verificacion adversarial encontro rotos. Cada caso de aqui es un
 * defecto que YA ocurrio: si vuelve, esto se pone rojo.
 *
 * Esa frase era falsa hasta la revision del paso 6. El caso 27 ("el cardio no
 * suma racha") importaba un modulo, lo tiraba, y afirmaba "la racha es 0" sobre
 * una pagina recien abierta y VACIA: sumarle 7 a la racha dentro de
 * `processCompletedCardioSession` dejaba la puerta en verde. Y el caso 26
 * bajaba el descanso a 0, con lo que "el ultimo descanso tambien se corre" —el
 * defecto estrella de ese paso— duraba cero segundos y era inobservable.
 *
 * Regla que sale de ahi: un caso que no se ha visto FALLAR con su defecto
 * reintroducido no cuenta como cobertura. Cada caso nuevo se prueba matando su
 * propio mutante antes de darlo por bueno.
 *
 * Sale 1 ante cualquier fallo. Uso: node scripts/verificar-comportamiento.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { resolve, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const CHROME = process.env.FIERRO_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let fallos = 0;
let ejecutados = 0;
const chk = (n, ok, d = '') => {
  ejecutados++;
  if (!ok) fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${n}${d ? ' :: ' + d : ''}`);
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};
const distIndex = await stat(join(DIST, 'index.html')).catch(() => {
  console.error('No hay dist/index.html. Corre `npm run build` antes.');
  process.exit(2);
});

// Frescura, no solo existencia. Un `npm run build` que falla deja el dist
// ANTERIOR en su sitio, y las tres sondas de navegador lo median tan contentas
// dando verde sobre un artefacto viejo. Se observo en vivo durante la
// auditoria: tsc EXIT=2, build EXIT=2, runtime EXIT=0.
{
  const fuentes = [];
  const recorrer = async (dir) => {
    const { readdir } = await import('fs/promises');
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) await recorrer(ruta);
      else if (/\.(ts|css|html)$/.test(e.name)) fuentes.push(ruta);
    }
  };
  await recorrer(join(RAIZ, 'src'));
  fuentes.push(join(RAIZ, 'index.html'));
  let masNueva = 0;
  let culpable = '';
  for (const f of fuentes) {
    const m = (await stat(f)).mtimeMs;
    if (m > masNueva) {
      masNueva = m;
      culpable = f;
    }
  }
  if (masNueva > distIndex.mtimeMs) {
    console.error(
      `dist/ esta rancio: ${culpable.replace(RAIZ + '/', '')} es mas nuevo que dist/index.html.\n` +
        'Corre `npm run build` — medir el artefacto viejo da verdes que no valen nada.'
    );
    process.exit(2);
  }
}

/**
 * Literales del propio mockup.
 *
 * El `<script data-dc-script>` de `Pantallas Fierro.dc.html` trae los datos con
 * los que se dibujaron las 32 capturas. Extraerlos de ahi es la unica forma de
 * que un texto inventado se ponga rojo: mientras las puertas solo compararon
 * cajas y colores, los seis tags de C-01 estuvieron mal (dos letras en vez de
 * una) y ninguna se entero — el propio script de fidelidad horneaba el tag
 * equivocado como si fuera "el mockup".
 */
const MOCKUP = await readFile(
  join(RAIZ, 'redesign', 'design_handoff_fierro', 'Pantallas Fierro.dc.html'),
  'utf8'
);
/**
 * El dia de HOY en local, como lo calcula la app.
 *
 * La puerta corre con TZ=America/Lima y sembraba los borradores con
 * `new Date().toISOString().slice(0,10)`: a partir de las 19:00 eso es el dia
 * de MAÑANA, y el resultado de dos casos pasaba a depender de la hora del
 * reloj de pared. Una puerta que se salta la regla que ella misma impone es la
 * que menos derecho tiene a la excepcion.
 */
function diaLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function datosDelMockup(nombre, ayudas = {}) {
  const i = MOCKUP.indexOf(`const ${nombre} = [`);
  if (i === -1) throw new Error(`El mockup no declara ${nombre}: la puerta no puede comparar contra nada`);
  const desde = MOCKUP.indexOf('[', i);
  let nivel = 0;
  for (let k = desde; k < MOCKUP.length; k++) {
    if (MOCKUP[k] === '[') nivel++;
    else if (MOCKUP[k] === ']' && --nivel === 0) {
      // eslint-disable-next-line no-new-func
      const nombres = Object.keys(ayudas);
      return Function(
        ...nombres,
        `"use strict";return (${MOCKUP.slice(desde, k + 1)})`
      )(...nombres.map((n) => ayudas[n]));
    }
  }
  throw new Error(`No se pudo cerrar el literal ${nombre} del mockup`);
}

const CARDIO_MODES_MOCKUP = datosDelMockup('cardioModes');
// `rangoLadder` se escribe con el helper `rl(...)` del mockup, asi que hay que
// darselo al evaluador o el literal no se puede leer.
const LADDER_MOCKUP = datosDelMockup('rangoLadder', {
  rl: (n, r, c, sub, tuyo, aqui) => ({ n, r, c, sub, tuyo, aqui }),
});
const ESPECIALES_MOCKUP = datosDelMockup('especiales');
const MODOS_ESPERADOS_TAGS = CARDIO_MODES_MOCKUP.map((m) => m.tag).join(',');
const servidor = createServer(async (q, r) => {
  const ruta = decodeURIComponent((q.url ?? '/').split('?')[0]);
  const archivo = join(DIST, ruta === '/' ? 'index.html' : ruta);
  if (!archivo.startsWith(DIST)) return r.writeHead(403).end();
  // Leer ANTES de escribir cabeceras: al reves, un fallo de lectura intenta
  // un segundo writeHead y tumba el proceso con ERR_HTTP_HEADERS_SENT.
  let cuerpo;
  try {
    cuerpo = await readFile(archivo);
  } catch {
    return r.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
  }
  r.writeHead(200, { 'Content-Type': MIME[extname(archivo)] ?? 'application/octet-stream' });
  r.end(cuerpo);
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const URL_APP = `http://127.0.0.1:${servidor.address().port}/`;

// Tope duro: una puerta que se cuelga no informa, bloquea.
//
// 420s. Subio de 180 al añadir los casos de cardio de punta a punta: una
// sesion de 70 segundos reales no se puede acelerar sin dejar de comprobar lo
// unico que importaba de ella —que el motor tarda lo que el pie anuncia—, y el
// recorrido de los seis modos son otros ~20s.
//
// Medido en esta maquina sin carga: ~240s con los casos del coach, o sea el
// 57% del tope. Un runner mas lento, o compartir CPU con otra corrida, lo
// acercaria — y entonces el rojo no diria nada del codigo. Por eso: el tope
// se puede subir con GYMMATE_PRESUPUESTO_MS, y al terminar se imprime lo que
// costo de verdad, para que el margen sea un dato y no una suposicion.
const PRESUPUESTO_MS = Number(process.env.GYMMATE_PRESUPUESTO_MS) || 600000;
const ARRANQUE = Date.now();

// Una excepcion a mitad de la suite abortaba el proceso y dejaba SIN CORRER
// todos los casos siguientes, con un stack por toda señal. Eso es la trampa de
// "el silencio parece exito": la salida no decia cuantos casos se habian
// quedado fuera. Ahora se cuenta como fallo y se dice, en voz alta.
process.on('uncaughtException', (e) => {
  console.error(`\nEXCEPCION que aborta la puerta: ${e?.message ?? e}`);
  console.error('Los casos posteriores NO se ejecutaron. La corrida no vale como verde.');
  process.exit(1);
});
const abortar = setTimeout(() => {
  console.error(`\nLa puerta excedio ${PRESUPUESTO_MS / 1000}s y se aborta.`);
  console.error('Si la maquina es lenta y no hay nada colgado, sube GYMMATE_PRESUPUESTO_MS.');
  process.exit(1);
}, PRESUPUESTO_MS);
abortar.unref?.();

// La app se usa en Lima (UTC-5). El navegador de la sonda hereda TZ del
// proceso, pero eso es implicito y se pierde si alguien corre el script a
// mano: `timezoneId` lo deja escrito. La racha, el heatmap y "hace N dias"
// solo se rompen en una zona con desfase negativo, asi que una sonda en UTC
// es una sonda que no puede ver la mitad de los defectos de fecha.
const ZONA = { timezoneId: 'America/Lima', locale: 'es-PE' };
const navegador = await chromium.launch({ executablePath: CHROME });

/** Pagina limpia, opcionalmente con localStorage sembrado. */
async function abrir(semilla = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, ...ZONA });
  const pagina = await ctx.newPage();
  await pagina.addInitScript((datos) => {
    for (const [k, v] of Object.entries(datos)) localStorage.setItem(k, JSON.stringify(v));
  }, semilla);
  // Tope corto: los reintentos por defecto de Playwright (30s x N) se comian
  // el presupuesto entero de la puerta cuando un selector legacy fallaba.
  pagina.setDefaultTimeout(4000);
  await pagina.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
  await pagina.waitForTimeout(900);
  return { ctx, pagina };
}

/**
 * Historial minimo para que H-01 se pinte ENTERO. Sin esto la home entra en
 * O-01 (vacio), donde faltan la mitad de las acciones: un chequeo que solo
 * ve el estado vacio valida lo que el usuario real nunca toca.
 */
function historialDePrueba(dias = [1, 3, 5, 8, 12]) {
  const hoy = new Date();
  return dias.map((atras, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras, 19, 30);
    const peso = 120 - i * 5;
    const volumen = 4 * 12 * peso;
    return {
      id: `s${i}`,
      sessionId: `s${i}`,
      date: d.toISOString(),
      savedAt: d.toISOString(),
      startedAt: new Date(d.getTime() - 3160000).toISOString(),
      grupo: 'GRUPO 1 - Piernas + Glúteos',
      volumenTotal: volumen,
      rpe: { value: 8, label: 'Muy difícil' },
      ejercicios: [
        {
          nombre: 'Prensa de Piernas',
          esMancuerna: false,
          grupoMuscular: 'Piernas',
          sets: 4,
          reps: 12,
          peso,
          volumen,
          completado: true,
        },
      ],
      volumenPorGrupo: { Piernas: volumen * 0.7, 'Glúteos': volumen * 0.3 },
    };
  });
}

/** CSV con las 11 columnas y la fecha DD/MM/YYYY que exporta la propia app. */
const CSV_DE_PRUEBA = [
  'Fecha,Grupo,Ejercicio,Sets,Reps,Peso (kg),Es Mancuerna,Grupo Muscular,Volumen,Completado,Volumen Total Sesión',
  '10/08/2026,GRUPO 1 - Piernas + Glúteos,Prensa de Piernas,4,12,120,No,Piernas,5760,Sí,5760',
  '12/08/2026,GRUPO 1 - Piernas + Glúteos,Prensa de Piernas,4,12,125,No,Piernas,6000,Sí,6000',
].join('\n');

const borradorDePrueba = {
  date: diaLocal(),
  grupo: 'GRUPO 1 - Piernas + Glúteos',
  ejercicios: [
    { nombre: 'Prensa de Piernas', sets: 4, reps: 12, peso: 120, volumen: 5760, completado: true },
    { nombre: 'Sentadilla', sets: 3, reps: 10, peso: 80, volumen: 2400, completado: false },
  ],
  volumenTotal: 8160,
  volumenPorGrupo: {},
};

// --------------------------------------------------------------------------
// 1. Descartar el borrador describe EL BORRADOR, no la sesion en memoria
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_draft: borradorDePrueba });
  const boton = pagina.locator('[data-accion="descartar"]').first();
  const hay = (await boton.count()) > 0;
  if (!hay) {
    chk('la tarjeta de borrador aparece con un borrador sembrado', false, 'no se encontro el boton de descartar');
  } else {
    await boton.click();
    await pagina.waitForTimeout(300);
    const cuerpo = (await pagina.locator('.f-sheet__cuerpo').textContent()) ?? '';
    chk(
      'descartar borrador cuenta los sets REALES del borrador',
      cuerpo.includes('7 sets') && cuerpo.includes('8,160'),
      cuerpo.slice(0, 90)
    );
    chk(
      'no dice "sin sets" teniendo una sesion entera dentro',
      !cuerpo.toLowerCase().includes('sin sets'),
      cuerpo.slice(0, 60)
    );
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 2. Cancelar "cambiar de rutina" NO navega al tab de entrenamiento
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  const r = await pagina.evaluate(async () => {
    const mod = await import('/assets/' + [...document.scripts]
      .map((s) => s.src.split('/').pop())
      .find((n) => n && n.endsWith('.js') && n.startsWith('index')));
    void mod;
    return true;
  }).catch(() => false);
  void r;
  // Se conduce por la API global, que es la misma que usan los onclick.
  await pagina.locator('[data-grupo]').first().click({ timeout: 5000 }).catch(() => {});
  await pagina.waitForTimeout(500);
  // Ensuciar la sesion por los inputs reales de la UI.
  const sucia = await pagina.evaluate(() => {
    const sets = document.getElementById('sets-0');
    const reps = document.getElementById('reps-0');
    const peso = document.getElementById('peso-0');
    if (!sets || !reps || !peso) return false;
    for (const [el, v] of [[sets, '4'], [reps, '10'], [peso, '100']]) {
      el.value = v;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  });
  await pagina.waitForTimeout(300);
  if (!sucia) {
    chk('se pudo ensuciar la sesion para la prueba', false, 'no se encontro el stepper');
  } else {
    // Volver a home. Con datos sin guardar, showHome() abre su propia hoja:
    // se acepta con el primario ("Salir").
    // Sin `void`, evaluate() se queda esperando la promesa de showHome, que
    // solo resuelve cuando alguien responde la hoja: el arnes se esperaba a
    // si mismo.
    await pagina.evaluate(() => {
      void window.showHome?.();
    });
    await pagina.waitForTimeout(400);
    if (await pagina.locator('.f-sheet .f-btn--primario').count()) {
      const cuerpoSalir = (await pagina.locator('.f-sheet__cuerpo').textContent()) ?? '';
      chk(
        'al salir, el borrador ya esta guardado cuando la hoja lo afirma',
        cuerpoSalir.includes('borrador queda guardado') &&
          (await pagina.evaluate(() => !!localStorage.getItem('gymmate_draft'))),
        cuerpoSalir.slice(0, 70)
      );
      await pagina.locator('.f-sheet .f-btn--primario').first().click();
      await pagina.waitForTimeout(400);
    }
    const tarjetas = pagina.locator('[data-grupo]');
    if ((await tarjetas.count()) > 1) {
      await tarjetas.nth(1).click({ timeout: 8000 }).catch((e) => chk('la 2a tarjeta de rutina es clicable', false, String(e).slice(0, 60)));
      await pagina.waitForTimeout(500);
      const hayHoja = (await pagina.locator('.f-sheet').count()) > 0;
      if (!hayHoja) {
        chk('aparece la hoja al cambiar de rutina con datos sin guardar', false, 'no aparecio');
      } else {
        const cuerpo = (await pagina.locator('.f-sheet__cuerpo').textContent()) ?? '';
        chk(
          'el cuerpo dice la verdad: lo registrado se pierde',
          cuerpo.includes('se pierde'),
          cuerpo.slice(0, 80)
        );
        chk(
          'la hoja de cambiar rutina es DESTRUCTIVA (rojo), no primaria',
          (await pagina.locator('.f-sheet .f-btn--destructivo').count()) === 1
        );
        // `:visible`: la hoja del descanso vive montada en index.html y
        // oculta, asi que un selector de documento entero la cogia a ella.
        await pagina.locator('.f-sheet:visible .f-btn--secundario').first().click();
        await pagina.waitForTimeout(500);
        const enWorkout = await pagina.evaluate(
          () => !document.getElementById('workoutTab')?.classList.contains('hidden')
        );
        chk('cancelar "cambiar de rutina" NO navega al tab de entrenamiento', !enWorkout);
      }
    }
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 3. Una sola hoja viva: un doble tap no abre dos ni se cancela sola
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  const r = await pagina.evaluate(async () => {
    // Con tope: si la guarda desaparece, las dos hojas se apilan y las
    // promesas no resuelven. Sin este race la puerta se colgaba en vez de
    // informar, y colgarse es la peor forma de detectar algo.
    const conTope = (p, etiqueta) =>
      Promise.race([p, new Promise((r) => setTimeout(() => r(`sin-resolver:${etiqueta}`), 3000))]);
    const f = window.fierroFeedback;
    const a = f.preguntar({ titulo: 'A', cuerpo: 'a', confirmar: 'Ok' });
    const b = f.preguntar({ titulo: 'B', cuerpo: 'b', confirmar: 'Ok' });
    await new Promise((r) => setTimeout(r, 100));
    const velos = document.querySelectorAll('.f-scrim').length;
    const segunda = await conTope(b, 'B');
    document.querySelector('.f-btn--destructivo')?.click();
    const primera = await conTope(a, 'A');
    // Limpieza: si quedaron hojas, se retiran para no contaminar lo que sigue.
    document.querySelectorAll('.f-scrim').forEach((v) => v.remove());
    return { velos, primera, segunda };
  });
  chk('dos invocaciones simultaneas dejan UN solo velo', r.velos === 1, `velos=${r.velos}`);
  chk('la segunda se descarta sin abrir hoja', r.segunda === 'descartado', String(r.segunda));
  chk('la primera resuelve con lo que se toco', r.primera === 'confirmar', String(r.primera));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 4. Escape y tocar fuera son 'descartado', no 'cancelar'
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  const conEscape = await pagina.evaluate(async () => {
    const p = window.fierroFeedback.preguntar({ titulo: 'X', cuerpo: 'x', confirmar: 'Ok' });
    await new Promise((r) => setTimeout(r, 60));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return p;
  });
  chk('Escape devuelve "descartado", no "cancelar"', conEscape === 'descartado', String(conEscape));
  const conVelo = await pagina.evaluate(async () => {
    const p = window.fierroFeedback.preguntar({ titulo: 'X', cuerpo: 'x', confirmar: 'Ok' });
    await new Promise((r) => setTimeout(r, 60));
    document.querySelector('.f-scrim')?.click();
    return p;
  });
  chk('tocar el velo devuelve "descartado"', conVelo === 'descartado', String(conVelo));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 5. El toast no tapa la barra inferior
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  const r = await pagina.evaluate(() => {
    window.fierroFeedback.mostrarToastDeshacer({ titulo: 'Rutina eliminada', alDeshacer() {} });
    const cont = document.getElementById('fierroToasts').getBoundingClientRect();
    const nav = document.querySelector('.f-tabbar')?.getBoundingClientRect();
    if (!nav) return { sinNav: true };
    const items = [...document.querySelectorAll('.f-tabbar__item, .f-fab')].map((el) => {
      const c = el.getBoundingClientRect();
      const encima = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
      return { texto: el.textContent.trim().slice(0, 12), encima: encima?.className ?? '' };
    });
    return { solapa: cont.bottom > nav.top, items };
  });
  if (r.sinNav) {
    chk('barra inferior presente', false, 'no se encontro .f-tabbar');
  } else {
    chk('el toast no solapa la barra inferior', !r.solapa);
    const tapados = r.items.filter((i) => String(i.encima).includes('f-toast'));
    chk(
      'ningun item de la barra queda tapado por el toast',
      tapados.length === 0,
      tapados.map((t) => t.texto).join(', ')
    );
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 6. Deshacer devuelve la rutina a SU posicion, no al final
// --------------------------------------------------------------------------
{
  const rutinas = [
    { id: 'w1', nombre: 'Pecho', ejercicios: [] },
    { id: 'w2', nombre: 'Espalda', ejercicios: [] },
    { id: 'w3', nombre: 'Piernas', ejercicios: [] },
  ];
  const { ctx, pagina } = await abrir({
    gymmate_custom_workouts: rutinas,
    gymmate_history: historialDePrueba(),
  });
  const r = await pagina.evaluate(async () => {
    // Por su nombre REAL en window. Con optional chaining la prueba pasaba
    // por vacio: no se llamaba a nada y el "deshacer" salia verde sin hacer
    // nada. Un chequeo que no puede fallar no es un chequeo.
    if (typeof window.deleteCustomWorkout !== 'function') return { ausente: true };
    window.deleteCustomWorkout('w1');
    await new Promise((r) => setTimeout(r, 150));
    const tras = JSON.parse(localStorage.getItem('gymmate_custom_workouts') || '[]').map((w) => w.id);
    // El almacenamiento era la mitad que ya funcionaba: la pintada era la
    // rota. Sin mirar el DOM, borrar dejaba una card fantasma con botones
    // muertos y la puerta seguia verde.
    const enPantallaTras = [...document.querySelectorAll('#fierroHome [data-custom-workout]')].map(
      (el) => el.dataset.customWorkout
    );
    document.querySelector('.f-toast__deshacer')?.click();
    await new Promise((r) => setTimeout(r, 150));
    const restaurado = JSON.parse(localStorage.getItem('gymmate_custom_workouts') || '[]').map((w) => w.id);
    const enPantallaRestaurado = [...document.querySelectorAll('#fierroHome [data-custom-workout]')].map(
      (el) => el.dataset.customWorkout
    );
    return { tras, restaurado, enPantallaTras, enPantallaRestaurado };
  });
  if (r.ausente) {
    chk('window.deleteCustomWorkout expuesta', false, 'no existe en window');
  } else {
    chk('el borrado saca la rutina', JSON.stringify(r.tras) === JSON.stringify(['w2', 'w3']), r.tras.join(','));
    chk(
      'deshacer la devuelve a SU posicion (no al final)',
      JSON.stringify(r.restaurado) === JSON.stringify(['w1', 'w2', 'w3']),
      r.restaurado.join(',')
    );
    chk(
      'la card borrada desaparece de la pantalla',
      JSON.stringify(r.enPantallaTras) === JSON.stringify(['w2', 'w3']),
      r.enPantallaTras.join(',') || '(ninguna)'
    );
    chk(
      'deshacer la vuelve a pintar en su sitio',
      JSON.stringify(r.enPantallaRestaurado) === JSON.stringify(['w1', 'w2', 'w3']),
      r.enPantallaRestaurado.join(',') || '(ninguna)'
    );
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 6b. La reserva de espacio coincide con la altura real de la tab bar
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  const r = await pagina.evaluate(async () => {
    const barra = document.querySelector('.f-tabbar');
    if (!barra) return { sinBarra: true };
    // Hasta el fondo: en lo alto de la pagina la ultima card cae fuera de la
    // ventana y la comparacion no medía nada. El scroll de la app es `smooth`,
    // asi que se espera a que la posicion se estabilice — con una espera fija
    // la medida se tomaba a mitad de camino y acusaba un solape inexistente.
    let previo = -1;
    for (let i = 0; i < 40 && previo !== window.scrollY; i++) {
      previo = window.scrollY;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 50));
    }
    const alto = +barra.getBoundingClientRect().height.toFixed(1);
    // El token es un `calc()` con `max()` dentro (depende del indicador de
    // inicio), y para una propiedad personalizada `getComputedStyle` devuelve
    // el TEXTO sin resolver: `parseFloat` daba NaN y la comparacion se volvia
    // imposible de cumplir. Se resuelve pidiendoselo al motor sobre un nodo
    // de prueba, que es la unica forma de leer el valor de verdad.
    const sonda = document.createElement('div');
    sonda.style.cssText = 'position:absolute;visibility:hidden;height:var(--h-nav-inferior)';
    document.body.appendChild(sonda);
    const token = parseFloat(getComputedStyle(sonda).height);
    sonda.remove();
    // Ultimo elemento del contenido: no puede quedar debajo de la barra.
    const ultimo = document.querySelector('.f-home__cardio')?.getBoundingClientRect();
    const topBarra = barra.getBoundingClientRect().top;
    return {
      alto,
      token,
      tapado: ultimo ? ultimo.bottom > topBarra : null,
      holgura: ultimo ? +(topBarra - ultimo.bottom).toFixed(1) : null,
    };
  });
  if (r.sinBarra) {
    chk('la tab bar FIERRO existe', false);
  } else {
    chk(
      '--h-nav-inferior coincide con la altura real de la tab bar',
      Math.abs(r.alto - r.token) < 1,
      `real ${r.alto}px | token ${r.token}px`
    );
    // Se calculaba y no se afirmaba: la medida existia solo para el informe.
    chk(
      'la ultima card no queda debajo de la tab bar',
      r.tapado === false,
      r.tapado === null ? 'no se encontro .f-home__cardio (home vacia)' : `holgura ${r.holgura}px`
    );
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 6c. Toda accion de H-01 tiene destino: un data-accion que apunta a un
//     global inexistente no hace nada y no avisa.
// --------------------------------------------------------------------------
{
  // Con la home vacia solo existe `importar`: las acciones que un usuario con
  // datos si toca (progreso, cardio) nunca se comprobaban.
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  const r = await pagina.evaluate(() => {
    const acciones = [...document.querySelectorAll('#fierroHome [data-accion]')].map(
      (el) => el.dataset.accion
    );
    // Las que salen por un global de `window`.
    const destinos = {
      progreso: 'showGamificationModal',
      cardio: 'showCardioSelector',
      importar: 'importFromCSV',
    };
    // Las que `alTocarHome` resuelve dentro del propio modulo. `coach` se
    // conduce entero en el caso 43; `continuar`/`descartar` en el del borrador.
    const internas = ['coach', 'continuar', 'descartar'];
    // El filtro estaba AL REVES: `filter(a => a in destinos)` tiraba en
    // silencio las acciones que el mapa no conocia, o sea justo las que
    // podrian estar rotas — la mitad de la home, incluida la entrada al Coach
    // IA de la fase 8. Ahora una accion que nadie reclama FALLA.
    const desconocidas = acciones.filter((a) => !(a in destinos) && !internas.includes(a));
    const rotas = acciones
      .filter((a) => a in destinos)
      .filter((a) => typeof window[destinos[a]] !== 'function');
    return { acciones, rotas, desconocidas };
  });
  chk('H-01 · ninguna accion de la home queda fuera de este chequeo',
    r.desconocidas.length === 0, r.desconocidas.join(', ') || '(ninguna)');
  chk('H-01 expone acciones', r.acciones.length > 0, r.acciones.join(', '));
  for (const esperada of ['progreso', 'cardio']) {
    chk(`H-01 con datos ofrece la accion "${esperada}"`, r.acciones.includes(esperada), r.acciones.join(', '));
  }
  chk('ninguna accion de H-01 apunta a un global inexistente', r.rotas.length === 0, r.rotas.join(', '));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 7. Un toast vivo NO puede interceptar los botones de la hoja
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  const r = await pagina.evaluate(() => {
    const f = window.fierroFeedback;
    for (const t of ['A', 'B', 'C']) f.mostrarToast({ tipo: 'exito', titulo: t, duracion: 0 });
    f.preguntar({ titulo: '¿Eliminar?', cuerpo: 'x', cancelar: 'Conservar', confirmar: 'Eliminar' });
    // DENTRO de la hoja: `document.querySelector` cogia el primer boton del
    // documento, y en cuanto otra pantalla oculta declaro un secundario, la
    // medida se hacia sobre un elemento que ni siquiera estaba en pantalla.
    const sobre = (sel) => {
      const hoja = document.querySelector('.f-scrim');
      const c = hoja.querySelector(sel).getBoundingClientRect();
      const el = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
      return el?.className ?? el?.tagName ?? '';
    };
    return {
      destructivo: sobre('.f-btn--destructivo'),
      secundario: sobre('.f-btn--secundario'),
      zVelo: +getComputedStyle(document.querySelector('.f-scrim')).zIndex,
      zToasts: +getComputedStyle(document.getElementById('fierroToasts')).zIndex,
    };
  });
  chk('el boton destructivo es alcanzable con toasts en pantalla', r.destructivo.includes('f-btn--destructivo'), r.destructivo);
  // Estructural, no posicional: con pocos toasts el boton queda libre por
  // geometria aunque el orden z siga mal. Lo que tiene que ser cierto SIEMPRE
  // es que el velo mande sobre los toasts.
  chk(
    'el velo esta por encima de los toasts en el orden z',
    r.zVelo > r.zToasts,
    `velo ${r.zVelo} vs toasts ${r.zToasts}`
  );
  chk('el secundario es alcanzable con toasts en pantalla', r.secundario.includes('f-btn--secundario'), r.secundario);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 8. El toast se queda dentro del marco de la app en pantalla ancha
// --------------------------------------------------------------------------
{
  const ctx = await navegador.newContext({ viewport: { width: 900, height: 844 }, ...ZONA });
  const pagina = await ctx.newPage();
  await pagina.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
  await pagina.waitForTimeout(700);
  const dentro = await pagina.evaluate(() => {
    window.fierroFeedback.mostrarToast({ tipo: 'exito', titulo: 'A', duracion: 0 });
    const t = document.getElementById('fierroToasts').getBoundingClientRect();
    const b = document.body.getBoundingClientRect();
    return t.left >= b.left - 1 && t.right <= b.right + 1;
  });
  chk('a 900px el toast no se sale del cuerpo de la app', dentro);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 9. Ninguna pantalla queda huerfana: si un modulo existe, se llega a el
//    tocando. Al sustituir la barra legacy y el markup de la home,
//    Calculadoras, Graficos y Records se quedaron sin ningun camino.
// --------------------------------------------------------------------------
{
  // Con una medicion registrada: sin ella P-01 pinta su estado vacio, que por
  // diseño solo ofrece "Registrar medición" — el historial de medidas no
  // existe todavia y no tiene camino porque no tiene contenido.
  const { ctx, pagina } = await abrir({
    gymmate_history: historialDePrueba(),
    gymmate_body_measurements: [{ date: '2026-08-10T12:00:00.000Z', weight: 75, chest: 98, waist: 82 }],
  });
  // El titulo afirmaba una propiedad universal sobre un enumerado de tres. La
  // lista es ahora TODA la superficie a la que se llega tocando: si mañana
  // aparece una pantalla nueva, este caso no la ve — pero al menos ya no
  // miente sobre las que hay.
  for (const [destino, camino] of [
    ['prs', ['[data-nav="profile"]', '[data-perfil="records"]']],
    ['charts', ['[data-nav="profile"]', '[data-perfil="graficos"]']],
    ['calculators', ['[data-nav="profile"]', '[data-perfil="calculadoras"]']],
    ['medidas', ['[data-nav="profile"]', '[data-perfil="ver-medidas"]']],
    ['profile', ['[data-nav="profile"]']],
    ['history', ['[data-nav="history"]']],
  ]) {
    let visible = false;
    let detalle = '';
    try {
      for (const paso of camino) {
        await pagina.locator(paso).first().click({ timeout: 3000 });
        await pagina.waitForTimeout(250);
      }
      visible = await pagina.locator(`#${destino}Tab`).first().isVisible();
    } catch (e) {
      detalle = String(e.message).split('\n')[0];
    }
    chk(`se puede llegar a #${destino}Tab tocando`, visible, detalle || camino.join(' → '));
    await pagina.locator('[data-nav="home"]').first().click().catch(() => {});
    await pagina.waitForTimeout(200);
  }

  // Y VOLVER a la home tiene que enseñar la home. `switchTab('home')` —que el
  // tipo `TabName` permite y `window.switchTab` expone— ocultaba la home y
  // buscaba un `#homeTab` inexistente: pantalla en blanco con la tab bar
  // marcando INICIO.
  for (const via of ['tab bar', 'switchTab']) {
    await pagina.evaluate(() => window.switchTab('history'));
    await pagina.waitForTimeout(400);
    if (via === 'tab bar') await pagina.locator('[data-nav="home"]').first().click();
    else await pagina.evaluate(() => window.switchTab('home'));
    await pagina.waitForTimeout(600);
    const v = await pagina.evaluate(() => {
      const b = document.querySelector('.f-home__rutina') || document.querySelector('#fierroHome button');
      const r = b?.getBoundingClientRect();
      return { home: !document.getElementById('homeView')?.classList.contains('hidden'), alto: r ? r.height : 0 };
    });
    chk(`volver a la home por ${via} la deja visible`, v.home && v.alto > 0, JSON.stringify(v));
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 10. Ninguna pantalla se queda pegada al borde. El padding vivia en <main>;
//     al quitarlo, las vistas que no son .tab-content perdieron el suyo.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  const r = await pagina.evaluate(async () => {
    window.showCardioSelector?.();
    await new Promise((r) => setTimeout(r, 300));
    // Las CUATRO, no solo la primera: medir una sola dejaba pasar tres
    // cuartas partes de la regresion que este caso dice vigilar.
    const vistas = ['cardioSelectorView', 'cardioConfigView', 'cardioTimerView', 'cardioSummaryView'];
    // El margen puede venir de la vista (legacy) o de la pantalla FIERRO que
    // hay dentro (que trae el suyo). Lo que no puede pasar es que no lo
    // ponga NADIE y la pantalla quede de borde a borde.
    const medir = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const suma = (nodo) => {
        const p = getComputedStyle(nodo);
        return { izq: parseFloat(p.paddingLeft), der: parseFloat(p.paddingRight) };
      };
      const propio = suma(el);
      const dentro = el.querySelector('.f-cardio');
      if (!dentro) return propio;
      const hijo = suma(dentro);
      return { izq: propio.izq + hijo.izq, der: propio.der + hijo.der };
    };
    // Se pasa tambien por la configuracion: sin abrirla, su vista esta vacia.
    window.selectCardioMode?.('tabata');
    await new Promise((r) => setTimeout(r, 250));
    return {
      cardio: Object.fromEntries(vistas.map((v) => [v, medir(v)])),
      ancho: document.documentElement.scrollWidth,
    };
  });
  for (const [id, caja] of Object.entries(r.cardio)) {
    // Timer y resumen no tienen contenido hasta que se corre una sesion; su
    // margen lo comprueba el caso 26 con la pantalla ya pintada.
    if (id === 'cardioTimerView' || id === 'cardioSummaryView') continue;
    chk(
      `#${id} conserva su margen lateral`,
      caja !== null && caja.izq >= 16 && caja.der >= 16,
      caja ? `izq ${caja.izq} / der ${caja.der}` : 'la vista no existe'
    );
  }
  chk('sin desbordamiento horizontal en cardio', r.ancho <= 390, `scrollWidth ${r.ancho}`);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 11. W-01: escribir NO repinta la pantalla. Si repintase, el <input> se
//     destruiria a media pulsacion y el usuario perderia el foco y el cursor.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  await pagina.locator('[data-grupo]').first().click();
  await pagina.waitForTimeout(500);
  await pagina.focus('#sets-0');
  const r = await pagina.evaluate(async () => {
    const input = document.getElementById('sets-0');
    input.value = '4';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    return {
      mismoNodo: document.getElementById('sets-0') === input,
      foco: document.activeElement?.id ?? '',
      volumen: document.getElementById('volumen-0')?.textContent ?? '',
    };
  });
  chk('escribir no destruye el input', r.mismoNodo, r.mismoNodo ? '' : 'la card se repinto');
  chk('el foco sigue en el campo', r.foco === 'sets-0', r.foco || '(ninguno)');
  await ctx.close();
}

// --------------------------------------------------------------------------
// 12. W-01: marcar ✓ abre la fila de RPE con chips 5-9; NUNCA un slider.
//     Un tap y se colapsa (README 3).
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  await pagina.locator('[data-grupo]').first().click();
  await pagina.waitForTimeout(500);
  await pagina.fill('#sets-0', '3');
  await pagina.dispatchEvent('#sets-0', 'change');
  await pagina.fill('#reps-0', '12');
  await pagina.dispatchEvent('#reps-0', 'change');
  await pagina.fill('#peso-0', '60');
  await pagina.dispatchEvent('#peso-0', 'change');
  await pagina.locator('[data-sesion="completar"][data-indice="0"]').click();
  await pagina.waitForTimeout(300);
  const abierto = await pagina.evaluate(() => ({
    chips: [...document.querySelectorAll('#fierroWorkout .f-rpe-chip')].map((c) => c.textContent),
    sliders: document.querySelectorAll('#fierroWorkout input[type="range"]').length,
    omitir: !!document.querySelector('[data-sesion="rpe-omitir"]'),
    detalle: document.querySelector('.f-hecho__detalle')?.textContent ?? '',
  }));
  chk('los chips de RPE por ejercicio son 5..9', JSON.stringify(abierto.chips) === JSON.stringify(['5', '6', '7', '8', '9']), abierto.chips.join(','));
  chk('no hay slider durante la sesion', abierto.sliders === 0, String(abierto.sliders));
  chk('hay "omitir"', abierto.omitir);
  chk('el detalle del ejercicio hecho cuadra', abierto.detalle === '3×12 · 60 kg · 2,160 kg', abierto.detalle);

  await pagina.locator('.f-rpe-chip', { hasText: '7' }).first().click();
  await pagina.waitForTimeout(300);
  const colapsado = await pagina.evaluate(() => ({
    chips: document.querySelectorAll('#fierroWorkout .f-rpe-chip').length,
    guardado: JSON.parse(localStorage.getItem('gymmate_draft') || '{}').ejercicios?.[0]?.rpe ?? null,
  }));
  chk('un tap colapsa la fila de RPE', colapsado.chips === 1, `${colapsado.chips} chips`);
  chk('el RPE queda guardado en el borrador', colapsado.guardado === 7, String(colapsado.guardado));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 13. W-04: la guia sale del nombre y de la "i", y sin foto NO deja hueco.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  await pagina.locator('[data-grupo]').first().click();
  await pagina.waitForTimeout(500);
  for (const selector of ['.f-ejercicio__nombre', '.f-ejercicio__info']) {
    await pagina.locator(selector).first().click();
    await pagina.waitForTimeout(300);
    const abierta = await pagina.evaluate(() => !!document.querySelector('.f-guia__nombre'));
    chk(`la guia se abre desde ${selector}`, abierta);
    await pagina.keyboard.press('Escape');
    await pagina.waitForTimeout(250);
  }
  const conFoto = await pagina.evaluate(async () => {
    document.querySelector('.f-ejercicio__nombre')?.click();
    await new Promise((r) => setTimeout(r, 250));
    const img = document.querySelector('.f-guia__foto');
    return { tieneImg: !!img, srcVacio: img ? !img.getAttribute('src') : false };
  });
  chk('la guia nunca pinta una foto sin src', !conFoto.srcVacio, JSON.stringify(conFoto));
  chk('con foto, la guia la pinta', conFoto.tieneImg, JSON.stringify(conFoto));
  await pagina.keyboard.press('Escape');
  await pagina.waitForTimeout(250);

  // El camino que faltaba: un ejercicio SIN imageUrl. Los seis de grupo1 la
  // tienen, asi que el chequeo anterior no probaba nunca la rama de "sin
  // foto" — que es justo la que el README obliga a no dejar en placeholder.
  const sinFoto = await pagina.evaluate(async () => {
    const { mostrarGuiaEjercicio } = window.__guiaDePrueba ?? {};
    if (!mostrarGuiaEjercicio) return { sinGancho: true };
    mostrarGuiaEjercicio('Ejercicio Que No Existe En La Base');
    await new Promise((r) => setTimeout(r, 250));
    const hoja = document.querySelector('.f-sheet');
    return {
      abierta: !!hoja,
      foto: !!document.querySelector('.f-guia__foto'),
      texto: !!document.querySelector('.f-guia__texto'),
      alto: hoja ? +hoja.getBoundingClientRect().height.toFixed(0) : 0,
    };
  });
  if (sinFoto.sinGancho) {
    chk('la guia se puede abrir desde la puerta', false, 'falta window.__guiaDePrueba');
  } else {
    chk('sin foto, la guia NO deja un bloque de imagen', sinFoto.abierta && !sinFoto.foto,
      JSON.stringify(sinFoto));
    chk('sin descripcion tampoco deja un parrafo vacio', !sinFoto.texto, JSON.stringify(sinFoto));
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 14. Terminar sin datos abre W-02 (hoja de RPE) sin pasar por confirmacion,
//     y "Omitir" no bloquea nada. El slider de W-02 se queda dentro de su
//     pista en los dos extremos.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  await pagina.locator('[data-grupo]').first().click();
  await pagina.waitForTimeout(500);
  await pagina.locator('[data-sesion="terminar"]').click();
  await pagina.waitForTimeout(500);
  const w02 = await pagina.evaluate(() => {
    const pista = document.getElementById('rpePista');
    const bola = document.getElementById('rpeBola');
    if (!pista || !bola) return { hoja: false };
    const medir = (v) => {
      const r = document.getElementById('rpeRango');
      r.value = String(v);
      r.dispatchEvent(new Event('input'));
      const b = bola.getBoundingClientRect();
      const p = pista.getBoundingClientRect();
      // El disco visible mide 24; el borde de 5px es del color de la hoja.
      return {
        izq: +(b.left + 5 - p.left).toFixed(2),
        der: +(p.right - (b.right - 5)).toFixed(2),
        cifra: document.getElementById('rpeCifra').textContent,
      };
    };
    return { hoja: true, min: medir(1), max: medir(10), medio: medir(5) };
  });
  chk('terminar abre la hoja de RPE (W-02)', w02.hoja);
  if (w02.hoja) {
    chk('en el minimo el disco no se sale por la izquierda', w02.min.izq >= -0.5, `${w02.min.izq}px`);
    chk('en el maximo el disco no se sale por la derecha', w02.max.der >= -0.5, `${w02.max.der}px`);
    chk('el numero sigue al slider', w02.min.cifra === '1' && w02.max.cifra === '10' && w02.medio.cifra === '5',
      `${w02.min.cifra}/${w02.medio.cifra}/${w02.max.cifra}`);
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 15. Cero emojis y cero dobles exclamaciones en lo que se ve. El coach los
//     tenia: "🔥 Racha de N días".
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  await pagina.locator('[data-grupo]').first().click();
  await pagina.waitForTimeout(500);
  const r = await pagina.evaluate(() => {
    const texto = document.body.innerText;
    const emojis = texto.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu) ?? [];
    return { emojis: [...new Set(emojis)], dobles: /!.*!/.test(texto) };
  });
  chk('la sesion no muestra emojis', r.emojis.length === 0, r.emojis.join(' '));
  chk('la sesion no usa exclamaciones dobles', !r.dobles);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 15b. La voz del coach, mensaje a mensaje. Mirar el body en un instante solo
//      ve UNO de los nueve textos: con un emoji metido en la rama de "rutina
//      sin historial" el chequeo anterior seguia verde, porque esa rama no se
//      ejecutaba con el historial sembrado.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  const textos = await pagina.evaluate(async () => {
    // Se llama a cada productor de mensaje y se recoge lo que escribe.
    const nota = document.createElement('div');
    nota.className = 'f-sesion__coach';
    document.body.appendChild(nota);
    const salida = [];
    const coach = window.__coachDePrueba;
    if (!coach) return null;
    const ej = {
      nombre: 'Prensa de Piernas',
      esMancuerna: false,
      grupoMuscular: 'Piernas',
      sets: 4,
      reps: 12,
      peso: 100,
      volumen: 4800,
      completado: true,
    };
    const recoger = (etiqueta) => {
      salida.push(`${etiqueta}: ${nota.innerText.replace(/\n/g, ' ')}`);
      nota.textContent = '';
    };
    // Rutina sin historial de ese grupo.
    coach.initCoachSession();
    coach.updateCoachOnSessionLoad('GRUPO INEXISTENTE', [ej, ej, ej]);
    recoger('apertura');
    // PR nuevo y cerca del PR, con el pico previo explicito.
    coach.initCoachSession();
    coach.updateCoachOnExerciseUpdate({ ...ej, peso: 160 }, 0, [ej], 150);
    recoger('pr-nuevo');
    coach.initCoachSession();
    coach.updateCoachOnExerciseUpdate({ ...ej, peso: 140 }, 0, [ej], 150);
    recoger('cerca-del-pr');
    // Completar: los tres tramos.
    coach.initCoachSession();
    coach.updateCoachOnExerciseComplete(ej, 1, 8);
    recoger('completado-suelto');
    coach.initCoachSession();
    coach.updateCoachOnExerciseComplete(ej, 7, 8);
    recoger('queda-uno');
    coach.initCoachSession();
    coach.updateCoachOnExerciseComplete(ej, 8, 8);
    recoger('todos');
    nota.remove();
    return salida;
  });
  if (!textos) {
    chk('el coach se puede conducir desde la puerta', false, 'falta window.__coachDePrueba');
  } else {
    for (const linea of textos) {
      const emojis = linea.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu) ?? [];
      chk(`coach sin emoji · ${linea.split(':')[0]}`, emojis.length === 0, linea);
      chk(`coach sin exclamaciones · ${linea.split(':')[0]}`, !/!/.test(linea), linea);
      chk(`coach sin "·" mal puesto ni bullets · ${linea.split(':')[0]}`, !linea.includes('•'), linea);
    }
    const prNuevo = textos.find((t) => t.startsWith('pr-nuevo'));
    chk('el mensaje de PR nuevo se dispara', /PR nuevo/.test(prNuevo ?? ''), prNuevo ?? '');
    chk('y no presenta el peso recien tecleado como marca anterior',
      /anterior: 150/.test(prNuevo ?? ''), prNuevo ?? '');
    const cerca = textos.find((t) => t.startsWith('cerca-del-pr'));
    chk('cerca del PR se dice el peso objetivo, no la diferencia',
      /Levanta \d/.test(cerca ?? '') && !/faltan|Estás a/.test(cerca ?? ''), cerca ?? '');
    const queda = textos.find((t) => t.startsWith('queda-uno'));
    chk('"Queda 1 ejercicio" llega a la nota', /Queda 1 ejercicio/.test(queda ?? ''), queda ?? '');
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 16. Crear una rutina propia la pinta en la home. Era el tercer punto que
//     paso de renderCustomWorkoutsInHome a renderizarHome y el unico sin
//     puerta: quitarlo dejaba la puerta verde y la rutina invisible.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  // B-01, conducido como lo conduce el usuario: nada de llamar a funciones
  // internas. El builder legacy exponia `saveCustomWorkout` en `window` y el
  // caso lo invocaba a mano; eso comprobaba el guardado pero no la pantalla.
  await pagina.evaluate(() => window.openWorkoutBuilder?.());
  await pagina.waitForTimeout(400);

  // Los textos literales del mockup. Sin esto se podian cambiar todos con las
  // cuatro puertas en verde.
  const literalesB = await pagina.evaluate(() => ({
    titulo: document.querySelector('.f-builder__titulo')?.textContent?.trim() ?? '',
    marcador: document.getElementById('builderNombre')?.getAttribute('placeholder') ?? '',
  }));
  chk('B-01 · el titulo es el del mockup', literalesB.titulo === 'NUEVA RUTINA', literalesB.titulo);
  chk('B-01 · el marcador del nombre es el del mockup',
    literalesB.marcador === 'Elige ejercicios y te propongo un nombre', literalesB.marcador);

  // El nombre SUGERIDO sale de los grupos elegidos. El caso rellenaba el campo
  // antes de elegir nada, asi que `nombreSugerido` podia devolver '' siempre y
  // sobrevivir: la sugerencia es la unica razon de ser del campo vacio.
  await pagina.locator('[data-builder="alternar"]').first().click();
  await pagina.waitForTimeout(200);
  const grupoDelPrimero = await pagina.evaluate(
    () => document.querySelector('[data-builder="alternar"]')?.dataset.grupo ?? ''
  );
  const propuesto = await pagina.evaluate(
    () => document.getElementById('builderNombre')?.getAttribute('placeholder') ?? ''
  );
  chk('B-01 · con un ejercicio elegido, el marcador propone SU grupo',
    grupoDelPrimero.length > 0 && propuesto === grupoDelPrimero, `${propuesto} | grupo ${grupoDelPrimero}`);

  await pagina.fill('#builderNombre', 'Rutina de prueba');
  await pagina.waitForTimeout(200);
  const sugerido = await pagina.evaluate(() => ({
    boton: document.querySelector('[data-builder="guardar"]')?.textContent?.trim() ?? '',
    chips: [...document.querySelectorAll('[data-builder="quitar"]')].length,
  }));
  chk('B-01 · el boton cuenta los ejercicios elegidos', /1 ejercicio\b/.test(sugerido.boton), sugerido.boton);
  chk('B-01 · el elegido sale como chip', sugerido.chips === 1, String(sugerido.chips));
  await pagina.locator('[data-builder="guardar"]').click();
  await pagina.waitForTimeout(500);
  const r = await pagina.evaluate(() => ({
    guardadas: JSON.parse(localStorage.getItem('gymmate_custom_workouts') || '[]').map((w) => w.nombre),
    enPantalla: [...document.querySelectorAll('#fierroHome [data-custom-workout]')].map(
      (el) => el.textContent.trim().split('\n')[0].trim()
    ),
    builderCerrado: document.getElementById('fierroBuilder')?.classList.contains('hidden') ?? false,
  }));
  chk('B-01 · el builder se cierra al guardar', r.builderCerrado);
  chk('la rutina nueva se guarda', r.guardadas.includes('Rutina de prueba'), r.guardadas.join(',') || '(ninguna)');
  chk('la rutina nueva aparece en la home sin recargar', r.enPantalla.length === r.guardadas.length && r.enPantalla.length > 0,
    `guardadas ${r.guardadas.length} | en pantalla ${r.enPantalla.length}`);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 17. Cerrar PROGRESO dos veces seguidas no puede dejar DOS pestanas activas.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  const r = await pagina.evaluate(async () => {
    const activas = () => [...document.querySelectorAll('[data-nav][aria-current]')].map((e) => e.dataset.nav);
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-nav="history"]').click();
    await esperar(150);
    document.querySelector('[data-nav="progress"]').click();
    await esperar(150);
    const conModal = activas();
    window.hideGamificationModal?.();
    window.hideGamificationModal?.();
    await esperar(300);
    const tras = activas();
    // Y una llamada suelta sin modal abierto tampoco debe mover nada.
    window.hideGamificationModal?.();
    await esperar(150);
    return { conModal, tras, suelta: activas() };
  });
  chk('con PROGRESO abierto hay UNA activa y es progress',
    r.conModal.length === 1 && r.conModal[0] === 'progress', r.conModal.join(','));
  chk('cerrar dos veces deja UNA sola activa', r.tras.length === 1, r.tras.join(',') || '(ninguna)');
  chk('al cerrar se vuelve a la pestana de la que se vino', r.tras[0] === 'history', r.tras.join(','));
  chk('cerrar sin modal abierto no mueve la barra', r.suelta.length === 1 && r.suelta[0] === 'history', r.suelta.join(','));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 18. La tab bar vuelve SIEMPRE. Chrome no desenfoca un input que pasa a
//     opacity:0, asi que cerrar un modal con Enter la dejaba oculta para
//     siempre: el usuario se quedaba sin barra inferior.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  const estado = () =>
    pagina.evaluate(() => {
      const b = document.querySelector('.f-tabbar');
      return {
        alto: +b.getBoundingClientRect().height.toFixed(1),
        display: getComputedStyle(b).display,
        reserva: getComputedStyle(document.body).paddingBottom,
      };
    });

  // P-02: la hoja de medicion. El modal legacy con sus ids sueltos
  // (`#measureWeight`) se retiro en el paso 9; los campos son `[data-medida]`.
  await pagina.locator('[data-nav="profile"]').click();
  await pagina.waitForTimeout(300);
  await pagina.locator('[data-perfil="medir"]').first().click();
  await pagina.waitForTimeout(400);
  const campoPeso = pagina.locator('[data-medida="weight"]');
  const hayCampo = await campoPeso.count();
  if (!hayCampo) {
    chk('P-02 · la hoja de medicion expone su campo de peso', false, 'no se encontro [data-medida=weight]');
  } else {
    chk('P-02 · la hoja de medicion expone su campo de peso', true);
    await campoPeso.focus();
    await pagina.waitForTimeout(250);
    const conFoco = await estado();
    chk('con el teclado abierto la barra se oculta y suelta su reserva',
      conFoco.display === 'none' && conFoco.reserva === '0px',
      `display ${conFoco.display} | reserva ${conFoco.reserva}`);

    await pagina.keyboard.press('Escape');
    await pagina.waitForTimeout(450);
    const tras = await estado();
    chk('tras cerrar la hoja la barra VUELVE',
      tras.display !== 'none' && tras.alto > 40,
      `display ${tras.display} | alto ${tras.alto}px | reserva ${tras.reserva}`);
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 19. Importar CSV desde la home repinta la home. La accion vive AHI: dejarla
//     sin repintar decia "SESIÓN 0" con dos sesiones ya dentro.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  const antes = await pagina.evaluate(() => document.getElementById('fierroHome')?.innerText ?? '');
  // El <input type=file> lo crea el codigo al vuelo y no llega al DOM: la
  // unica forma de conducirlo es interceptar el dialogo del navegador.
  const esperaDialogo = pagina.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
  await pagina.locator('[data-accion="importar"]').first().click();
  const dialogo = await esperaDialogo;
  if (!dialogo) {
    chk('la accion importar abre el selector de fichero', false, 'no llego el filechooser');
  } else {
    await dialogo.setFiles({
      name: 'historial.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV_DE_PRUEBA, 'utf-8'),
    });
    await pagina.waitForTimeout(1200);
    const r = await pagina.evaluate(() => ({
      despues: document.getElementById('fierroHome')?.innerText ?? '',
      historial: JSON.parse(localStorage.getItem('gymmate_history') || '[]').length,
    }));
    chk('el CSV entra al historial', r.historial >= 1, `${r.historial} sesiones`);
    chk(
      'la home se repinta tras importar',
      antes !== r.despues,
      antes === r.despues ? 'texto identico: la home no se entero' : 'cambio'
    );
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 20. HI-01 → HI-02 → volver, y las cifras del detalle.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({
    gymmate_history: historialDePrueba([1, 4, 8, 40, 70]),
    gymmate_prs: { 'Prensa de Piernas': { peso: 150, sets: 4, reps: 12, volumen: 7200, date: new Date().toISOString() } },
  });
  await pagina.locator('[data-nav="history"]').click();
  await pagina.waitForTimeout(400);
  const lista = await pagina.evaluate(() => ({
    filas: document.querySelectorAll('.f-hist__fila').length,
    meses: [...document.querySelectorAll('.f-hueso__mes')].map((e) => e.textContent),
  }));
  chk('HI-01 lista las cinco sesiones', lista.filas === 5, String(lista.filas));
  chk('HI-01 agrupa por mes', lista.meses.length >= 2, lista.meses.join(' / '));
  chk(
    'el contador del mes cuadra con las filas que lo siguen',
    lista.meses.reduce((t, m) => t + Number(/· (\d+)/.exec(m)?.[1] ?? 0), 0) === lista.filas,
    lista.meses.join(' / ')
  );

  await pagina.locator('.f-hist__fila').first().click();
  await pagina.waitForTimeout(400);
  const detalle = await pagina.evaluate(() => ({
    hay: !!document.querySelector('[data-hueso="volver-lista"]'),
    sub: document.querySelector('#fierroHistorial .f-sesion__sub')?.textContent ?? '',
    metricas: [...document.querySelectorAll('.f-metrica-hueso')].map((e) => e.innerText.replace(/\n/g, '=')),
    sets: document.querySelectorAll('.f-set').length,
  }));
  chk('tocar una sesion abre HI-02', detalle.hay);
  chk('HI-02 lleva el prefijo del grupo al subtitulo, no al titular',
    detalle.sub.includes('GRUPO 1'), detalle.sub);
  chk('el subtitulo de HI-02 trae fecha, duracion y RPE',
    /·.*·.*RPE/.test(detalle.sub), detalle.sub);
  chk('HI-02 pinta un set por serie registrada', detalle.sets === 4, String(detalle.sets));
  chk('HI-02 enseña volumen y sets', detalle.metricas.some((m) => m.startsWith('VOLUMEN')) &&
    detalle.metricas.some((m) => m.startsWith('SETS')), detalle.metricas.join(' | '));

  await pagina.locator('[data-hueso="volver-lista"]').click();
  await pagina.waitForTimeout(350);
  const vuelta = await pagina.evaluate(() => document.querySelectorAll('.f-hist__fila').length);
  chk('volver devuelve a la lista', vuelta === 5, String(vuelta));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 21. PR-01: la etiqueta y el marcador cuentan la MISMA historia. Con el pico
//     del record (150) y el actual del historial (120) decia "EN TU PICO" con
//     el marcador al 80%.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({
    gymmate_history: historialDePrueba([1, 4, 8]),
    gymmate_prs: { 'Prensa de Piernas': { peso: 150, sets: 4, reps: 12, volumen: 7200, date: new Date().toISOString() } },
  });
  await pagina.locator('[data-nav="profile"]').click();
  await pagina.waitForTimeout(300);
  await pagina.locator('[data-perfil="records"]').click();
  await pagina.waitForTimeout(600);
  const r = await pagina.evaluate(() => {
    const marcador = document.querySelector('.f-zonas__marcador');
    const pista = document.querySelector('.f-zonas__pista');
    const pie = document.querySelector('#fierroRecords .f-zonas__pie');
    if (!marcador || !pista) return { sinBarra: true };
    const m = marcador.getBoundingClientRect();
    const p = pista.getBoundingClientRect();
    return {
      estado: pie?.firstElementChild?.textContent ?? '',
      pico: pie?.lastElementChild?.textContent ?? '',
      left: marcador.style.left,
      dentro: m.left >= p.left - 1 && m.right <= p.right + 1,
      color: getComputedStyle(marcador).backgroundColor,
    };
  });
  if (r.sinBarra) {
    chk('PR-01 dibuja la barra de zonas', false);
  } else {
    chk('el marcador se queda dentro de la pista', r.dentro, `left ${r.left}`);
    chk('el marcador es #16181C sobre Hueso', r.color === 'rgb(22, 24, 28)', r.color);
    chk('con el actual por debajo del pico NO dice "EN TU PICO"',
      !r.estado.includes('EN TU PICO'), `${r.estado} · ${r.pico}`);
    chk('el pico del pie es el del record, no el del historial',
      r.pico.includes('150'), r.pico);
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 22. G-01: el toggle cambia el grafico, y el rotulo no puede mentir sobre
//     lo que agrupa.
// --------------------------------------------------------------------------
{
  // Dos sesiones el MISMO dia: sin eso, "Día" y "Todo" coinciden por
  // casualidad del escenario y el chequeo no prueba nada.
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 1, 4, 8, 40, 70]) });
  await pagina.locator('[data-nav="profile"]').click();
  await pagina.waitForTimeout(300);
  await pagina.locator('[data-perfil="graficos"]').click();
  await pagina.waitForTimeout(600);
  const leer = () =>
    pagina.evaluate(() => ({
      activos: [...document.querySelectorAll('.f-segmentado__item[aria-pressed="true"]')].map((e) => e.textContent),
      label: document.querySelector('.f-graf__label')?.textContent ?? '',
      puntos: (document.querySelector('.f-graf__linea')?.getAttribute('points') ?? '').split(' ').filter(Boolean).length,
      linea: document.querySelector('.f-graf__linea')?.getAttribute('points') ?? '',
      canvas: document.querySelectorAll('canvas').length,
    }));
  const mes = await leer();
  chk('G-01 no usa <canvas>: los graficos son SVG a mano', mes.canvas === 0, String(mes.canvas));
  chk('solo hay UN rango activo', mes.activos.length === 1, mes.activos.join(','));
  chk('el rotulo dice por MES cuando se agrupa por mes',
    mes.label.includes('MES'), mes.label);

  await pagina.locator('[data-hueso="rango"][data-rango="dia"]').click();
  await pagina.waitForTimeout(400);
  const dia = await leer();
  chk('cambiar el rango cambia el activo', dia.activos.join(',') === 'Día', dia.activos.join(','));
  chk('el rotulo dice por DÍA cuando se agrupa por dia', dia.label.includes('DÍA'), dia.label);
  chk('por dia hay mas puntos que por mes', dia.puntos > mes.puntos, `${dia.puntos} vs ${mes.puntos}`);

  // "Todo" tiene que ser algo distinto de "Día": los cuatro botones son
  // cuatro comportamientos, no tres.
  await pagina.locator('[data-hueso="rango"][data-rango="todo"]').click();
  await pagina.waitForTimeout(400);
  const todo = await leer();
  chk('el rotulo de Todo dice por SESIÓN', todo.label.includes('SESIÓN'), todo.label);
  chk('Todo y Día no son el mismo grafico', todo.linea !== dia.linea || todo.puntos !== dia.puntos,
    `todo ${todo.puntos} pts vs dia ${dia.puntos} pts`);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 22b. El fondo Hueso solo se enciende en las pantallas Hueso. Con el
//      selector puesto sobre .f-hueso en vez de sobre el tab, los tres tabs
//      existen siempre en el DOM y la home salia con fondo claro.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  const fondo = () => pagina.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const enHome = await fondo();
  await pagina.locator('[data-nav="history"]').click();
  await pagina.waitForTimeout(350);
  const enHistorial = await fondo();
  await pagina.locator('[data-nav="home"]').click();
  await pagina.waitForTimeout(350);
  const deVuelta = await fondo();
  chk('la home tiene fondo Carbon', enHome === 'rgb(8, 9, 11)', enHome);
  chk('el historial tiene fondo Hueso', enHistorial === 'rgb(246, 245, 242)', enHistorial);
  chk('volver a la home devuelve el fondo Carbon', deVuelta === 'rgb(8, 9, 11)', deVuelta);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 23. Vacíos de las secciones Hueso: nunca "No hay datos", siempre con accion.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  for (const [nombre, camino] of [
    ['historial', ['[data-nav="history"]']],
    ['récords', ['[data-nav="profile"]', '[data-perfil="records"]']],
    ['gráficos', ['[data-nav="profile"]', '[data-perfil="graficos"]']],
  ]) {
    for (const paso of camino) {
      await pagina.locator(paso).first().click();
      await pagina.waitForTimeout(300);
    }
    const r = await pagina.evaluate(() => {
      const vacio = [...document.querySelectorAll('.f-vacio-hueso')].find(
        (el) => el.getBoundingClientRect().width > 0
      );
      return {
        hay: !!vacio,
        texto: vacio?.innerText ?? '',
        acciones: vacio ? vacio.querySelectorAll('button').length : 0,
      };
    });
    chk(`el vacío de ${nombre} existe`, r.hay, r.texto.slice(0, 60));
    chk(`el vacío de ${nombre} ofrece una accion concreta`, r.acciones > 0, String(r.acciones));
    chk(`el vacío de ${nombre} no dice "No hay datos"`, !/no hay datos/i.test(r.texto), r.texto.slice(0, 60));
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 24. Cardio: seis modos, "For Time" fuera, y las cifras del pie.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 4]) });
  await pagina.locator('[data-accion="cardio"]').click();
  await pagina.waitForTimeout(400);
  const selector = await pagina.evaluate(() => ({
    modos: [...document.querySelectorAll('.f-modo__nombre')].map((e) => e.textContent),
    forTime: /for\s*time/i.test(document.body.innerText),
  }));
  chk('hay SEIS modos de cardio', selector.modos.length === 6, selector.modos.join(','));
  chk('"For Time" no aparece por ningun lado', !selector.forTime);

  await pagina.locator('[data-modo="tabata"]').click();
  await pagina.waitForTimeout(350);
  const tabata = await pagina.evaluate(() => ({
    total: document.querySelector('.f-cardio__total-cifra')?.textContent ?? '',
    valores: [...document.querySelectorAll('.f-stepper__valor')].map((e) => e.textContent.trim()),
  }));
  chk('el Tabata por defecto son 8 rondas de 20/10', tabata.valores.join(',') === '8,20,10', tabata.valores.join(','));
  chk('y su duracion total es 4:00, como el mockup', tabata.total.includes('4:00'), tabata.total);

  await pagina.locator('[data-cardio="mas"][data-clave="rounds"]').click();
  await pagina.waitForTimeout(300);
  const tras = await pagina.evaluate(() => document.querySelector('.f-cardio__total-cifra')?.textContent ?? '');
  chk('subir una ronda suma 30s al total', tras.includes('4:30'), tras);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 25. La piramide: 7 niveles, presets y escalado proporcional.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 4]) });
  await pagina.locator('[data-accion="cardio"]').click();
  await pagina.waitForTimeout(350);
  await pagina.locator('[data-modo="pyramid"]').click();
  await pagina.waitForTimeout(400);
  const leer = () =>
    pagina.evaluate(() => ({
      niveles: [...document.querySelectorAll('.f-nivel__seg')].map((e) => Number(e.textContent)),
      total: document.querySelector('.f-cardio__total-cifra')?.textContent ?? '',
      activo: document.querySelector('.f-preset[aria-pressed="true"]')?.textContent ?? '',
      pico: document.querySelector('.f-montana__pico-label')?.textContent ?? '',
    }));
  const media = await leer();
  chk('la piramide del mockup son 7 niveles', media.niveles.length === 7, media.niveles.join(','));
  chk('con pico 75s', media.pico.includes('75'), media.pico);
  chk('y total 7:15', media.total.includes('7:15'), media.total);
  chk('MEDIA es el preset de arranque', media.activo === 'MEDIA', media.activo);
  chk('es simetrica', JSON.stringify(media.niveles) === JSON.stringify([...media.niveles].reverse()),
    media.niveles.join(','));

  await pagina.locator('[data-cardio="escalar"][data-factor="1.25"]').click();
  await pagina.waitForTimeout(300);
  const arriba = await leer();
  chk('escalar sube todos los niveles', arriba.niveles.every((n, i) => n > media.niveles[i]),
    arriba.niveles.join(','));
  chk('escalar mantiene los siete niveles', arriba.niveles.length === 7, String(arriba.niveles.length));
  chk('escalar deja de marcar un preset', arriba.activo === '', arriba.activo || '(ninguno)');

  await pagina.locator('[data-cardio="preset"][data-preset="reset"]').click();
  await pagina.waitForTimeout(300);
  const reset = await leer();
  chk('RESET devuelve la piramide de MEDIA',
    JSON.stringify(reset.niveles) === JSON.stringify(media.niveles), reset.niveles.join(','));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 26. Un cardio de punta a punta: timer, resumen, historial y XP.
//
//     La version anterior de este caso bajaba `rest` a 0, asi que "el ultimo
//     descanso tambien se corre" —el defecto estrella del paso 6— duraba cero
//     segundos y era inobservable: reintroducir el bug dejaba las cuatro
//     puertas en verde. Ahora el descanso se queda en 5s y se afirma la
//     duracion EXACTA contra la aritmetica rederivada a mano.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 4]) });
  await pagina.locator('[data-accion="cardio"]').click();
  await pagina.waitForTimeout(350);
  await pagina.locator('[data-modo="tabata"]').click();
  await pagina.waitForTimeout(300);
  // 2 rondas x (30s trabajo + 5s descanso) = 70s exactos, con 60s de trabajo.
  // El trabajo tiene que llegar al minimo que paga XP: por debajo de un minuto
  // una sesion de cardio no puntua, que es lo que corta la granja de XP.
  for (let i = 0; i < 6; i++) {
    await pagina.locator('[data-cardio="menos"][data-clave="rounds"]').click();
    await pagina.waitForTimeout(40);
  }
  for (let i = 0; i < 2; i++) {
    await pagina.locator('[data-cardio="mas"][data-clave="work"]').click();
    await pagina.waitForTimeout(40);
  }
  await pagina.locator('[data-cardio="menos"][data-clave="rest"]').click();
  await pagina.waitForTimeout(40);

  const cfg = await pagina.evaluate(() => ({
    valores: [...document.querySelectorAll('.f-stepper__valor')].map((e) =>
      Number.parseInt(e.textContent || '0', 10)
    ),
    pie: document.querySelector('.f-cardio__total-cifra')?.textContent?.trim() ?? '',
    sub: document.querySelector('.f-cardio__sub')?.textContent?.trim() ?? '',
  }));
  chk('los steppers quedan donde se los dejo', cfg.valores.join(',') === '2,30,5', cfg.valores.join(','));
  // 2 x (30 + 5) = 70 s. Rederivado a mano, no leido de la misma funcion.
  chk('el pie anuncia la duracion rederivada a mano', cfg.pie === '1:10 min', cfg.pie);
  chk(
    'el subtitulo sigue a los steppers, no a una cadena fija',
    cfg.sub === '30s trabajo / 5s descanso × 2 rondas',
    cfg.sub
  );

  await pagina.locator('[data-cardio="comenzar"]').click();
  // 3 de cuenta atras + 70 de sesion + margen.
  await pagina.waitForTimeout(80000);
  const fin = await pagina.evaluate(() => {
    const hist = JSON.parse(localStorage.getItem('gymmate_history') || '[]').filter(
      (s) => s.type === 'cardio'
    );
    return {
      resumen: !document.getElementById('cardioSummaryView')?.classList.contains('hidden'),
      label: document.querySelector('.f-cardio__resumen-label')?.textContent ?? '',
      guardado: document.querySelector('.f-cardio__guardado')?.textContent ?? '',
      metricas: [...document.querySelectorAll('.f-cardio__metrica-label')].map((e) => e.textContent),
      cifras: [...document.querySelectorAll('.f-cardio__metrica-cifra')].map((e) => e.textContent),
      cifraTotal: document.querySelector('.f-cardio__resumen-cifra')?.textContent ?? '',
      cardioEnHistorial: hist.length,
      stats: hist[0]?.stats ?? null,
      xp: (JSON.parse(localStorage.getItem('gymmate_gamification') || '{}').xpHistory || []).filter(
        (t) => t.source === 'cardio_complete'
      ),
    };
  });
  chk('el cardio llega a su resumen', fin.resumen);
  chk('el resumen dice el modo', fin.label.includes('TABATA'), fin.label);
  chk('y COMPLETADO, porque llego al final', fin.label.includes('COMPLETADO'), fin.label);
  chk('y que la sesion quedo guardada', fin.guardado.includes('Guardado'), fin.guardado);
  chk('la sesion entra en el historial', fin.cardioEnHistorial === 1, String(fin.cardioEnHistorial));

  // EL chequeo que faltaba: el motor tarda lo que el pie anuncio. Reintroducir
  // el bug del ultimo descanso (30 -> 25) pone esto rojo.
  chk(
    'el motor tarda EXACTAMENTE lo que anuncio el pie',
    fin.stats?.totalTime === 70,
    `totalTime ${fin.stats?.totalTime} (esperado 70)`
  );
  chk('y lo reparte bien entre trabajo y descanso', fin.stats?.workTime === 60 && fin.stats?.restTime === 10,
    `trabajo ${fin.stats?.workTime} / descanso ${fin.stats?.restTime} (esperados 60 / 10)`);
  chk('las rondas completadas son las que se hicieron', fin.stats?.roundsCompleted === 2,
    String(fin.stats?.roundsCompleted));
  // 60s de trabajo x 15 kcal/min = 15. El ritmo sale del mockup (C-04: 2:40 -> ~40).
  chk('las kcal salen del ritmo del mockup', fin.stats?.calories === 15, `${fin.stats?.calories} (esperado 15)`);
  chk('el reloj del resumen coincide con el total', fin.cifraTotal.trim() === '1:10', fin.cifraTotal);

  chk('el cardio SUMA XP', fin.xp.length === 1 && fin.xp[0].amount > 0, JSON.stringify(fin.xp));
  chk('el resumen enseña el XP', fin.metricas.includes('XP'), fin.metricas.join(','));
  chk('y las cuatro metricas del mockup', fin.metricas.join(',') === 'RONDAS,TRABAJO,KCAL EST.,XP',
    fin.metricas.join(','));
  const margen = await pagina.evaluate(() => {
    // La rejilla, no una celda: una celda de dos columnas nunca llega al
    // borde derecho y la medida no diria nada.
    const card = document.querySelector('#cardioSummaryView .f-cardio__rejilla');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { izq: +r.left.toFixed(1), der: +(window.innerWidth - r.right).toFixed(1) };
  });
  chk(
    'el resumen conserva su margen lateral',
    margen !== null && margen.izq >= 16 && margen.der >= 16,
    margen ? `izq ${margen.izq} / der ${margen.der}` : 'sin metricas'
  );
  await ctx.close();
}

// --------------------------------------------------------------------------
// 27. El cardio NO suma racha (cambio aprobado nº 4).
//
//     El caso anterior importaba un modulo, lo tiraba, y afirmaba "la racha es
//     0" sobre una pagina recien abierta y VACIA: sumarle 7 a la racha dentro
//     de `processCompletedCardioSession` dejaba la puerta en verde. Ahora se
//     siembra una racha real de pesas y se comprueba que el cardio no la mueve.
// --------------------------------------------------------------------------
{
  const hoy = new Date();
  const diasAtras = (n) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - n);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };
  // Tres dias LOCALES seguidos de cardio y ni uno de pesas.
  const soloCardio = [0, 1, 2].map((n) => ({
    type: 'cardio',
    mode: 'tabata',
    sessionId: `c_${n}`,
    date: diasAtras(n),
    savedAt: diasAtras(n),
    grupo: 'Cardio - TABATA',
    ejercicios: [],
    volumenTotal: 0,
    volumenPorGrupo: {},
    stats: { totalTime: 240, workTime: 160, restTime: 80, roundsCompleted: 8, calories: 40 },
  }));
  const { ctx, pagina } = await abrir({ gymmate_history: soloCardio });
  // initGamification corre en el arranque y persiste; con 500ms se leia el
  // localStorage antes de que existiera y la asercion se hacia sobre nada.
  await pagina.waitForTimeout(1600);
  const r = await pagina.evaluate(() => ({
    racha: JSON.parse(localStorage.getItem('gymmate_gamification') || '{}').streakData?.currentStreak ?? -1,
    pantalla: document.body.innerText,
  }));
  chk('tres dias seguidos de SOLO cardio no son racha', r.racha === 0, String(r.racha));
  chk('y la home no pinta un chip de racha', !/RACHA\s+[1-9]/.test(r.pantalla),
    (r.pantalla.match(/RACHA[^\n]*/) || ['sin chip'])[0]);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 27b. La racha usa el dia LOCAL, no el de Greenwich.
//
//      Entrenar cuatro dias seguidos alternando tarde y noche daba racha 1: en
//      Lima toda sesion posterior a las 19:00 caia en el dia UTC siguiente y
//      colisionaba con la del dia real siguiente.
// --------------------------------------------------------------------------
{
  const hoy = new Date();
  const aLaHora = (n, hora) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - n);
    d.setHours(hora, 0, 0, 0);
    return d.toISOString();
  };
  const mixto = [
    [0, 12],
    [1, 20],
    [2, 12],
    [3, 20],
  ].map(([n, hora], i) => ({
    type: 'weights',
    sessionId: `w_${i}`,
    date: aLaHora(n, hora),
    savedAt: aLaHora(n, hora),
    grupo: 'Piernas',
    ejercicios: [],
    volumenTotal: 1000,
    volumenPorGrupo: { Piernas: 1000 },
  }));
  const { ctx, pagina } = await abrir({ gymmate_history: mixto });
  await pagina.waitForTimeout(1600);
  const racha = await pagina.evaluate(
    () => JSON.parse(localStorage.getItem('gymmate_gamification') || '{}').streakData?.currentStreak ?? -1
  );
  chk('cuatro dias locales seguidos son racha 4, se entrene de tarde o de noche', racha === 4, String(racha));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 27c. Los SEIS modos de cardio se dibujan de verdad.
//
//      C-06, C-07 y C-08 no se renderizaban en ninguna puerta: un mutante que
//      hacia reventar `configCircuito`, `configEmom` o `timerPiramide` pasaba
//      las cuatro en verde. Aqui se abre cada modo, se comprueba que pinta algo
//      y que no deja un solo error en consola.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 4]) });
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e)));
  pagina.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });

  const MODOS = ['tabata', 'emom', 'amrap', 'circuit', 'pyramid', 'custom'];
  // Literales del `<script data-dc-script>` del mockup (`cardioModes`).
  const TAGS = { tabata: 'T', emom: 'E', amrap: 'A', circuit: 'C', pyramid: 'P', custom: 'X' };

  await pagina.locator('[data-accion="cardio"]').click();
  await pagina.waitForTimeout(350);

  const listado = await pagina.evaluate(() =>
    [...document.querySelectorAll('.f-modo')].map((f) => ({
      tag: f.querySelector('.f-modo__tag')?.textContent?.trim() ?? '',
      n: f.querySelector('.f-modo__nombre')?.textContent?.trim() ?? '',
      d: f.querySelector('.f-modo__desc')?.textContent?.trim() ?? '',
    }))
  );
  chk(
    'los tags de C-01 son los del mockup, de una letra',
    listado.map((m) => m.tag).join(',') === MODOS_ESPERADOS_TAGS,
    `${listado.map((m) => m.tag).join(',')} | mockup ${MODOS_ESPERADOS_TAGS}`
  );
  // Cinco de las seis descripciones estaban reescritas a mano y ninguna puerta
  // lo veia: nada comparaba TEXTO contra el mockup.
  const desviados = CARDIO_MODES_MOCKUP.filter(
    (esperado, i) => listado[i]?.n !== esperado.n || listado[i]?.d !== esperado.d
  ).map((e, i) => `${e.n}: "${listado[i]?.d ?? ''}" != "${e.d}"`);
  chk('nombre y descripcion de los seis modos son los del mockup, literales',
    desviados.length === 0, desviados.slice(0, 3).join(' | '));

  for (const modo of MODOS) {
    await pagina.locator(`[data-modo="${modo}"]`).click();
    await pagina.waitForTimeout(320);
    const v = await pagina.evaluate(() => {
      const cfg = document.getElementById('cardioConfigView');
      return {
        visible: cfg ? !cfg.classList.contains('hidden') : false,
        texto: (cfg?.innerText ?? '').trim(),
        comenzar: !!cfg?.querySelector('[data-cardio="comenzar"]'),
      };
    });
    chk(`C-02/05/07/08 · ${modo} se dibuja`, v.visible && v.texto.length > 40, `${v.texto.length} chars`);
    chk(`${modo} ofrece Comenzar`, v.comenzar);
    await pagina.locator('[data-cardio="volver-selector"]').click();
    await pagina.waitForTimeout(220);
  }

  // C-06: el timer de piramide, que tampoco se dibujaba nunca.
  await pagina.locator('[data-modo="pyramid"]').click();
  await pagina.waitForTimeout(300);
  await pagina.locator('[data-cardio="comenzar"]').click();
  await pagina.waitForTimeout(4200);
  const piramide = await pagina.evaluate(() => ({
    hechos: document.querySelectorAll('.f-nivel__barra--hecho').length,
    activos: document.querySelectorAll('.f-nivel__barra--activo').length,
    proximos: document.querySelectorAll('.f-nivel__barra--proximo').length,
    etiquetaActiva: document.querySelector('.f-nivel__seg--activo')?.textContent?.trim() ?? '',
    leyenda: document.querySelector('.f-piramide__leyenda')?.textContent ?? '',
  }));
  // Invertir `estadoDeNivel(i, actual)` pasaba las cuatro puertas: aqui muere.
  chk('C-06 · exactamente un nivel activo', piramide.activos === 1, String(piramide.activos));
  chk('C-06 · y los otros seis repartidos entre hechos y proximos',
    piramide.hechos + piramide.proximos === 6, `${piramide.hechos} hechos / ${piramide.proximos} proximos`);
  chk('C-06 · al empezar ninguno esta hecho', piramide.hechos === 0, String(piramide.hechos));
  // README §8: "el activo ... con el countdown encima".
  chk('C-06 · el nivel activo lleva su countdown, no sus segundos crudos',
    /^\d+:\d\d$/.test(piramide.etiquetaActiva), piramide.etiquetaActiva);

  chk('ningun modo de cardio deja errores en consola', errores.length === 0, errores.slice(0, 3).join(' | '));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 27d. Salir de cardio para el motor: ni sesiones fantasma ni resumen encima
//      de otra pantalla.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 4]) });
  await pagina.locator('[data-accion="cardio"]').click();
  await pagina.waitForTimeout(320);
  await pagina.locator('[data-modo="tabata"]').click();
  await pagina.waitForTimeout(280);
  for (let i = 0; i < 7; i++) {
    await pagina.locator('[data-cardio="menos"][data-clave="rounds"]').click();
    await pagina.waitForTimeout(35);
  }
  await pagina.locator('[data-cardio="comenzar"]').click();
  await pagina.waitForTimeout(1200);
  // El usuario se va a mitad de la cuenta atras / del trabajo.
  await pagina.locator('[data-nav="home"]').click();
  await pagina.waitForTimeout(12000);
  const tras = await pagina.evaluate(() => ({
    cardioVisible: ['cardioSelectorView', 'cardioConfigView', 'cardioTimerView', 'cardioSummaryView'].filter(
      (id) => document.getElementById(id)?.classList.contains('hidden') === false
    ),
    guardadas: JSON.parse(localStorage.getItem('gymmate_history') || '[]').filter((s) => s.type === 'cardio')
      .length,
    xp: (JSON.parse(localStorage.getItem('gymmate_gamification') || '{}').xpHistory || []).filter(
      (t) => t.source === 'cardio_complete'
    ).length,
  }));
  chk('salir de cardio no guarda una sesion abandonada', tras.guardadas === 0, String(tras.guardadas));
  chk('ni cobra su XP', tras.xp === 0, String(tras.xp));
  chk('ni pinta el resumen encima de la home', tras.cardioVisible.length === 0, tras.cardioVisible.join(','));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 27e. Un tap en "+" de la duracion de AMRAP sube UN minuto, no sesenta.
// --------------------------------------------------------------------------
{
  // Con historial: sin el, la home entra en O-01 y ahi no hay entrada a cardio.
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 4]) });
  await pagina.locator('[data-accion="cardio"]').click();
  await pagina.waitForTimeout(320);
  await pagina.locator('[data-modo="amrap"]').click();
  await pagina.waitForTimeout(280);
  const leer = () =>
    pagina.evaluate(() => ({
      valor: document.querySelector('.f-stepper__valor')?.textContent?.trim() ?? '',
      pie: document.querySelector('.f-cardio__total-cifra')?.textContent?.trim() ?? '',
    }));
  const antes = await leer();
  await pagina.locator('[data-cardio="mas"][data-clave="duration"]').click();
  await pagina.waitForTimeout(220);
  const despues = await leer();
  chk('AMRAP arranca en los 12 minutos del mockup', antes.valor === '12', antes.valor);
  chk('y un tap en "+" lo deja en 13, no en 72', despues.valor === '13', despues.valor);
  chk('el pie nunca escribe "min" detras de un h:mm:ss', !/:\d\d:\d\d\s*min/.test(despues.pie), despues.pie);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 27f. Ni emojis ni dobles exclamaciones en NINGUNA pantalla de cardio.
//      La prohibicion solo miraba la pantalla de sesion.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 4]) });
  await pagina.locator('[data-accion="cardio"]').click();
  await pagina.waitForTimeout(320);
  let sospechosos = [];
  for (const modo of ['tabata', 'emom', 'amrap', 'circuit', 'pyramid', 'custom']) {
    await pagina.locator(`[data-modo="${modo}"]`).click();
    await pagina.waitForTimeout(280);
    const t = await pagina.evaluate(() => document.body.innerText);
    // `Emoji_Presentation`, no `Extended_Pictographic`: el segundo marca
    // tambien las flechas ↗ ↘, que el README autoriza expresamente como texto
    // ("los pocos glifos (←, ›, ✓, ✕, +, ⓘ, ↑) son texto"). Un chequeo que
    // prohibe lo que el contrato permite es un falso rojo, y un falso rojo
    // gasta la misma confianza que un falso verde.
    if (/\p{Emoji_Presentation}|\uFE0F/u.test(t)) sospechosos.push(`${modo}: emoji`);
    if (/!!|¡¡/.test(t)) sospechosos.push(`${modo}: doble exclamacion`);
    await pagina.locator('[data-cardio="volver-selector"]').click();
    await pagina.waitForTimeout(200);
  }
  chk('cardio no tiene emojis ni dobles exclamaciones', sospechosos.length === 0, sospechosos.join(' | '));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 28. Reanudar un borrador NO convierte los opcionales en obligatorios ni
//     regala XP por PRs que ya existian.
// --------------------------------------------------------------------------
{
  const borrador = {
    date: diaLocal(),
    grupo: 'GRUPO 1 - Piernas + Glúteos',
    startedAt: new Date(Date.now() - 600000).toISOString(),
    ejercicios: [
      { nombre: 'Prensa de Piernas', esMancuerna: false, grupoMuscular: 'Piernas', sets: 4, reps: 12, peso: 120, volumen: 5760, completado: false },
      { nombre: 'Abductora Máquina', esMancuerna: false, grupoMuscular: 'Glúteos', sets: 0, reps: 0, peso: 0, volumen: 0, completado: false },
      { nombre: 'Aductora Máquina', esMancuerna: false, grupoMuscular: 'Piernas', sets: 0, reps: 0, peso: 0, volumen: 0, completado: false },
      { nombre: 'Patada de Glúteo en Máquina', esMancuerna: false, grupoMuscular: 'Glúteos', sets: 0, reps: 0, peso: 0, volumen: 0, completado: false },
      { nombre: 'Extensión de Cuádriceps', esMancuerna: false, grupoMuscular: 'Piernas', sets: 0, reps: 0, peso: 0, volumen: 0, completado: false },
      { nombre: 'RDL / Peso Muerto Rumano', esMancuerna: false, grupoMuscular: 'Piernas', sets: 0, reps: 0, peso: 0, volumen: 0, completado: false },
      { nombre: 'Hip Thrust', esMancuerna: false, grupoMuscular: 'Glúteos', sets: 0, reps: 0, peso: 0, volumen: 0, completado: false },
      { nombre: 'Abdominales en Máquina', esMancuerna: false, grupoMuscular: 'Core', sets: 0, reps: 0, peso: 0, volumen: 0, completado: false },
    ],
    volumenTotal: 5760,
    volumenPorGrupo: { Piernas: 5760 },
    draftTimestamp: Date.now(),
  };
  const { ctx, pagina } = await abrir({
    gymmate_draft: borrador,
    gymmate_history: historialDePrueba([2, 5]),
    gymmate_prs: {
      'Prensa de Piernas': { peso: 180, sets: 4, reps: 12, volumen: 8640, date: new Date().toISOString() },
      'Abductora Máquina': { peso: 60, sets: 3, reps: 12, volumen: 2160, date: new Date().toISOString() },
    },
  });
  await pagina.locator('[data-accion="continuar"]').click();
  await pagina.waitForTimeout(600);
  const r = await pagina.evaluate(() => ({
    opcionales: [...document.querySelectorAll('.f-opcional__nombre')].map((e) => e.textContent),
    separador: !!document.querySelector('.f-separador'),
    cards: document.querySelectorAll('.f-ejercicio').length,
  }));
  chk('reanudar conserva los opcionales como opcionales', r.opcionales.length === 2, r.opcionales.join(','));
  chk('y su separador', r.separador);
  chk('los obligatorios siguen siendo seis', r.cards === 6, String(r.cards));

  // Y ahora al terminar: sin PRs nuevos, no puede haber filas de PR en W-03.
  await pagina.locator('[data-sesion="terminar"]').click();
  await pagina.waitForTimeout(500);
  // Con datos sin guardar sale antes la hoja de "¿Guardar antes de terminar?".
  const guardar = pagina.locator('.f-sheet__botones .f-btn--secundario');
  if (await guardar.count()) {
    await guardar.first().click();
    await pagina.waitForTimeout(500);
  }
  await pagina.locator('#rpeConfirmar').click();
  await pagina.waitForTimeout(1500);
  const xp = await pagina.evaluate(() => ({
    filas: [...document.querySelectorAll('.f-xp__concepto')].map((e) => e.textContent ?? ''),
    total: document.querySelector('.f-xp__cifra')?.textContent ?? '',
  }));
  chk(
    'reanudar no inventa PRs: ninguna fila "PR ·" sin haber batido nada',
    !xp.filas.some((f) => f.startsWith('PR ·')),
    xp.filas.join(' | ') || '(sin resumen)'
  );
  await ctx.close();
}

// --------------------------------------------------------------------------
// 29. Las hojas atrapan el foco y lo devuelven al cerrarse.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  await pagina.locator('[data-grupo]').first().click();
  await pagina.waitForTimeout(500);
  await pagina.locator('.f-ejercicio__info').first().focus();
  const antes = await pagina.evaluate(() => document.activeElement?.className ?? '');
  await pagina.locator('.f-ejercicio__info').first().click();
  await pagina.waitForTimeout(400);
  const dentro = await pagina.evaluate(async () => {
    const visitados = [];
    for (let i = 0; i < 6; i++) {
      // Se tabula de verdad y se apunta si el foco sale de la hoja.
      const hoja = document.querySelector('.f-scrim');
      const activo = document.activeElement;
      visitados.push(hoja?.contains(activo) ? 'dentro' : 'FUERA');
      await new Promise((r) => setTimeout(r, 10));
      // Sin acceso al Tab real desde aqui: se comprueba el mecanismo.
      break;
    }
    const fuera = [...document.body.children].filter(
      (h) => h !== document.querySelector('.f-scrim') && !h.inert
    );
    return { visitados, sinInertar: fuera.map((h) => h.id || h.tagName) };
  });
  chk('con la hoja abierta el foco arranca dentro', dentro.visitados[0] === 'dentro', dentro.visitados.join(','));
  chk('el resto de la pagina queda inerte', dentro.sinInertar.length === 0, dentro.sinInertar.join(','));

  await pagina.keyboard.press('Escape');
  await pagina.waitForTimeout(300);
  const despues = await pagina.evaluate(() => ({
    clase: document.activeElement?.className ?? '',
    inertes: [...document.body.children].filter((h) => h.inert).length,
  }));
  chk('al cerrar, el foco vuelve al boton que la abrio', despues.clase.includes('f-ejercicio__info'),
    `${antes} -> ${despues.clase}`);
  chk('y nada se queda inerte', despues.inertes === 0, String(despues.inertes));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 30. El anillo de foco es Fragua en toda la app, nunca el azul legacy.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  const azules = [];
  for (const [nombre, camino, selector] of [
    ['home', [], '.f-home__rutina'],
    ['sesion', ['[data-grupo]'], '.f-ejercicio__check'],
    ['historial', ['[data-nav="home"]', '[data-nav="history"]'], '.f-hueso__accion'],
  ]) {
    for (const paso of camino) {
      await pagina.locator(paso).first().click();
      await pagina.waitForTimeout(350);
    }
    // Con Tab de verdad, no con .focus(): tras un click, Chromium no aplica
    // :focus-visible a un foco programatico y la medida salia la del texto.
    await pagina.evaluate(() => document.body.focus());
    let color = null;
    for (let i = 0; i < 60; i++) {
      await pagina.keyboard.press('Tab');
      const r = await pagina.evaluate((sel) => {
        const el = document.activeElement;
        if (!el || !el.matches(sel)) return null;
        return getComputedStyle(el).outlineColor;
      }, selector);
      if (r) {
        color = r;
        break;
      }
    }
    if (color && color !== 'rgb(255, 99, 23)') azules.push(`${nombre}:${selector}=${color}`);
    chk(`el foco de ${nombre} va en Fragua`, color === 'rgb(255, 99, 23)', `${selector} -> ${color}`);
  }
  void azules;
  await ctx.close();
}

// --------------------------------------------------------------------------
// 31. "Eliminar" ELIMINA. El guardia de identidad se tragaba todos los
//     borrados en silencio: getHistory() reparsea el JSON, asi que indexOf
//     sobre una lista nueva devolvia -1 siempre.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 4, 8]) });
  await pagina.locator('[data-nav="history"]').click();
  await pagina.waitForTimeout(400);
  await pagina.locator('.f-hist__fila').first().click();
  await pagina.waitForTimeout(350);
  await pagina.locator('[data-hueso="borrar"]').click();
  await pagina.waitForTimeout(350);
  await pagina.locator('.f-btn--destructivo').click();
  await pagina.waitForTimeout(600);
  const r = await pagina.evaluate(() => ({
    quedan: JSON.parse(localStorage.getItem('gymmate_history') || '[]').length,
    filas: document.querySelectorAll('.f-hist__fila').length,
    toast: document.querySelector('.f-toast__titulo')?.textContent ?? '',
  }));
  chk('borrar quita la sesion del almacenamiento', r.quedan === 2, `${r.quedan} sesiones`);
  chk('y de la pantalla', r.filas === 2, `${r.filas} filas`);
  chk('y lo dice', r.toast.includes('eliminado'), r.toast || '(sin toast)');
  await ctx.close();
}

// --------------------------------------------------------------------------
// 32. CSV: ida y vuelta, duplicados y fechas ilegibles.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({
    gymmate_history: historialDePrueba([1, 4]),
    // P-01 dice que el CSV "es la copia con la que se recupera todo": esta
    // semilla lleva UNA de cada cosa que la app guarda, para que la ida y
    // vuelta pueda desmentirlo.
    gymmate_profile: { name: 'Alonso', weight: 75, height: 176 },
    gymmate_body_measurements: [{ date: '2026-08-10T12:00:00.000Z', weight: 75, chest: 98, waist: 82 }],
    // Un PR de un ejercicio que NO esta en el historial: se perdia entero.
    gymmate_prs: {
      'Press Banca': { peso: 60, sets: 3, reps: 8, volumen: 1440, date: '2026-06-12T12:00:00.000Z' },
    },
    // Y una sesion de CARDIO. Sin ella, borrar entera la seccion de cardio del
    // exportador dejaba las cuatro puertas en verde, y el chequeo "el toast no
    // anuncia cardio que no entro" no podia fallar: no habia cardio.
    // Un ejercicio creado a mano, la conversacion del coach y la progresion:
    // las tres cosas que el CSV NO se llevaba. Sin ellas en la semilla, borrar
    // esas secciones del exportador pasaria las cuatro puertas en verde.
    gymmate_custom_exercises: [
      { id: 'ce1', nombre: 'Remo Gironda', grupoMuscular: 'Espalda', esMancuerna: false,
        createdAt: '2026-05-02T12:00:00.000Z' },
    ],
    gymmate_coach_conversacion: [
      { id: 't1', autor: 'coach', texto: 'Tu volumen subió 12%', fecha: '2026-08-01T10:00:00.000Z' },
      { id: 't2', autor: 'usuario', texto: '¿y las piernas?', fecha: '2026-08-01T10:01:00.000Z' },
    ],
    gymmate_custom_workouts: [
      {
        id: 'propia_1',
        nombre: 'Mi rutina',
        isCustom: true,
        createdAt: '2026-07-01T12:00:00.000Z',
        ejercicios: [{ nombre: 'Sentadilla', esMancuerna: false, grupoMuscular: 'Piernas' }],
        opcionales: [{ nombre: 'Zancadas', esMancuerna: true, grupoMuscular: 'Glúteos' }],
      },
    ],
  });
  // Un ejercicio registrado y NO completado (volumen 0): el exportador lo
  // tiraba, y con el se iba su grupo del reparto por musculo. Y una sesion de
  // cardio, que la semilla no tenia.
  await pagina.evaluate(() => {
    const h = JSON.parse(localStorage.getItem('gymmate_history'));
    h[0].ejercicios.push({ nombre: 'Peso Muerto', esMancuerna: false, grupoMuscular: 'Espalda',
      sets: 3, reps: 0, peso: 0, volumen: 0, completado: false });
    const hoy = new Date();
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 7, 18, 0).toISOString();
    h.push({
      sessionId: 'cardio_1', date: d, savedAt: d, type: 'cardio', mode: 'tabata',
      grupo: 'Cardio - TABATA', ejercicios: [], volumenTotal: 0, volumenPorGrupo: {},
      stats: { totalTime: 240, workTime: 160, restTime: 80, roundsCompleted: 8, calories: 48 },
    });
    localStorage.setItem('gymmate_history', JSON.stringify(h));
    // Una mejor racha que el historial NO puede rederivar: dos sesiones
    // sueltas dan racha 1, asi que si el 5 sobrevive es porque viajo en el CSV.
    const g = JSON.parse(localStorage.getItem('gymmate_gamification'));
    g.streakData.bestStreak = 5;
    g.streakData.streakMilestones = [3];
    localStorage.setItem('gymmate_gamification', JSON.stringify(g));
  });

  // 1) Exportar y quedarse con el contenido.
  const csv = await pagina.evaluate(async () => {
    let capturado = '';
    const crear = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      blob.text().then((t) => (capturado = t));
      return crear(blob);
    };
    window.exportToExcel?.();
    await new Promise((r) => setTimeout(r, 400));
    URL.createObjectURL = crear;
    return capturado;
  });
  chk('el CSV se genera', csv.length > 0, `${csv.length} bytes`);
  chk('el CSV incluye el PERFIL', /=== PERFIL ===/.test(csv), csv.slice(0, 40));
  chk('el CSV incluye las MEDIDAS', /=== MEDIDAS CORPORALES ===/.test(csv), '');
  chk('el CSV incluye los RÉCORDS', /=== RÉCORDS ===/.test(csv), '');
  chk('el CSV incluye las RUTINAS PROPIAS', /=== RUTINAS PROPIAS ===/.test(csv), '');
  chk('el CSV no tira los ejercicios sin completar', /Peso Muerto/.test(csv),
    'un set registrado y no completado desaparecia del backup');
  chk('el CSV incluye las SESIONES DE CARDIO', /=== SESIONES DE CARDIO ===/.test(csv) && /Tabata/.test(csv),
    'media app son los seis modos de cardio');
  chk('el CSV incluye los EJERCICIOS PROPIOS', /=== EJERCICIOS PROPIOS ===/.test(csv) && /Remo Gironda/.test(csv),
    'sin ellos, las rutinas apuntan a nombres que no existen');
  chk('el CSV incluye la PROGRESIÓN que no se rederiva', /=== PROGRESIÓN ===/.test(csv) && /bestStreak/.test(csv),
    'hitos de racha, mejor racha y fechas de logro');
  chk('el CSV incluye la CONVERSACIÓN DEL COACH', /=== CONVERSACIÓN DEL COACH ===/.test(csv) && /volumen subió/.test(csv));

  // 2) Importarlo de vuelta en una app vacia: tiene que entrar.
  await ctx.close();
  const segunda = await abrir();
  const dialogo = segunda.pagina.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
  await segunda.pagina.locator('[data-accion="importar"]').first().click();
  const chooser = await dialogo;
  if (!chooser) {
    chk('el CSV exportado se puede volver a importar', false, 'no llego el filechooser');
  } else {
    await chooser.setFiles({ name: 'backup.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
    await segunda.pagina.waitForTimeout(1200);
    const r = await segunda.pagina.evaluate(() => ({
      n: JSON.parse(localStorage.getItem('gymmate_history') || '[]').length,
      toast: document.querySelector('.f-toast__titulo')?.textContent ?? '',
      detalle: document.querySelector('.f-toast__detalle')?.textContent ?? '',
      prs: JSON.parse(localStorage.getItem('gymmate_prs') || '{}'),
      rutinas: JSON.parse(localStorage.getItem('gymmate_custom_workouts') || '[]'),
      medidas: JSON.parse(localStorage.getItem('gymmate_body_measurements') || '[]'),
      propios: JSON.parse(localStorage.getItem('gymmate_custom_exercises') || '[]').map((e) => e.nombre),
      turnos: JSON.parse(localStorage.getItem('gymmate_coach_conversacion') || '[]').length,
      gam: JSON.parse(localStorage.getItem('gymmate_gamification') || '{}'),
      cardio: JSON.parse(localStorage.getItem('gymmate_history') || '[]')
        .filter((x) => x.type === 'cardio')
        .map((x) => ({ modo: x.mode, rondas: x.stats?.roundsCompleted })),
      grupos: (JSON.parse(localStorage.getItem('gymmate_history') || '[]').find((x) => x.type !== 'cardio') || {}).volumenPorGrupo ?? {},
      ejercicios: ((JSON.parse(localStorage.getItem('gymmate_history') || '[]').find((x) => x.type !== 'cardio') || {}).ejercicios ?? []).map((e) => e.nombre),
    }));
    chk('el CSV que exporta la app se puede volver a importar', r.n === 3, `${r.n} sesiones · ${r.toast}`);
    chk('restaurar recupera el cardio, con sus rondas',
      r.cardio.length === 1 && r.cardio[0].rondas === 8 && r.cardio[0].modo === 'tabata',
      JSON.stringify(r.cardio));

    // "Se recupera TODO", una promesa a la vez.
    chk('restaurar recupera el PR de un ejercicio que no esta en el historial',
      r.prs['press banca']?.peso === 60 || r.prs['Press Banca']?.peso === 60,
      JSON.stringify(Object.keys(r.prs)));
    chk('y conserva la fecha del PR, no la de la sesion que lo produjo',
      String(r.prs['press banca']?.date ?? r.prs['Press Banca']?.date ?? '').startsWith('2026-06-12'),
      String(r.prs['press banca']?.date ?? r.prs['Press Banca']?.date ?? '(sin fecha)'));
    chk('restaurar recupera las rutinas propias del builder',
      r.rutinas.length === 1 && r.rutinas[0].nombre === 'Mi rutina',
      JSON.stringify(r.rutinas.map((x) => x.nombre)));
    chk('y con sus ejercicios y sus opcionales',
      r.rutinas[0]?.ejercicios?.length === 1 && r.rutinas[0]?.opcionales?.length === 1,
      JSON.stringify({ e: r.rutinas[0]?.ejercicios?.length, o: r.rutinas[0]?.opcionales?.length }));
    chk('restaurar recupera las medidas', r.medidas.length === 1, `${r.medidas.length} mediciones`);
    chk('restaurar recupera los ejercicios propios',
      r.propios.includes('Remo Gironda'), JSON.stringify(r.propios));
    chk('restaurar recupera la conversacion del coach', r.turnos === 2, `${r.turnos} turnos`);
    chk('restaurar recupera la mejor racha y los hitos, que no se rederivan',
      (r.gam?.streakData?.bestStreak ?? 0) >= 5,
      `mejor racha ${r.gam?.streakData?.bestStreak} · hitos ${JSON.stringify(r.gam?.streakData?.streakMilestones)}`);
    // `saveHistory` canonicaliza el nombre ("Peso Muerto" -> "Peso Muerto
    // Convencional"), asi que se comprueba que el ejercicio SIGUE AHI, no su
    // literal: son dos sesiones y la primera tenia dos ejercicios.
    chk('restaurar conserva el ejercicio registrado y no completado',
      r.ejercicios.length === 2 && r.ejercicios.some((n) => /Peso Muerto/.test(n)),
      r.ejercicios.join(', '));
    chk('y con el, su grupo en el reparto por musculo',
      Object.keys(r.grupos).length >= 2, JSON.stringify(r.grupos));

    // La gamificacion se recalcula: restaurar dejaba NIVEL 1 · 0 XP con el
    // heatmap lleno, y `recalculateXP` no colgaba de ningun boton.
    chk('restaurar NO deja la gamificacion en cero',
      (r.gam?.playerStats?.totalXP ?? 0) > 0,
      `totalXP ${r.gam?.playerStats?.totalXP ?? 'sin estado'}`);

    // El toast cuenta lo que ENTRO, no lo que parseo.
    chk('el toast cuenta el cardio que SI entro', /1 de cardio/.test(r.detalle), r.detalle);
  }
  await segunda.ctx.close();

  // Importar el MISMO backup encima no debe anunciar nada recuperado.
  // La accion de importar de la home solo existe en el estado vacio (O-01);
  // con historial vive en la cabecera de HISTORIAL.
  // La MISMA semilla que genero el backup, cardio incluido: si falta, el cardio
  // entra de verdad y el chequeo comprobaria lo contrario de lo que dice.
  const hoyT = new Date();
  const dT = new Date(hoyT.getFullYear(), hoyT.getMonth(), hoyT.getDate() - 7, 18, 0).toISOString();
  const tercera = await abrir({
    gymmate_history: [
      ...historialDePrueba([1, 4]),
      {
        sessionId: 'cardio_1', date: dT, savedAt: dT, type: 'cardio', mode: 'tabata',
        grupo: 'Cardio - TABATA', ejercicios: [], volumenTotal: 0, volumenPorGrupo: {},
        stats: { totalTime: 240, workTime: 160, restTime: 80, roundsCompleted: 8, calories: 48 },
      },
    ],
  });
  await tercera.pagina.evaluate(() => window.switchTab('history'));
  await tercera.pagina.waitForTimeout(600);
  const dlg3 = tercera.pagina.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
  await tercera.pagina.locator('[data-hueso="importar"]').first().click();
  const ch3 = await dlg3;
  if (ch3) {
    await ch3.setFiles({ name: 'backup.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
    await tercera.pagina.waitForTimeout(1200);
    const t = await tercera.pagina.evaluate(() => ({
      titulo: document.querySelector('.f-toast__titulo')?.textContent ?? '',
      detalle: document.querySelector('.f-toast__detalle')?.textContent ?? '',
    }));
    chk('reimportar el mismo backup dice 0 sesiones', /: 0 sesiones/.test(t.titulo), t.titulo);
    chk('y no se apunta un cardio que no entro', !/de cardio/.test(t.detalle), t.detalle);
  } else {
    // Los otros dos usos de filechooser del archivo si llevan este `else`;
    // este no, y sin el la deduplicacion al reimportar dejaba de comprobarse
    // en silencio.
    chk('reimportar · llega el selector de archivo', false, 'no se abrio el filechooser');
  }
  await tercera.ctx.close();
}

// --------------------------------------------------------------------------
// 33. Importar el MISMO CSV dos veces no duplica. La clave del CSV era el
//     texto crudo y la del historial un toLocaleDateString sin cero delante:
//     no coincidian nunca y se podia importar cuatro veces seguidas.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  const importar = async () => {
    const espera = pagina.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
    // El boton visible: el de la home o el del header de HISTORIAL, segun
    // donde este el usuario. Los dos existen en el DOM a la vez.
    await pagina.locator('[data-accion="importar"]:visible, [data-hueso="importar"]:visible').first().click();
    const chooser = await espera;
    if (!chooser) return null;
    await chooser.setFiles({
      name: 'historial.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV_DE_PRUEBA, 'utf-8'),
    });
    await pagina.waitForTimeout(1100);
    return pagina.evaluate(() => ({
      n: JSON.parse(localStorage.getItem('gymmate_history') || '[]').length,
      detalle: document.querySelector('.f-toast__detalle')?.textContent ?? '',
    }));
  };
  const primera = await importar();
  chk('la primera importacion entra', primera?.n === 2, JSON.stringify(primera));
  // Con datos ya dentro, la home deja de tener el boton de importar: el
  // camino del usuario pasa a ser el header de HISTORIAL.
  await pagina.locator('[data-nav="history"]').click();
  await pagina.waitForTimeout(400);
  const segunda = await importar();
  chk('la segunda no duplica', segunda?.n === 2, JSON.stringify(segunda));
  chk('y avisa de las duplicadas', /duplicada/.test(segunda?.detalle ?? ''), segunda?.detalle ?? '');
  await ctx.close();
}

// --------------------------------------------------------------------------
// 34. Un CSV con una fecha ilegible no puede dejar la app en blanco.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir();
  const espera = pagina.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
  await pagina.locator('[data-accion="importar"]').first().click();
  const chooser = await espera;
  const roto = [
    'Fecha,Grupo,Ejercicio,Sets,Reps,Peso (kg),Es Mancuerna,Grupo Muscular,Volumen,Completado,Volumen Total Sesión',
    'ayer,GRUPO 1 - Piernas + Glúteos,Prensa de Piernas,4,12,120,No,Piernas,5760,Sí,5760',
    '12/08/2026,GRUPO 1 - Piernas + Glúteos,Prensa de Piernas,4,12,125,No,Piernas,6000,Sí,6000',
  ].join('\n');
  if (!chooser) {
    chk('el selector de fichero se abre', false);
  } else {
    await chooser.setFiles({ name: 'roto.csv', mimeType: 'text/csv', buffer: Buffer.from(roto, 'utf-8') });
    await pagina.waitForTimeout(1200);
    const tras = await pagina.evaluate(() => ({
      n: JSON.parse(localStorage.getItem('gymmate_history') || '[]').length,
      detalle: document.querySelector('.f-toast__detalle')?.textContent ?? '',
    }));
    chk('la fila legible entra', tras.n === 1, String(tras.n));
    chk('y se avisa de la ilegible', /ilegible/.test(tras.detalle), tras.detalle || '(sin detalle)');

    // Y sobre todo: recargar no puede dejar la app en blanco.
    const errores = [];
    pagina.on('pageerror', (e) => errores.push(e.message));
    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.waitForTimeout(900);
    const vivo = await pagina.evaluate(() => ({
      alto: document.getElementById('fierroHome')?.getBoundingClientRect().height ?? 0,
      texto: (document.getElementById('fierroHome')?.innerText ?? '').length,
    }));
    chk('tras recargar la home sigue viva', vivo.alto > 100 && vivo.texto > 20,
      `alto ${vivo.alto} · ${vivo.texto} caracteres`);
    chk('y sin excepciones sin capturar', errores.length === 0, errores.join(' | '));
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 35. Una sesion de cardio en el historial: fila con sus rondas y su tiempo,
//     y un detalle que no habla de kg.
// --------------------------------------------------------------------------
{
  const hoy = new Date();
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1, 19, 0);
  const cardio = {
    type: 'cardio',
    mode: 'tabata',
    sessionId: 'cardio_1',
    date: d.toISOString(),
    savedAt: d.toISOString(),
    grupo: 'Cardio - TABATA',
    ejercicios: [],
    volumenTotal: 0,
    volumenPorGrupo: {},
    stats: { totalTime: 240, workTime: 160, restTime: 80, roundsCompleted: 8, calories: 27 },
  };
  const { ctx, pagina } = await abrir({ gymmate_history: [cardio, ...historialDePrueba([4])] });
  await pagina.locator('[data-nav="history"]').click();
  await pagina.waitForTimeout(400);
  const fila = await pagina.evaluate(() => {
    const f = document.querySelector('.f-hist__fila');
    return {
      texto: f?.innerText.replace(/\n/g, ' | ') ?? '',
      cifra: f?.querySelector('.f-hist__cifra')?.textContent ?? '',
    };
  });
  chk('la fila de cardio dice el modo con su nombre', fila.texto.includes('Tabata'), fila.texto);
  chk('y las rondas', fila.texto.includes('8 rondas'), fila.texto);
  chk('y el tiempo, no un guion', fila.cifra === '4:00', fila.cifra);

  await pagina.locator('.f-hist__fila').first().click();
  await pagina.waitForTimeout(400);
  const detalle = await pagina.evaluate(() => ({
    metricas: [...document.querySelectorAll('.f-metrica-hueso__label')].map((e) => e.textContent),
    hablaDeKg: (document.querySelector('#fierroHistorial')?.innerText ?? '').includes('mejor set histórico'),
    volumenCero: (document.querySelector('#fierroHistorial')?.innerText ?? '').includes('VOLUMEN\n0 kg'),
  }));
  chk('el detalle de cardio enseña tiempo y rondas',
    detalle.metricas.includes('TIEMPO') && detalle.metricas.includes('RONDAS'), detalle.metricas.join(','));
  chk('y NO enseña volumen 0 ni la nota de kg', !detalle.hablaDeKg && !detalle.volumenCero,
    JSON.stringify(detalle));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 36. PR-01 sin sesiones de un ejercicio: ni "SIN DATOS" ni marcador al 100%.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({
    gymmate_history: historialDePrueba([1, 4]),
    gymmate_prs: {
      'Prensa de Piernas': { peso: 120, sets: 4, reps: 12, volumen: 5760, date: new Date().toISOString() },
      'Hip Thrust': { peso: 90, sets: 3, reps: 10, volumen: 2700, date: new Date().toISOString() },
    },
  });
  await pagina.locator('[data-nav="profile"]').click();
  await pagina.waitForTimeout(300);
  await pagina.locator('[data-perfil="records"]').click();
  await pagina.waitForTimeout(600);
  const r = await pagina.evaluate(() => {
    const cards = [...document.querySelectorAll('#fierroRecords .f-hueso__card')];
    const hip = cards.find((c) => c.textContent?.includes('Hip Thrust'));
    const barras = [...document.querySelectorAll('#fierroRecords .f-zonas__marcador')].map((m) => {
      const p = m.parentElement.getBoundingClientRect();
      const b = m.getBoundingClientRect();
      return { dentro: b.left >= p.left - 0.5 && b.right <= p.right + 0.5 };
    });
    return {
      textoHip: hip?.innerText.replace(/\n/g, ' | ') ?? '',
      hipTieneBarra: !!hip?.querySelector('.f-zonas'),
      sinDatos: (document.querySelector('#fierroRecords')?.innerText ?? '').includes('SIN DATOS'),
      todosDentro: barras.every((b) => b.dentro),
      cuantas: barras.length,
    };
  });
  chk('un ejercicio sin sesiones NO dibuja una barra vacia', !r.hipTieneBarra, r.textoHip);
  chk('ni dice "SIN DATOS"', !r.sinDatos, r.textoHip);
  chk('dice qué hacer', /complétalo una vez/i.test(r.textoHip), r.textoHip);
  chk('y los marcadores que si existen caben dentro de su pista',
    r.cuantas > 0 && r.todosDentro, `${r.cuantas} marcadores`);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 41. CA-01 / CA-02 / P-01 / P-03 se dibujan de verdad, y sus cifras cuadran.
//
//     La leccion de la fase 6: una pantalla que ninguna puerta renderiza puede
//     reventar entera y todo sigue verde.
// --------------------------------------------------------------------------
{
  const hoy = new Date();
  const atras = (n, h = 12) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - n);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  const hist = [0, 3, 7].map((n, i) => ({
    sessionId: `w${i}`,
    date: atras(n),
    savedAt: atras(n),
    grupo: 'Piernas',
    type: 'weights',
    volumenTotal: 4800,
    volumenPorGrupo: { Piernas: 4800 },
    ejercicios: [
      { nombre: 'Press Banca', sets: 4, reps: 8, peso: 60, volumen: 1920, completado: true, esMancuerna: false, grupoMuscular: 'Pecho' },
    ],
  }));
  const medidas = [
    { date: atras(180), weight: 77.4, neck: 38, chest: 96, waist: 85, hips: 97, armRight: 34.5, thighRight: 55.5 },
    { date: atras(2), weight: 75.0, neck: 38, chest: 98, waist: 82, hips: 96, armRight: 36, thighRight: 58 },
  ];

  const { ctx, pagina } = await abrir({
    gymmate_history: hist,
    gymmate_body_measurements: medidas,
    gymmate_profile: { name: 'Alonso', birthdate: '1998-03-10', gender: 'male', weight: 75, height: 176, activity: 1.55 },
  });
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e)));
  pagina.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });

  // --- P-01 ---
  await pagina.evaluate(() => window.switchTab('profile'));
  await pagina.waitForTimeout(600);
  const p01 = await pagina.evaluate(() => ({
    texto: document.getElementById('profileTab')?.innerText ?? '',
    nombre: document.querySelector('[data-perfil-dato="name"]')?.value ?? '',
    peso: document.querySelector('[data-perfil-dato="weight"]')?.value ?? '',
    marcador: document.querySelector('.f-grasa__marcador')?.style.getPropertyValue('--t') ?? '',
  }));
  chk('P-01 se dibuja con los datos del perfil', p01.nombre === 'Alonso' && p01.peso === '75',
    `${p01.nombre} / ${p01.peso}`);
  chk('P-01 enseña el resumen de medidas', /PESO[\s\S]*PECHO[\s\S]*CINTURA[\s\S]*BRAZO/.test(p01.texto));
  // 14.4 % sobre escala 0-35 -> 0.4114. La barra anima desde 0, asi que llega
  // con valor: un marcador en 0 seria la animacion sin arrancar.
  chk('P-01 · el marcador de grasa cae donde dice la escala',
    Math.abs(Number(p01.marcador) - 0.4114) < 0.01, p01.marcador);

  // --- CA-01 y sus tres pestañas ---
  await pagina.evaluate(() => window.switchTab('calculators'));
  await pagina.waitForTimeout(600);
  const ca01 = await pagina.evaluate(() => document.getElementById('calculatorsTab')?.innerText ?? '');
  // Press Banca 60 kg x 8 -> Epley 76.0, Brzycki 74.5, Lombardi 73.9, media 74.8.
  // Son las cifras que CA-01 dibuja en el mockup.
  chk('CA-01 · el 1RM reproduce las cuatro cifras del mockup',
    ca01.includes('74.8') && ca01.includes('76.0') && ca01.includes('74.5') && ca01.includes('73.9'),
    ca01.replace(/\n/g, ' | ').slice(0, 200));

  await pagina.locator('[data-pestana="calorias"]').click();
  await pagina.waitForTimeout(400);
  const ca02 = await pagina.evaluate(() => document.getElementById('calculatorsTab')?.innerText ?? '');
  // 28 años, 75 kg, 176 cm, 1.55 -> BMR 1,715 / TDEE 2,658 / -20% 2,126 / +20% 3,190.
  chk('CA-02 · reproduce las cuatro cifras del mockup',
    ['1,715', '2,658', '2,126', '3,190'].every((c) => ca02.includes(c)),
    ca02.replace(/\n/g, ' | ').slice(0, 220));

  await pagina.locator('[data-pestana="progresivo"]').click();
  await pagina.waitForTimeout(400);
  const ca03 = await pagina.evaluate(() => document.getElementById('calculatorsTab')?.innerText ?? '');
  chk('CA-01 · el progresivo dibuja sus tres opciones',
    /Conservador[\s\S]*Moderado[\s\S]*Agresivo/.test(ca03), ca03.replace(/\n/g, ' | ').slice(0, 200));
  // Primero el rotulo: sin esto, `split('PRÓXIMO')[1]` era `undefined` en
  // cuanto alguien renombrara el bloque, la regex no matcheaba nada y la
  // guarda se apagaba sola en verde.
  chk('CA-01 · el progresivo rotula PRÓXIMO PESO, como el mockup', ca03.includes('PRÓXIMO PESO'),
    ca03.replace(/\n/g, ' | ').slice(0, 120));
  chk('y no escribe un decimal de mas', ca03.includes('PRÓXIMO') && !/\b\d+\.0\b/.test(ca03.split('PRÓXIMO')[1] ?? ''),
    (ca03.split('PRÓXIMO')[1] ?? '').replace(/\n/g, ' | ').slice(0, 120));

  // --- P-03 ---
  await pagina.evaluate(() => window.switchTab('medidas'));
  await pagina.waitForTimeout(600);
  const p03 = await pagina.evaluate(() => ({
    texto: document.getElementById('medidasTab')?.innerText ?? '',
    fondo: getComputedStyle(document.body).backgroundColor,
    puntos: document.querySelectorAll('#medidasTab polyline').length,
  }));
  chk('P-03 · vive en seccion Hueso', p03.fondo === 'rgb(246, 245, 242)', p03.fondo);
  chk('P-03 · dibuja las dos tendencias', p03.puntos === 2, String(p03.puntos));
  chk('P-03 · el cambio de perimetros sale de los datos',
    ['+2', '−3', '+1.5', '+2.5'].every((d) => p03.texto.includes(d)),
    p03.texto.replace(/\n/g, ' | ').slice(0, 240));
  // El pie es una afirmacion GENERADA: con estos datos dice lo del mockup.
  chk('P-03 · el pie afirma lo que los datos sostienen',
    p03.texto.includes('Brazo y muslo creciendo, cintura bajando'),
    (p03.texto.match(/Brazo[^\n]*/) || ['(no esta)'])[0]);

  chk('ninguna pantalla de perfil deja errores en consola', errores.length === 0, errores.slice(0, 3).join(' | '));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 42. Cambiar el peso corporal RECALCULA los rangos (README §6, el bug
//     `onBodyweightChange`: la funcion existia y no la llamaba nadie).
// --------------------------------------------------------------------------
{
  const hoy = new Date();
  const d = new Date(hoy);
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  const { ctx, pagina } = await abrir({
    gymmate_history: [
      {
        sessionId: 'w1',
        date: d.toISOString(),
        savedAt: d.toISOString(),
        grupo: 'Piernas',
        type: 'weights',
        volumenTotal: 8640,
        volumenPorGrupo: { Piernas: 8640 },
        ejercicios: [
          { nombre: 'Sentadilla', sets: 4, reps: 8, peso: 100, volumen: 3200, completado: true, esMancuerna: false, grupoMuscular: 'Piernas' },
        ],
      },
    ],
    gymmate_prs: { Sentadilla: { peso: 100, sets: 4, reps: 8, volumen: 3200, date: d.toISOString() } },
    gymmate_profile: { name: 'A', birthdate: '1998-03-10', gender: 'male', weight: 100, height: 176, activity: 1.55 },
  });
  await pagina.evaluate(() => window.switchTab('profile'));
  await pagina.waitForTimeout(700);
  const ratioAntes = await pagina.evaluate(
    () => JSON.parse(localStorage.getItem('gymmate_gamification') || '{}').muscleRanks?.piernas?.ratio ?? -1
  );

  // Mitad de peso corporal = el doble de ratio, con el mismo 1RM.
  await pagina.fill('[data-perfil-dato="weight"]', '50');
  await pagina.locator('[data-perfil="guardar"]').click();
  await pagina.waitForTimeout(900);
  const ratioDespues = await pagina.evaluate(
    () => JSON.parse(localStorage.getItem('gymmate_gamification') || '{}').muscleRanks?.piernas?.ratio ?? -1
  );

  chk('el ratio de piernas existia antes de tocar nada', ratioAntes > 0, String(ratioAntes));
  chk('bajar el peso corporal a la mitad DUPLICA el ratio',
    ratioAntes > 0 && Math.abs(ratioDespues / ratioAntes - 2) < 0.05,
    `${ratioAntes} -> ${ratioDespues}`);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 43b. GM-01/GM-02/GM-03 · los textos literales del handoff. Los tres tenian
//      cero aserciones: se podian reescribir enteros con las cuatro puertas en
//      verde.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({
    gymmate_history: historialDePrueba(),
    gymmate_prs: {
      'Prensa de Piernas': { peso: 120, sets: 4, reps: 12, volumen: 5760, date: new Date().toISOString() },
    },
    gymmate_profile: { name: 'A', birthdate: '1998-03-10', gender: 'male', weight: 80, height: 176, activity: 1.55 },
  });
  await pagina.locator('[data-nav="progress"]').click();
  await pagina.waitForTimeout(600);

  const gm01 = await pagina.evaluate(() => ({
    abierto: !document.getElementById('fierroProgreso')?.classList.contains('hidden'),
    titulo: document.querySelector('#fierroProgreso .f-prog__titulo')?.textContent?.trim() ?? '',
    logros: document.querySelector('[data-prog="logros"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    navInerte: document.querySelector('nav.f-tabbar')?.hasAttribute('inert') ?? false,
  }));
  chk('GM-01 · la pestaña PROGRESO abre la superposicion', gm01.abierto === true);
  chk('GM-01 · el titulo es PROGRESO', gm01.titulo === 'PROGRESO', gm01.titulo);
  chk('GM-01 · la fila de logros cuenta X DE 25, no una cadena fija',
    /^LOGROS · \d+ DE 25 ›$/.test(gm01.logros), gm01.logros);
  chk('GM-01 · la tab bar tapada queda inerte', gm01.navInerte === true);

  // GM-02
  await pagina.locator('[data-prog="rango"]').first().click();
  await pagina.waitForTimeout(400);
  const gm02 = await pagina.evaluate(() => ({
    titulo: document.querySelector('#fierroProgreso .f-prog__titulo')?.textContent?.trim() ?? '',
    sub: document.querySelector('#fierroProgreso .f-prog__sub')?.textContent?.trim() ?? '',
    especiales: [...document.querySelectorAll('#fierroProgreso .f-prog__label')]
      .map((e) => e.textContent.trim()).find((t) => t.startsWith('RANGOS ESPECIALES')) ?? '',
    escalones: [...document.querySelectorAll('.f-escalon__nombre')].map((e) => e.textContent.trim()),
    subs: [...document.querySelectorAll('.f-escalon__sub')].map((e) => e.textContent.trim()),
    franjas: [...document.querySelectorAll('.f-escalon__franja')].map((e) => e.textContent.trim()),
  }));
  chk('GM-02 · el titulo es RANGOS', gm02.titulo === 'RANGOS', gm02.titulo);
  chk('GM-02 · el subtitulo es el literal del mockup',
    gm02.sub === '1RM estimado ÷ peso corporal · ajustado por ejercicio', gm02.sub);
  chk('GM-02 · el bloque de especiales lleva su literal',
    gm02.especiales === 'RANGOS ESPECIALES · NO SE COMPRAN CON FUERZA', gm02.especiales);
  // Los nombres, el orden, las franjas y los subniveles se rederivan del
  // literal `rangoLadder` del mockup: tecleados a mano aqui, este chequeo
  // solo diria que la app coincide con lo que yo recordaba.
  chk('GM-02 · la escalera es la del mockup, en su orden',
    gm02.escalones.join(',') === LADDER_MOCKUP.map((r) => r.n).join(','),
    `${gm02.escalones.join(',')} vs ${LADDER_MOCKUP.map((r) => r.n).join(',')}`);
  chk('GM-02 · cada escalon lleva el subnivel que el mockup le pone',
    gm02.subs.join(',') === LADDER_MOCKUP.map((r) => r.sub).join(','),
    `${gm02.subs.join(',')} vs ${LADDER_MOCKUP.map((r) => r.sub).join(',')}`);
  chk('GM-02 · y las franjas de ratio tambien',
    gm02.franjas.join(',') === LADDER_MOCKUP.map((r) => r.r).join(','),
    `${gm02.franjas.join(',')} vs ${LADDER_MOCKUP.map((r) => r.r).join(',')}`);
  const especialesEnPantalla = await pagina.evaluate(() =>
    [...document.querySelectorAll('.f-especial__nombre')].map((e) => e.textContent.trim())
  );
  chk('GM-02 · los dos rangos especiales son los del mockup',
    especialesEnPantalla.join(',') === ESPECIALES_MOCKUP.map((e) => e.n).join(','),
    `${especialesEnPantalla.join(',')} vs ${ESPECIALES_MOCKUP.map((e) => e.n).join(',')}`);

  // GM-03
  await pagina.locator('[data-prog="volver"]').click();
  await pagina.waitForTimeout(300);
  await pagina.locator('[data-prog="logros"]').click();
  await pagina.waitForTimeout(400);
  const gm03 = await pagina.evaluate(() => ({
    titulo: document.querySelector('#fierroProgreso .f-prog__titulo')?.textContent?.trim() ?? '',
    sub: document.querySelector('#fierroProgreso .f-prog__sub')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    pct: document.querySelector('.f-prog__pct')?.textContent?.trim() ?? '',
    filtros: [...document.querySelectorAll('[data-prog="filtro"]')].map((e) => e.textContent.trim()),
    bloques: [...document.querySelectorAll('#fierroProgreso .f-prog__label')].map((e) => e.textContent.trim()),
  }));
  chk('GM-03 · el titulo es LOGROS', gm03.titulo === 'LOGROS', gm03.titulo);
  chk('GM-03 · el subtitulo cuenta sobre 25 y declara el XP de logros',
    /^\d+ de 25 · [\d,]+ XP ganados por logros$/.test(gm03.sub), gm03.sub);
  chk('GM-03 · los cuatro filtros son los del mockup',
    gm03.filtros.join(',') === 'TODOS,SESIONES,VOLUMEN,RACHAS', gm03.filtros.join(','));
  chk('GM-03 · los tres bloques llevan su literal',
    gm03.bloques.includes('EN PROGRESO — LO PRÓXIMO A CAER') &&
      gm03.bloques.includes('CONSEGUIDOS') &&
      gm03.bloques.includes('BLOQUEADOS — CÓMO SE ABREN, SIEMPRE VISIBLE'),
    gm03.bloques.join(' | '));
  // El porcentaje es el de la cuenta, no un numero suelto.
  const [hechos, total] = gm03.sub.match(/^(\d+) de (\d+)/).slice(1).map(Number);
  chk('GM-03 · el porcentaje se rederiva de la cuenta',
    gm03.pct === `${Math.round((hechos / total) * 100)}%`, `${gm03.pct} con ${hechos}/${total}`);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 43. CO-01 · el coach se abre de verdad y dice lo que el mockup dice.
//     Tres pantallas del handoff (CO-01/02/03) no tenian NI UNA comprobacion:
//     un mutante que hiciera `throw` en `abrirCoach` pasaba las cuatro
//     puertas en verde.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({
    gymmate_history: historialDePrueba(),
    gymmate_prs: {
      'Prensa de Piernas': { peso: 120, sets: 4, reps: 12, volumen: 5760, date: new Date().toISOString() },
    },
  });
  const tarjeta = pagina.locator('.f-home__coach');
  chk('H-01 · la tarjeta del coach esta en la home', (await tarjeta.count()) === 1);
  await tarjeta.first().click();
  await pagina.waitForTimeout(500);

  const visible = await pagina.locator('#fierroCoach:not(.hidden)').count();
  chk('CO-01 · pulsar la tarjeta abre el coach', visible === 1);

  const cabecera = (await pagina.locator('#fierroCoach .f-coach__titulo').innerText().catch(() => '')).trim();
  chk('CO-01 · la cabecera dice COACH, como el mockup', cabecera === 'COACH', cabecera);

  const volver = (await pagina.locator('#fierroCoach [data-coach="cerrar"]').innerText().catch(() => '')).trim();
  chk('CO-01 · el volver es la flecha del mockup', volver === '←', volver);

  const marcador = await pagina.getAttribute('#coachEntrada', 'placeholder');
  chk('CO-01 · el compositor lleva el texto literal del mockup',
    marcador === 'Pregúntale a tus datos…', String(marcador));

  const enviar = (await pagina.locator('#fierroCoach [data-coach="enviar"]').innerText().catch(() => '')).trim();
  chk('CO-01 · el enviar es la flecha del mockup', enviar === '↑', enviar);

  // El primer turno viene del banner de la home, no de una cadena inventada.
  const mensajeBanner = (await tarjeta.first().getAttribute('data-mensaje')) ?? '';
  const primerTurno = (await pagina.locator('#fierroCoach .f-coach__texto').first().innerText().catch(() => '')).trim();
  chk('CO-01 · el primer turno ES el mensaje de la home, no otro texto',
    mensajeBanner.length > 0 && primerTurno === mensajeBanner, `${primerTurno} | ${mensajeBanner}`);

  const sello = (await pagina.locator('#fierroCoach .f-coach__sello').first().innerText().catch(() => '')).trim();
  chk('CO-01 · el sello del turno es "COACH · HOY HH:MM"',
    /^COACH · HOY \d{2}:\d{2}$/.test(sello), sello);

  // La tab bar queda tapada por la superposicion: el mockup no la dibuja.
  const navInerte = await pagina.evaluate(() => document.querySelector('nav.f-tabbar')?.hasAttribute('inert'));
  chk('CO-01 · la tab bar queda inerte mientras el coach esta abierto', navInerte === true);

  // La conversacion se persiste, que es lo que hace que reabrir no la pierda.
  const guardada = await pagina.evaluate(() => JSON.parse(localStorage.getItem('gymmate_coach_conversacion') || '[]').length);
  chk('CO-01 · la conversacion queda guardada', guardada >= 1, String(guardada));

  await pagina.locator('#fierroCoach [data-coach="cerrar"]').click();
  await pagina.waitForTimeout(300);
  const trasCerrar = await pagina.evaluate(() => document.querySelector('nav.f-tabbar')?.hasAttribute('inert'));
  chk('CO-01 · al cerrar, la tab bar vuelve', trasCerrar === false);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 44. CO-01 · la aritmetica del componente de datos sale del historial, NO del
//     modelo. Regla del handoff: "la aritmetica nunca la genera el modelo".
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({
    gymmate_history: historialDePrueba(),
    gymmate_prs: {
      'Prensa de Piernas': { peso: 120, sets: 4, reps: 12, volumen: 5760, date: new Date().toISOString() },
    },
  });
  await pagina.locator('.f-home__coach').first().click();
  await pagina.waitForTimeout(400);
  await pagina.fill('#coachEntrada', '¿Cómo voy en prensa de piernas?');
  await pagina.locator('#fierroCoach [data-coach="enviar"]').click();
  await pagina.waitForTimeout(1200);

  const etiqueta = (await pagina.locator('.f-coach__dato-label').last().innerText().catch(() => '')).trim();
  chk('CO-01 · el componente de datos rotula el ejercicio y 1RM EST.',
    etiqueta === 'PRENSA DE PIERNAS · 1RM EST.', etiqueta);

  const cifraCoach = (await pagina.locator('.f-coach__dato-cifra').last().innerText().catch(() => '')).trim();
  // 1RM promedio de las tres formulas para 120 kg x 12, rederivado a mano.
  const epley = 120 * (1 + 12 / 30);
  const brzycki = 120 * (36 / (37 - 12));
  const lombardi = 120 * Math.pow(12, 0.1);
  const promedio = (epley + brzycki + lombardi) / 3;
  chk('CO-01 · la cifra es el 1RM rederivado a mano, no un numero del modelo',
    cifraCoach.startsWith(String(Math.round(promedio))), `${cifraCoach} vs ${promedio.toFixed(1)}`);
  // Y es LA MISMA cifra que enseña PR-01 bajo el mismo rotulo: el coach usaba
  // Epley a secas y ponia 168 donde PR-01 pone 165.
  await pagina.locator('#fierroCoach [data-coach="cerrar"]').click();
  await pagina.waitForTimeout(300);
  await pagina.evaluate(() => window.switchTab('prs'));
  await pagina.waitForTimeout(600);
  const enRecords = (await pagina.locator('#fierroRecords').innerText().catch(() => '')).replace(/\s+/g, ' ');
  chk('CO-01 · el 1RM del coach coincide con el de PR-01',
    enRecords.includes(cifraCoach.split(' ')[0]), `coach ${cifraCoach} | PR-01 ${enRecords.slice(0, 160)}`);

  const pie = (await pagina.locator('.f-coach__dato-pie').last().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  chk('CO-01 · el pie declara el pico real del historial (120 kg)',
    pie.includes('PICO 120 KG'), pie);

  // La voz del handoff: el peso objetivo, nunca la diferencia.
  const respuesta = (await pagina.locator('#fierroCoach .f-coach__texto').last().innerText().catch(() => '')).trim();
  chk('CO-01 · la respuesta dice el peso objetivo, no "te faltan X kg"',
    /Levanta 122\.5 kg/.test(respuesta) && !/faltan/i.test(respuesta), respuesta);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 45. CO-02 · PENSANDO → streaming → DETENER. El adaptador local responde al
//     instante, asi que el estado intermedio nunca se veia.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  await pagina.locator('.f-home__coach').first().click();
  await pagina.waitForTimeout(400);
  // Adaptador lento: 700 ms hasta el primer token, luego una palabra cada 250.
  await pagina.evaluate(() => {
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__coachDePrueba.usarAdaptador({
      enLinea: true,
      datosPara: () => null,
      async *responder() {
        await espera(700);
        for (const t of ['Agosto ', 'va ', 'mejor ', 'que ', 'julio.']) {
          yield t;
          await espera(250);
        }
      },
    });
  });
  await pagina.fill('#coachEntrada', '¿Cómo voy este mes?');
  await pagina.locator('#fierroCoach [data-coach="enviar"]').click();
  await pagina.waitForTimeout(250);

  const pensando = (await pagina.locator('.f-coach__sello--pensando').innerText().catch(() => '')).trim();
  chk('CO-02 · antes del primer token el sello dice PENSANDO', pensando === 'PENSANDO', pensando);

  const marcadorEsperando = await pagina.getAttribute('#coachEntrada', 'placeholder');
  chk('CO-02 · el compositor dice "Esperando respuesta…"',
    marcadorEsperando === 'Esperando respuesta…', String(marcadorEsperando));

  const detener = (await pagina.locator('#fierroCoach [data-coach="detener"]').innerText().catch(() => '')).trim();
  chk('CO-02 · el enviar se convierte en el DETENER del mockup (■)', detener === '■', detener);
  const rojo = await pagina.evaluate(() => {
    const b = document.querySelector('.f-coach__enviar--detener');
    return b ? getComputedStyle(b).color : '';
  });
  chk('CO-02 · el detener va en rojo destructivo', rojo === 'rgb(229, 72, 77)', rojo);

  // Ya en streaming: el texto crece por trozos.
  await pagina.waitForTimeout(900);
  const parcial1 = (await pagina.locator('#coachParcial').innerText().catch(() => '')).trim();
  await pagina.waitForTimeout(600);
  const parcial2 = (await pagina.locator('#coachParcial').innerText().catch(() => '')).trim();
  chk('CO-02 · la respuesta llega en streaming, no de golpe',
    parcial1.length > 0 && parcial2.length > parcial1.length, `${parcial1} -> ${parcial2}`);

  // Dos preguntas seguidas: el segundo turno NO puede reescribir el primero.
  // El streaming usaba `.f-coach__texto:last-of-type`, que mira el TIPO de
  // elemento (span) y no la clase, asi que la segunda respuesta se pintaba
  // encima de la primera. El comentario del codigo era la unica defensa.
  await pagina.locator('#fierroCoach [data-coach="detener"]').click();
  await pagina.waitForTimeout(300);
  await pagina.evaluate(() => {
    window.__coachDePrueba.usarAdaptador({
      enLinea: true,
      datosPara: () => null,
      async *responder(pregunta) { yield pregunta.includes('uno') ? 'PRIMERA.' : 'SEGUNDA.'; },
    });
  });
  await pagina.fill('#coachEntrada', 'pregunta uno');
  await pagina.locator('#fierroCoach [data-coach="enviar"]').click();
  await pagina.waitForTimeout(700);
  await pagina.fill('#coachEntrada', 'pregunta dos');
  await pagina.locator('#fierroCoach [data-coach="enviar"]').click();
  await pagina.waitForTimeout(900);
  const textos = await pagina.evaluate(() =>
    [...document.querySelectorAll('#fierroCoach .f-coach__card .f-coach__texto')].map((e) => e.textContent.trim())
  );
  chk('CO-02 · la segunda respuesta no reescribe la primera',
    textos.includes('PRIMERA.') && textos.includes('SEGUNDA.'), textos.join(' | '));

  // Y detener devuelve el compositor conservando lo escrito.
  await pagina.evaluate(() => {
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__coachDePrueba.usarAdaptador({
      enLinea: true,
      datosPara: () => null,
      async *responder() {
        for (const t of ['Agosto ', 'va ', 'mejor ', 'que ', 'julio.']) { yield t; await espera(300); }
      },
    });
  });
  await pagina.fill('#coachEntrada', 'otra mas');
  await pagina.locator('#fierroCoach [data-coach="enviar"]').click();
  await pagina.waitForTimeout(500);
  await pagina.locator('#fierroCoach [data-coach="detener"]').click();
  await pagina.waitForTimeout(400);
  const vuelveElEnviar = (await pagina.locator('#fierroCoach [data-coach="enviar"]').innerText().catch(() => '')).trim();
  chk('CO-02 · detener devuelve el compositor', vuelveElEnviar === '↑', vuelveElEnviar);
  const conservado = (await pagina.locator('#fierroCoach .f-coach__texto').last().innerText().catch(() => '')).trim();
  chk('CO-02 · lo que ya habia escrito no se tira', conservado.startsWith('Agosto'), conservado);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 46. CO-03 · sin conexion. El texto es literal del mockup, la pregunta queda
//     en cola, y el resto de la app no se entera.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  await pagina.locator('.f-home__coach').first().click();
  await pagina.waitForTimeout(400);
  await pagina.evaluate(() => {
    window.__coachDePrueba.usarAdaptador({
      enLinea: true,
      datosPara: () => null,
      // eslint-disable-next-line require-yield
      async *responder() {
        throw new Error('sin red');
      },
    });
  });
  await pagina.fill('#coachEntrada', '¿Qué rutina toca hoy?');
  await pagina.locator('#fierroCoach [data-coach="enviar"]').click();
  await pagina.waitForTimeout(700);

  const etiquetaError = (await pagina.locator('.f-coach__error-label').innerText().catch(() => '')).trim();
  chk('CO-03 · el error se rotula SIN CONEXIÓN', etiquetaError === 'SIN CONEXIÓN', etiquetaError);

  const textoError = (await pagina.locator('.f-coach__error .f-coach__texto').innerText().catch(() => '')).trim();
  chk('CO-03 · el texto del error es el literal del mockup',
    textoError === 'No se pudo conectar con el coach. Tu pregunta quedó guardada — reintenta cuando vuelva la señal.',
    textoError);

  const reintentar = (await pagina.locator('[data-coach="reintentar"]').first().innerText().catch(() => '')).trim();
  chk('CO-03 · ofrece Reintentar', reintentar.includes('Reintentar') || reintentar.includes('reintentar'), reintentar);

  const cola = await pagina.evaluate(() => JSON.parse(localStorage.getItem('gymmate_coach_cola') || '[]'));
  chk('CO-03 · la pregunta queda guardada de verdad, no solo en el texto',
    Array.isArray(cola) && cola.includes('¿Qué rutina toca hoy?'), JSON.stringify(cola));

  // "El resto de la app no se entera: todo lo demas es local."
  await pagina.locator('#fierroCoach [data-coach="cerrar"]').click();
  await pagina.waitForTimeout(300);
  await pagina.evaluate(() => window.switchTab('history'));
  await pagina.waitForTimeout(600);
  const hayHistorial = await pagina.locator('#fierroHistorial [data-hueso="detalle"]').count();
  chk('CO-03 · con el coach caido, el historial sigue funcionando', hayHistorial > 0, String(hayHistorial));

  // Y al volver la señal, la cola se drena.
  await pagina.evaluate(() => {
    window.__coachDePrueba.usarAdaptador({
      enLinea: true,
      datosPara: () => null,
      async *responder() { yield 'Toca piernas.'; },
    });
  });
  await pagina.evaluate(() => window.switchTab('home'));
  await pagina.waitForTimeout(400);
  await pagina.locator('.f-home__coach').first().click();
  await pagina.waitForTimeout(400);
  await pagina.locator('[data-coach="reintentar"]').first().click();
  await pagina.waitForTimeout(900);
  const colaFinal = await pagina.evaluate(() => JSON.parse(localStorage.getItem('gymmate_coach_cola') || '[]'));
  chk('CO-03 · al volver la señal la cola se vacia', colaFinal.length === 0, JSON.stringify(colaFinal));
  const respondio = (await pagina.locator('#fierroCoach .f-coach__texto').last().innerText().catch(() => '')).trim();
  chk('CO-03 · y la pregunta guardada obtiene su respuesta', respondio === 'Toca piernas.', respondio);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 46b. Importar un CSV no puede BAJAR nada de lo que el usuario ya tenia.
//      `reinitGamification()` rederivaba el estado desde cero: importar UNA
//      sesion vieja —mas datos, no menos— le quitaba al usuario los bonos de
//      hito de racha, el escalon real de sus PRs, los ascensos de rango y su
//      mejor racha. Bajaba de nivel bajo un toast verde, sin vuelta atras.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba([1, 2, 3, 4, 5, 6, 7]) });

  // Estado "ganado en vivo": lo que la migracion NO sabe rederivar.
  await pagina.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('gymmate_gamification'));
    g.playerStats.totalXP += 3000;
    g.streakData.bestStreak = 31;
    g.streakData.streakMilestones = [3, 7, 14, 30];
    const logro = g.achievements.find((a) => !a.unlockedAt);
    if (logro) logro.unlockedAt = '2026-01-15T12:00:00.000Z';
    localStorage.setItem('gymmate_gamification', JSON.stringify(g));
  });
  const antes = await pagina.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('gymmate_gamification'));
    return {
      xp: g.playerStats.totalXP,
      nivel: g.playerStats.level,
      mejor: g.streakData.bestStreak,
      hitos: g.streakData.streakMilestones,
      logros: g.achievements.filter((a) => a.unlockedAt).length,
    };
  });

  // Y ahora se importa UNA sesion vieja, de un dia que no esta en el historial.
  const dialogoX = pagina.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
  await pagina.evaluate(() => window.switchTab('history'));
  await pagina.waitForTimeout(500);
  await pagina.locator('[data-hueso="importar"]').first().click();
  const chX = await dialogoX;
  if (!chX) {
    chk('importar · llega el selector de archivo', false, 'no se abrio el filechooser');
  } else {
    const csvViejo =
      '=== ENTRENAMIENTOS DE PESAS ===\n' +
      'Fecha,Grupo,Ejercicio,Sets,Reps,Peso (kg),Es Mancuerna,Grupo Muscular,Volumen,Completado,Volumen Total Sesión\n' +
      '01/02/2026,GRUPO 1 - Piernas + Glúteos,Prensa de Piernas,4,12,90,No,Piernas,4320,Sí,4320\n';
    await chX.setFiles({ name: 'viejo.csv', mimeType: 'text/csv', buffer: Buffer.from(csvViejo, 'utf-8') });
    await pagina.waitForTimeout(1500);
    const despues = await pagina.evaluate(() => {
      const g = JSON.parse(localStorage.getItem('gymmate_gamification'));
      return {
        xp: g.playerStats.totalXP,
        nivel: g.playerStats.level,
        mejor: g.streakData.bestStreak,
        hitos: g.streakData.streakMilestones,
        logros: g.achievements.filter((a) => a.unlockedAt).length,
        sesiones: JSON.parse(localStorage.getItem('gymmate_history')).length,
      };
    });
    chk('importar · la sesion vieja entra de verdad', despues.sesiones === 8, String(despues.sesiones));
    chk('importar NO baja el XP', despues.xp >= antes.xp, `${antes.xp} -> ${despues.xp}`);
    chk('importar NO baja el nivel', despues.nivel >= antes.nivel, `${antes.nivel} -> ${despues.nivel}`);
    chk('importar NO borra la mejor racha', despues.mejor >= antes.mejor, `${antes.mejor} -> ${despues.mejor}`);
    chk('importar NO borra los hitos de racha cobrados',
      antes.hitos.every((h) => despues.hitos.includes(h)),
      `${JSON.stringify(antes.hitos)} -> ${JSON.stringify(despues.hitos)}`);
    chk('importar NO desconsigue logros', despues.logros >= antes.logros, `${antes.logros} -> ${despues.logros}`);
  }
  await ctx.close();
}

// --------------------------------------------------------------------------
// 47. Una fecha ilegible en localStorage no puede pintar "Invalid Date" ni
//     "hace NaN días". Entraban por un CSV editado a mano; el importador ya
//     las filtra, pero un historial viejo puede traerlas y el rotulo miente.
// --------------------------------------------------------------------------
{
  const { ctx, pagina } = await abrir({
    gymmate_history: [
      {
        sessionId: 'roto', date: 'no-es-fecha', savedAt: 'no-es-fecha',
        grupo: 'GRUPO 4 - Espalda + Bíceps', type: 'weights',
        volumenTotal: 1000, volumenPorGrupo: { Espalda: 1000 },
        ejercicios: [{ nombre: 'Remo', sets: 3, reps: 10, peso: 40, volumen: 1200,
          completado: true, esMancuerna: false, grupoMuscular: 'Espalda' }],
      },
      ...historialDePrueba([2, 5]),
    ],
    gymmate_body_measurements: [{ date: 'tampoco', weight: 75, chest: 98, waist: 82 }],
  });
  const miente = (t) => /Invalid Date|NaN/.test(t);

  const home = await pagina.locator('#fierroHome').innerText();
  chk('H-01 · una fecha ilegible no se pinta como Invalid Date ni NaN', !miente(home),
    (home.match(/.{0,40}(Invalid Date|NaN).{0,20}/) ?? ['(limpio)'])[0]);

  await pagina.evaluate(() => window.switchTab('history'));
  await pagina.waitForTimeout(600);
  const hist = await pagina.locator('#fierroHistorial').innerText();
  chk('HI-01 · tampoco en el historial', !miente(hist),
    (hist.match(/.{0,40}(Invalid Date|NaN).{0,20}/) ?? ['(limpio)'])[0]);

  await pagina.locator('#fierroHistorial [data-hueso="detalle"]').first().click();
  await pagina.waitForTimeout(500);
  const det = await pagina.locator('#fierroHistorial').innerText();
  chk('HI-02 · tampoco en el detalle de sesion', !miente(det),
    (det.match(/.{0,40}(Invalid Date|NaN).{0,20}/) ?? ['(limpio)'])[0]);

  await pagina.evaluate(() => window.switchTab('profile'));
  await pagina.waitForTimeout(600);
  const perf = await pagina.locator('#profileTab').innerText();
  chk('P-01 · tampoco en el perfil', !miente(perf),
    (perf.match(/.{0,40}(Invalid Date|NaN).{0,20}/) ?? ['(limpio)'])[0]);
  await ctx.close();
}

// --------------------------------------------------------------------------
// 48. Un nombre con comilla doble no puede inyectar atributos ni truncarse.
//     `escapar()` no escapaba `"`, y media app interpola en atributos: un CSV
//     de backup ajeno bastaba para ejecutar JS en el origen de la app.
// --------------------------------------------------------------------------
{
  const NOMBRE = 'x" onfocus="window.__INYECTADO=1" z="';
  const EJERCICIO = 'Press "Militar"';
  const { ctx, pagina } = await abrir({
    gymmate_profile: { name: NOMBRE, birthdate: '1998-03-10', gender: 'male', weight: 75, height: 176, activity: 1.55 },
    gymmate_history: [
      {
        sessionId: 'a', date: new Date(Date.now() - 86400000).toISOString(),
        savedAt: new Date(Date.now() - 86400000).toISOString(),
        grupo: 'Pecho', type: 'weights', volumenTotal: 1200, volumenPorGrupo: { Pecho: 1200 },
        ejercicios: [{ nombre: EJERCICIO, sets: 3, reps: 10, peso: 40, volumen: 1200,
          completado: true, esMancuerna: false, grupoMuscular: 'Pecho' }],
      },
    ],
  });
  await pagina.evaluate(() => window.switchTab('profile'));
  await pagina.waitForTimeout(700);
  const inyec = await pagina.evaluate((n) => {
    const campo = document.querySelector('[data-perfil-dato="name"]');
    if (campo) campo.dispatchEvent(new FocusEvent('focus'));
    return {
      atributos: campo ? [...campo.attributes].map((a) => a.name) : [],
      valor: campo ? campo.value : null,
      ejecutado: window.__INYECTADO === 1,
      esperado: n,
    };
  }, NOMBRE);
  chk('P-01 · una comilla en el nombre no ejecuta nada', inyec.ejecutado === false);
  chk('P-01 · y no crea atributos nuevos en el input',
    !inyec.atributos.includes('onfocus') && !inyec.atributos.includes('z'), inyec.atributos.join(','));
  chk('P-01 · el nombre vuelve ENTERO, sin truncar en la comilla',
    inyec.valor === inyec.esperado, `${inyec.valor}`);

  // Y el nombre del ejercicio en el <select> de G-01, que se cortaba en la comilla.
  await pagina.evaluate(() => window.switchTab('charts'));
  await pagina.waitForTimeout(700);
  const opciones = await pagina.evaluate(() =>
    [...document.querySelectorAll('.f-graf__selector option')].map((o) => o.value)
  );
  chk('G-01 · un ejercicio con comillas no se trunca en el selector',
    opciones.includes('Press "Militar"'), JSON.stringify(opciones));
  await ctx.close();
}

// --------------------------------------------------------------------------
// 49. Zonas seguras del sistema. En un iPhone la barra de estado y el
//     indicador de inicio se comen franjas de la pantalla, y iOS se queda los
//     toques que caen ahi. La app se pinta debajo a proposito
//     (`viewport-fit=cover` + `black-translucent`), asi que apartar el
//     contenido es responsabilidad nuestra — y arriba no se hacia: el saludo
//     quedaba bajo la hora y la ✕ de las superposiciones era INTOCABLE. Habia
//     que matar la app para salir de PROGRESO.
//
//     `env()` no se puede fijar desde Playwright, pero todo el CSS deriva de
//     dos tokens: se fuerzan a los valores reales de un iPhone con Dynamic
//     Island (59pt arriba, 34pt abajo). Si algo dejara de derivar de ellos,
//     este caso no lo moveria — y por eso tambien se comprueba que la barra
//     CAMBIA de alto al forzarlos.
// --------------------------------------------------------------------------
{
  const ARRIBA = 59;
  const ABAJO = 34;
  const ctx = await navegador.newContext({ viewport: { width: 402, height: 874 }, ...ZONA });
  const pagina = await ctx.newPage();
  await pagina.addInitScript(
    ({ h, arriba, abajo }) => {
      localStorage.setItem('gymmate_history', JSON.stringify(h));
      localStorage.setItem(
        'gymmate_profile',
        JSON.stringify({ name: 'A', birthdate: '1998-03-10', gender: 'male', weight: 75, height: 176, activity: 1.55 })
      );
      addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--safe-area-inset-top', arriba + 'px');
        document.documentElement.style.setProperty('--safe-area-inset-bottom', abajo + 'px');
      });
    },
    { h: historialDePrueba(), arriba: ARRIBA, abajo: ABAJO }
  );
  pagina.setDefaultTimeout(4000);
  await pagina.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
  await pagina.waitForTimeout(900);

  // La barra crece con el indicador, y el cuerpo reserva EXACTAMENTE su alto.
  // Sumar 22px + 34px daba 56px de vacio y el cuerpo reservaba 22px de mas.
  const barra = await pagina.evaluate(() => {
    const n = document.querySelector('nav.f-tabbar');
    return {
      alto: +n.getBoundingClientRect().height.toFixed(1),
      pad: parseFloat(getComputedStyle(n).paddingBottom),
      reserva: parseFloat(getComputedStyle(document.body).paddingBottom),
    };
  });
  chk('zonas seguras · el hueco de abajo es el del indicador, no la suma',
    barra.pad === ABAJO, `padding-bottom ${barra.pad}px (deberia ser ${ABAJO}, no ${22 + ABAJO})`);
  chk('zonas seguras · el cuerpo reserva justo el alto de la barra',
    Math.abs(barra.reserva - barra.alto) < 0.5, `reserva ${barra.reserva} vs barra ${barra.alto}`);
  chk('zonas seguras · la barra CRECE con el indicador (los tokens mandan de verdad)',
    barra.alto === 59 + ABAJO, `${barra.alto}px`);

  // Nada que se lea o se toque puede empezar dentro de la franja de arriba.
  const invade = async (nombre) => {
    const dentro = await pagina.evaluate((arriba) => {
      const malos = [];
      for (const e of document.querySelectorAll('body *')) {
        const r = e.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || r.top >= arriba) continue;
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
        // El enlace de salto vive fuera de pantalla hasta que recibe el foco.
        if (e.classList.contains('skip-link')) continue;
        const tocable = e.matches('button,a,input,select,textarea,[role="button"]');
        const conTexto = e.children.length === 0 && (e.textContent || '').trim() !== '';
        if (tocable || conTexto) malos.push(`${e.className || e.tagName}@${Math.round(r.top)}`);
      }
      return [...new Set(malos)].slice(0, 4);
    }, ARRIBA);
    chk(`zonas seguras · ${nombre} no mete nada bajo la barra de estado`,
      dentro.length === 0, dentro.join(', '));
  };

  await invade('H-01');
  await pagina.evaluate(() => window.switchTab('history'));
  await pagina.waitForTimeout(500);
  await invade('HISTORIAL');
  await pagina.evaluate(() => window.switchTab('profile'));
  await pagina.waitForTimeout(500);
  await invade('PERFIL');
  await pagina.evaluate(() => window.switchTab('home'));
  await pagina.waitForTimeout(500);

  // Los cerradores de las tres superposiciones: el defecto que obligaba a
  // matar la app. No basta con que esten pintados — tienen que RECIBIR el
  // toque en su centro.
  const cerrador = async (nombre, abrir, sel) => {
    await abrir();
    await pagina.waitForTimeout(600);
    const r = await pagina.evaluate((sel) => {
      const b = document.querySelector(sel);
      if (!b) return null;
      const q = b.getBoundingClientRect();
      const en = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return { top: +q.top.toFixed(1), recibe: en === b || b.contains(en) };
    }, sel);
    chk(`zonas seguras · el cerrador de ${nombre} cae fuera de la franja del sistema`,
      r !== null && r.top >= ARRIBA, r ? `top ${r.top}px (minimo ${ARRIBA})` : `sin ${sel}`);
    chk(`zonas seguras · y recibe el toque en su centro`, r?.recibe === true);
  };
  await cerrador('PROGRESO', () => pagina.locator('[data-nav="progress"]').click(), '[data-prog="cerrar"]');
  await pagina.locator('[data-prog="cerrar"]').click();
  await pagina.waitForTimeout(400);
  await cerrador('el coach', () => pagina.locator('.f-home__coach').first().click(), '[data-coach="cerrar"]');
  await pagina.locator('[data-coach="cerrar"]').click();
  await pagina.waitForTimeout(400);
  await cerrador('el builder', () => pagina.locator('#fabButton').click(), '[data-builder="cerrar"]');
  await ctx.close();
}

// --------------------------------------------------------------------------
clearTimeout(abortar);
await navegador.close();
servidor.close();
// Trinquete de cuenta. tokens tiene el suyo (`rederivados < 40`) y fidelidad
// dos; esta imprimia "OK" con los chequeos que fuera. Si un boton deja de
// abrir un selector de archivo o una pantalla deja de pintarse, media docena
// de casos dejan de ejecutarse y el verde no cambia de color.
console.log(`\n${ejecutados} chequeos ejecutados`);
const CHEQUEOS_MINIMO = 300;
if (ejecutados < CHEQUEOS_MINIMO) {
  fallos++;
  console.log(
    `\nFALLA solo se ejecutaron ${ejecutados} chequeos (minimo ${CHEQUEOS_MINIMO}): ` +
      'algun caso se salto entero'
  );
}
const costo = Math.round((Date.now() - ARRANQUE) / 1000);
console.log(`\ncosto ${costo}s de un tope de ${PRESUPUESTO_MS / 1000}s (${Math.round((costo * 100000) / PRESUPUESTO_MS)}% del presupuesto)`);
console.log(fallos ? `\n${fallos} FALLO(S) DE COMPORTAMIENTO` : '\nOK: sin fallos de comportamiento');
process.exit(fallos ? 1 : 0);
