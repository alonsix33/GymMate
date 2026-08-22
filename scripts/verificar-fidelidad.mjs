#!/usr/bin/env node
/**
 * Puerta de fidelidad FIERRO.
 *
 * Compara los estilos COMPUTADOS de los componentes reales de la app contra
 * los valores declarados en `Pantallas Fierro.dc.html`. Los valores esperados
 * NO estan tecleados aqui: se extraen del mockup en cada corrida, asi que si
 * el mockup cambia, el chequeo cambia con el.
 *
 * Como funciona:
 *   1. Localiza el bloque de una pantalla por su data-screen-label.
 *   2. Toma el atributo style= del n-esimo elemento de ese bloque.
 *   3. Monta el componente equivalente en la app construida y compara las
 *      propiedades que se le piden.
 *
 * Sale 1 ante cualquier discrepancia.
 * Uso: node scripts/verificar-fidelidad.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, readFileSync } from 'fs';
import { readFile as leer, stat } from 'fs/promises';
import { resolve, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const MOCKUP = join(RAIZ, 'redesign/design_handoff_fierro/Pantallas Fierro.dc.html');
const CHROME = process.env.FIERRO_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let fallos = 0;
const chk = (nombre, ok, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`);
};

// --------------------------------------------------------------------------
// Extraccion desde el mockup
// --------------------------------------------------------------------------
const mockup = await leer(MOCKUP, 'utf-8');

/** Devuelve el trozo de HTML de una pantalla, por su data-screen-label. */
function bloquePantalla(label) {
  const marca = `data-screen-label="${label}"`;
  const i = mockup.indexOf(marca);
  if (i === -1) throw new Error(`El mockup no tiene la pantalla "${label}"`);
  const ini = mockup.lastIndexOf('<div', i);
  // El corte termina donde empieza la SIGUIENTE pantalla. Un recorte de tamano
  // fijo se desbordaba a la pantalla de al lado y comparaba componentes que no
  // eran los de esta: un chequeo que miente sobre su alcance.
  const sig = mockup.indexOf('data-screen-label="', i + marca.length);
  const fin = sig === -1 ? mockup.length : mockup.lastIndexOf('<div', sig);
  return mockup.slice(ini, fin);
}

/** style= del n-esimo elemento (0-based) dentro de un bloque. */
function estiloDe(bloque, indice) {
  const estilos = [...bloque.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  if (indice >= estilos.length) throw new Error(`El bloque no tiene un elemento #${indice}`);
  return Object.fromEntries(
    estilos[indice]
      .split(';')
      .filter(Boolean)
      .map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
  );
}

const hexARgb = (h) => {
  const n = h.replace('#', '');
  const v = n.length === 3 ? [...n].map((c) => c + c) : (n.match(/../g) ?? []);
  const [r, g, b, a] = v.map((x) => parseInt(x, 16));
  return a === undefined
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(2)})`;
};
const norm = (v) => (v.startsWith('#') ? hexARgb(v) : v.replace(/\s+/g, ' ').trim());

/** ".06em" con font-size 10px -> "0.6px". El navegador siempre devuelve px. */
function emAPx(valor, fontSizePx) {
  const m = /^([\d.]+)em$/.exec(valor.trim());
  if (!m) return valor;
  return `${+(parseFloat(m[1]) * fontSizePx).toFixed(4)}px`;
}

// --------------------------------------------------------------------------
// Servidor de dist
// --------------------------------------------------------------------------
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
  let cuerpo;
  try {
    cuerpo = await leer(archivo);
  } catch {
    return r.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
  }
  r.writeHead(200, { 'Content-Type': MIME[extname(archivo)] ?? 'application/octet-stream' });
  r.end(cuerpo);
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const URL_APP = `http://127.0.0.1:${servidor.address().port}/`;

const navegador = await chromium.launch({ executablePath: CHROME });
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
await pagina.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
await pagina.waitForTimeout(1000);

/**
 * Renderiza un fragmento LITERAL del mockup en un iframe aislado, con las
 * mismas fuentes y sin el reset de Tailwind, y devuelve la caja del elemento
 * raiz. Es la unica forma honesta de comparar ALTURAS: el mockup no tiene
 * reset y la app si, asi que dos declaraciones identicas dan cajas distintas.
 */
async function cajaDelMockup(fragmento, contenedor = '') {
  return pagina.evaluate(async ({ html, contenedor }) => {
    const marco = document.createElement('iframe');
    marco.style.cssText = 'position:fixed;left:-9999px;top:0;width:390px;height:900px;border:0';
    document.body.appendChild(marco);
    const d = marco.contentDocument;
    d.open();
    d.write(
      '<!doctype html><meta charset="utf-8">' +
        '<style>body{margin:0;font-family:\'Instrument Sans\',sans-serif;' +
        'background:#0B0C0F;color:#EBEDF0}</style>' +
        '<div id="r" style="width:390px;' + contenedor + '">' + html + '</div>'
    );
    d.close();
    // Las @font-face viven en el documento padre: se replican en el iframe.
    for (const hoja of [...document.styleSheets]) {
      let reglas;
      try { reglas = hoja.cssRules; } catch { continue; }
      for (const regla of reglas) {
        if (regla.constructor.name === 'CSSFontFaceRule') {
          const est = d.createElement('style');
          est.textContent = regla.cssText;
          d.head.appendChild(est);
        }
      }
    }
    await d.fonts.ready;
    const el = d.getElementById('r').firstElementChild;
    const c = el.getBoundingClientRect();
    marco.remove();
    return { width: +c.width.toFixed(2), height: +c.height.toFixed(2) };
  }, { html: fragmento, contenedor });
}

/** Caja del componente real de la app. */
async function cajaDeLaApp(html, selector, contenedor = '') {
  return pagina.evaluate(
    ({ html, selector, contenedor }) => {
      let host = document.getElementById('__fidelidadCaja');
      if (!host) {
        host = document.createElement('div');
        host.id = '__fidelidadCaja';
        host.className = 'f-root';
        host.style.cssText = 'position:fixed;left:-9999px;top:0;width:390px';
        document.body.appendChild(host);
      }
      // El mismo contexto de padre que se le da al mockup: sin el, un hijo
      // flex se mide contra 390px y el mockup contra 350.
      host.innerHTML = contenedor ? `<div style="${contenedor}">${html}</div>` : html;
      const el = host.querySelector(selector);
      if (!el) return null;
      const c = el.getBoundingClientRect();
      return { width: +c.width.toFixed(2), height: +c.height.toFixed(2) };
    },
    { html, selector, contenedor }
  );
}

/** Estilo declarado en la etiqueta de apertura de un fragmento. */
function estiloAbertura(frag) {
  return frag.match(/^<[a-z]+\b[^>]*style="([^"]*)"/)?.[1] ?? '';
}

