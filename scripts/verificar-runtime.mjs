#!/usr/bin/env node
/**
 * Chequeo de runtime FIERRO: levanta la app CONSTRUIDA en un navegador real y
 * mide. No lee CSS y opina — mide anchos de texto, estado del FontFaceSet,
 * estilos computados y pedidos de red.
 *
 * Cubre, y SOLO cubre:
 *   1. que las dos familias self-hosted esten realmente cargadas
 *   2. que la APP las use (no basta con que existan: la fase 1 fallo justo ahi)
 *   3. que los ejes variables wdth/wght de Archivo esten vivos
 *   4. que tabular-nums funcione en ambas familias
 *   5. que el fondo del body sea el token --page-bg leido del propio DOM
 *   6. que no haya un solo pedido cross-origin ni un solo pedido fallido
 *   7. que la app cargue y renderice con la red cortada
 *
 * La deteccion de fallback usa un CENTINELA: se compara
 *   font-family: Archivo, "<centinela inexistente>"
 * contra
 *   font-family: "<centinela inexistente>"
 * Si Archivo falta, las dos caen a la MISMA fuente de ultimo recurso y miden
 * igual -> rojo. Comparar contra system-ui daria verde aunque Archivo faltara,
 * porque el fallback por defecto tampoco es system-ui.
 *
 * Sale 1 ante cualquier fallo.  Uso: node scripts/verificar-runtime.mjs [url]
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { resolve, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const CHROME = process.env.FIERRO_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// La sonda sirve dist/ ella misma. Apuntarla a un servidor de fuera invita a
// medir un artefacto viejo o una raiz equivocada y creerse el resultado.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};
await stat(join(DIST, 'index.html')).catch(() => {
  console.error('No hay dist/index.html. Corre `npm run build` antes que esta sonda.');
  process.exit(2);
});
const servidor = createServer(async (req, res) => {
  const ruta = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const archivo = join(DIST, ruta === '/' ? 'index.html' : ruta);
  if (!archivo.startsWith(DIST)) return res.writeHead(403).end();
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': MIME[extname(archivo)] ?? 'application/octet-stream' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
  }
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const URL_APP = process.argv[2] ?? `http://127.0.0.1:${servidor.address().port}/`;

let fallos = 0;
const chk = (nombre, ok, detalle = '') => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${detalle ? ' :: ' + detalle : ''}`);
};

const navegador = await chromium.launch({ executablePath: CHROME });
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });

const pedidos = [];
const fallidos = [];
pagina.on('request', (r) => pedidos.push(r.url()));
pagina.on('requestfailed', (r) => fallidos.push(`${r.url()} :: ${r.failure()?.errorText}`));
const errConsola = [];
pagina.on('console', (m) => m.type() === 'error' && errConsola.push(m.text()));

await pagina.goto(URL_APP, { waitUntil: 'networkidle', timeout: 60000 });
await pagina.waitForTimeout(1200);

const m = await pagina.evaluate(async () => {
  const CENTINELA = '"__FierroSinFuente__"';
  const ancho = (css, txt = 'PIERNAS 2,800 kg') => {
    const el = document.createElement('span');
    el.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:44px;' + css;
    el.textContent = txt;
    document.body.appendChild(el);
    const w = +el.getBoundingClientRect().width.toFixed(2);
    el.remove();
    return w;
  };
  await Promise.all([
    document.fonts.load('900 44px Archivo', 'PIERNAS 2,800 kg'),
    document.fonts.load('700 15px "Instrument Sans"', 'Prensa 120 kg'),
  ]);
  await document.fonts.ready;
  const cargada = (fam) => [...document.fonts].some((f) => f.family === fam && f.status === 'loaded');

  // Elemento que la APP marca como display, para comprobar el cableado real.
  const display = document.querySelector('.font-display');
  const raiz = getComputedStyle(document.documentElement);

  return {
    archivoCargada: cargada('Archivo'),
    instrumentCargada: cargada('Instrument Sans'),
    // centinela
    archivoVsCentinela: [
      ancho(`font-family:Archivo,${CENTINELA};font-weight:900;font-stretch:118%`),
      ancho(`font-family:${CENTINELA};font-weight:900`),
    ],
    instrumentVsCentinela: [
      ancho(`font-family:'Instrument Sans',${CENTINELA};font-weight:700`),
      ancho(`font-family:${CENTINELA};font-weight:700`),
    ],
    // ejes variables (con centinela, para que un fallback no los simule)
    wdth: [
      ancho(`font-family:Archivo,${CENTINELA};font-weight:900;font-stretch:62.5%`),
      ancho(`font-family:Archivo,${CENTINELA};font-weight:900;font-stretch:118%`),
    ],
    wght: [
      ancho(`font-family:Archivo,${CENTINELA};font-weight:400;font-stretch:118%`),
      ancho(`font-family:Archivo,${CENTINELA};font-weight:900;font-stretch:118%`),
    ],
    tnumInstrument: [
      ancho(`font-family:'Instrument Sans';font-variant-numeric:tabular-nums`, '111'),
      ancho(`font-family:'Instrument Sans';font-variant-numeric:tabular-nums`, '000'),
    ],
    tnumArchivo: [
      ancho(`font-family:Archivo;font-weight:800;font-stretch:110%;font-variant-numeric:tabular-nums`, '111'),
      ancho(`font-family:Archivo;font-weight:800;font-stretch:110%;font-variant-numeric:tabular-nums`, '000'),
    ],
    // cableado real de la app
    bodyFF: getComputedStyle(document.body).fontFamily,
    displayFF: display ? getComputedStyle(display).fontFamily : null,
    // el fondo comparado contra el TOKEN leido del DOM, no contra un hex tecleado
    bodyBg: getComputedStyle(document.body).backgroundColor,
    tokenPageBg: raiz.getPropertyValue('--page-bg').trim(),
    origen: location.origin,
  };
});

const hex2rgb = (h) => {
  const n = h.replace('#', '');
  const v = n.length === 3 ? [...n].map((c) => c + c) : n.match(/../g);
  return `rgb(${v.slice(0, 3).map((x) => parseInt(x, 16)).join(', ')})`;
};
const distintos = ([a, b], min = 2) => Math.abs(a - b) > min;

console.log(`\n--- ${URL_APP} ---`);
chk('Archivo cargada en el FontFaceSet', m.archivoCargada);
chk('Instrument Sans cargada en el FontFaceSet', m.instrumentCargada);
chk('Archivo no cae a fallback (centinela)', distintos(m.archivoVsCentinela), m.archivoVsCentinela.join(' vs '));
chk('Instrument no cae a fallback (centinela)', distintos(m.instrumentVsCentinela, 0.5), m.instrumentVsCentinela.join(' vs '));
chk('eje wdth vivo (62.5% != 118%)', distintos(m.wdth), m.wdth.join(' vs '));
// El fallback tambien varia de peso: sin encadenarlo a que Archivo este
// cargada, esta asercion da verde con las fuentes ausentes.
chk('eje wght vivo (400 != 900)', m.archivoCargada && distintos(m.wght), m.wght.join(' vs '));
chk('tabular-nums en Instrument', m.tnumInstrument[0] === m.tnumInstrument[1], m.tnumInstrument.join(' / '));
chk('tabular-nums en Archivo', m.tnumArchivo[0] === m.tnumArchivo[1], m.tnumArchivo.join(' / '));
chk('la APP usa Instrument Sans en el body', /Instrument Sans/.test(m.bodyFF), m.bodyFF);
chk('la APP usa Archivo en .font-display', m.displayFF === null || /Archivo/.test(m.displayFF), m.displayFF ?? '(sin .font-display en esta pantalla)');
chk('el fondo del body es el token --page-bg', m.bodyBg === hex2rgb(m.tokenPageBg), `${m.bodyBg} vs token ${m.tokenPageBg}`);

const externos = pedidos.filter((u) => u.startsWith('http') && !u.startsWith(m.origen));
chk('cero pedidos cross-origin', externos.length === 0, externos.slice(0, 3).join(', '));
chk('cero pedidos fallidos', fallidos.length === 0, fallidos.slice(0, 3).join(' | '));
chk('cero errores de consola', errConsola.length === 0, errConsola.slice(0, 2).join(' | '));

// --- offline ---------------------------------------------------------------
// serviceWorker.ready no resuelve nunca si el SW no llega a activar: sin
// carrera contra un temporizador, la sonda se cuelga en vez de fallar.
const swListo = await pagina.evaluate(
  () =>
    new Promise((res) => {
      if (!navigator.serviceWorker) return res(false);
      const t = setTimeout(() => res(false), 15000);
      navigator.serviceWorker.ready.then(() => {
        clearTimeout(t);
        res(true);
      });
    })
);
chk('el service worker activa', swListo === true);
await pagina.waitForTimeout(1500);
fallidos.length = 0;
await pagina.context().setOffline(true);
let errNav = null;
await pagina.reload({ waitUntil: 'load', timeout: 30000 }).catch((e) => (errNav = e.message));
await pagina.waitForTimeout(800);
const offline = await pagina.evaluate(async () => {
  await document.fonts.ready;
  return {
    texto: document.body.innerText.trim().length,
    archivo: [...document.fonts].some((f) => f.family === 'Archivo'),
  };
});
console.log('\n--- con la red cortada ---');
chk('la app recarga sin red', errNav === null, errNav ?? '');
chk('renderiza contenido sin red', offline.texto > 200, `${offline.texto} caracteres`);
chk('las @font-face siguen disponibles sin red', offline.archivo);
chk('cero pedidos fallidos sin red', fallidos.length === 0, fallidos.slice(0, 3).join(' | '));

await navegador.close();
servidor.close();
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nOK: sin fallos');
process.exit(fallos ? 1 : 0);
