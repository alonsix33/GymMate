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
const chk = (n, ok, d = '') => {
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
function datosDelMockup(nombre) {
  const i = MOCKUP.indexOf(`const ${nombre} = [`);
  if (i === -1) throw new Error(`El mockup no declara ${nombre}: la puerta no puede comparar contra nada`);
  const desde = MOCKUP.indexOf('[', i);
  let nivel = 0;
  for (let k = desde; k < MOCKUP.length; k++) {
    if (MOCKUP[k] === '[') nivel++;
    else if (MOCKUP[k] === ']' && --nivel === 0) {
      // eslint-disable-next-line no-new-func
      return Function(`"use strict";return (${MOCKUP.slice(desde, k + 1)})`)();
    }
  }
  throw new Error(`No se pudo cerrar el literal ${nombre} del mockup`);
}

const CARDIO_MODES_MOCKUP = datosDelMockup('cardioModes');
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
// recorrido de los seis modos son otros ~20s. El tope sigue siendo un tope: si
// se dispara, es que algo se colgo.
const PRESUPUESTO_MS = 420000;

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
  process.exit(1);
}, PRESUPUESTO_MS);
abortar.unref?.();

const navegador = await chromium.launch({ executablePath: CHROME });

/** Pagina limpia, opcionalmente con localStorage sembrado. */
async function abrir(semilla = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
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
  date: new Date().toISOString().split('T')[0],
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
        await pagina.locator('.f-sheet .f-btn--secundario').first().click();
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
    const token = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--h-nav-inferior')
    );
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
    const destinos = {
      progreso: 'showGamificationModal',
      cardio: 'showCardioSelector',
      importar: 'importFromCSV',
    };
    const rotas = acciones
      .filter((a) => a in destinos)
      .filter((a) => typeof window[destinos[a]] !== 'function');
    return { acciones, rotas };
  });
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
    const sobre = (sel) => {
      const c = document.querySelector(sel).getBoundingClientRect();
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
  const ctx = await navegador.newContext({ viewport: { width: 900, height: 844 } });
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
  const { ctx, pagina } = await abrir({ gymmate_history: historialDePrueba() });
  for (const [destino, camino] of [
    ['prs', ['[data-nav="profile"]', '[data-action="prs"]']],
    ['charts', ['[data-nav="profile"]', '[data-action="charts"]']],
    ['calculators', ['[data-nav="profile"]', '[data-action="calculators"]']],
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
  const r = await pagina.evaluate(async () => {
    window.openWorkoutBuilder?.();
    await new Promise((r) => setTimeout(r, 300));
    const nombre = document.getElementById('customWorkoutName');
    if (nombre) {
      nombre.value = 'Rutina de prueba';
      nombre.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Se toca el primer ejercicio de la lista tal cual lo hace el usuario.
    document.querySelector('#exerciseGroupsList [onclick*="toggleExerciseSelection"]')?.click();
    await new Promise((r) => setTimeout(r, 150));
    window.saveCustomWorkout?.();
    await new Promise((r) => setTimeout(r, 400));
    return {
      guardadas: JSON.parse(localStorage.getItem('gymmate_custom_workouts') || '[]').map((w) => w.nombre),
      enPantalla: [...document.querySelectorAll('#fierroHome [data-custom-workout]')].map(
        (el) => el.textContent.trim().split('\n')[0].trim()
      ),
    };
  });
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

  await pagina.locator('[data-nav="profile"]').click();
  await pagina.waitForTimeout(250);
  await pagina.evaluate(() => window.openMeasurementsModal?.());
  await pagina.waitForTimeout(300);
  const hayCampo = await pagina.locator('#measureWeight').count();
  if (!hayCampo) {
    chk('el modal de medidas expone su campo de peso', false, 'no se encontro #measureWeight');
  } else {
    await pagina.focus('#measureWeight');
    await pagina.waitForTimeout(200);
    const conFoco = await estado();
    chk('con el teclado abierto la barra se oculta y suelta su reserva',
      conFoco.display === 'none' && conFoco.reserva === '0px',
      `display ${conFoco.display} | reserva ${conFoco.reserva}`);

    await pagina.locator('#measureWeight').press('Enter');
    await pagina.waitForTimeout(400);
    const tras = await estado();
    chk('tras cerrar el modal con Enter la barra VUELVE',
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
  await pagina.locator('[data-action="prs"]').click();
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
  await pagina.locator('[data-action="charts"]').click();
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
    ['récords', ['[data-nav="profile"]', '[data-action="prs"]']],
    ['gráficos', ['[data-nav="profile"]', '[data-action="charts"]']],
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
    date: new Date().toISOString().slice(0, 10),
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
    gymmate_profile: { name: 'Alonso', weight: 75, height: 176 },
    gymmate_body_measurements: [{ date: '2026-08-10', weight: 75, chest: 98, waist: 82 }],
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
    }));
    chk('el CSV que exporta la app se puede volver a importar', r.n === 2, `${r.n} sesiones · ${r.toast}`);
  }
  await segunda.ctx.close();
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
  await pagina.locator('[data-action="prs"]').click();
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

clearTimeout(abortar);
await navegador.close();
servidor.close();
console.log(fallos ? `\n${fallos} FALLO(S) DE COMPORTAMIENTO` : '\nOK: sin fallos de comportamiento');
process.exit(fallos ? 1 : 0);