/** Extrae el outerHTML del primer elemento del bloque que cumpla un filtro. */
function fragmentoDe(bloque, filtro) {
  const re = /<(div|button|span|nav)\b[^>]*>/g;
  const candidatos = [];
  let m;
  while ((m = re.exec(bloque))) {
    const ini = m.index;
    const etiqueta = m[1];
    // Cierre equilibrado de la etiqueta.
    const sub = bloque.slice(ini);
    const partes = new RegExp(`<${etiqueta}\\b|</${etiqueta}>`, 'g');
    let prof = 0;
    let p;
    let fin = -1;
    while ((p = partes.exec(sub))) {
      if (p[0][1] === '/') {
        if (--prof === 0) { fin = p.index + p[0].length; break; }
      } else prof++;
    }
    if (fin === -1) continue;
    const frag = sub.slice(0, fin);
    if (filtro(frag)) candidatos.push(frag);
  }
  // El mas corto es el elemento en si; los largos son sus contenedores, que
  // tambien contienen el texto buscado.
  return candidatos.length ? candidatos.sort((x, y) => x.length - y.length)[0] : null;
}

/** Compara la caja del mockup contra la de la app. */
async function compararCaja(nombre, fragmento, htmlApp, selector, opciones = {}) {
  const { tolerancia = 0.5, contenedor = '' } = opciones;
  if (!fragmento) return chk(`${nombre} · caja`, false, 'no se localizo el fragmento en el mockup');
  // El contexto del padre importa: un <span> suelto es inline y su alto sale
  // de las metricas de la fuente; dentro de un flex se blockifica y sale del
  // line-height. Medirlo fuera de su contenedor da un numero que no existe.
  const esperada = await cajaDelMockup(fragmento, contenedor);
  const obtenida = await cajaDeLaApp(htmlApp, selector, contenedor);
  for (const eje of ['width', 'height']) {
    const dif = Math.abs(esperada[eje] - (obtenida?.[eje] ?? 0));
    chk(
      `${nombre} · ${eje}`,
      dif <= tolerancia,
      `mockup ${esperada[eje]} | app ${obtenida?.[eje]} (dif ${dif.toFixed(2)})`
    );
  }
}

/** Monta HTML suelto dentro de un .f-root y devuelve los estilos computados. */
async function computar(html, selector, props) {
  return pagina.evaluate(
    ({ html, selector, props }) => {
      let host = document.getElementById('__fidelidad');
      if (!host) {
        host = document.createElement('div');
        host.id = '__fidelidad';
        host.className = 'f-root';
        document.body.appendChild(host);
      }
      host.innerHTML = html;
      const el = host.querySelector(selector);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
    },
    { html, selector, props }
  );
}

function comparar(nombre, esperado, obtenido, mapa) {
  for (const [propMockup, propCss] of Object.entries(mapa)) {
    const esp = esperado[propMockup];
    if (esp === undefined) {
      chk(`${nombre} · ${propMockup}`, false, 'el mockup no declara esa propiedad');
      continue;
    }
    const got = obtenido?.[propCss];
    chk(`${nombre} · ${propCss}`, norm(esp) === norm(got ?? ''), `mockup ${norm(esp)} | app ${got}`);
  }
}

// --------------------------------------------------------------------------
// F-01 — el bloque tiene, en orden: [0] contenedor, [1] toast exito,
// [2] icono, [3] texto, [4] accion, [5] toast aviso, [6] icono, ...
// --------------------------------------------------------------------------
const f01 = bloquePantalla('F-01 Feedback');

console.log('\n--- F-01 · toast ---');
comparar(
  'toast',
  estiloDe(f01, 1),
  await computar('<div class="f-toast"></div>', '.f-toast', [
    'background-color', 'border-radius', 'padding', 'box-shadow', 'gap', 'border-top-color',
  ]),
  {
    background: 'background-color',
    'border-radius': 'border-radius',
    padding: 'padding',
    gap: 'gap',
  }
);

console.log('\n--- F-01 · icono de toast (exito) ---');
comparar(
  'icono exito',
  estiloDe(f01, 2),
  await computar(
    '<div class="f-toast"><div class="f-toast__icono f-toast__icono--exito">✓</div></div>',
    '.f-toast__icono',
    ['width', 'height', 'background-color', 'color', 'font-weight', 'font-size', 'border-radius']
  ),
  {
    width: 'width',
    height: 'height',
    background: 'background-color',
    color: 'color',
    'font-weight': 'font-weight',
    'font-size': 'font-size',
  }
);

console.log('\n--- F-01 · boton deshacer ---');
// El deshacer es el elemento con "DESHACER" en el bloque.
const estilosF01 = [...f01.matchAll(/style="([^"]*)"[^>]*>([^<]*)/g)];
const declDeshacer = estilosF01.find((m) => m[2].includes('DESHACER'));
if (!declDeshacer) {
  chk('boton deshacer localizado en el mockup', false);
} else {
  const esperado = Object.fromEntries(
    declDeshacer[1].split(';').filter(Boolean).map((d) => {
      const c = d.indexOf(':');
      return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
    })
  );
  comparar(
    'deshacer',
    esperado,
    await computar(
      '<div class="f-toast"><button class="f-toast__deshacer">DESHACER · 5</button></div>',
      '.f-toast__deshacer',
      ['color', 'border-radius', 'padding', 'border-top-color', 'font-size', 'font-weight']
    ),
    { color: 'color', 'border-radius': 'border-radius', padding: 'padding' }
  );
}

