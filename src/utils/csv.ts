/**
 * CSV de GymMate: partir en registros, partir un registro en celdas y
 * neutralizar celdas que Excel interpretaria como formula.
 *
 * `String.split(/\r?\n/)` cortaba un mensaje del coach con saltos de linea en
 * varias filas: la conversacion volvia truncada y las lineas sobrantes se
 * leian como filas de otra seccion.
 */

/** Parte el texto en registros respetando los saltos de linea DENTRO de comillas.
 *  Los registros vacios se descartan. */
export function partirEnRegistros(texto: string): string[] {
  const registros: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      // `""` dentro de comillas es una comilla literal: no alterna el estado.
      if (entreComillas && texto[i + 1] === '"') {
        actual += '""';
        i++;
        continue;
      }
      entreComillas = !entreComillas;
      actual += c;
    } else if ((c === '\n' || c === '\r') && !entreComillas) {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      if (actual.trim()) registros.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  if (actual.trim()) registros.push(actual);
  return registros;
}

/** Un registro -> celdas. Las celdas entre comillas conservan saltos de linea y
 *  espacios; las demas se recortan. */
export function partirCeldas(registro: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let entreComillas = false;
  let eraCitada = false;
  const cerrar = () => {
    celdas.push(eraCitada ? actual : actual.trim());
    actual = '';
    eraCitada = false;
  };
  for (let i = 0; i < registro.length; i++) {
    const c = registro[i];
    if (c === '"') {
      if (entreComillas && registro[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
        if (entreComillas) eraCitada = true;
      }
    } else if (c === ',' && !entreComillas) {
      cerrar();
    } else {
      actual += c;
    }
  }
  cerrar();
  return celdas;
}

/** Excel, Calc y Sheets ejecutan una celda que empieza por = + - @ (o tab / CR).
 *  El prefijo `'` la deja como texto; `quitarNeutralizacion` lo deshace al leer. */
const EMPIEZA_COMO_FORMULA = /^[=+\-@\t\r]/;

export function neutralizarFormula(valor: string): string {
  return EMPIEZA_COMO_FORMULA.test(valor) ? `'${valor}` : valor;
}

export function quitarNeutralizacion(valor: string): string {
  return /^'[=+\-@\t\r]/.test(valor) ? valor.slice(1) : valor;
}

export function escaparCelda(valor: string | number): string {
  const s = String(valor);
  if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
