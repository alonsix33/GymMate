# SUPER PROMPT — pegar en Claude Code desde la raíz del repo GymMate

Implementa el rediseño visual "FIERRO" de GymMate siguiendo `design_handoff_fierro/README.md` al pie de la letra. Antes de escribir una línea de código, lee completo el README, abre `design_handoff_fierro/Pantallas Fierro.dc.html` y `Sistema Fierro.dc.html` en el navegador, y revisa `design_handoff_fierro/screenshots/` — esa carpeta tiene la captura de cada pantalla nombrada por su código (H-01, W-01…).

## Contrato de fidelidad (no negociable)
1. El diseño ya está decidido y aprobado. Tu trabajo es RECREARLO, no interpretarlo. No propongas mejoras visuales, no cambies colores, radios, tipografías, espaciados ni copy. Si un valor no está en el README, tómalo del HTML de referencia (inspecciónalo con DevTools); si tampoco está ahí, PREGUNTA — nunca inventes.
2. Respeta la sección "Qué NO debe hacer Claude Code" del README como si fuera un linter: sin frameworks, sin librerías de UI/iconos/charts, sin copiar los .dc.html a producción, sin alert(), sin emojis, sin contenido inventado.
3. Los tokens CSS del README (rampas Carbón/Hueso/Fragua, Zonas, rangos, heatmap, escala tipográfica, radios) son la ÚNICA fuente de color y tipografía. Todo color en el código debe ser una custom property — si escribes un hex suelto fuera de tokens.css, está mal.
4. Copy literal: los textos de los mockups son finales, en español, con la voz definida ("Levanta 50 kg y es PR nuevo", nunca "faltan 2.5 kg"; sin exclamaciones dobles ni porras).

## Proceso obligatorio (un paso a la vez)
Sigue el "Orden de implementación sugerido" del README (9 pasos). Para CADA paso:
1. Anuncia qué vas a construir y qué pantallas/códigos cubre.
2. Impleméntalo dentro de la arquitectura existente (vanilla TS, módulos en `src/features/`, render a DOM, localStorage). No refactorices nada fuera del alcance del paso.
3. Levanta la app, ponla al lado de la captura correspondiente de `screenshots/` y compara: layout, jerarquía, colores exactos, espaciado, radios, copy. Corrige hasta que el diff visual sea nulo a simple vista.
4. Verifica los comportamientos de ese paso contra la sección "Interactions & Behavior" del README (ahí están las specs que el mockup no muestra: cuartiles del heatmap, umbrales de rangos I–III, acotado del slider RPE, prioridades del coach, etc.).
5. Haz UN commit con mensaje `fierro: paso N — <alcance>` y DETENTE. Muéstrame capturas del resultado y espera mi OK antes del paso siguiente.

## Alcance funcional
- La lógica de negocio existente (XP, 1RM, rangos, CSV, duplicados) se conserva. Solo aplican los 5 cambios de la sección "Cambios de comportamiento" del README.
- Estado nuevo según "State Management" del README (RPE por ejercicio/sesión, subniveles de rango, logros, medidas con timestamp, conversación del coach).
- El coach IA (CO-01…03) es el ÚLTIMO paso y depende de backend: implementa primero la UI con sus 5 estados y un adaptador mock; no bloquees nada esperando esa integración.
- Offline-first intacto: nada puede bloquear la UI por red.

## Criterio de terminado global
La app en vivo, pantalla por pantalla, es indistinguible de `screenshots/` salvo por los datos reales del usuario. Cada una de las 32 capturas tiene su equivalente funcionando. Cero warnings de TypeScript nuevos, cero `alert()`, cero hex fuera de tokens.

Empieza ahora con el paso 1 (tokens CSS + fuentes self-hosted) y muéstramelo antes de seguir.
