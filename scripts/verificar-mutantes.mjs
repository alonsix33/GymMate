#!/usr/bin/env node
/**
 * La puerta que comprueba que las OTRAS puertas sirven.
 *
 * Nace de un agujero concreto. `verificar-servidor.mjs` tiene un tope
 * (`CHEQUEOS_MINIMO`) con un texto que suena a garantia: "borrar casos no
 * puede ser una forma de poner la puerta en verde". Es cierto y por eso
 * engaña: protege del BORRADO y de nada mas. Vaciar tres chequeos dejandoles
 * el nombre y `chk(nombre, true)` daba "24 chequeos ejecutados · sin
 * discrepancias · exit 0". El tope cuenta LLAMADAS, no defectos atrapados.
 *
 * Es el mismo modo de falla que el contador de fidelidad, que contaba bloques
 * del mockup leidos en vez de comparaciones hechas.
 *
 * Aqui se hace lo unico que responde de verdad a "lo verde no es evidencia":
 * se rompe el codigo a proposito, defecto por defecto, y se exige que la
 * puerta se ponga roja. Cada mutante de esta lista es un defecto que YA
 * ocurrio o que la puerta afirma cubrir.
 *
 * Sale 1 si algun mutante SOBREVIVE. Uso: node scripts/verificar-mutantes.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Cada mutante: que archivo, que se cambia por que, y de que defecto real
 * viene. `minimo` es cuantos chequeos tienen que morir como poco; con 1 basta
 * para que el mutante este cubierto, pero se pide mas donde el defecto toca
 * varias cosas y bajar de ahi seria perder cobertura sin darse cuenta.
 */
const MUTANTES = [
  {
    nombre: 'el preflight vuelve a exigir token',
    porque: 'El defecto original: el navegador no manda Authorization en un preflight, asi que la peticion real no salia nunca.',
    archivo: 'server/index.mjs',
    de: '    if (!permitido) return json(res, 403, { error: \'origen no permitido\' });\n    res.writeHead(204, {',
    a: '    if (!permitido || !autorizado(req)) return json(res, 403, { error: \'origen no permitido\' });\n    res.writeHead(204, {',
    minimo: 1,
  },
  {
    nombre: 'se responde con el comodin *',
    porque: 'Con `*`, cualquier pagina que Alonso visite podria pedirle su historial a este servidor.',
    archivo: 'server/index.mjs',
    de: "  res.setHeader('Access-Control-Allow-Origin', origen);",
    a: "  res.setHeader('Access-Control-Allow-Origin', '*');",
    minimo: 3,
  },
  {
    nombre: 'se acepta cualquier origen',
    porque: 'La lista dejaria de servir para nada y no habria ninguna señal.',
    archivo: 'server/index.mjs',
    de: '  if (!ORIGENES.includes(origen)) return false;',
    a: '  if (false) return false;',
    minimo: 2,
  },
  {
    nombre: 'Vary solo en la rama permitida',
    porque: 'El envenenamiento de cache solo es posible en la rama que NO se permite; ahi es donde hace falta.',
    archivo: 'server/index.mjs',
    de: "  res.setHeader('Vary', 'Origin');\n  if (!ORIGENES.includes(origen)) return false;",
    a: "  if (!ORIGENES.includes(origen)) return false;\n  res.setHeader('Vary', 'Origin');",
    minimo: 1,
  },
  {
    nombre: 'se piden credenciales que no hacen falta',
    porque: 'Superficie a cambio de nada: la auth es Bearer desde localStorage, no cookies.',
    archivo: 'server/index.mjs',
    de: "  res.setHeader('Access-Control-Allow-Origin', origen);",
    a: "  res.setHeader('Access-Control-Allow-Origin', origen);\n  res.setHeader('Access-Control-Allow-Credentials', 'true');",
    minimo: 1,
  },
  {
    nombre: 'DELETE en los metodos permitidos',
    porque: 'Anunciar un metodo que no existe invita a usarlo.',
    archivo: 'server/index.mjs',
    de: "'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',",
    a: "'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',",
    minimo: 1,
  },
  {
    nombre: 'el cuerpo se concatena como texto (UTF-8 partido)',
    porque: 'Comprobado: 128 KB con acentos volvian con 4 caracteres destruidos, 200 OK y ninguna señal. Y `gymmate_prs` esta indexado por el NOMBRE del ejercicio.',
    archivo: 'server/index.mjs',
    de: '        const texto = Buffer.concat(trozos).toString(\'utf8\');',
    a: "        const texto = trozos.reduce((t, x) => t + x, '');",
    minimo: 1,
  },
  {
    nombre: 'sin GYMMATE_TOKEN la API queda abierta',
    porque: 'Dejaria el historial y el credito del modelo al alcance de cualquiera con la URL.',
    archivo: 'server/index.mjs',
    de: '  if (!TOKEN) return false;',
    a: '  if (!TOKEN) return true;',
    minimo: 1,
  },
  {
    nombre: 'el streaming del coach pierde las cabeceras CORS',
    porque: 'La respuesta le llegaria al navegador como fallo de red y la app culparia a la conexion.',
    archivo: 'server/coach.mjs',
    de: "  res.writeHead(200, {\n    'Content-Type': 'text/plain; charset=utf-8',",
    a: "  res.removeHeader('Access-Control-Allow-Origin');\n  res.writeHead(200, {\n    'Content-Type': 'text/plain; charset=utf-8',",
    minimo: 1,
  },
  {
    nombre: 'el aviso de /api/salud vuelve a decir lo contrario',
    porque: 'Un rotulo que miente sobre el riesgo hace tomar la decision al reves.',
    archivo: 'server/index.mjs',
    de: "'Falta GYMMATE_TOKEN: la API no acepta a nadie hasta que la configures.',",
    a: "'Falta GYMMATE_TOKEN: la API está abierta a cualquiera.',",
    minimo: 1,
  },
];

