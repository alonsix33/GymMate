#!/usr/bin/env node
/**
 * Puerta de comportamiento FIERRO.
 *
 * Conduce la app construida en un navegador real y reproduce los escenarios
 * que la verificacion adversarial encontro rotos. Cada caso de aqui es un
 * defecto que YA ocurrio: si vuelve, esto se pone rojo.
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
await stat(join(DIST, 'index.html')).catch(() => {
  console.error('No hay dist/index.html. Corre `npm run build` antes.');
  process.exit(2);
});
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
const abortar = setTimeout(() => {
  console.error('\nLa puerta excedio 180s y se aborta.');
  process.exit(1);
}, 180000);
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
    return {
      id: `s${i}`,
      date: d.toISOString(),
      savedAt: d.toISOString(),
      grupo: 'GRUPO 1 - Piernas + Glúteos',
      volumenTotal: 3000 + i * 800,
      ejercicios: [
        { nombre: 'Prensa de Piernas', sets: 4, reps: 12, peso: 100 + i * 5, volumen: 3000 + i * 800 },
      ],
      volumenPorGrupo: { piernas: 3000 + i * 800 },
    };
  });
}

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
    ['prs', ['[data-nav="history"]', '[data-action="prs"]']],
    ['charts', ['[data-nav="history"]', '[data-action="charts"]']],
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
    const medir = (id) => {
      const el = document.getElementById(id);
      if (!el || el.classList.contains('hidden')) return null;
      const p = getComputedStyle(el);
      return { izq: parseFloat(p.paddingLeft), der: parseFloat(p.paddingRight) };
    };
    return { cardio: medir('cardioSelectorView'), ancho: document.documentElement.scrollWidth };
  });
  chk(
    'el selector de cardio conserva su margen lateral',
    r.cardio !== null && r.cardio.izq >= 16 && r.cardio.der >= 16,
    r.cardio ? `izq ${r.cardio.izq} / der ${r.cardio.der}` : 'la vista no se abrio'
  );
  chk('sin desbordamiento horizontal en cardio', r.ancho <= 390, `scrollWidth ${r.ancho}`);
  await ctx.close();
}

clearTimeout(abortar);
await navegador.close();
servidor.close();
console.log(fallos ? `\n${fallos} FALLO(S) DE COMPORTAMIENTO` : '\nOK: sin fallos de comportamiento');
process.exit(fallos ? 1 : 0);