console.log('\n--- F-01 · par de botones de la confirmacion ---');
const botonesF01 = [...f01.matchAll(/<button style="([^"]*)"[^>]*>([^<]*)</g)];
for (const [, decl, texto] of botonesF01) {
  const esperado = Object.fromEntries(
    decl.split(';').filter(Boolean).map((d) => {
      const c = d.indexOf(':');
      return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
    })
  );
  const esDestructivo = esperado.background && esperado.background.startsWith('#E5484D');
  const clase = esDestructivo ? 'f-btn--destructivo' : 'f-btn--secundario';
  const obtenido = await computar(
    `<div class="f-sheet"><div class="f-sheet__botones"><button class="f-btn ${clase}">${texto}</button></div></div>`,
    `.${clase}`,
    ['background-color', 'color', 'border-radius', 'padding', 'font-weight', 'font-size', 'border-top-color']
  );
  const mapa = { color: 'color', 'border-radius': 'border-radius', padding: 'padding', 'font-weight': 'font-weight', 'font-size': 'font-size' };
  if (esperado.background && esperado.background !== 'transparent') mapa.background = 'background-color';
  if (esperado.border) {
    const hex = esperado.border.match(/#[0-9A-Fa-f]{3,8}/)?.[0];
    if (hex) chk(`${texto} · color de borde`, norm(hex) === obtenido?.['border-top-color'], `mockup ${norm(hex)} | app ${obtenido?.['border-top-color']}`);
  }
  comparar(texto.trim(), esperado, obtenido, mapa);
}

// --------------------------------------------------------------------------
// H-01 — tab bar y FAB (el CSS ya existe aunque Home sea de la fase 3)
// --------------------------------------------------------------------------
const h01 = bloquePantalla('H-01 Home');
const iTab = [...h01.matchAll(/style="([^"]*)"/g)].findIndex((m) => m[1].includes('#0E1013'));
if (iTab >= 0) {
  console.log('\n--- H-01 · tab bar ---');
  comparar(
    'tab bar',
    estiloDe(h01, iTab),
    await computar('<nav class="f-tabbar"></nav>', '.f-tabbar', [
      'background-color', 'padding', 'gap', 'border-top-color',
    ]),
    { background: 'background-color', padding: 'padding', gap: 'gap' }
  );

  console.log('\n--- H-01 · FAB ---');
  const declFab = [...h01.matchAll(/style="([^"]*)"/g)].map((m) => m[1]).find((d) => d.includes('width:50px'));
  if (declFab) {
    const esperado = Object.fromEntries(
      declFab.split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    comparar(
      'FAB',
      esperado,
      await computar('<button class="f-fab">+</button>', '.f-fab', [
        'width', 'height', 'background-color', 'color', 'font-size', 'font-weight', 'margin-top',
      ]),
      {
        width: 'width', height: 'height', background: 'background-color',
        color: 'color', 'font-size': 'font-size', 'font-weight': 'font-weight',
        'margin-top': 'margin-top',
      }
    );
  }
}

// --------------------------------------------------------------------------
// Cajas: alto y ancho reales contra el mockup renderizado. Esta es la parte
// que faltaba — la puerta comparaba colores y radios y dejaba pasar un toast
// un 47% mas alto de lo debido.
// --------------------------------------------------------------------------
console.log('\n--- cajas contra el mockup renderizado ---');

await compararCaja(
  'toast con accion',
  fragmentoDe(f01, (f) => estiloAbertura(f).includes('box-shadow') && f.includes('Sesión guardada')),
  `<div class="f-toast"><div class="f-toast__icono f-toast__icono--exito">✓</div>
   <div class="f-toast__texto"><span class="f-toast__titulo">Sesión guardada · 8,325 kg</span></div>
   <button class="f-toast__accion">VER</button></div>`,
  '.f-toast'
);

await compararCaja(
  'toast con detalle',
  fragmentoDe(f01, (f) => estiloAbertura(f).includes('box-shadow') && f.includes('CSV importado')),
  `<div class="f-toast"><div class="f-toast__icono f-toast__icono--aviso">!</div>
   <div class="f-toast__texto"><span class="f-toast__titulo">CSV importado: 44 sesiones</span>
   <span class="f-toast__detalle">3 duplicadas omitidas</span></div>
   <button class="f-toast__accion">DETALLE</button></div>`,
  '.f-toast'
);

await compararCaja(
  'chip DESHACER',
  fragmentoDe(f01, (f) => f.startsWith('<span') && estiloAbertura(f).includes('border:1px solid #3E2A1E')),
  '<div class="f-toast"><button class="f-toast__deshacer">DESHACER · 5</button></div>',
  '.f-toast__deshacer',
  { contenedor: 'display:flex;align-items:center' }
);

const sistema = await leer(join(RAIZ, 'redesign/design_handoff_fierro/Sistema Fierro.dc.html'), 'utf-8');

// Los botones se miden contra las PANTALLAS, no contra la galeria del sistema.
// La galeria dibuja un boton de muestra de 15px/R10/13-22, mientras que las
// ocho pantallas que llevan un primario coinciden en 15.5px/R12/16 — y el
// README fija el padding vertical del primario en 15-16px, fuera del cual
// queda el 13 de la galeria. El mismo criterio que ya se aplico al titulo de
// las hojas: la galeria ilustra, las pantallas mandan.
const w01Botones = bloquePantalla('W-01 Sesión activa');
await compararCaja(
  'boton primario',
  fragmentoDe(w01Botones, (f) => f.startsWith('<button') && estiloAbertura(f).includes('background:#FF6317')),
  '<button class="f-btn f-btn--primario f-btn--bloque">Guardar entrenamiento</button>',
  '.f-btn',
  { contenedor: 'display:flex;flex-direction:column;width:350px' }
);
await compararCaja(
  'boton secundario',
  fragmentoDe(w01Botones, (f) => f.startsWith('<button') && estiloAbertura(f).includes('border:1px solid #3E4552')),
  '<button class="f-btn f-btn--secundario f-btn--bloque">Terminar sesión</button>',
  '.f-btn',
  { contenedor: 'display:flex;flex-direction:column;width:350px' }
);
{
  const w04 = bloquePantalla('W-04 Guía de ejercicio');
  await compararCaja(
    'boton de hoja (W-04 Cerrar)',
    fragmentoDe(w04, (f) => f.startsWith('<button') && estiloAbertura(f).includes('border-radius:11px')),
    '<button class="f-btn f-btn--secundario f-btn--bloque f-btn--hoja">Cerrar</button>',
    '.f-btn',
    // 390 de pantalla menos los 22 de padding de la hoja a cada lado.
    { contenedor: 'display:flex;flex-direction:column;width:346px' }
  );
}
await compararCaja(
  'badge INTENSA',
  fragmentoDe(sistema, (f) => f.startsWith('<span') && estiloAbertura(f).includes('background:#FF6317') && f.includes('>INTENSA<')),
  '<span class="f-badge f-badge--intensa">INTENSA</span>',
  '.f-badge',
  { contenedor: 'display:flex;flex-wrap:wrap;align-items:center' }
);
await compararCaja(
  'badge MODERADA',
  fragmentoDe(sistema, (f) => f.startsWith('<span') && estiloAbertura(f).includes('background:#52290F')),
  '<span class="f-badge f-badge--moderada">MODERADA</span>',
  '.f-badge',
  { contenedor: 'display:flex;flex-wrap:wrap;align-items:center' }
);
await compararCaja(
  'fila de dato',
  fragmentoDe(sistema, (f) => estiloAbertura(f).includes('border-radius:10px') && f.includes('Set 3 · 12 reps')),
  '<div class="f-fila"><span>Set 3 · 12 reps</span><span class="f-num" style="font-weight:600">120 kg</span></div>',
  '.f-fila'
);

// --------------------------------------------------------------------------
// H-01 — Inicio
// --------------------------------------------------------------------------
console.log('\n--- H-01 ---');

comparar(
  'card del coach',
  estiloDe(h01, [...h01.matchAll(/style="([^"]*)"/g)].findIndex((m) => m[1].includes('border-radius:20px'))),
  await computar('<section class="f-home__coach"></section>', '.f-home__coach', [
    'background-color', 'border-radius', 'padding', 'gap', 'border-top-color',
  ]),
  { background: 'background-color', 'border-radius': 'border-radius', padding: 'padding', gap: 'gap' }
);

const declRacha = [...h01.matchAll(/style="([^"]*)"/g)].map((m) => m[1]).find((d) => d.includes('padding:7px 10px'));
if (declRacha) {
  const esperado = Object.fromEntries(
    declRacha.split(';').filter(Boolean).map((d) => {
      const c = d.indexOf(':');
      return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
    })
  );
  comparar(
    'chip de racha',
    esperado,
    await computar('<span class="f-home__racha">RACHA 2</span>', '.f-home__racha', [
      'background-color', 'color', 'border-radius', 'padding', 'border-top-color',
    ]),
    { background: 'background-color', color: 'color', 'border-radius': 'border-radius', padding: 'padding' }
  );
}

// La celda del heatmap: 2.5px y box-sizing border-box, declarados a mano en
// el mockup porque la celda con anillo no puede crecer sobre sus vecinas.
comparar(
  'celda del heatmap',
  { 'border-radius': '2.5px', 'box-sizing': 'border-box' },
  await computar(
    '<div class="f-heat"><div class="f-heat__semana"><div class="f-heat__celda"></div></div></div>',
    '.f-heat__celda',
    ['border-radius', 'box-sizing']
  ),
  { 'border-radius': 'border-radius', 'box-sizing': 'box-sizing' }
);

await compararCaja(
  'fila de rutina',
  fragmentoDe(h01, (f) => estiloAbertura(f).includes('padding:14px 16px') && f.includes('{{ r.t }}')),
  `<button class="f-home__rutina"><span class="f-home__rutina-texto">
     <span class="f-home__rutina-grupo">GRUPO 1</span>
     <span class="f-home__rutina-nombre">Piernas + Glúteos</span></span>
     <span class="f-home__rutina-meta f-num">6 ejercicios<br>hace 3 días</span>
     <span class="f-home__chevron">›</span></button>`,
  '.f-home__rutina'
);

await compararCaja(
  'banner de borrador',
  fragmentoDe(h01, (f) => estiloAbertura(f).includes('border-radius:14px') && f.includes('Sesión en curso')),
  `<section class="f-home__borrador"><div class="f-home__borrador-texto">
     <span class="f-home__borrador-titulo">Sesión en curso — Piernas + Glúteos</span>
     <span class="f-home__borrador-sub">Borrador guardado hace 12 min · 2/8 ejercicios</span></div>
     <button class="f-home__continuar">Continuar</button>
     <button class="f-home__descartar">✕</button></section>`,
  '.f-home__borrador'
);

// --------------------------------------------------------------------------
// La pantalla EN SU PAGINA, no el componente aislado.
//
// Este es el chequeo que faltaba: comparar cajas de componentes montados en un
// contenedor propio daba 0.00px mientras la pantalla entera perdia 40px de
// ancho, porque el <main> legacy y .f-home aplicaban padding los dos. Un
// componente correcto dentro de una pantalla encogida sigue estando mal.
// --------------------------------------------------------------------------
console.log('\n--- H-01 en su pagina real ---');
{
  const anchoPantalla = 390;
  const paginaReal = await navegador.newPage({ viewport: { width: anchoPantalla, height: 900 } });
  await paginaReal.addInitScript(() => {
    const dia = 86400000;
    const clave = (d) => {
      const x = new Date(Date.now() - d * dia);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };
    // Con un hueco LARGO: la etiqueta "← hueco de 47 días" es la que llenaba
    // la fila del pie. Sembrar solo dias recientes dejaba el pie corto y el
    // chequeo pasaba aunque el gap estuviera mal.
    const dias = [0, 2, 4, 7, 9, 56, 58, 61, 63, 66];
    localStorage.setItem(
      'gymmate_history',
      JSON.stringify(
        dias.map((d) => ({
          date: clave(d), type: 'weights', grupo: 'GRUPO 1 - Piernas + Glúteos',
          volumenTotal: 1000 + d * 300, volumenPorGrupo: {}, ejercicios: [],
        }))
      )
    );
  });
  await paginaReal.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
  await paginaReal.waitForTimeout(1200);

  const medido = await paginaReal.evaluate(() => {
    const card = document.querySelector('.f-home__heatmap');
    const celda = document.querySelector('.f-heat__celda');
    const pie = document.querySelector('.f-home__heatmap-pie');
    const primero = document.querySelector('.f-home__saludo');
    return {
      card: card ? +card.getBoundingClientRect().width.toFixed(2) : null,
      celda: celda ? +celda.getBoundingClientRect().width.toFixed(2) : null,
      pie: pie ? +pie.getBoundingClientRect().height.toFixed(2) : null,
      aireArriba: primero ? +primero.getBoundingClientRect().top.toFixed(2) : null,
      desbordaX: document.documentElement.scrollWidth > window.innerWidth,
      hueco: document.querySelector('.f-heat__hueco')?.textContent ?? '',
    };
  });
  await paginaReal.close();

  // El mockup: pantalla de 390 con UN solo padding de 20 -> card de 350.
  const cardEsperada = anchoPantalla - 20 * 2;
  chk('la card ocupa el ancho del mockup', Math.abs((medido.card ?? 0) - cardEsperada) < 0.5,
    `real ${medido.card} | mockup ${cardEsperada}`);
  // 350 de card - 2*20 de padding = 310 utiles; 16 columnas con 15 gaps de 3px.
  const celdaEsperada = +((cardEsperada - 40 - 15 * 3) / 16).toFixed(2);
  chk('la celda del heatmap mide lo que debe', Math.abs((medido.celda ?? 0) - celdaEsperada) < 0.6,
    `real ${medido.celda} | esperada ${celdaEsperada}`);
  chk('el escenario tiene etiqueta de hueco (si no, el pie no prueba nada)',
    medido.hueco.includes('hueco de'), medido.hueco);
  chk('el pie del heatmap cabe en UNA fila', (medido.pie ?? 99) < 20, `${medido.pie}px de alto`);
  chk('el aire sobre el saludo es el del mockup', Math.abs((medido.aireArriba ?? 0) - 14) < 0.5,
    `${medido.aireArriba}px | mockup 14`);
  chk('la pantalla no desborda en horizontal', !medido.desbordaX);
}

// --------------------------------------------------------------------------
// W-01 — Sesion activa. Cajas y estilos contra el mockup.
// --------------------------------------------------------------------------
const w01 = bloquePantalla('W-01 Sesión activa');

console.log('\n--- W-01 · componentes ---');

await compararCaja(
  'metrica VOLUMEN',
  fragmentoDe(w01, (f) => estiloAbertura(f).includes('flex:1.4')),
  `<div class="f-metrica f-metrica--protagonista">
     <span class="f-metrica__label">VOLUMEN</span>
     <span class="f-metrica__cifra">1,240 <span class="f-metrica__unidad">kg</span></span>
   </div>`,
  '.f-metrica--protagonista',
  { contenedor: 'display:flex;gap:10px;width:350px' }
);

await compararCaja(
  'boton de stepper',
  fragmentoDe(w01, (f) => estiloAbertura(f).includes('width:30px;height:46px')),
  `<div class="f-stepper f-stepper--sesion"><button class="f-stepper__btn">−</button></div>`,
  '.f-stepper__btn'
);

// Dos chips distintos: el inactivo lleva borde de 1px (y en content-box mide
// 32), el activo va relleno y mide 30. Se comparan por separado, o el gate
// medía el activo del mockup contra el inactivo de la app.
await compararCaja(
  'chip de RPE inactivo',
  fragmentoDe(w01, (f) => estiloAbertura(f).includes('border:1px solid #2C323D') && /">[5-9]</.test(f)),
  `<div class="f-rpe-fila"><button class="f-rpe-chip" aria-pressed="false">5</button></div>`,
  '.f-rpe-chip'
);

await compararCaja(
  'chip de RPE activo',
  fragmentoDe(w01, (f) => estiloAbertura(f).includes('border-radius:8px;background:#FF6317')),
  `<div class="f-rpe-fila"><button class="f-rpe-chip" aria-pressed="true">6</button></div>`,
  '.f-rpe-chip'
);

await compararCaja(
  'check del ejercicio hecho',
  fragmentoDe(w01, (f) => estiloAbertura(f).includes('width:26px;height:26px;border-radius:50%;background:#FF6317')),
  `<div class="f-hecho__fila"><button class="f-hecho__check">✓</button></div>`,
  '.f-hecho__check'
);

{
  const declCrono = [...w01.matchAll(/style="([^"]*)"/g)]
    .map((m) => m[1])
    .find((d) => d.includes('font:700 11px/1 ui-monospace'));
  if (declCrono) {
    const esperado = Object.fromEntries(
      declCrono.split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    comparar(
      'cronometro',
      { ...esperado, 'font-size': '11px', 'font-weight': '700' },
      await computar('<button class="f-sesion__crono">42:10</button>', '.f-sesion__crono', [
        'background-color', 'border-radius', 'color', 'padding', 'font-size', 'font-weight',
      ]),
      {
        background: 'background-color', 'border-radius': 'border-radius', color: 'color',
        padding: 'padding', 'font-size': 'font-size', 'font-weight': 'font-weight',
      }
    );
  }
}

{
  const declBadge = [...w01.matchAll(/style="([^"]*)"[^>]*>INTENSA</g)].map((m) => m[1])[0];
  if (declBadge) {
    const esperado = Object.fromEntries(
      declBadge.split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    comparar(
      'badge INTENSA',
      {
        ...esperado,
        'font-size': '10px',
        'font-weight': '700',
        'letter-spacing': emAPx(esperado['letter-spacing'] ?? '0', 10),
      },
      await computar('<span class="f-badge f-badge--sesion f-badge--intensa">INTENSA</span>', '.f-badge--intensa', [
        'background-color', 'color', 'border-radius', 'padding', 'letter-spacing',
      ]),
      {
        background: 'background-color', color: 'color', 'border-radius': 'border-radius',
        padding: 'padding', 'letter-spacing': 'letter-spacing',
      }
    );
  }
}

// --------------------------------------------------------------------------
// W-01 en su pagina real: la sesion entera, con datos, en 390px.
// --------------------------------------------------------------------------
console.log('\n--- W-01 en su pagina real ---');
{
  const anchoPantalla = 390;
  const paginaW = await navegador.newPage({ viewport: { width: anchoPantalla, height: 900 } });
  await paginaW.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
  await paginaW.waitForTimeout(1000);
  await paginaW.locator('[data-grupo]').first().click();
  await paginaW.waitForTimeout(600);
  await paginaW.fill('#sets-0', '4');
  await paginaW.dispatchEvent('#sets-0', 'change');
  await paginaW.fill('#reps-0', '12');
  await paginaW.dispatchEvent('#reps-0', 'change');
  await paginaW.fill('#peso-0', '120');
  await paginaW.dispatchEvent('#peso-0', 'change');
  await paginaW.waitForTimeout(300);

  const m = await paginaW.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const card = r('.f-ejercicio');
    const stepperFila = document.querySelector('.f-steppers');
    return {
      card: card ? +card.width.toFixed(2) : null,
      cardIzq: card ? +card.left.toFixed(2) : null,
      pantalla: document.querySelector('.f-sesion')
        ? +document.querySelector('.f-sesion').getBoundingClientRect().width.toFixed(2)
        : null,
      steppers: stepperFila ? stepperFila.querySelectorAll('.f-stepper-campo').length : 0,
      desbordaX: document.documentElement.scrollWidth > window.innerWidth,
      aireArriba: r('.f-sesion__cabecera') ? +r('.f-sesion__cabecera').top.toFixed(2) : null,
      volumen: document.getElementById('volumen-0')?.textContent,
      metrica: document.getElementById('fierroVolumenTotal')?.textContent.trim(),
    };
  });
  await paginaW.close();

  const cardEsperada = anchoPantalla - 20 * 2;
  chk('la card del ejercicio ocupa el ancho del mockup',
    Math.abs((m.card ?? 0) - cardEsperada) < 0.5, `real ${m.card} | mockup ${cardEsperada}`);
  chk('el margen izquierdo es el del mockup', Math.abs((m.cardIzq ?? 0) - 20) < 0.5, `${m.cardIzq}px | mockup 20`);
  chk('la fila tiene los tres steppers', m.steppers === 3, String(m.steppers));
  chk('el aire sobre la cabecera es el del mockup', Math.abs((m.aireArriba ?? 0) - 10) < 0.5,
    `${m.aireArriba}px | mockup 10`);
  chk('la sesion no desborda en horizontal', !m.desbordaX);
  chk('el volumen del ejercicio se calcula y se pinta', m.volumen === '5,760 kg', String(m.volumen));
  chk('la metrica de volumen total cuadra', m.metrica === '5,760 kg', String(m.metrica));
}

// --------------------------------------------------------------------------
// W-02, W-03 y W-04 — la puerta solo miraba W-01, y cinco roturas groseras
// de las otras tres pasaban en verde.
// --------------------------------------------------------------------------
const w02 = bloquePantalla('W-02 RPE');
const w03 = bloquePantalla('W-03 Resumen XP');
const w04f = bloquePantalla('W-04 Guía de ejercicio');

console.log('\n--- W-02 · slider ---');
await compararCaja(
  'pista del slider',
  fragmentoDe(w02, (f) => estiloAbertura(f).includes('height:10px;border-radius:5px')),
  `<div class="f-rpe-bloque"><div class="f-rpe-pista"><span class="f-rpe-bola" style="--t:0.78"></span></div></div>`,
  '.f-rpe-pista',
  { contenedor: 'width:346px' }
);
await compararCaja(
  'bola del slider',
  fragmentoDe(w02, (f) => estiloAbertura(f).includes('width:24px;height:24px;border-radius:50%')),
  `<div class="f-rpe-pista" style="width:300px"><span class="f-rpe-bola" style="--t:0.5"></span></div>`,
  '.f-rpe-bola'
);
{
  const declCifra = [...w02.matchAll(/style="([^"]*)"[^>]*>8</g)].map((m) => m[1])[0];
  if (declCifra) {
    const esperado = Object.fromEntries(
      declCifra.split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    comparar(
      'cifra de RPE',
      esperado,
      await computar(
        '<span class="f-rpe-bloque__cifra" style="color:var(--zona-ambar)">8</span>',
        '.f-rpe-bloque__cifra',
        ['font-size', 'font-weight', 'color', 'font-stretch']
      ),
      { 'font-size': 'font-size', 'font-weight': 'font-weight', color: 'color', 'font-stretch': 'font-stretch' }
    );
  } else {
    chk('cifra de RPE · se localiza en el mockup', false);
  }
}

console.log('\n--- W-03 · resumen de XP ---');
{
  const declXP = [...w03.matchAll(/style="([^"]*)"[^>]*>\+189 XP</g)].map((m) => m[1])[0];
  if (declXP) {
    const esperado = Object.fromEntries(
      declXP.split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    comparar(
      'cifra heroe de XP',
      esperado,
      await computar('<span class="f-xp__cifra">+189 XP</span>', '.f-xp__cifra', [
        'font-size', 'font-weight', 'color', 'font-stretch', 'line-height',
      ]),
      {
        'font-size': 'font-size', 'font-weight': 'font-weight', color: 'color',
        'font-stretch': 'font-stretch',
      }
    );
  } else {
    chk('cifra heroe de XP · se localiza en el mockup', false);
  }
}
await compararCaja(
  'fila del desglose de XP',
  fragmentoDe(w03, (f) => estiloAbertura(f).includes('padding:13px 16px') && f.includes('{{ x.n }}')),
  // Suelta, igual que el fragmento del mockup: dentro del contenedor el borde
  // de 1px se lleva 2px y la comparacion mediria dos cosas distintas.
  `<div class="f-xp__fila"><span class="f-xp__concepto">Sesión completada</span><span class="f-xp__valor">+50</span></div>`,
  '.f-xp__fila',
  { contenedor: 'width:346px' }
);
await compararCaja(
  'card de ascenso de rango',
  fragmentoDe(w03, (f) => estiloAbertura(f).includes('border:1px solid #E3B341')),
  `<div class="f-xp__ascenso" style="--rango:var(--rango-oro)"><span class="f-xp__ascenso-cuadro"></span>
   <div class="f-xp__ascenso-textos"><span class="f-xp__ascenso-titulo">Glúteos subió a <span class="f-xp__ascenso-rango">Oro</span></span>
   <span class="f-xp__ascenso-detalle">Plata → Oro · ratio 0.74x · +100 XP</span></div></div>`,
  '.f-xp__ascenso',
  { contenedor: 'width:346px' }
);

console.log('\n--- W-04 · guia ---');
await compararCaja(
  'bloque de datos de la guia',
  fragmentoDe(w04f, (f) => estiloAbertura(f).includes('border-top:1px solid #20242D') && f.includes('Tu PR')),
  `<div class="f-guia__datos">
     <div class="f-guia__fila"><span class="f-guia__label">Tu PR</span><span class="f-guia__valor f-guia__valor--pr">180 kg · 17 abr</span></div>
     <div class="f-guia__fila"><span class="f-guia__label">Última vez</span><span class="f-guia__valor">4×12 · 120 kg</span></div>
   </div>`,
  '.f-guia__datos',
  { contenedor: 'display:flex;flex-direction:column;width:346px' }
);
{
  const declFoto = [...w04f.matchAll(/style="([^"]*)"/g)]
    .map((m) => m[1])
    .find((d) => d.includes('height:150px') && d.includes('border-radius:12px'));
  if (declFoto) {
    comparar(
      'foto de la guia',
      { height: '150px', 'border-radius': '12px' },
      await computar('<img class="f-guia__foto" alt="">', '.f-guia__foto', ['height', 'border-radius']),
      { height: 'height', 'border-radius': 'border-radius' }
    );
  } else {
    chk('foto de la guia · se localiza en el mockup', false);
  }
}

// --------------------------------------------------------------------------
// W-01 · barras de volumen por musculo: la proporcion es sobre el TOTAL.
// --------------------------------------------------------------------------
{
  const w01v = bloquePantalla('W-01 Sesión activa');
  const rellenos = [...w01v.matchAll(/width:(\d+)%;height:100%;background:(#[0-9A-F]{6})/g)];
  chk('el mockup declara dos barras de musculo', rellenos.length === 2, String(rellenos.length));
  if (rellenos.length === 2) {
    // 5,760 y 2,160 -> 72% y 27% del TOTAL (7,920), no del mayor.
    chk('la primera barra es el 72% del total', rellenos[0][1] === '72', rellenos[0][1]);
    chk('la segunda es el 27%', rellenos[1][1] === '27', rellenos[1][1]);
    chk('la mayor va en Fragua y la otra no', rellenos[0][2] === '#FF6317' && rellenos[1][2] !== '#FF6317',
      `${rellenos[0][2]} / ${rellenos[1][2]}`);
  }
}

// --------------------------------------------------------------------------
// Secciones Hueso — HI-01, HI-02, PR-01, G-01.
// --------------------------------------------------------------------------
const hi01 = bloquePantalla('HI-01 Historial');
const pr01 = bloquePantalla('PR-01 PRs');
const g01 = bloquePantalla('G-01 Gráficos');

console.log('\n--- Hueso · componentes ---');

{
  // El header oscuro que hace la transicion Carbon -> Hueso.
  const declHeader = [...hi01.matchAll(/style="([^"]*)"/g)]
    .map((m) => m[1])
    .find((d) => d.includes('background:#0B0C0F') && d.includes('padding:14px 22px 18px'));
  if (declHeader) {
    const esperado = Object.fromEntries(
      declHeader.split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    comparar(
      'header Hueso',
      esperado,
      await computar('<header class="f-hueso__header"></header>', '.f-hueso__header', [
        'background-color', 'color', 'padding', 'gap',
      ]),
      { background: 'background-color', color: 'color', padding: 'padding', gap: 'gap' }
    );
  } else {
    chk('header Hueso · se localiza en el mockup', false);
  }
}

await compararCaja(
  'fila de sesion (HI-01)',
  fragmentoDe(hi01, (f) => estiloAbertura(f).includes('padding:14px 16px') && f.includes('{{ h.v }}')),
  `<button class="f-hist__fila"><span class="f-hist__textos">
     <span class="f-hist__nombre">Piernas + Glúteos</span>
     <span class="f-hist__sub">vie, 17 abr · 6 ejercicios</span></span>
     <span class="f-hist__cifra">8,325</span></button>`,
  '.f-hist__fila',
  { contenedor: 'width:354px' }
);

await compararCaja(
  'card de record (PR-01)',
  fragmentoDe(pr01, (f) => estiloAbertura(f).includes('border-radius:12px;padding:16px') && f.includes('{{ p.kg }}')),
  `<article class="f-hueso__card">
     <div class="f-pr__cabecera"><div class="f-pr__identidad"><div class="f-pr__nombre">Prensa de Piernas</div>
     <div class="f-pr__detalle">4×12 · 120 kg</div></div>
     <span class="f-pr__cifra">164.9 <span class="f-pr__unidad">kg</span></span></div>
     <div class="f-zonas"><div class="f-zonas__pista">
       <div class="f-zonas__roja"></div><div class="f-zonas__ambar"></div><div class="f-zonas__verde"></div>
       <div class="f-zonas__marcador"></div></div>
       <div class="f-zonas__pie"><span>EN TU PICO</span><span>PICO 150 KG</span></div></div>
   </article>`,
  '.f-hueso__card',
  { contenedor: 'width:354px' }
);

{
  // Los tres segmentos de la barra de zonas, uno a uno.
  const pista = fragmentoDe(pr01, (f) => estiloAbertura(f).includes('position:relative;height:10px;display:flex;gap:2px'));
  if (!pista) chk('barra de zonas · se localiza en el mockup', false);
  const declSegmentos = [...(pista ?? '').matchAll(/style="([^"]*)"/g)].map((m) => m[1]).slice(1);
  const clases = ['f-zonas__roja', 'f-zonas__ambar', 'f-zonas__verde', 'f-zonas__marcador'];
  for (let i = 0; i < clases.length && i < declSegmentos.length; i++) {
    const esperado = Object.fromEntries(
      declSegmentos[i].split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    const mapa = {};
    if (esperado.background) mapa.background = 'background-color';
    if (esperado['border-radius']) mapa['border-radius'] = 'border-radius';
    if (esperado.width) mapa.width = 'width';
    comparar(
      `zona ${clases[i]}`,
      esperado,
      await computar(
        `<div style="width:300px"><div class="f-zonas__pista"><div class="f-zonas__roja"></div><div class="f-zonas__ambar"></div><div class="f-zonas__verde"></div><div class="f-zonas__marcador"></div></div></div>`,
        `.${clases[i]}`,
        ['background-color', 'border-radius', 'width', 'border-bottom-color', 'border-bottom-width']
      ),
      // El ancho se compara solo donde el mockup lo declara en %.
      Object.fromEntries(Object.entries(mapa).filter(([k]) => k !== 'width' || esperado.width.endsWith('%') === false))
    );
    if (esperado['border-bottom']) {
      const [ancho, , color] = esperado['border-bottom'].split(' ');
      comparar(
        `zona ${clases[i]} · borde`,
        { ancho, color },
        await computar(
          `<div class="f-zonas__pista"><div class="f-zonas__roja"></div><div class="f-zonas__ambar"></div><div class="f-zonas__verde"></div></div>`,
          `.${clases[i]}`,
          ['border-bottom-width', 'border-bottom-color']
        ),
        { ancho: 'border-bottom-width', color: 'border-bottom-color' }
      );
    }
  }
}

{
  const declSeg = [...g01.matchAll(/style="([^"]*)"/g)]
    .map((m) => m[1])
    .find((d) => d.includes('background:#E7E5DF'));
  if (declSeg) {
    const esperado = Object.fromEntries(
      declSeg.split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    comparar(
      'control segmentado',
      esperado,
      await computar('<div class="f-segmentado"></div>', '.f-segmentado', [
        'background-color', 'border-radius', 'padding', 'gap',
      ]),
      { background: 'background-color', 'border-radius': 'border-radius', padding: 'padding', gap: 'gap' }
    );
  } else {
    chk('control segmentado · se localiza en el mockup', false);
  }
}

// --------------------------------------------------------------------------
// Las pantallas Hueso en su pagina real.
// --------------------------------------------------------------------------
console.log('\n--- Hueso en su pagina real ---');
{
  const anchoPantalla = 390;
  const paginaH = await navegador.newPage({ viewport: { width: anchoPantalla, height: 900 } });
  await paginaH.addInitScript(() => {
    const hoy = new Date();
    const mk = (atras, vol, peso) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras, 19, 30);
      return {
        sessionId: 's' + atras, date: d.toISOString(), savedAt: d.toISOString(),
        startedAt: new Date(d.getTime() - 3160000).toISOString(),
        grupo: 'GRUPO 1 - Piernas + Glúteos', volumenTotal: vol,
        rpe: { value: 8, label: 'Muy difícil' },
        ejercicios: [{ nombre: 'Prensa de Piernas', esMancuerna: false, grupoMuscular: 'Piernas', sets: 4, reps: 12, peso, volumen: vol, completado: true }],
        volumenPorGrupo: { Piernas: vol * 0.7, 'Glúteos': vol * 0.3 },
      };
    };
    localStorage.setItem('gymmate_history', JSON.stringify([mk(1, 8325, 120), mk(4, 7700, 115), mk(8, 7000, 110), mk(40, 6000, 100), mk(70, 5000, 90)]));
    localStorage.setItem('gymmate_prs', JSON.stringify({ 'Prensa de Piernas': { peso: 150, sets: 4, reps: 12, volumen: 7200, date: new Date().toISOString() } }));
  });
  await paginaH.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
  await paginaH.waitForTimeout(1000);

  const medir = async () =>
    paginaH.evaluate(() => {
      // La pantalla VISIBLE: los tres tabs Hueso existen a la vez en el DOM y
      // querySelector devolvia siempre el primero, oculto y de ancho 0.
      const visible = [...document.querySelectorAll('.f-hueso')].find(
        (el) => el.getBoundingClientRect().width > 0
      );
      const card = visible?.querySelector('.f-hist__fila, .f-hueso__card, .f-graf, .f-vacio-hueso');
      const cuerpo = visible?.querySelector('.f-hueso__cuerpo');
      return {
        fondo: visible ? getComputedStyle(visible).backgroundColor : null,
        fondoBody: getComputedStyle(document.body).backgroundColor,
        card: card ? +card.getBoundingClientRect().width.toFixed(2) : null,
        cardIzq: card ? +card.getBoundingClientRect().left.toFixed(2) : null,
        cuerpoPad: cuerpo ? getComputedStyle(cuerpo).padding : null,
        desbordaX: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

  for (const [nombre, camino] of [
    ['HI-01', ['[data-nav="history"]']],
    ['PR-01', ['[data-nav="profile"]', '[data-action="prs"]']],
    ['G-01', ['[data-nav="profile"]', '[data-action="charts"]']],
  ]) {
    for (const paso of camino) {
      await paginaH.locator(paso).first().click();
      await paginaH.waitForTimeout(350);
    }
    const m = await medir();
    // 390 de pantalla con UN solo padding de 18 -> card de 354.
    chk(`${nombre} · la card ocupa el ancho del mockup`, Math.abs((m.card ?? 0) - 354) < 0.5,
      `real ${m.card} | mockup 354`);
    chk(`${nombre} · el margen izquierdo es el del mockup`, Math.abs((m.cardIzq ?? 0) - 18) < 0.5,
      `${m.cardIzq}px | mockup 18`);
    chk(`${nombre} · el cuerpo lleva el padding del mockup`, m.cuerpoPad === '18px 18px 26px', String(m.cuerpoPad));
    chk(`${nombre} · el fondo es Hueso`, m.fondo === 'rgb(246, 245, 242)', String(m.fondo));
    chk(`${nombre} · el fondo de la pagina tambien`, m.fondoBody === 'rgb(246, 245, 242)', String(m.fondoBody));
    chk(`${nombre} · no desborda en horizontal`, !m.desbordaX);
  }

  // HI-02: se entra desde la lista.
  await paginaH.locator('[data-nav="history"]').click();
  await paginaH.waitForTimeout(350);
  await paginaH.locator('.f-hist__fila').first().click();
  await paginaH.waitForTimeout(350);
  const d = await medir();
  chk('HI-02 · la card ocupa el ancho del mockup', Math.abs((d.card ?? 0) - 354) < 0.5, `real ${d.card}`);
  chk('HI-02 · no desborda en horizontal', !d.desbordaX);
  await paginaH.close();
}

// --------------------------------------------------------------------------
// Cardio — C-01…C-08.
// --------------------------------------------------------------------------
const c01 = bloquePantalla('C-01 Cardio selector');
const c02 = bloquePantalla('C-02 Cardio config');
const c03 = bloquePantalla('C-03 Cardio timer');
const c05 = bloquePantalla('C-05 Pirámide');

console.log('\n--- Cardio · componentes ---');

await compararCaja(
  'fila de modo (C-01)',
  fragmentoDe(c01, (f) => estiloAbertura(f).includes('padding:15px 16px') && f.includes('{{ m.n }}')),
  `<button class="f-modo"><span class="f-modo__tag">TB</span>
     <span class="f-modo__textos"><span class="f-modo__nombre">Tabata</span>
     <span class="f-modo__desc">20s trabajo / 10s descanso × 8 rondas</span></span>
     <span class="f-modo__chevron">›</span></button>`,
  '.f-modo',
  { contenedor: 'width:350px' }
);

await compararCaja(
  'boton de stepper de cardio (C-02)',
  fragmentoDe(c02, (f) => estiloAbertura(f).includes('width:52px;height:54px')),
  `<div class="f-stepper f-stepper--cardio"><button class="f-stepper__btn">−</button></div>`,
  '.f-stepper__btn'
);

{
  const declFase = [...c03.matchAll(/style="([^"]*)"[^>]*>TRABAJO</g)].map((m) => m[1])[0];
  if (declFase) {
    const esperado = Object.fromEntries(
      declFase.split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    comparar(
      'chip de fase (C-03)',
      { ...esperado, 'letter-spacing': emAPx(esperado['letter-spacing'] ?? '0', 12) },
      await computar('<span class="f-fase">TRABAJO</span>', '.f-fase', [
        'background-color', 'color', 'border-radius', 'padding', 'letter-spacing',
      ]),
      {
        background: 'background-color', color: 'color', 'border-radius': 'border-radius',
        padding: 'padding', 'letter-spacing': 'letter-spacing',
      }
    );
  } else {
    chk('chip de fase · se localiza en el mockup', false);
  }
}

{
  // El anillo: r, grosor y colores.
  const circulos = [...c03.matchAll(/<circle([^>]*)>/g)].map((m) => m[1]);
  const pista = circulos.find((c) => c.includes('#20242D'));
  const avance = circulos.find((c) => c.includes('#FF6317'));
  chk('el anillo del mockup tiene r=104 y grosor 10',
    !!pista && pista.includes('r="104"') && pista.includes('stroke-width="10"'), pista ?? '(no encontrado)');
  const medido = await computar(
    `<div class="f-anillo"><svg class="f-anillo__svg" viewBox="0 0 230 230"><circle class="f-anillo__pista" cx="115" cy="115" r="104"></circle><circle class="f-anillo__avance" cx="115" cy="115" r="104"></circle></svg></div>`,
    '.f-anillo__pista',
    ['stroke', 'stroke-width']
  );
  chk('la pista del anillo usa el token de borde sutil',
    norm(medido?.stroke ?? '') === norm('#20242D'), `${medido?.stroke}`);
  chk('la pista mide 10 de grosor', parseFloat(medido?.['stroke-width'] ?? '0') === 10, String(medido?.['stroke-width']));
  const medidoAvance = await computar(
    `<div class="f-anillo"><svg class="f-anillo__svg" viewBox="0 0 230 230"><circle class="f-anillo__avance" cx="115" cy="115" r="104"></circle></svg></div>`,
    '.f-anillo__avance',
    ['stroke', 'stroke-width', 'stroke-linecap']
  );
  chk('el arco de avance va en Fragua', norm(medidoAvance?.stroke ?? '') === norm('#FF6317'), `${medidoAvance?.stroke}`);
  chk('el arco tiene las puntas redondeadas', medidoAvance?.['stroke-linecap'] === 'round', String(medidoAvance?.['stroke-linecap']));
  void avance;
}

await compararCaja(
  'marca de ronda (C-03)',
  fragmentoDe(c03, (f) => estiloAbertura(f).includes('width:22px;height:6px')),
  `<div class="f-rondas"><span class="f-rondas__marca"></span></div>`,
  '.f-rondas__marca'
);

{
  const declPreset = [...c05.matchAll(/style="([^"]*)"[^>]*>MEDIA</g)].map((m) => m[1])[0];
  if (declPreset) {
    const esperado = Object.fromEntries(
      declPreset.split(';').filter(Boolean).map((d) => {
        const c = d.indexOf(':');
        return [d.slice(0, c).trim(), d.slice(c + 1).trim()];
      })
    );
    comparar(
      'preset activo (C-05)',
      esperado,
      await computar(
        '<div class="f-presets"><button class="f-preset" aria-pressed="true">MEDIA</button></div>',
        '.f-preset',
        ['background-color', 'color', 'border-radius', 'padding']
      ),
      { background: 'background-color', color: 'color', 'border-radius': 'border-radius', padding: 'padding' }
    );
  } else {
    chk('preset activo · se localiza en el mockup', false);
  }
}

// --------------------------------------------------------------------------
// Cardio en su pagina real.
// --------------------------------------------------------------------------
console.log('\n--- Cardio en su pagina real ---');
{
  const anchoPantalla = 390;
  const paginaC = await navegador.newPage({ viewport: { width: anchoPantalla, height: 900 } });
  await paginaC.addInitScript(() => {
    const hoy = new Date();
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1, 19, 0);
    localStorage.setItem('gymmate_history', JSON.stringify([{
      sessionId: 's1', date: d.toISOString(), savedAt: d.toISOString(),
      grupo: 'GRUPO 1 - Piernas + Glúteos', volumenTotal: 4800, ejercicios: [],
      volumenPorGrupo: { Piernas: 4800 },
    }]));
  });
  await paginaC.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
  await paginaC.waitForTimeout(1000);
  await paginaC.locator('[data-accion="cardio"]').click();
  await paginaC.waitForTimeout(400);

  const selector = await paginaC.evaluate(() => {
    const fila = document.querySelector('.f-modo');
    return {
      ancho: fila ? +fila.getBoundingClientRect().width.toFixed(2) : null,
      izq: fila ? +fila.getBoundingClientRect().left.toFixed(2) : null,
      modos: document.querySelectorAll('.f-modo').length,
      desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  chk('C-01 · la fila de modo ocupa el ancho del mockup',
    Math.abs((selector.ancho ?? 0) - 350) < 0.5, `real ${selector.ancho} | mockup 350`);
  chk('C-01 · el margen izquierdo es el del mockup',
    Math.abs((selector.izq ?? 0) - 20) < 0.5, `${selector.izq}px | mockup 20`);
  chk('C-01 · son SEIS modos (sin "For Time")', selector.modos === 6, String(selector.modos));
  chk('C-01 · no desborda en horizontal', !selector.desborda);

  await paginaC.locator('[data-modo="pyramid"]').click();
  await paginaC.waitForTimeout(400);
  const piramide = await paginaC.evaluate(() => {
    const barras = [...document.querySelectorAll('.f-nivel__barra')];
    const grafico = document.querySelector('.f-montana__grafico');
    return {
      niveles: barras.length,
      alturas: barras.map((b) => b.getBoundingClientRect().height.toFixed(1)),
      alto: grafico ? +grafico.getBoundingClientRect().height.toFixed(1) : null,
      total: document.querySelector('.f-cardio__total-cifra')?.textContent ?? '',
      desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  chk('C-05 · siete niveles', piramide.niveles === 7, String(piramide.niveles));
  // 150 de contenido + 1 de borde inferior: el mockup se dibuja en
  // content-box y mide exactamente lo mismo.
  chk('C-05 · la montaña mide lo que el mockup',
    Math.abs((piramide.alto ?? 0) - 151) < 0.5, `${piramide.alto}px | mockup 151`);
  chk('C-05 · el total es el 7:15 del mockup', piramide.total.includes('7:15'), piramide.total);
  chk('C-05 · la montaña es simetrica',
    JSON.stringify(piramide.alturas) === JSON.stringify([...piramide.alturas].reverse()),
    piramide.alturas.join(','));
  chk('C-05 · no desborda en horizontal', !piramide.desborda);
  await paginaC.close();
}

await navegador.close();
servidor.close();
console.log(fallos ? `\n${fallos} FALLO(S) DE FIDELIDAD` : '\nOK: la app coincide con el mockup en todo lo comprobado');
process.exit(fallos ? 1 : 0);
