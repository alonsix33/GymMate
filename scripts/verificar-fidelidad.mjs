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
  try {
    r.writeHead(200, { 'Content-Type': MIME[extname(archivo)] ?? 'application/octet-stream' });
    r.end(await leer(archivo));
  } catch {
    r.writeHead(404).end('404');
  }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const URL_APP = `http://127.0.0.1:${servidor.address().port}/`;

const navegador = await chromium.launch({ executablePath: CHROME });
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
await pagina.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
await pagina.waitForTimeout(1000);

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

await navegador.close();
servidor.close();
console.log(fallos ? `\n${fallos} FALLO(S) DE FIDELIDAD` : '\nOK: la app coincide con el mockup en todo lo comprobado');
process.exit(fallos ? 1 : 0);
