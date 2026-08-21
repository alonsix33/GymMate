# Handoff: GymMate v2 — Rediseño "FIERRO"

## Overview
Rediseño visual completo de GymMate (PWA de tracking de entrenamientos, vanilla TS + localStorage, repo `alonsix33/GymMate`, branch `main`). Reemplaza el 100% del lenguaje visual actual por el sistema FIERRO: base oscura + secciones claras, un solo acento, heatmap de consistencia como componente firma. **No se conserva nada del CSS actual.** La lógica de negocio existente (rutinas, XP, rangos, cálculos) se conserva — esto es un rediseño de UI, con las excepciones funcionales listadas en "Cambios de comportamiento".

## About the Design Files
Los archivos `Sistema Fierro.dc.html` y `Pantallas Fierro.dc.html` incluidos son **referencias de diseño creadas en HTML** — prototipos que muestran apariencia e intención, NO código de producción para copiar. La tarea es **recrear estas pantallas dentro del codebase existente** (vanilla TS, sin framework, PWA offline-first), usando sus patrones actuales (módulos en `src/features/`, render a DOM, estado en localStorage). No introducir React ni frameworks nuevos.

Para verlas: abrir los .html en un navegador. Cada pantalla tiene un código (H-01, W-01…) usado en toda esta spec.

## Fidelity
**High-fidelity.** Colores, tipografía, espaciado, radios y copy son finales. Recrear pixel-perfect. Los datos mostrados son de ejemplo; la estructura y el estilo no.

## Design Tokens — la fuente de verdad
Implementar como CSS custom properties en `src/styles/` ANTES que cualquier pantalla.

### Color — 3 rampas con nombre + zonas semánticas
Regla dura: el color NUNCA identifica categorías (no colores por rutina/grupo muscular). Solo hay 3 rampas + zonas con significado fijo.

**Carbón** (estructura: fondos, superficies, bordes, texto):
- carbon-950 `#0B0C0F` fondo de app · carbon-900 `#111318` cards · carbon-800 `#171A20` superficies elevadas/inputs · carbon-700 `#20242D` bordes sutiles · carbon-600 `#2C323D` bordes de cards activas · carbon-500 `#3E4552` bordes de botón secundario · carbon-400 `#5A6270` texto deshabilitado · carbon-300 `#7E8694` texto secundario · carbon-200 `#A8AEB9` texto terciario claro · carbon-100 `#CDD1D9` · carbon-50 `#EBEDF0` texto principal
- Fondo del documento/página: `#08090B`. Divisores finos: `#1C2027` / `#171A20`.

**Hueso** (secciones claras — SOLO datos históricos: Historial, Récords, Gráficos, Historial de medidas):
- hueso-500 `#8A877C` texto secundario claro · hueso-400 `#A9A69B` · hueso-300 `#CBC8BE` · hueso-200 `#E0DED7` bordes · hueso-100 `#EDECE7` fondos de nota · hueso-50 `#F6F5F2` fondo de sección
- Sobre Hueso: texto principal `#16181C`, cards blancas `#FFFFFF` con borde `#E0DED7`, texto secundario `#5F5D55`.

**Fragua** (ÚNICO acento — acción primaria, día entrenado, PR, intensidad, "semana actual"):
- fragua-900 `#7A2604` · 800 `#9C3407` · 700 `#C2440A` · 600 `#E5540F` · **500 `#FF6317` (principal)** · 400 `#FF7E42` (hover) · 300 `#FF9C6B` · 200 `#FFBD9C` · 100 `#FFDCC9` · 50 `#FFF0E7`
- Texto sobre Fragua-500: siempre `#0B0C0F`.

**Zonas** (semánticas, SOLO en progresión vs. historial propio, RPE y % grasa — nunca decorativas):
- Zona Roja `#E5484D` (retroceso) · Zona Ámbar `#DFA23A` (manteniendo) · Zona Verde `#43B97F` (progresando/territorio PR)
- Fondos de zona: mismo hex + alpha `24` (p.ej. `#E5484D24`). En secciones Hueso, verde de texto `#3F8F5F` y rojo `#B5443F` (más oscuros por contraste).

