# Plan de mejora de GymMate

Salió de cuatro revisiones en paralelo (bugs y código, UX con el historial real, service worker, coach de IA) y de lo que ya se arregló en el PR #75. Cada punto dice **de dónde sale** y si **lo verifiqué yo en el código** (✔) o es un hallazgo de un revisor que falta comprobar (◻).

Esfuerzo: **S** = horas · **M** = un día o dos · **L** = una semana.

## 0. Dónde estamos

- **Hecho en el PR #75** (aún sin mergear ni desplegar): fechas en Lima, sesiones fusionadas por día, cálculos en código en vez de en el modelo, récords falsos fuera del pico, botón "Marcar como no hecho" y "Corregir récord" con confirmación, markdown en el chat, prompt reescrito, y una rutina nueva ya no pisa la anterior.
- **Tu teléfono sigue en la versión vieja.** La captura del 17-nov lo prueba (asteriscos sin renderizar). Nada de lo hecho llega hasta que se mergee, se redespliegue el servidor y el service worker se actualice.

## Fase 0 · Que lo nuevo llegue a tu teléfono (S)

1. Mergear el PR #75 y redesplegar el servidor (el prompt vive en `server/coach.mjs`).
2. **Actualización automática de la PWA** (informe de PWA; diagnóstico reproducido en Chromium):
   - Causa: `skipWaiting` activa el service worker nuevo, pero la ventana abierta sigue con el JS viejo y nadie la recarga. En iOS la app casi nunca se cierra del todo y no se llama a `update()` en ningún sitio. ✔ (no hay `visibilitychange` ni `update()` en `src/`).
   - Solución recomendada: **buscar actualización al abrir, al volver a primer plano y cada 30 min; recargar solo si no hay un entrenamiento en curso; si lo hay, un aviso "Versión nueva · ACTUALIZAR"**. Más una línea "Versión X · Buscar actualización" en Perfil.
   - Se prefiere esto a "recargar siempre" porque una recarga a media serie pierde lo tecleado.
   - Los pasos de una sola vez en tu iPhone (sin borrar datos) están en el informe: cerrar la app del todo, abrir 15 s con red, cerrar y abrir otra vez.

## Fase 1 · Datos que no se pueden perder (M)

Orden por gravedad. Todo con test que falle antes y pase después.

| # | Qué | Origen | Verificado |
|---|---|---|---|
| 1.1 | Guardar el borrador al ocultar la app (`pagehide` / `visibilitychange`). Hoy hay 15 s de espera y iOS suspende al bloquear la pantalla: se pierden series. | bugs | ✔ |
| 1.2 | Cargar una rutina con un borrador sin terminar no avisa y el primer autoguardado lo pisa (un solo slot). | bugs | ◻ |
| 1.3 | `setItem` traga el error de cuota: el toast dice "guardado" aunque no se escribió nada. | bugs | ◻ |
| 1.4 | JSON corrupto se sobrescribe en el siguiente guardado. Copiar el crudo a `<clave>__corrupto` antes de descartarlo y validar el tipo al restaurar. | bugs | ◻ |
| 1.5 | El historial se recorta en silencio a 200 sesiones (≈10 meses). | bugs | ✔ |
| 1.6 | Copia del servidor de un solo slot que se sobrescribe sin comparar: un teléfono vacío que suba destruye la copia buena. Guardar las últimas N versiones y rechazar una subida con mucho menos contenido. | bugs | ◻ |
| 1.7 | `checkAndUpdatePR` fija el récord al teclear, aunque no se guarde. Un primer "450" por error queda de PR. | bugs | ◻ |
| 1.8 | El normalizador de PRs compara `.weight` y el campo real es `.peso`: si dos nombres colapsan, gana el primero, no el mejor. | bugs | ✔ |
| 1.9 | "Marcar como no hecho" solo lo respetan el coach y las zonas; calculadoras, gráficos, historial y XP siguen contando esa serie. Un helper único `seriesValidas`. | bugs | ◻ |
| 1.10 | El RPE de sesión no llega al historial si guardas antes de terminar. | bugs | ◻ |
| 1.11 | Importar CSV parte por línea, pero el exportador mete mensajes del coach con saltos de línea: la conversación se trunca al ir y volver. Parser CSV completo. | bugs | ✔ (lo vi en tu CSV) |

## Fase 2 · Coach: que no te ignore ni te grite (M)

Causas raíz, con las capturas delante (informe del coach):

- **La tarjeta "Tu volumen subió 13%" no está en lo que ve el modelo**, pero se guarda como si el coach la hubiera dicho. Por eso responde "no lo voy a repetir como si fuera mío". Solución: sección `AVISOS DE LA APP` con la tarjeta y los kg de origen, y guardarla como aviso, no como turno del coach.
- **"Dice que no está y en el mismo mensaje que sí"**: el modelo compara la fecha de hoy con la de la bitácora, que es aritmética. Solución: un bloque `REVISIÓN DE HOY` ya calculado, ejercicio por ejercicio contra la sesión anterior.
- **Tono**: el prompt actual lista frases prohibidas ("es un techo", "dale un día fijo") y eso hace más probable que las copie. Pasar a describir en positivo cómo habla: compañero que conoce tus números, aliento concreto con el dato, "propone, no ordena", un retraso es un dato y no una culpa, corto. Hay un prompt completo propuesto en el informe.
- **Historial de 12 turnos**: arrastra el tono duro de días anteriores. Mandar solo los 4–6 turnos del día y un resumen determinista de lo anterior. Botón "Olvidar lo anterior" en lugar del ✕ que borra todo.
- **Atajos y saludo**: chips "¿Qué toca hoy?", "Revisar mi sesión", "¿Cómo voy esta semana?"; un "Hola" se contesta con un saludo corto, sin auditoría.
- **Cómo medirlo**: 18 diálogos de prueba (los fallos reales incluidos) con reglas comprobables (sin fechas ISO, números solo del contexto, longitud, frases vetadas) y un script para correrlos con el modelo real cuando haya clave.