let fallos = 0;
console.log(`Probando ${MUTANTES.length} mutantes contra la puerta del servidor.\n`);

for (const m of MUTANTES) {
  const ruta = join(RAIZ, m.archivo);
  const original = readFileSync(ruta, 'utf8');
  if (!original.includes(m.de)) {
    fallos++;
    console.log(`FALLA ${m.nombre} :: el codigo a mutar ya no existe en ${m.archivo}.`);
    console.log('      Un mutante que no se puede aplicar no prueba nada. Actualizalo o borralo.');
    continue;
  }
  writeFileSync(ruta, original.replace(m.de, m.a));
  let muertos = 0;
  try {
    execFileSync(process.execPath, [join(RAIZ, 'scripts', 'verificar-servidor.mjs')], {
      cwd: RAIZ,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    muertos = ((e.stdout ?? '') + (e.stderr ?? '')).split('\n').filter((l) => l.startsWith('FALLA')).length;
    // Un mutante que hace REVENTAR la puerta tambien esta atrapado: lo que no
    // vale es que pase en verde.
    if (muertos === 0) muertos = 1;
  } finally {
    writeFileSync(ruta, original);
  }
  const ok = muertos >= m.minimo;
  if (!ok) fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${m.nombre} :: ${muertos} chequeo(s) muertos, minimo ${m.minimo}`);
  if (!ok) console.log(`      ${m.porque}`);
}

// Que la lista no se vacie por el mismo camino que este script vino a cerrar.
const MUTANTES_MINIMO = 10;
if (MUTANTES.length < MUTANTES_MINIMO) {
  fallos++;
  console.log(`\nFALLA solo hay ${MUTANTES.length} mutantes (minimo ${MUTANTES_MINIMO}).`);
}

if (fallos > 0) {
  console.log(`\n${fallos} mutante(s) SOBREVIVEN. La puerta dice cubrir algo que no cubre.`);
  process.exit(1);
}
console.log(`\n${MUTANTES.length} mutantes, ${MUTANTES.length} muertos. La puerta del servidor muerde.`);