**Rangos musculares** (solo en contexto de gamificación): Hierro `#3E4552` · Bronce `#A9744A` · Plata `#A8AEB9` · Oro `#E3B341` · Platino `#8FD0DB` · Esmeralda `#43B97F` · Diamante `#7FC7FF` · Campeón `#FF6317` · Simétrico `#C9A0FF`.

**Heatmap** (escala de calor, cuartiles): 0 = `#171A20` · Q1 `#52290F` · Q2 `#8A3D0B` · Q3 `#C85510` · Q4 `#FF6317`. Día solo-cardio: celda transparente con borde `1.5px solid #C2440A`.

### Tipografía
- **Display: "Archivo"** (Google Fonts, variable wdth/wght). Siempre expandido y pesado — nunca en texto corrido. `font-stretch` 110–118%, weight 800–900.
- **UI: "Instrument Sans"** (Google Fonts) 400–700. TODOS los números de datos con `font-variant-numeric: tabular-nums`.
- **Labels: monospace del sistema** (`ui-monospace, Menlo, monospace`), 9–12px, weight 600–700, `letter-spacing .06–.16em`, MAYÚSCULAS.

Escala:
- display-xl: Archivo 900, stretch 118%, 44px/0.95 (títulos héroe; en headers de pantalla móvil 22–30px)
- display-m: Archivo 800, stretch 112%, 30px/1.05 (títulos de sección)
- cifra: Archivo 800–900, stretch 110–115%, 18–72px según jerarquía, tabular-nums (todo dato protagonista); la unidad (kg/reps) en 11–18px weight 600–700 color carbon-300
- heading: Instrument 700, 15–18px
- body: Instrument 400–600, 13–15px / 1.45–1.55
- label: mono 600, 9.5–11px caps (ver arriba)

### Forma y jerarquía
El radio comunica peso del dato: **card héroe R20** (un dato protagonista por pantalla) · **card métrica R14–R16** · **fila de dato R10–R12**. Marco de teléfono/pantalla R28. Chips/badges R5–R6. Botones R10–R12. Nada de radio uniforme global.

### Espaciado y táctil
Padding de card: 14–20px. Gap entre cards: 8–12px. Padding lateral de pantalla: 18–20px. Targets táctiles ≥44px (steppers 46–56px de alto). Botón primario: padding 15–16px vertical.

### Botones (un primario por pantalla, máximo)
- Primario: fondo fragua-500, texto `#0B0C0F`, weight 700, R10–12. Hover fragua-400.
- Secundario: transparente, borde `1px solid #3E4552`, texto carbon-50, weight 600.
- Terciario: texto fragua-500 sin borde.
- Deshabilitado: fondo `#171A20`, texto `#5A6270` (visible, nunca fantasma).
- Destructivo: fondo `#E5484D` texto `#0B0C0F` — **NUNCA Fragua**, siempre a la derecha del par en confirmaciones.

## Prohibiciones (antipatrones — parte del contrato de diseño)
Sin gradientes decorativos (el único gradiente permitido: pista del slider RPE verde→ámbar→rojo, que es semántico). Sin glassmorphism. Sin iconografía en círculos/cuadros de color. Sin emojis en UI ni copy. Sin colores por categoría. Sin `alert()`/`confirm()` del navegador. Sin burbujas de chat genéricas ni avatares/mascota en el coach. Estados vacíos siempre con acción concreta — nunca "No hay datos".

## Voz y copy
Directa, con datos, sin porras. Patrones: "Levanta 50 kg en X y es PR nuevo" (nunca "faltan 2.5 kg"), "12 días sin entrenar espalda", "Última sesión de este grupo: 2,800 kg. ¿Lo superamos?". Prohibido: "¡Desata tu potencial!", "¡Ups! Algo salió mal 😅", cualquier exclamación doble o emoji.

## Screens / Views
Cada pantalla está mockeada en `Pantallas Fierro.dc.html` con su código visible. Mapa pantalla → módulo del repo:

