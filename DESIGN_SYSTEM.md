# GymMate — Sistema de diseño

**El sistema vigente es FIERRO.** Su contrato completo —rampas de color, zonas
semánticas, tipografía, forma, espaciado, voz y las 32 pantallas— vive en:

- [`redesign/design_handoff_fierro/README.md`](redesign/design_handoff_fierro/README.md) — el contrato
- [`redesign/design_handoff_fierro/Pantallas Fierro.dc.html`](redesign/design_handoff_fierro/) — las 32 pantallas
- [`redesign/design_handoff_fierro/Sistema Fierro.dc.html`](redesign/design_handoff_fierro/) — los componentes

En el código, la **única fuente de verdad** de color y tipografía es
[`src/styles/tokens.css`](src/styles/tokens.css). Cualquier hex suelto fuera de
ese archivo es un defecto: `npm run verificar` lo rechaza, y también rechaza un
`var(--token)` que no exista, un `alert()` y un color escrito en TypeScript.

Los componentes están en [`src/styles/fierro.css`](src/styles/fierro.css), con
el prefijo `f-` y una referencia `[REF Pantallas:…]` allí donde el valor sale
del mockup y no del README.

## Por qué este archivo ya no describe nada

Hasta el rediseño, aquí vivía un sistema "Dark Mode Profesional v3.1" montado
sobre Tailwind CSS y Lucide Icons. Las tres cosas se retiraron: la app no tiene
Tailwind, no tiene librería de iconos —los glifos son texto— y no tiene ninguna
dependencia de runtime. Dejar aquí 476 líneas describiendo clases que ya no
existen sería peor que no tener el archivo: un colaborador nuevo instalaría
Tailwind y escribiría hex a mano.
