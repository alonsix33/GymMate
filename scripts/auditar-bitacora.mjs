#!/usr/bin/env node
/**
 * Audita la bitacora SIN TOCARLA. Solo lee y lista.
 *
 *   node scripts/auditar-bitacora.mjs copia.json
 *
 * `copia.json` es la copia que guarda el servidor (GET /api/datos con tu token:
 * `{ datos: { gymmate_history: [...] } }`), o el propio array del historial.
 *
 * Busca lo que el 13-nov-2026 ensucio el coach, para que el usuario vea QUE hay
 * antes de decidir nada (la regla del encargo: no se borra ni se reescribe sin
 * ensenarlo primero):
 *   1. dias con mas de un guardado (y si es el mismo entrenamiento repetido),
 *   2. ejercicios guardados sin series (0x0@0) que la bitacora cuenta como hechos,
 *   3. el mismo ejercicio dos veces en un dia,
 *   4. COPIAS: la misma linea exacta "ejercicio sets x reps @ peso" en dias
 *      distintos (como Abdominales 4x15@63 el 25-oct y el 13-nov),
 *   5. pesos de mas de 3 veces el mejor de las demas series (outliers).
 *
 * Los dias son de America/Lima, igual que el coach.
 */
import { readFileSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: node scripts/auditar-bitacora.mjs copia.json');
  process.exit(2);
}

const crudo = JSON.parse(readFileSync(ruta, 'utf8'));
const historial = Array.isArray(crudo) ? crudo : (crudo.datos ?? crudo).gymmate_history;
if (!Array.isArray(historial)) {
  console.error('No encuentro `gymmate_history` en ese archivo.');
  process.exit(2);
}

const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dia = (s) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(s.date ?? ''))) return s.date;
  const d = new Date(s.savedAt || s.date);
  return Number.isNaN(d.getTime()) ? null : lima.format(d);
};
const etiqueta = (c) => {
  const [a, m, d] = c.split('-').map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} ${MESES[m - 1]} ${a}`;
};
const linea = (e) => `${e.nombre} ${e.sets}x${e.reps}@${e.peso}`;

const pesas = historial.filter((s) => s.type !== 'cardio');
const porDia = new Map();
for (const s of pesas) {
  const c = dia(s);
  if (!c) continue;
  if (!porDia.has(c)) porDia.set(c, []);
  porDia.get(c).push(s);
}

let hallazgos = 0;
const titulo = (t) => console.log(`\n== ${t}`);
const nota = (t) => { hallazgos++; console.log(`  - ${t}`); };

titulo('1. Dias con mas de un guardado');
for (const [c, ss] of [...porDia].sort().reverse()) {
  if (ss.length < 2) continue;
  const grupos = ss.map((s) => `"${s.grupo}"`).join(' + ');
  const mismo = new Set(ss.map((s) => s.grupo)).size < ss.length;
  nota(`${etiqueta(c)}: ${ss.length} guardados (${grupos})${mismo ? ' — MISMO entrenamiento repetido' : ''}`);
}

titulo('2. Ejercicios guardados sin series (0x0@0)');
for (const [c, ss] of [...porDia].sort().reverse()) {
  const vacios = ss.flatMap((s) => (s.ejercicios ?? []).filter((e) => !(e.volumen > 0)).map((e) => e.nombre));
  if (vacios.length) nota(`${etiqueta(c)}: ${[...new Set(vacios)].join(', ')}`);
}

titulo('3. El mismo ejercicio dos veces en un dia');
for (const [c, ss] of [...porDia].sort().reverse()) {
  const cuenta = new Map();
  for (const s of ss) for (const e of s.ejercicios ?? []) if (e.volumen > 0) cuenta.set(e.nombre, (cuenta.get(e.nombre) ?? 0) + 1);
  const rep = [...cuenta].filter(([, n]) => n > 1).map(([n, k]) => `${n} (x${k})`);
  if (rep.length) nota(`${etiqueta(c)}: ${rep.join(', ')}`);
}

titulo('4. Copias: la misma linea exacta en dias distintos');
const lineas = new Map();
for (const [c, ss] of porDia) {
  for (const s of ss) for (const e of s.ejercicios ?? []) {
    if (!(e.volumen > 0)) continue;
    const k = linea(e);
    if (!lineas.has(k)) lineas.set(k, new Set());
    lineas.get(k).add(c);
  }
}
for (const [k, dias] of [...lineas].sort()) {
  // Repetir 4x10@55 durante semanas es normal; sospechoso es lo RARO que se
  // repite (series de 15 con un peso que no es el habitual). Se lista todo lo
  // que aparece en 2 dias o mas y el usuario decide; no se afirma nada.
  if (dias.size >= 2) nota(`${k}: ${[...dias].sort().reverse().map(etiqueta).join(' · ')}`);
}

titulo('5. Pesos de mas de 3 veces el mejor de las demas series');
const filas = [];
for (const [c, ss] of porDia) for (const s of ss) for (const e of s.ejercicios ?? []) if (e.volumen > 0) filas.push({ c, e });
for (const f of filas) {
  const otros = filas.filter((o) => o !== f && o.e.nombre === f.e.nombre).map((o) => o.e.peso);
  const mejor = otros.length ? Math.max(...otros) : 0;
  if (mejor > 0 && f.e.peso > mejor * 3) nota(`${etiqueta(f.c)}: ${f.e.nombre} ${f.e.peso} kg (el mejor de las demas: ${mejor} kg)${f.e.excluido ? ' — ya EXCLUIDO' : ''}`);
}

console.log(`\n${pesas.length} sesiones de pesas en ${porDia.size} dias. ${hallazgos} hallazgo(s).`);
console.log('Este script NO modifica nada. Decide tu que se corrige.');