| Código | Pantalla | Repo |
|---|---|---|
| H-01 | Home (heatmap + coach + nivel/mapa + rutinas + draft) | `src/ui/navigation.ts`, `src/utils/insights.ts` |
| W-01 | Sesión activa (steppers, RPE chips, descanso, volumen por músculo) | `src/features/workout.ts`, `src/state/session.ts` |
| W-02 | RPE de sesión al terminar (bottom sheet, slider 1–10) | `src/features/workout.ts` |
| W-03 | Resumen de XP post-sesión | `src/features/gamification/*` |
| W-04 | Guía de ejercicio (bottom sheet al tocar nombre/ⓘ) | `src/data/exercises.ts` |
| C-01…C-08 | Cardio: selector, Tabata, timer anillo, resumen, Pirámide config+timer, Circuito, EMOM/AMRAP | `src/features/cardio.ts`, `src/data/cardio-exercises.ts` |
| HI-01, HI-02 | Historial + import/export CSV; detalle de sesión | `src/features/history.ts` |
| PR-01 | Récords con barra de zonas | `src/features/history.ts` |
| G-01 | Gráficos (toggle temporal, distribución, por ejercicio) | `src/features/charts.ts` |
| CA-01, CA-02 | Calculadoras 1RM/progresivo; calorías | `src/features/calculators.ts` |
| P-01, P-02, P-03 | Perfil; registrar medidas; historial de medidas | `src/features/profile.ts` |
| B-01 | Builder de rutinas | `src/features/workout.ts`, `src/data/training-groups.ts` |
| GM-01, GM-02, GM-03 | Progreso (nivel, mapa dual, rangos); escalera de rangos; logros | `src/features/gamification/*`, `src/ui/gamification/muscle-map.ts` |
| CO-01, CO-02, CO-03 | Coach IA: conversación, streaming, error (requiere backend — implementar al final) | nuevo módulo |
| O-01, O-02 | Home sin datos; vacíos por módulo | transversal |
| F-01 | Toasts, confirmación destructiva, estados de sync | nuevo `src/ui/feedback.ts` |

Reglas transversales de layout:
- **Regla oscuro/claro**: lo que pasa HOY (Home, sesión, cardio, calculadoras, perfil, gamificación) vive en Carbón; lo que YA PASÓ (Historial, Récords, Gráficos, historial de medidas) se lee sobre Hueso, con header oscuro que hace la transición.
- Tab bar inferior: 4 items en label mono (INICIO · HISTORIAL · PROGRESO · PERFIL) + FAB central Fragua de 50px "+". Item activo: label Fragua + punto de 4px encima.
- Bottom sheets: fondo `#111318`, borde superior `#2C323D`, R24 arriba, handle de 36×4px `#3E4552` centrado.
- Mapa muscular: reutilizar los polígonos SVG existentes de `muscle-map.ts` TAL CUAL; el fill de cada grupo = color de su rango actual; partes neutras (cabeza, antebrazos) `#262B34`; sin glow, sin gradientes.

