/**
 * El coach, del lado del servidor.
 *
 * Aqui esta la clave de Anthropic y aqui se queda: si el navegador hablara
 * directo con la API, la clave viajaria en el bundle y cualquiera con las
 * herramientas de desarrollo se la lleva.
 *
 * La regla del handoff se respeta al pie: "la aritmetica nunca la genera el
 * modelo". Los numeros —1RM, estancamiento, proximo peso— los calcula la app
 * en tu telefono y llegan aqui ya hechos, dentro de `datos`. El modelo solo
 * los EXPLICA. Si se inventa una cifra, la tarjeta de datos que se pinta al
 * lado sigue diciendo la verdad.
 */
const MODELO = process.env.COACH_MODELO || 'claude-sonnet-5';
const MAX_TOKENS = Number(process.env.COACH_MAX_TOKENS) || 700;

const SISTEMA = `Eres el coach de GymMate, una app de gimnasio de una sola persona.

Voz:
- Español de Perú, directo, sin animar de más. Nada de "¡vamos!", "¡tú puedes!"
  ni exclamaciones dobles. Sin emojis. Sin mascota ni nombre propio: eres una
  función de la app, no un personaje.
- Di el peso objetivo, nunca la diferencia. "Levanta 50 kg y es PR nuevo", no
  "te faltan 2.5 kg".
- Frases cortas. Si no hay dato para responder, dilo y no rellenes.

Aritmética:
- NO calcules. Los números de 1RM, pico, sesiones estancado y próximo peso te
  llegan ya calculados en el bloque DATOS. Úsalos literalmente.
- Si el bloque DATOS viene vacío, no inventes cifras: pide al usuario que
  registre ese ejercicio.`;

export async function responderCoach(req, res, cuerpo) {
  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({ error: 'Falta ANTHROPIC_API_KEY en las variables del servicio' })
    );
  }

  const pregunta = String(cuerpo?.pregunta ?? '').slice(0, 2000);
  if (!pregunta.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'pregunta vacía' }));
  }

  // El historial y los datos vienen del cliente; se acotan por si acaso.
  const historial = Array.isArray(cuerpo?.historial) ? cuerpo.historial.slice(-12) : [];
  const datos = cuerpo?.datos ?? null;

  const mensajes = historial
    .filter((t) => t && (t.autor === 'coach' || t.autor === 'usuario') && typeof t.texto === 'string')
    .map((t) => ({ role: t.autor === 'usuario' ? 'user' : 'assistant', content: t.texto.slice(0, 4000) }));

  const bloqueDatos = datos
    ? `\n\nDATOS (calculados en el dispositivo, son la verdad):\n${JSON.stringify(datos)}`
    : '\n\nDATOS: ninguno para esta pregunta.';
  mensajes.push({ role: 'user', content: pregunta + bloqueDatos });

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        system: SISTEMA,
        messages: mensajes,
        stream: true,
      }),
    });
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'no se pudo hablar con el modelo: ' + e.message }));
  }

  if (!upstream.ok || !upstream.body) {
    const detalle = await upstream.text().catch(() => '');
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'el modelo respondió ' + upstream.status, detalle: detalle.slice(0, 500) }));
  }

  // Se reenvia como texto plano en trozos: la app ya pinta en streaming y no
  // necesita el protocolo SSE entero, solo el texto segun llega.
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });

  const lector = upstream.body.getReader();
  const dec = new TextDecoder();
  let resto = '';
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const lineas = resto.split('\n');
      resto = lineas.pop() ?? '';
      for (const linea of lineas) {
        if (!linea.startsWith('data:')) continue;
        try {
          const ev = JSON.parse(linea.slice(5).trim());
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            res.write(ev.delta.text);
          }
        } catch {
          // Un evento partido a la mitad se recompone en la vuelta siguiente.
        }
      }
    }
  } catch {
    // Se corta el stream: la app lo trata como error de red y guarda la
    // pregunta en su cola, que es exactamente CO-03.
  }
  res.end();
}
