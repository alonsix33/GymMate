/**
 * Markdown basico para el chat del coach: **negrita** y listas.
 *
 * El coach escribe markdown y la pantalla lo pintaba como texto plano:
 * asteriscos visibles y las listas con guiones pegadas en un solo parrafo.
 * Esto NO es un parser de markdown: es el subconjunto que el prompt le permite
 * al coach, y todo lo demas sale como texto.
 *
 * Seguridad: se ESCAPA primero y se marca despues, asi que ninguna etiqueta
 * del modelo llega al DOM; las unicas que salen son las que se escriben aqui.
 */
import { escapar } from '@/utils/formato';

function enLinea(escapado: string): string {
  // Solo pares COMPLETOS y en una linea: un `**` abierto a mitad de streaming
  // se queda como texto hasta que llega el cierre.
  return escapado.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
}

/** " - **Prensa a 185.** ..." pegado en medio de un parrafo: cada " - **" que
 *  abre un elemento es un salto de lista. */
function separarListasPegadas(linea: string): string[] {
  if (/^\s*[-*]\s/.test(linea)) return [linea];
  const partes = linea.split(/\s+-\s+(?=\*\*)/);
  return partes.length > 1 ? [partes[0], ...partes.slice(1).map((p) => `- ${p}`)] : [linea];
}

export function markdownBasico(texto: string): string {
  const lineas = String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap(separarListasPegadas);

  const salida: string[] = [];
  let lista: 'ul' | 'ol' | null = null;
  let parrafo: string[] = [];

  const cerrarParrafo = () => {
    if (parrafo.length) salida.push(`<p>${parrafo.join('<br>')}</p>`);
    parrafo = [];
  };
  const cerrarLista = () => {
    if (lista) salida.push(`</${lista}>`);
    lista = null;
  };

  for (const bruta of lineas) {
    const linea = bruta.trimEnd();
    const vi = linea.match(/^\s*[-*•]\s+(.*)$/);
    const nu = linea.match(/^\s*\d+[.)]\s+(.*)$/);
    if (vi || nu) {
      cerrarParrafo();
      const tipo = vi ? 'ul' : 'ol';
      if (lista !== tipo) {
        cerrarLista();
        salida.push(`<${tipo}>`);
        lista = tipo;
      }
      salida.push(`<li>${enLinea(escapar((vi ?? nu)![1]))}</li>`);
    } else if (linea.trim() === '') {
      cerrarParrafo();
      cerrarLista();
    } else {
      cerrarLista();
      // Un encabezado "## x" se queda en negrita: el prompt no los permite.
      const h = linea.match(/^#{1,6}\s+(.*)$/);
      parrafo.push(h ? `<strong>${escapar(h[1])}</strong>` : enLinea(escapar(linea)));
    }
  }
  cerrarParrafo();
  cerrarLista();
  return salida.join('');
}
