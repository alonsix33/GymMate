#!/usr/bin/env node
/**
 * Chequeo estatico de los tokens FIERRO.
 *
 * Rederiva los valores canonicos desde el TEXTO de
 * redesign/design_handoff_fierro/README.md y desde los dos .dc.html.
 * No hay ninguna lista de valores tecleada a mano en este archivo.
 *
 * Cubre, y SOLO cubre:
 *   A. las 3 rampas de color (Carbon 11 / Hueso 6 / Fragua 10 = 27 pasos)
 *   B. los 9 rangos musculares
 *   C. los 5 escalones del heatmap
 *   D. cobertura inversa de color: todo hex/rgb() del README y de
 *      Pantallas Fierro.dc.html existe como token
 *   E. cobertura tipografica: todo font-size, letter-spacing, line-height,
 *      border-radius, font-stretch y font-weight usado en Pantallas
 *      existe como token
 *   F. integridad: ningun var(--x) de tokens.css apunta a un token inexistente
 *
 * NO cubre: si los tokens se USAN bien en los componentes (eso es visual),
 * ni geometria de componente (paddings, alturas), que el contrato no exige
 * tokenizar — el contrato exige color y tipografia.
 *
 * Solo mira declaraciones dentro de :root y fuera de comentarios: un token
 * comentado no existe para el navegador y no debe existir para el chequeo.
 *
 * Sale 1 ante cualquier discrepancia.  Uso: node scripts/verificar-tokens.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join, relative, basename } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HANDOFF = resolve(RAIZ, 'redesign/design_handoff_fierro');
const leer = (p) => readFileSync(resolve(RAIZ, p), 'utf-8');

const readme = leer('redesign/design_handoff_fierro/README.md');
const pantallas = leer('redesign/design_handoff_fierro/Pantallas Fierro.dc.html');
const sistema = leer('redesign/design_handoff_fierro/Sistema Fierro.dc.html');
const corpus = pantallas + sistema;

const fallos = [];
const nota = (m) => fallos.push(m);

// --- tokens declarados: solo :root, sin comentarios -------------------------
function rootDecls(css) {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const ini = limpio.indexOf(':root');
  if (ini === -1) throw new Error('tokens.css no tiene bloque :root');
  const abre = limpio.indexOf('{', ini);
  let prof = 0;
  let cierra = -1;
  for (let i = abre; i < limpio.length; i++) {
    if (limpio[i] === '{') prof++;
    else if (limpio[i] === '}' && --prof === 0) {
      cierra = i;
      break;
    }
  }
  if (cierra === -1) throw new Error('tokens.css: bloque :root sin cerrar');
  const cuerpo = limpio.slice(abre + 1, cierra);
  return new Map(
    [...cuerpo.matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
  );
}

const cssTokens = leer('src/styles/tokens.css');
const tok = rootDecls(cssTokens);

// Resuelve alias para poder comparar valores finales.
function valor(nombre, vistos = new Set()) {
  let v = tok.get(nombre);
  while (v && v.startsWith('var(')) {
    const ref = v.slice(4, v.lastIndexOf(')')).split(',')[0].trim();
    if (vistos.has(ref)) return undefined;
    vistos.add(ref);
    v = tok.get(ref);
  }
  return v;
}

const cmp = (clave, esperado, origen) => {
  const got = valor(clave);
  if (got === undefined) nota(`FALTA ${clave} (canon ${esperado}, ${origen})`);
  else if (got.toUpperCase() !== esperado.toUpperCase())
    nota(`${clave}: tokens.css=${got} != canon ${esperado} (${origen})`);
};

// Cuenta real de valores rederivados desde el README. Era una constante
// decorativa impresa a mano ("41 valores"): un numero que nadie calculaba y que
// habria seguido diciendo 41 aunque la extraccion cayera a cero.
let rederivados = 0;

// --- A. rampas --------------------------------------------------------------
const RAMPAS = {
  carbon: [['950', '900', '800', '700', '600', '500', '400', '300', '200', '100', '50'], '**Carbón**'],
  hueso: [['500', '400', '300', '200', '100', '50'], '**Hueso**'],
  fragua: [['900', '800', '700', '600', '500', '400', '300', '200', '100', '50'], '**Fragua**'],
};
for (const [nombre, [pasos, marca]] of Object.entries(RAMPAS)) {
  const cola = readme.split(marca)[1] ?? '';
  // La linea de la rampa es la primera vineta con >=3 hexes. Las siguientes
  // ("Texto sobre Fragua-500: `#0B0C0F`") no son la rampa.
  const linea = cola
    .split('\n')
    .find((l) => l.startsWith('- ') && (l.match(/`#[0-9A-Fa-f]{6}`/g) ?? []).length >= 3);
  if (!linea) {
    nota(`COBERTURA rampa ${nombre}: no se encontro su linea en el README`);
    continue;
  }
  const vistos = new Map(
    [...linea.matchAll(/\b(\d{2,3})\b[^`\n]*?`(#[0-9A-Fa-f]{6})`/g)]
      .filter((m) => pasos.includes(m[1]))
      .map((m) => [m[1], m[2]])
  );
  if (vistos.size !== pasos.length)
    nota(`COBERTURA rampa ${nombre}: el README dio ${vistos.size} de ${pasos.length} pasos`);
  for (const [paso, hex] of vistos) {
    cmp(`--${nombre}-${paso}`, hex, `README rampa ${nombre}`);
    rederivados++;
  }
}

// --- B. rangos musculares ---------------------------------------------------
const SLUG = {
  Hierro: 'hierro', Bronce: 'bronce', Plata: 'plata', Oro: 'oro', Platino: 'platino',
  Esmeralda: 'esmeralda', Diamante: 'diamante', Campeón: 'campeon', Simétrico: 'simetrico',
};
const lineaRangos = readme.split('\n').find((l) => l.includes('Hierro `#'));
const rangos = [...(lineaRangos ?? '').matchAll(/([A-ZÁÉÍÓÚ][a-zá-úé]+)\s*`(#[0-9A-Fa-f]{6})`/g)];
if (rangos.length !== 9) nota(`COBERTURA rangos: el README dio ${rangos.length} de 9`);
for (const [, nombre, hex] of rangos) {
  cmp(`--rango-${SLUG[nombre]}`, hex, 'README rangos');
  rederivados++;
}

// --- C. heatmap -------------------------------------------------------------
const lineaHeat = readme.split('\n').find((l) => l.includes('**Heatmap**'));
const heat = [...(lineaHeat ?? '').matchAll(/(0|Q1|Q2|Q3|Q4)\s*=?\s*`(#[0-9A-Fa-f]{6})`/g)];
const MAPA_HEAT = { 0: '--heat-0', Q1: '--heat-q1', Q2: '--heat-q2', Q3: '--heat-q3', Q4: '--heat-q4' };
if (heat.length !== 5) nota(`COBERTURA heatmap: el README dio ${heat.length} de 5`);
for (const [, k, v] of heat) {
  cmp(MAPA_HEAT[k], v, 'README heatmap');
  rederivados++;
}

// --- D. cobertura inversa de color -----------------------------------------
// Normaliza #abc -> #aabbcc y rgb(a)() -> #rrggbb para comparar de verdad.
const expandir = (h) =>
  h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h;
const deRgb = (s) => {
  const n = s.match(/-?[\d.]+/g);
  if (!n || n.length < 3) return null;
  return '#' + n.slice(0, 3).map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('');
};
function coloresDe(texto) {
  const out = new Set();
  for (const h of texto.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []) out.add(expandir(h).toUpperCase());
  for (const r of texto.match(/rgba?\([^)]*\)/g) ?? []) {
    const h = deRgb(r);
    if (h) out.add(h.toUpperCase());
  }
  return out;
}
const tengo = new Set(
  [...tok.keys()].map((k) => valor(k)).filter(Boolean).flatMap((v) => [...coloresDe(v)])
);
// Sombras y velos declarados como valor compuesto tambien aportan su color.
for (const v of tok.values()) for (const c of coloresDe(v)) tengo.add(c);

const faltanReadme = [...coloresDe(readme)].filter((h) => !tengo.has(h)).sort();
if (faltanReadme.length) nota(`colores del README sin token: ${faltanReadme.join(', ')}`);

// Las pantallas son la verdad de produccion. Sistema Fierro.dc.html es el doc
// ilustrativo: se chequea aparte y solo se avisa, no rompe.
const faltanPantallas = [...coloresDe(pantallas)].filter((h) => !tengo.has(h)).sort();
if (faltanPantallas.length) nota(`colores de Pantallas.dc.html sin token: ${faltanPantallas.join(', ')}`);
const faltanSistema = [...coloresDe(sistema)].filter((h) => !tengo.has(h)).sort();

// --- E. cobertura tipografica ----------------------------------------------
const valoresTok = new Set([...tok.keys()].map((k) => valor(k)).filter(Boolean));
const DIMENSIONES = [
  ['font-size', [/font-size:([0-9.]+)px/g, /font:\s*\d+\s+([0-9.]+)px/g], (v) => `${v}px`],
  ['letter-spacing', [/letter-spacing:(-?\.?[0-9.]+)em/g], (v) => `${v}em`],
  ['line-height', [/line-height:([0-9.]+)(?![0-9a-z])/g, /font:\s*\d+\s+[0-9.]+px\/([0-9.]+)/g], (v) => v],
  ['border-radius', [/border-radius:([0-9.]+)px(?![0-9])/g], (v) => `${v}px`],
  ['font-stretch', [/font-stretch:([0-9.]+)%/g], (v) => `${v}%`],
  ['font-weight', [/font-weight:([0-9]+)/g, /font:\s*(\d{3})\s/g], (v) => v],
];
for (const [nombre, patrones, fmt] of DIMENSIONES) {
  const usados = new Set();
  for (const p of patrones) for (const m of pantallas.matchAll(p)) usados.add(fmt(m[1]));
  const sin = [...usados].filter((v) => !valoresTok.has(v)).sort();
  if (sin.length) nota(`${nombre} usado en Pantallas sin token: ${sin.join(', ')}`);
}

// --- F. integridad de referencias ------------------------------------------
const sinComentarios = cssTokens.replace(/\/\*[\s\S]*?\*\//g, '');
const refs = new Set([...sinComentarios.matchAll(/var\((--[a-z0-9_-]+)/g)].map((m) => m[1]));
const rotas = [...refs].filter((r) => !tok.has(r)).sort();
if (rotas.length) nota(`var() que no resuelve a ningun token de :root: ${rotas.join(', ')}`);

// --- G. reglas estaticas sobre el codigo fuente -----------------------------
//
// Estas cuatro las pedia el contrato desde el principio y NINGUNA puerta las
// miraba. Se descubrio mutando: un `alert()` metido a mano, un hex crudo en
// `fierro.css`, un `var(--token-inexistente)` y un emoji en una descripcion
// pasaban las cuatro puertas en verde.
//
// Van aqui, en la puerta estatica, porque son propiedades del CODIGO: no hace
// falta un navegador para comprobarlas y asi fallan en el primer segundo.
function ficheros(dir, ext) {
  const salida = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...ficheros(ruta, ext));
    else if (ext.some((e) => entrada.endsWith(e))) salida.push(ruta);
  }
  return salida;
}

const SRC = join(RAIZ, 'src');
const fuentesTS = ficheros(SRC, ['.ts']);
const fuentesCSS = ficheros(SRC, ['.css']);

// G1 · cero alert()/confirm()/prompt(): los reemplaza F-01.
for (const f of fuentesTS) {
  const texto = readFileSync(f, 'utf8');
  const sinComent = texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const fn of ['alert', 'confirm', 'prompt']) {
    const re = new RegExp(`(?<![\\w.$])${fn}\\s*\\(`, 'g');
    if (re.test(sinComent)) {
      fallos.push(`${relative(RAIZ, f)}: usa ${fn}() — el contrato lo prohibe, va por src/ui/feedback.ts`);
    }
  }
}

// G2 · cero dia UTC. `toISOString().split('T')[0]` es dia de Greenwich, y en
// Lima manda el dia siguiente a partir de las 19:00. Un solo helper decide
// que dia es: src/utils/fecha.ts.
for (const f of fuentesTS) {
  if (relative(RAIZ, f) === join('src', 'utils', 'fecha.ts')) continue;
  const texto = readFileSync(f, 'utf8');
  if (/toISOString\(\)\s*\.\s*(split\(['"]T['"]\)\s*\[0\]|slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\))/.test(texto)) {
    fallos.push(
      `${relative(RAIZ, f)}: deriva el dia con toISOString() — eso es UTC. Usa claveDiaLocal() de @/utils/fecha`
    );
  }
}

// G3 · cero hex fuera de tokens.css. El contrato: "cualquier hex suelto fuera
// de tokens.css es un defecto".
//
// Queda UNA excepcion declarada, con su cuenta clavada: `main.css` es la hoja
// legacy que la fase 9 elimina entera. Clavar el numero convierte la excepcion
// en un trinquete: si aparece un hex nuevo, la puerta se pone roja igual. Una
// excepcion sin numero seria una puerta que miente sobre su alcance.
const HEX_LEGACY_PERMITIDOS = { 'src/styles/main.css': 14 };
for (const f of fuentesCSS) {
  if (basename(f) === 'tokens.css') continue;
  const rel = relative(RAIZ, f).split('\\').join('/');
  const texto = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const hexes = [...texto.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  const permitidos = HEX_LEGACY_PERMITIDOS[rel];
  if (permitidos === undefined) {
    if (hexes.length) {
      fallos.push(
        `${rel}: ${hexes.length} hex fuera de tokens.css (${[...new Set(hexes)].slice(0, 5).join(', ')})`
      );
    }
  } else if (hexes.length !== permitidos) {
    fallos.push(
      `${rel}: ${hexes.length} hex, se esperaban ${permitidos} (hoja legacy, la fase 9 la borra). ` +
        `Si bajaste el numero, actualiza HEX_LEGACY_PERMITIDOS; si subio, no metas hex nuevos.`
    );
  }
}

// G3b · cero hex en TypeScript. El color solo sale de tokens.css: un hex en un
// .ts se salta la puerta de tokens, la de fidelidad y el ojo. Los comentarios
// SI pueden citarlos (documentar que token es cual es util).
for (const f of fuentesTS) {
  const texto = readFileSync(f, 'utf8');
  const sinComent = texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  const hexes = [...sinComent.matchAll(/['"\`]#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].slice(1));
  if (hexes.length) {
    fallos.push(
      `${relative(RAIZ, f)}: ${hexes.length} hex en codigo TS (${[...new Set(hexes)].slice(0, 4).join(', ')}) — usa var(--token)`
    );
  }
}

// G4 · integridad de var() en TODAS las hojas, no solo en tokens.css. Un
// `var(--r-inexistente)` compilaba y se veia mal en silencio.
//
// No cuentan como huerfanas: las que llevan valor de reserva —`var(--x, y)`,
// que es justo el mecanismo de "el tamaño lo fija quien la use"— ni las que el
// TS escribe como propiedad en linea (`style="--rango:${color}"`).
const propsEnLinea = new Set();
for (const f of fuentesTS) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(--[a-z0-9_-]+)\s*:/g)) propsEnLinea.add(m[1]);
}
for (const f of fuentesCSS) {
  const texto = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const declaradosAqui = new Set([...texto.matchAll(/^\s*(--[a-z0-9_-]+)\s*:/gm)].map((m) => m[1]));
  const usados = new Set(
    [...texto.matchAll(/var\((--[a-z0-9_-]+)\s*(,?)/g)].filter((m) => m[2] !== ',').map((m) => m[1])
  );
  const huerfanos = [...usados]
    .filter((v) => !tok.has(v) && !declaradosAqui.has(v) && !propsEnLinea.has(v))
    .sort();
  if (huerfanos.length) {
    fallos.push(`${relative(RAIZ, f)}: var() sin token: ${huerfanos.join(', ')}`);
  }
}

// --- salida -----------------------------------------------------------------
console.log(`tokens en :root            : ${tok.size}`);
console.log(`rampa + rangos + heatmap   : ${rederivados} valores rederivados del README`);
if (rederivados < 40) {
  fallos.push(
    `solo se rederivaron ${rederivados} valores del README (se esperan 41): la extraccion se rompio ` +
      'y la puerta estaria comparando casi nada'
  );
}
console.log(`colores unicos con token   : ${tengo.size}`);
if (faltanSistema.length)
  console.log(
    `aviso (no rompe)           : Sistema.dc.html usa ${faltanSistema.join(', ')} — ` +
      `es el doc ilustrativo, las pantallas reales no lo usan`
  );
if (fallos.length) {
  console.log('\nFALLOS:');
  for (const f of fallos) console.log('  -', f);
  process.exit(1);
}
console.log('\nOK: sin discrepancias');