## Interactions & Behavior — specs que el mockup no dice
1. **Heatmap (H-01)**: 1 celda = 1 día, 16 semanas × 7. Valor del día = suma de volumen (kg) de todas sus sesiones de pesas. Color = cuartil del valor dentro de los días CON entrenamiento de los últimos 6 meses del propio usuario (Q1–Q4); 0 = sin sesión. Día con solo cardio: borde `#C2440A`, sin relleno, no entra en los cuartiles. Huecos ≥14 días: subrayado rojo con etiqueta "N DÍAS SIN ENTRENAR".
2. **Coach banner (H-01)**: un solo mensaje, el de mayor prioridad según `insights.ts` (orden ya implementado: borrador > racha en riesgo > racha 5+ > volumen ±10/15% semanal > músculo >10 días > último peso 90–99% del PR). El copy dice el peso objetivo, nunca la diferencia.
3. **RPE por ejercicio (W-01)**: al marcar ✓ el ejercicio, aparece inline una fila de chips 5–9 + "omitir" (30×30px). Un tap y se colapsa. NO usar slider durante la sesión. El slider 1–10 con gradiente semántico solo existe en W-02 (fin de sesión).
4. **Slider RPE (W-02)**: pista 10px R5, gradiente `90deg, #43B97F, #DFA23A 55%, #E5484D`. Bola 24px, borde 5px del color del fondo del sheet. El recorrido de la bola se acota: `left: calc(12px + (100% − 24px) × t)` con t∈[0,1] — nunca se sale de la pista. Margen vertical 8px alrededor de la pista.
5. **Barra de zonas (PR-01, G-01, CO-01)**: segmentos roja 0–70% / ámbar 70–95% / verde 95%+ del pico histórico del ejercicio. Marcador actual: barra vertical 2.5px (clara en fondo oscuro, `#16181C` en Hueso). "Actual" = mejor set de las últimas 3 sesiones. Al aparecer (y en el chat del coach), el marcador anima desde 0 hasta su posición (~600ms ease-out).
6. **Rangos (GM-02)**: ratio = 1RM estimado ÷ peso corporal, ajustado por ejercicio (usar la lógica existente). Umbrales: Hierro 0–0.3 · Bronce 0.3–0.5 · Plata 0.5–0.7 · Oro 0.7–0.9 · Platino 0.9–1.1 · Esmeralda 1.1–1.3 · Diamante 1.3–1.6 · Campeón 1.6–2.0 · Simétrico 2.0+. Cada rango se divide en subniveles I–III en tercios iguales de su franja; Simétrico no tiene subniveles. El recálculo se dispara al cambiar peso corporal (fix del bug `onBodyweightChange`).
7. **Rangos especiales**: FORJADO (12 semanas consecutivas sin hueco >7 días en un músculo; se pierde con un hueco; +500 XP) y SIMÉTRICO TOTAL (8 grupos en 2.0x+; +25,000 XP).
8. **Pirámide (C-05/C-06)**: presets CORTA/MEDIA/LARGA/INTENSA/EXTENDIDA/RESET; escalar ↑/↓ recalcula los 7 niveles en proporción. En el timer: niveles superados en `#3A1F0C` (brasa), el activo en fragua-500 con `pulse` 1.6s y el countdown encima, los próximos con borde `1.5px dashed #2C323D`.
9. **EMOM (C-08)**: barra "tu minuto" = trabajo estimado (ritmo de la última sesión EMOM) vs. resto. AMRAP: el contador de rondas es el protagonista; tap en cualquier parte del timer suma una ronda.
10. **Timers cardio**: beep 3-2-1 y vibración al cambio de fase (Vibration API). Anillo SVG: `stroke-dasharray` con la circunferencia, animado con el tiempo.
11. **Guía de ejercicio (W-04)**: tap en nombre o ⓘ abre bottom sheet. Si el ejercicio no tiene foto, se omite el bloque de imagen (nunca placeholder vacío). La card del ejercicio en W-01 NUNCA muestra foto.
12. **Toasts (F-01)**: esquina inferior, fondo `#111318` borde `#2C323D` R12, sombra `0 8px 24px rgba(0,0,0,.5)`, icono circular 22px (✓ verde, ! ámbar), acción en label mono. Deshacer con countdown de 5s. Reemplazan todos los `alert()`.
13. **Confirmación destructiva (F-01)**: bottom sheet, describe la pérdida con datos ("42 minutos y 6 sets"), botón destructivo rojo a la derecha, "Seguir entrenando" secundario a la izquierda.
14. **Sync (F-01, futuro Supabase)**: offline-first, nunca bloquear por red. Punto de estado (verde=synced, ámbar pulsando=pendiente) vive en Perfil, no en la barra global.
15. **Coach IA (CO-01…03)**: sin nombre propio ni avatar. Turnos del coach = cards Carbón R14 con label mono "COACH"; usuario = fila R10 alineada a la derecha, fondo `#171A20`. Streaming progresivo con cursor de bloque Fragua (8×16px, blink .9s step-end). Estado pensando: label "PENSANDO" mono Fragua, blink 1.3s — sin puntos suspensivos. Error: card borde `#3D2626`, label "SIN CONEXIÓN" roja, botón Reintentar, la pregunta queda guardada. La aritmética (1RM, estancamiento, próximo peso) llega del backend determinista y se inserta como componente de datos; el LLM solo explica. Modelos: mensajes cortos → Haiku, preguntas abiertas → Sonnet.
16. **Draft de sesión (H-01)**: banner Carbón-800 con "Continuar" primario pequeño y ✕ para descartar (con confirmación F-01). Autosave visible en W-01: "CAMBIOS GUARDADOS · HH:MM" en label mono.

