# Plan de mejora de GymMate · estado real

Última actualización: 18-nov-2026. Todo lo marcado ✔ está mergeado en `main` (PR #75 a #84) y pasó las puertas (`npm run verificar`) y el CI de GitHub. Lo marcado ◻ no se pudo comprobar aquí y dice por qué.

## Hecho

### Fase 0 · que lo nuevo llegue a tu teléfono
| | |
|---|---|
| ✔ Actualización automática de la PWA | Busca al abrir, al volver a primer plano y cada 30 min; recarga solo si no hay entrenamiento en curso. Versión visible en Perfil. |
| ✔ CI en cada PR | `rapido` (tipos, tests con Postgres real, build, servidor) y `navegador` (runtime, fidelidad, comportamiento). |

### Fase 1 · datos que no se pierden
| | |
|---|---|
| ✔ 1.1 Guardado honesto | Con la cuota llena ya no dice "guardado": el borrador se conserva y se avisa. |
| ✔ 1.2 Datos dañados | Se copian a `<clave>__corrupto_<ts>` antes de descartarse; restaurar valida y es todo o nada. |
| ✔ 1.3 Sin recorte silencioso | Se quitó el tope de 200 sesiones; aviso desde 800. |
| ✔ 1.4 Copia del servidor | 10 versiones, rechazo (409) de una copia con menos de la mitad de sesiones, escritura atómica. |
| ✔ 1.5 Récords | Se fijan al guardar, no al teclear; el normalizador elige el mejor. |
| ✔ 1.6 "No hecho" | Un solo criterio (`seriesValidas`) en todos los cálculos. |
| ✔ 1.7 RPE de sesión | Llega al historial aunque ya estuviera guardada. |
| ✔ 1.8 CSV | Ida y vuelta sin pérdidas (92 sesiones / 280 ejercicios de tu CSV real), fórmulas neutralizadas, columnas añadidas al final. |
| ✔ 1.9 Valores raros | Regla de la mediana además del 3×: detecta los dos de tríceps en polea sin falsos positivos. **Tú confirmaste que fueron un error**: el coach te lo propone con botón; nada se reescribe solo. |

### Fase 2 · coach
| | |
|---|---|
| ✔ 2.1 Avisos de la app | Las tarjetas de Home viajan como `AVISOS DE LA APP` con sus cifras y se rotulan "AVISO DE LA APP". |
| ✔ 2.2 REVISIÓN DE HOY | Hoy contra la vez anterior de cada ejercicio, comparado por código. |
| ✔ 2.3 Hilo, saludo y atajos | Solo viaja el hilo de hoy (≤6 turnos); "Hola" se contesta sin modelo; tres atajos. |
| ✔ 2.4 Prompt | Voz en positivo, "pico" vs "ahora" definidos. |
| ✔ 2.5 Evaluación | `server/eval-coach.mjs`: 18 diálogos con reglas comprobables. |
| ✔ 5.1 Gráficos pedidos por el modelo (plan B) | Marca `[[grafico|…]]` que la app valida y dibuja. |

### Fases 3, 4, 7
| | |
|---|---|
| ✔ 3.1 Táctil y contraste | Áreas de 44 px (± de la sesión: 40×48), contraste del texto apagado 4,7:1. |
| ✔ 3.2 Un solo RPE | Si diste el de tus ejercicios, la sesión lleva el promedio. |
| ✔ 3.3 Descanso | Automático al marcar ✓, por reloj de pared, Wake Lock, y **visible** (una regla antigua lo ocultaba). |
| ✔ 3.4 Decimales y foco | 57.5 se ve como 57.5; el foco ya no se pierde al pasar de campo. |
| ✔ 4.1 HOME | Tarjeta EMPEZAR sobre el pliegue y "+" que empieza a entrenar. |
| ✔ 4.2 Navegación | Récords/Gráficos/Calculadoras arriba en Perfil, grupos, pestaña NIVEL. |
| ✔ 4.3 Builder | Buscador y tus ejercicios usados primero. |
| ✔ 7.2 Seguridad | CSP, intentos de token, `/api/salud` mínimo, límite al modelo, zoom permitido. |
| ✔ 7.3 Deuda | Versión única, registro de errores, un solo lector de `localStorage`. |

## Lo que NO se hizo, y por qué
- **Series individuales (10-9-8)**: fuera de este plan por decisión tuya; versión siguiente. Cambia el formato de datos.
- **Probar el coach con el modelo real** (`node server/eval-coach.mjs --modelo` y que sepa usar `[[grafico|…]]`): no hay clave de API en este entorno. Las respuestas del modelo real **no se evaluaron**; solo los comprobadores y la petición que se le arma.
- **`window.*` (~40 globales)** y **memoizar `getHistory`**: riesgo mayor que el valor (el HTML y las puertas dependen de los globales; los llamadores mutan el arreglo que devuelve).
- **Los dos botones "Guardar entrenamiento" / "Terminar sesión"** siguen: vienen del mockup W-01 y la puerta de fidelidad los fija. Con el autoguardado el primero es redundante; quitarlo es decisión de diseño.
- **± de la sesión a 44 px**: quedan en 40×48; 44 obligaría a bajar el KG a otra fila.

## Solo se puede comprobar en un iPhone real
Nada de esto se probó en un iPhone; todo se probó en Chromium y jsdom.
1. Que la PWA instalada toma la versión nueva sin borrar datos (cerrar del todo, abrir 15 s con red, cerrar y abrir).
2. Wake Lock durante el descanso y que el descanso sigue bien tras bloquear la pantalla.
3. Que el teclado no hace zoom al enfocar campos (ahora 16 px) y que la lupa de pellizco funciona.
4. Permiso de notificaciones al empezar el primer descanso.
5. Vibración y sonido al terminar el descanso (iOS los limita).
6. Safe areas (notch y barra inferior) con la hoja del "+" y la barra de descanso fija.
7. Que Netlify sirve la CSP sin romper nada (se verificó contra el servidor propio, no contra Netlify).

## Cómo se verifica
`npm run verificar` = tokens, tipos, tests (con `TZ=America/Lima`), build, runtime, fidelidad al mockup, comportamiento (352 chequeos), servidor (82) y mutantes (32/32). En CI corre lo mismo menos el navegador local. Para correrlo aquí hace falta `FIERRO_CHROME` apuntando a un Chromium.