## Fase 3 · Registrar una serie rápido (S–M)

Es lo que más haces y hoy cuesta unos 8 gestos por ejercicio (informe de UX, medido en navegador).

1. **Precargar la última vez** (sets/reps/kg). Solo el 31 % de tus ejercicios repite exacto, pero con valores precargados repetir cuesta 1 toque y cambiar cuesta 1–2. ✔ (la plantilla carga todo en 0).
2. **Paso del kg a 2.5** (tus saltos reales: +5, +10, +2.5…) con pulsación larga. ✔ (`PASO_STEPPER.peso = 1`).
3. **Botones de al menos 44 px** (hoy: stepper 32×48, check 34, "volver" 17×24) y subir el contraste del texto deshabilitado (3.0–3.2:1).
4. **Un solo botón de cierre y un solo RPE** (hoy hay "Guardar" y "Terminar", y dos escalas de RPE).
5. **Descanso automático** al marcar el check; el temporizador usa reloj de pared (hoy se congela con la pantalla bloqueada).
6. Mostrar 57.5 kg como 57.5 (hoy sale 58) y arreglar el foco perdido al pasar de campo.

## Fase 4 · HOME y navegación (M)

- **HOME**: tarjeta grande **EMPEZAR** (o **CONTINUAR · 3/7** si hay borrador) con la rutina que toca, sobre el pliegue. Tus rutinas hoy quedan bajo el pliegue en 390×844. La rotación es la que calcula el coach (Piernas → Espalda+Bíceps → Upper Push). Heatmap y nivel plegados abajo.
- **El "+" central** abre solo "Nueva rutina"; que inicie el entrenamiento.
- **Récords y Gráficos** están al fondo de Perfil; subirlos. **"PROGRESO" es un modal de nivel y logros**, no de cargas: renombrar.
- **Perfil** ordenado en Cuenta / Datos y copia / Avanzado; fecha de nacimiento en formato local.
- Builder: buscador y tus ejercicios usados primero (hoy 92 filas sin buscar).

## Fase 5 · Coach con herramientas y respuestas visuales (L)

Lo que pides: que el coach muestre gráficos y datos en vez de texto plano, y que sepa llamarlos siempre igual.

- Hoy hay **una sola herramienta**, el marcador `[[excluir|…]]` en texto libre, y el gráfico solo aparece si escribes el nombre exacto del ejercicio.
- Pasar a **llamadas de herramientas** con esquema: `mostrar_ejercicio`, `mostrar_grafico(ejercicio, métrica, rango)`, `mostrar_sesion(fecha)`, `comparar_semanas`, `proponer_rutina`, `marcar_no_hecho`. El ejercicio es una lista cerrada armada con tus datos; la app **valida y dibuja con tus cifras reales**, nunca las que mande el modelo.
- El servidor deja de mandar texto plano y pasa a eventos (texto / herramienta / fin).
- ◻ Falta comprobar que la API de DeepSeek acepta `tools` con streaming; sin clave no lo pude probar. Plan B: bloques estructurados con el mismo validador.

## Fase 6 · Modelo de datos por series reales (L)

Hoy se guarda un único "4×10 @ 55" por ejercicio. No permite 10-9-8 reps ni bajar de peso, y el detalle de sesión **dibuja 4 barras inventadas** que parecen reales. Pasar a series individuales con "4×10 uniforme" como atajo, y ampliar el CSV (RPE, hora, ids).

## Fase 7 · Calidad (M)

- CI en GitHub: hoy Netlify solo corre `tsc && vite build`; un test o una puerta en rojo no frena un despliegue.
- Tests de `storage`, importar/exportar CSV y `workout` (hoy solo los toca Playwright a mano).
- CSP y límite de intentos del token; `/api/salud` público expone demasiado; quitar `user-scalable=no`.
- Deuda: 40 `window.*`, 4 copias de `getItem/setItem`, versiones incoherentes (3.1.0, 3.2.0, "v4.0").

## Decisiones que necesito de ti

1. ¿Empiezo por **Fase 0 + 1** (que llegue a tu teléfono y proteger tus datos)? Es lo que recomiendo.
2. **Registro por series reales (Fase 6)** cambia el formato de tus datos. ¿Lo quieres, o basta con precargar y el paso de 2.5?
3. **Herramientas del coach (Fase 5)**: necesito una clave del modelo en este entorno para probarlas de verdad.

## Lo que no se verificó

- Nada de esto se probó en un iPhone real; el service worker se reprodujo en Chromium.
- Del uso de cardio, medidas y calculadoras solo sé que **no aparecen** en tu CSV; no hay telemetría en la app.
- Ninguna respuesta del coach se probó con el modelo real.