## Cambios de comportamiento vs. la app actual (aprobados)
- "For Time" se elimina de cardio (quedan 6 modos).
- El backup CSV incluye perfil + medidas, no solo historial.
- El calculador de peso progresivo clasifica por grupo muscular real, no por keywords del nombre.
- Racha: una sola implementación (la de gamificación); cardio no suma racha.
- RPE nuevo: por ejercicio (chips post-✓) y por sesión (slider al terminar) — dato nuevo en el modelo de sesión.

## State Management
Mantener el patrón actual (localStorage). Estado nuevo requerido: RPE por ejercicio y por sesión; timestamps de mediciones corporales (una por día, la de hoy sobrescribe); progreso de logros (25 definiciones: conseguido/en-progreso/bloqueado con condición); subnivel de rango por músculo; conversación del coach (persistente local); cola de preguntas del coach pendientes por red.

## Assets
- Fuentes: Archivo e Instrument Sans vía Google Fonts (o self-host en `public/fonts/` para offline-first — recomendado en PWA).
- Polígonos del mapa muscular: ya existen en `src/ui/gamification/muscle-map.ts` — reutilizar.
- Fotos de ejercicios: las que ya tenga `src/data/exercises.ts`; los que no tengan, la guía es solo texto.
- Sin librería de iconos: los pocos glifos (←, ›, ✓, ✕, +, ⓘ, ↑) son texto.

## Orden de implementación sugerido
1. Tokens CSS + fuentes (todo depende de esto)
2. Componentes base: botones, cards, steppers, badges, tab bar, bottom sheet, toast/confirm (F-01)
3. Home H-01 + heatmap + estados vacíos O-01/O-02 (máximo impacto visible)
4. Sesión activa W-01…W-04
5. Historial/Récords/Gráficos (HI, PR, G — secciones Hueso)
6. Cardio C-01…C-08
7. Calculadoras + Perfil + Medidas (CA, P)
8. Gamificación GM-01…03
9. Coach IA CO-01…03 (último: requiere backend)

## Qué NO debe hacer Claude Code (guardrails de implementación)
- **No introducir frameworks ni librerías de UI** (React, Vue, Tailwind, componentes npm, librerías de iconos o charts). El stack es vanilla TS + DOM + CSS propio; los gráficos son SVG a mano como en los mockups.
- **No copiar los .dc.html a producción** — son referencia. Nada de `sc-for`, `{{ }}`, ni `support.js` en el codebase.
- **No "mejorar" ni reinterpretar el diseño**: no cambiar colores, radios, tipografías, espaciados ni copy. Si un valor no está en esta spec, se toma del HTML de referencia; si tampoco está ahí, se pregunta — no se inventa.
- **No inventar pantallas, secciones, métricas ni textos** que no existan en los mockups. Cero contenido de relleno.
- **No tocar la lógica de negocio existente** (cálculo de XP, 1RM, rangos, detección de duplicados CSV) salvo los 5 cambios listados en "Cambios de comportamiento".
- **No eliminar funciones** de FEATURES que no aparezcan en un mockup — se pregunta antes.
- **No usar** `alert()`/`confirm()`/`prompt()`, emojis, spinners genéricos, ni animaciones no especificadas (las únicas: pulse/blink definidas, la barra de zonas al aparecer, transiciones de fase de timers).
- **No romper offline-first**: nada que bloquee la UI esperando red (solo el coach depende de red, con sus estados CO-02/CO-03).
- **No hacer commits masivos**: un paso del orden de implementación por commit, verificado contra el mockup antes de seguir.

## Files
- `Sistema Fierro.dc.html` — el sistema de diseño navegable (tokens, componentes, voz)
- `Pantallas Fierro.dc.html` — las 26 pantallas con códigos H/W/C/HI/PR/G/CA/P/B/GM/CO/O/F
- `screenshots/` — captura PNG de cada pantalla, nombrada por su código (referencia rápida; la verdad canónica sigue siendo el HTML)
