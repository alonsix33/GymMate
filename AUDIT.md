# GymMate — Auditoría Técnica Completa

**Fecha:** 2026-07-28
**Alcance:** Inventario técnico, calidad de código, PWA/notificaciones, viabilidad de AI Coach, diagnóstico y propuesta de v2.
**Metodología:** Lectura completa del código fuente, `npm install` + `npm run build` + `npm run test` + `npm audit` reales (no solo lectura estática), inspección del bundle generado.

---

## Resumen ejecutivo

GymMate es una PWA **100% cliente** (sin backend, sin base de datos, todo en `localStorage`), escrita en **TypeScript vanilla** (sin framework UI) con Vite, Tailwind y Chart.js. El código está sorprendentemente bien organizado para no usar un framework: módulos separados por feature, tipado fuerte, 21 tests unitarios que pasan, y un sistema de gamificación completo (~4,000 líneas) ya implementado. El "AI Coach" mencionado en el README **no usa ningún modelo de IA** — es un motor de reglas determinista (if/else sobre historial y PRs).

**Veredicto corto:** el core (lógica de negocio: cálculo de volumen, 1RM, gamificación, normalización de ejercicios) vale la pena conservarlo — es correcto, testeado y no depende de arquitectura. Lo que **no** escala es la capa de presentación (manipulación directa del DOM vía `innerHTML` + funciones colgadas en `window` para `onclick`) y la ausencia total de backend, que es un requisito duro para push notifications reales y para persistir cualquier estado del AI Coach entre dispositivos. Ver diagnóstico en Fase 5.

---

## FASE 1 — Inventario técnico

### Stack

| Categoría | Detalle |
|---|---|
| Lenguaje | TypeScript 5.x (`strict: true`, `noUnusedLocals`, `noUnusedParameters`) |
| Framework UI | **Ninguno** — vanilla TS + manipulación directa del DOM (`innerHTML`, `getElementById`) |
| Gestor de estado | Ninguno formal — estado en módulos (`src/state/session.ts`) + `localStorage` como fuente de verdad |
| Bundler | Vite 5.4.21 |
| Estilos | Tailwind CSS 3.4 (compilado local, sin CDN) |
| Gráficos | Chart.js 4.x |
| Iconos | Lucide (`lucide` npm package) |
| PWA | `vite-plugin-pwa` 0.17 + Workbox (generateSW) |
| Tests | Vitest 1.6.1 |
| Node | v22.22.2 usado en esta auditoría (no hay `.nvmrc`, no está fijado) |
| Deploy | Netlify (`netlify.toml` presente, SPA fallback configurado) |

**Nota de versión:** hay tres números de versión inconsistentes en el repo — `package.json` dice `3.1.0`, `README.md` dice `v4.0.0`, `vite.config.ts` tiene `APP_VERSION = '3.2.0'` (usado para cache-busting del SW). Esto es un riesgo real: si `APP_VERSION` no se sincroniza con releases reales, el sistema de invalidación de caché del service worker puede no dispararse cuando debería.

### Backend

**No existe.** Confirmé con `grep` que no hay ninguna llamada `fetch()`, `XMLHttpRequest`, ni uso de `import.meta.env` en `src/`. Todo el estado vive en `localStorage` del navegador. Hay un documento `SUPABASE_INTEGRATION.md` (24 KB) que es un **plan de arquitectura futura, nunca implementado** — no hay `@supabase/supabase-js` en `package.json`, ni cliente, ni variables de entorno `VITE_SUPABASE_*`.

Esto significa: **cero sincronización entre dispositivos, cero backup automático, y cero servidor donde correr lógica de push o de IA.** Todo lo que hoy funciona, funciona porque el navegador guarda datos localmente — borrar datos del sitio o cambiar de teléfono pierde el historial completo.

### Modelo de datos (localStorage)

Todo persistido con `JSON.stringify`/`parse` bajo claves fijas (`src/utils/storage.ts`, `src/constants/index.ts`). No hay migraciones de schema formales, solo funciones de migración ad-hoc para nombres de ejercicios.

| Entidad | Clave storage | Campos principales |
|---|---|---|
| **Historial de sesiones** | `STORAGE_KEYS.HISTORY` (máx. 200, antes 30) | `date`, `type: 'weights'\|'cardio'`, `grupo`, `ejercicios[]`, `volumenTotal`, `volumenPorGrupo`, `rpe`, `stats` (cardio), `sessionId`, `savedAt` |
| **Ejercicio dentro de sesión** | (embebido) | `nombre`, `sets`, `reps`, `peso`, `esMancuerna`, `grupoMuscular`, `volumen`, `completado` |
| **PRs** | `STORAGE_KEYS.PRS` | `Record<nombreNormalizado, {peso, sets, reps, volumen, date}>` |
| **Perfil** | `STORAGE_KEYS.PROFILE` | `name`, `birthdate`, `gender`, `weight`, `height`, `activity` |
| **Medidas corporales** | `gymmate_body_measurements` (máx. 100) | peso, cuello, pecho, cintura, cadera, brazos, muslos, `bodyFat` (Navy method) |
| **Draft (autoguardado)** | `STORAGE_KEYS.DRAFT` | sesión en curso + timestamp, expira a las 24h |
| **Entrenamientos personalizados** | `STORAGE_KEYS.CUSTOM_WORKOUTS` | `id`, `nombre`, `ejercicios[]`, `opcionales[]`, `isCustom`, `createdAt` |
| **Ejercicios personalizados** | `gymmate_custom_exercises` | `id`, `nombre`, `grupoMuscular`, `esMancuerna`, `createdAt` |
| **Gamificación** | (dentro de `features/gamification`) | XP total, nivel (1-100), rangos por grupo muscular, achievements, streaks — ver Fase 2 |

**Volumen ("Volumen Total Sesión") se calcula 100% en frontend**, en `src/utils/calculations.ts`: `calculateVolume = sets × reps × (esMancuerna ? peso × 2 : peso)`. No hay backend que verifique o recalcule esto — cualquier manipulación de `localStorage` (DevTools) altera PRs, XP y estadísticas sin validación. Esto es aceptable para una app personal de un solo usuario, pero es un bloqueante si en v2 se agrega login/sync (ver Fase 5).

### Service Worker / PWA

Configurado vía `vite-plugin-pwa` con `generateSW`:
- `registerType: 'autoUpdate'`, `cleanupOutdatedCaches`, `skipWaiting`, `clientsClaim` — buena higiene de actualización (el changelog del propio README menciona que esto arregló un bug real de caché de CSS).
- `globPatterns` precachea JS/CSS/HTML/iconos/fuentes (app shell completo) → **offline real para la UI y la lógica**, confirmado con build (`dist/sw.js`, 26 entradas precacheadas, 1.4 MB).
- `runtimeCaching`: `CacheFirst` para Google Fonts (1 año) y para imágenes de ejercicios servidas desde `raw.githubusercontent.com/yuhonas/free-exercise-db` (30 días, máx 50 entradas).
- **No hay ninguna integración de Push API o Notification API** — ni `Notification.requestPermission()`, ni `PushManager.subscribe()`, ni VAPID keys, ni suscripción push en ningún archivo. Grep confirmado sobre todo `src/`.

**Riesgo de dependencia externa:** las imágenes de ejercicios se cargan en tiempo real desde un repo de GitHub de terceros (`yuhonas/free-exercise-db`) vía `raw.githubusercontent.com`. Si ese repo se renombra, se borra, o GitHub cambia su CDN, las imágenes desaparecen sin aviso — y solo se cachean después de la primera visita (usuarios nuevos sin conexión no las verán).

### Dependencias — vulnerabilidades y estado

`npm audit` (tras `npm install` real, 539 paquetes): **21 vulnerabilidades — 1 crítica, 13 altas, 6 moderadas, 1 baja.**

| Paquete | Severidad | Nota |
|---|---|---|
| `vitest` | **Crítica** | Rango vulnerable `<=3.2.5`; el proyecto usa 1.6.1 (dev-only, no llega a producción) |
| `postcss` | Alta | XSS + path traversal en source maps (`<=8.5.17`) |
| `rollup` | Alta | Escritura arbitraria de archivos vía path traversal (toolchain de build, no runtime) |
| `sharp` | Alta | CVEs de libvips heredadas — usado en `scripts/generate-icons.js`, no en runtime del usuario |
| `serialize-javascript` | Alta | RCE vía RegExp — dependencia transitiva de Workbox |
| `ws` | Alta | Fuga de memoria + DoS |
| `vite`, `vite-plugin-pwa`, `esbuild`, `ajv`, `lodash`, `minimatch`, `picomatch`, `brace-expansion`, `fast-uri`, `@babel/core`, etc. | Alta/Moderada/Baja | Todas dev/build-time |

**Contexto importante:** todas estas vulnerabilidades están en **devDependencies** (herramientas de build/test), no en las dos únicas dependencias de producción (`chart.js`, `lucide`), que están limpias. El riesgo real para el usuario final es bajo — pero sí representa riesgo para quien desarrolla/compila el proyecto (supply-chain), y `npm audit fix` debería aplicarse antes de tocar código nuevo.

`npm outdated`: `lucide` está en `0.468.0`, la última es `1.27.0` (salto mayor, cambios de API probables). `chart.js` está actualizado.

Existe también una nota explícita en el propio código (`history.ts`): el export a Excel se reemplazó por CSV **"por seguridad"** — indicio de que en algún momento hubo una dependencia `xlsx`/SheetJS con vulnerabilidades conocidas (el paquete `xlsx` de SheetJS tiene un historial de CVEs de prototype pollution / ReDoS sin parche oficial en npm). Buena decisión ya tomada por el proyecto.

---

## FASE 2 — Estado del código

### Estructura y separación de responsabilidades

```
src/
├── constants/     # claves de storage, límites, keywords
├── data/          # catálogo de ejercicios (730 líneas), rutinas predefinidas, ejercicios cardio
├── features/      # lógica de negocio por dominio (workout, cardio, history, coach, profile, calculators, gamification/)
├── state/         # estado de sesión en curso
├── types/         # tipos compartidos
├── ui/            # componentes de renderizado (modals, navigation, gamification/)
├── utils/         # storage, cálculos, normalización de ejercicios, insights, iconos
└── main.ts        # entry point — 943 líneas, orquesta todo y expone funciones a `window`
```

Es una separación razonable **para no tener framework**: `features/` contiene la lógica de negocio pura (mayormente testeable), `ui/` genera HTML como strings, `utils/` son helpers puros. El código está en español para nombres de dominio (ejercicios, rutinas) e inglés para infraestructura — consistente, no mezclado al azar.

**El problema estructural real:** `main.ts` importa ~40 funciones de todos los módulos y las cuelga en `window` (`window.showHome = showHome`, etc.) para que el HTML generado por `innerHTML` pueda usar `onclick="showHome()"`. Esto es el patrón típico de apps vanilla pre-framework: funciona, pero:
- No hay componentización real — cada "pantalla" es una función que arma un string HTML gigante.
- El acoplamiento entre lógica y DOM es directo (`document.getElementById(...).innerHTML = ...`), lo que hace las funciones difíciles de testear (de hecho, **cero tests tocan `ui/` o `main.ts`**).
- Cualquier cambio de UI significativo (ej. un rediseño) toca decenas de funciones que arman HTML a mano.

### Código muerto / duplicado

- `exportToExcel` es un alias directo de `exportToCSV` (`export const exportToExcel = exportToCSV;`) — nombre engañoso (ya no exporta Excel, exporta CSV), pero no es código muerto, solo una etiqueta desactualizada. Cosmético, bajo riesgo.
- No se encontraron marcadores `TODO`/`FIXME`/`HACK` en todo `src/` — o el código está limpio, o nunca se documentó deuda técnica explícitamente (más probable lo segundo, dado lo que sigue).
- `react-body-highlighter` está en `devDependencies` pero **no se usa como paquete** — el archivo `src/ui/gamification/muscle-map.ts` tiene un comentario `// Based on react-body-highlighter (MIT License)`, es decir, se copió el algoritmo de mapeo de músculos y se reescribió a mano en vanilla TS. La dependencia npm quedó huérfana en `package.json` sin motivo — debería eliminarse.
- El módulo de gamificación es **grande**: ~2,400 líneas en `features/gamification/` + ~1,600 líneas en `ui/gamification/` (≈27% del código total del proyecto). Está bien tipado y documentado (`docs/GAMIFICATION_IMPLEMENTATION_PLAN.md`, 1,663 líneas, describe el diseño completo de XP/rangos/achievements antes de implementarse), pero es una inversión de complejidad enorme para una app de un solo usuario. No es código muerto, pero es una superficie grande a mantener si se decide reescribir el core.

### Manejo de errores y estados de carga

- `storage.ts` envuelve cada operación de `localStorage` en `try/catch` con fallback silencioso (`return defaultValue` / `console.error`) — razonable para una app offline-first, pero **no hay ningún manejo de errores de red** porque no hay red. En v2 con backend, este patrón no alcanza.
- No hay estados de carga (`loading`, `error`) en ninguna parte de la UI — no los necesita, porque todo es síncrono sobre `localStorage`. Esto **cambiará por completo** en cuanto se introduzca cualquier llamada asíncrona real (login, sync, IA), y hoy no hay ninguna convención ni componente para mostrar "cargando..." o "error de red".
- `console.log/error/warn` aparece solo 8 veces en todo el proyecto — no hay logging estructurado, pero tampoco hay ruido.

### Tests

- **1 solo archivo de test**: `src/tests/calculations.test.ts`, 21 tests, **todos pasan** (verificado con `npx vitest run`).
- Cobertura real: solo funciones puras de `utils/calculations.ts` (`calculateVolume`, `calculateVolumenPorGrupo`, `calculateCalories`, `getWeekNumber`, `daysSince`). **Cero tests** de: gamificación (XP, rangos, achievements — el módulo más grande del proyecto), `storage.ts`, `history.ts` (incluyendo el import/export CSV), `exercise-normalizer.ts` (542 líneas de lógica de alias que es exactamente el tipo de código que se rompe silenciosamente), coach.ts, ni ningún componente de `ui/`.
- No hay tests de integración ni end-to-end (Playwright/Cypress no están instalados, aunque el entorno de este sandbox sí tiene Chromium preinstalado — no es que falte tooling disponible, es que no se usó).

### Sistema de "AI Coach" actual — importante para Fase 4

`src/features/coach.ts` (359 líneas) **no llama a ningún modelo de IA.** Es una máquina de estados con:
- Un array fijo de 8 tips de texto (`TIPS`), elegidos al azar cada 2 minutos.
- Reglas condicionales sobre el historial: "última vez hiciste X kg", "estás a Y kg de tu PR", "faltan N ejercicios".
- Un sistema de prioridad de mensajes (`pr-alert` > `success` > `pr-close`/`streak` > `motivation` > `tip` > `info`) con tiempos de persistencia por tipo.

`src/utils/insights.ts` (393 líneas) es un motor similar pero para el hero de la pantalla principal: detecta rachas, tendencias de volumen semana-a-semana, músculos descuidados (>10 días sin entrenar), cercanía a PR, "mejor semana", etc. — **todo determinístico, basado en comparaciones de fechas y porcentajes**, sin IA.

Esto es una **excelente base para la Fase 4**: la lógica de detección de patrones (estancamiento, PRs cercanos, inactividad) ya existe y está bien probada conceptualmente — lo que falta es la capa conversacional/generativa, que es exactamente donde un LLM aporta valor real (ver Fase 4).

---

## FASE 3 — Auditoría PWA / Notificaciones

### `manifest.json` (generado por vite-plugin-pwa)

Bien configurado:
- `display: "standalone"`, `start_url: "/"`, `scope: "/"` ✅
- Iconos 192/512 con `purpose: "any"` y `purpose: "maskable"` ✅ (requisito de Chrome/Android para instalación)
- `apple-touch-icon` 180×180 ✅
- `theme_color`/`background_color: "#000000"` consistentes ✅
- `shortcuts` (accesos directos a "Nuevo Entrenamiento", "Historial", "PRs") — buen detalle, poco común verlo bien hecho ✅
- `categories: ["health", "fitness", "lifestyle"]` ✅

`index.html` tiene los meta tags de iOS correctos: `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, viewport con `viewport-fit=cover` (para notch). Falta el meta tag legado `apple-mobile-web-app-capable` (el estándar `mobile-web-app-capable` ya cubre iOS 16.4+, pero versiones de iOS/Safari algo más viejas solo respetan el prefijo `apple-`) — arreglo trivial, agregar la línea no cuesta nada y da compatibilidad hacia atrás.

**Conclusión: el manifest no es un bloqueante para nada de lo que quieres construir.** Está mejor configurado que la mayoría de PWAs reales.

### Web Push — estado actual

**Cero implementación.** No hay VAPID keys, no hay `PushManager.subscribe()`, no hay suscripción guardada en ningún lado, no hay endpoint de push (porque no hay backend). El único uso de `Notification`/`serviceWorker` en el código es indirecto vía `vite-plugin-pwa` (registro del SW) y una referencia en `timer.ts` que hay que revisar si es notificación real o solo vibración — no se encontró llamada explícita a `Notification.requestPermission()`.

### Requisito duro: backend para push

Push funciona así, sin excepción posible: navegador → suscripción con VAPID pública → **tu servidor guarda esa suscripción** → cuando quieres notificar, tu servidor firma un mensaje con la clave VAPID privada y lo manda al *push service* del navegador (FCM para Chrome/Android, APNs vía webkit para Safari/iOS, etc.) → el navegador lo entrega al Service Worker → el SW muestra la notificación.

Esto significa: **no hay forma de tener push sin algún tipo de servidor**, mínimo para guardar suscripciones y dispararlas. Las opciones son:

| Opción | Qué resuelve | Qué sigue siendo tu responsabilidad |
|---|---|---|
| **Servidor propio + `web-push` (npm)** | Control total, sin costo de terceros | Hosting, guardar suscripciones en una DB, cron/lógica para decidir cuándo notificar |
| **OneSignal** (free tier generoso) | Infraestructura de entrega, dashboard, segmentación, ya soporta iOS 16.4+ Web Push | Sigues necesitando *algo* que le diga a OneSignal "notifica al usuario X ahora" — o defines reglas dentro de OneSignal directamente |
| **Firebase Cloud Messaging (FCM)** | Gratis, soporta web push (incluido iOS via web push, no vía app nativa) | Requiere Firebase project + su propio SDK cliente; más manual que OneSignal pero sin vendor lock-in de dashboard |

Dado que **de todas formas necesitas un backend** para el AI Coach (Fase 4) y para cualquier sincronización multi-dispositivo, mi recomendación es no traer un tercero para push (OneSignal/FCM) y en su lugar correr `web-push` desde el mismo backend que ya vas a construir. Simplifica: una sola fuente de verdad para "cuándo notificar" (el motor de detección de inactividad ya existe en `insights.ts`), sin duplicar lógica entre tu servidor y el dashboard de un tercero.

### Limitaciones conocidas de iOS (Alonso usa iPhone)

- **Safari/iOS 16.4+ es un requisito duro**, no una recomendación — versiones anteriores no soportan Web Push en absoluto.
- **La PWA debe estar instalada a la pantalla de inicio** ("Añadir a pantalla de inicio") — Safari en pestaña normal (no standalone) **no** puede recibir push, aunque el navegador soporte la API.
- El permiso de notificaciones **debe solicitarse desde un gesto directo del usuario** (tap en un botón), no automáticamente al cargar — Safari es más estricto que Chrome en esto.
- Las notificaciones push en iOS **no soportan imágenes ricas ni acciones custom** tan bien como Android/Chrextra; mantener el payload simple (título + cuerpo + ícono) es más confiable.
- Safari on iOS **revoca el permiso silenciosamente** si el usuario no abre la PWA instalada por un tiempo prolongado (no hay un número oficial documentado, pero es un comportamiento conocido) — hay que re-solicitar permiso de forma elegante, no asumir que la suscripción sigue viva para siempre.
- No hay Badging API completo ni notificaciones "silenciosas" (background sync) tan flexibles como en Android — diseña las notificaciones asumiendo que **cada una debe justificarse por sí sola** (ej. "3 días sin entrenar piernas" es mejor que un genérico "¡Hola!").

---

## FASE 4 — Viabilidad del AI Coach

### Arquitectura propuesta

**Principio rector: separar aritmética de conversación.** Todo lo que hoy vive en `calculations.ts`, `insights.ts` e `xp.ts` (cálculo de 1RM, detección de estancamiento, %1RM, sugerencia de siguiente peso, rachas, comparación semana-a-semana) **debe seguir siendo código determinista en el backend**, no delegarse a un LLM. Un LLM no debería hacer aritmética de progresión — ya tienes esa lógica escrita, testeada y funcionando; moverla a un prompt la vuelve más lenta, más cara, y menos confiable (los LLMs cometen errores aritméticos sutiles con regularidad).

```
┌─────────────────────────────────────────────────────────────┐
│  Cliente (PWA)                                                │
│  - UI del coach (banner, chat, notificaciones)                │
│  - Envía: historial reciente (JSON) + pregunta/trigger        │
└───────────────────────────┬───────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼───────────────────────────────────┐
│  Backend (Node/Supabase Edge Function/Netlify Function)       │
│                                                                 │
│  ┌─────────────────────┐      ┌──────────────────────────┐   │
│  │ Capa determinística  │      │ Capa conversacional (IA)  │   │
│  │ (reutiliza tu código │─────▶│ Claude API                │   │
│  │  actual, portado)    │ JSON │ - Explica el análisis     │   │
│  │ - 1RM, %1RM          │ ya   │ - Genera mensaje motiv.   │   │
│  │ - Detección estanc.  │ calc │ - Responde preguntas libres│   │
│  │ - Próximo peso sug.  │      │   del usuario sobre su     │   │
│  │ - Detección inactiv. │      │   progreso                │   │
│  └─────────────────────┘      └──────────────────────────┘   │
│                                                                 │
│  Cron/scheduler → detecta inactividad → dispara push          │
└───────────────────────────┬───────────────────────────────────┘
                            │ Web Push (VAPID)
┌───────────────────────────▼───────────────────────────────────┐
│  Service Worker → Notification                                 │
└─────────────────────────────────────────────────────────────┘
```

**Flujo concreto:**
1. El backend recibe el historial (o lo lee de su propia DB si ya migraste de `localStorage` a Postgres/Supabase — ver Fase 5).
2. La capa determinística calcula: ¿hay estancamiento? (mismo peso/reps en N sesiones), ¿qué peso sugerir? (doble progresión: si completó todas las reps del rango objetivo en todas las series → sube peso; si no → sube reps), ¿hace cuánto no entrena X músculo?, ¿qué % de su 1RM está levantando?
3. Ese resultado estructurado (JSON pequeño, no el historial completo) se le pasa a Claude **solo para la capa de texto**: "explica esto de forma motivadora" o "genera un recordatorio breve". El LLM nunca ve el historial crudo completo si no es necesario — reduce tokens y evita que "razone" sobre datos que ya fueron pre-procesados correctamente.
4. Para preguntas abiertas del usuario ("¿por qué no estoy progresando en press banca?"), ahí sí conviene pasarle más contexto (los datos ya resumidos + la pregunta) y dejar que el modelo razone en lenguaje natural sobre un problema que sí es ambiguo/cualitativo.

### Comparación de costo/latencia: Haiku 4.5 vs Sonnet 5

Precios actuales de la API de Anthropic (por millón de tokens):

| Modelo | Input | Output | Contexto |
|---|---|---|---|
| **Claude Haiku 4.5** | $1.00 / MTok | $5.00 / MTok | 200K |
| **Claude Sonnet 5** | $3.00 / MTok ($2.00 introductorio hasta 2026-08-31) | $15.00 / MTok ($10.00 introductorio) | 1M |

Con **prompt caching** (recomendado para el system prompt del coach, que no cambia entre llamadas): lectura de caché cuesta ~0.1× el precio de input normal; escritura de caché ~1.25× (TTL 5 min) o ~2× (TTL 1h). Dado que el system prompt del coach (instrucciones + esquema de datos) es fijo y se reutiliza en cada llamada, cachearlo reduce el costo real muy por debajo de la tabla de arriba después de la primera llamada.

**Estimación de costo por interacción típica** (payload de historial ~2-5 KB de JSON ≈ 500-1,500 tokens de input, respuesta corta ~100-300 tokens de output):

| Escenario | Haiku 4.5 | Sonnet 5 |
|---|---|---|
| Notificación motivacional corta (input ~800 tok, output ~80 tok) | ~$0.0012 | ~$0.0025 (con precio intro) |
| Explicación conversacional larga (input ~1,500 tok con contexto + pregunta, output ~400 tok) | ~$0.0035 | ~$0.0070 |

En ambos casos el costo absoluto por llamada es trivial (fracciones de centavo) incluso a cientos de interacciones por usuario al mes — la diferencia real entre modelos no es "¿puedo pagarlo?" sino **calidad de respuesta y latencia**.

**Latencia:** Haiku 4.5 es sustancialmente más rápido (es el modelo más liviano de la familia actual, pensado para uso de alto volumen/baja latencia); Sonnet 5 razona mejor pero tarda más, especialmente si se le da "thinking" (que en Sonnet 5 está activo por defecto salvo que se desactive explícitamente).

**Recomendación concreta:**
- **Haiku 4.5** para: notificaciones push motivacionales, recordatorios de inactividad, mensajes cortos contextuales durante el entrenamiento (el equivalente actual de `coach.ts`). Es un análisis estructurado + generación de texto corto — exactamente el caso de uso donde Haiku rinde igual que un modelo más caro a una fracción del costo y con menor latencia (importante si quieres que el mensaje aparezca "al instante" durante el entrenamiento).
- **Sonnet 5** para: la conversación abierta donde el usuario hace preguntas tipo "¿cómo voy con mi progreso este mes?" o pide explicaciones de por qué se sugiere cierto peso — ahí el razonamiento y la calidad de explicación importan más que el costo marginal, que sigue siendo bajo en términos absolutos.
- No uses ningún modelo para la aritmética (1RM, %1RM, próximo peso, detección de estancamiento) — eso ya lo tienes en `calculations.ts`/`insights.ts`/`xp.ts`, es determinístico, gratis, instantáneo, y 100% confiable. Pedirle a un LLM que "calcule" en vez de "explique un cálculo ya hecho" es la forma más común de introducir errores de aritmética silenciosos en features de IA para fitness.

---

## FASE 5 — Entregable

### Diagnóstico honesto: ¿repotenciar o reescribir el core?

**No reescribas el core de lógica de negocio.** `calculations.ts`, `exercise-normalizer.ts`, el motor de gamificación (`features/gamification/`), y los datos de ejercicios/rutinas son correctos, están (parcialmente) testeados, y son independientes de la capa de presentación — se pueden portar prácticamente sin cambios a cualquier stack nuevo (son funciones puras de TypeScript, sin dependencia de DOM).

**Sí conviene reescribir la capa de UI y agregar backend**, por estas razones concretas:
1. **No hay backend, y lo necesitas de forma no negociable** para push real y para que el AI Coach tenga sentido (guardar historial de conversación, ejecutar la capa determinística server-side, no exponer tu API key de Anthropic en el cliente — hoy toda la lógica corre en el navegador del usuario, y una futura llamada a Claude API **nunca debe hacerse directo desde el frontend** con una key embebida).
2. **La UI vanilla con `innerHTML` + funciones en `window`** no escala bien para agregar un chat de IA interactivo, streaming de respuestas, o estados de carga/error que sí vas a necesitar en cuanto haya red de por medio. No es imposible, pero cada feature nueva de este tipo se vuelve más frágil en el patrón actual que en un framework con estado reactivo.
3. **La ausencia de sync multi-dispositivo** es probablemente el motivo real por el que dejaste de usar la app activamente (no lo sé, pero es el patrón típico: apps que solo viven en un teléfono se abandonan cuando cambias de hábito o de dispositivo). Push + IA sin sync es una mejora parcial; con sync, resuelve el problema de raíz.

**Lo que yo haría:** mantener Vite + TypeScript (el tooling ya funciona, `npm run build` compila limpio, los 21 tests pasan), migrar la capa de UI a un framework reactivo (React o Svelte — Svelte da un bundle más chico y es más fácil de migrar incrementalmente desde vanilla; React tiene más ecosistema si quieres librerías de chat/streaming ya hechas), y agregar un backend real (Supabase es buena elección: ya tienes el plan de integración escrito en `SUPABASE_INTEGRATION.md`, incluye Auth + Postgres + Edge Functions donde correr la capa determinística y las llamadas a Claude sin exponer la API key).

### Propuesta de arquitectura v2

| Módulo | Alcance | Esfuerzo estimado |
|---|---|---|
| **Backend base (Supabase)** | Auth (Google login), tablas para sesiones/PRs/perfil/medidas, RLS, migración de datos desde `localStorage` (import único al primer login) | 1.5–2 semanas |
| **Sync multi-dispositivo** | Estrategia offline-first (localStorage como caché, Supabase como fuente de verdad, resolución de conflictos last-write-wins por timestamp — tal como ya está diseñado en `SUPABASE_INTEGRATION.md`) | 1 semana (una vez el backend base existe) |
| **Push notifications** | VAPID + `web-push` en backend, endpoint de suscripción, cron/trigger que reutiliza la lógica de `insights.ts` (inactividad, streak en riesgo) para decidir cuándo notificar, UI de permiso en iOS (banner explicando "instala la app" antes de pedir permiso) | 1–1.5 semanas |
| **AI Coach — capa determinística** | Portar `calculations.ts`/`insights.ts`/lógica de doble progresión a Edge Function; endpoint que recibe user_id y devuelve JSON de "análisis" (estancamiento, próximo peso, PRs cercanos) | 3–5 días (mayormente portar código ya existente) |
| **AI Coach — capa conversacional** | Integración Claude API (Haiku para notificaciones, Sonnet para chat), endpoint de chat con historial de conversación persistido, streaming de respuesta en el chat | 1–1.5 semanas |
| **Migración de UI a framework** | Reescribir componentes (React o Svelte) reutilizando toda la lógica de `features/`/`utils/` sin cambios; puede hacerse pantalla por pantalla mientras la app sigue funcionando | 3–4 semanas (es la parte más grande, por volumen de pantallas: home, workout builder, cardio, historial, PRs, perfil, calculadoras, gamificación) |
| **Mejoras UX/UI puntuales** (sin esperar la migración completa) | Fix del meta tag iOS faltante, code-splitting del bundle (hoy 1 solo JS de 1 MB), actualizar `lucide`, limpiar `react-body-highlighter` huérfano, unificar número de versión | 2–3 días |

**Total estimado v2 completa: ~8–11 semanas** de trabajo enfocado, asumiendo que la lógica de negocio existente se reutiliza (no se reescribe) y que el trabajo se puede paralelizar parcialmente (backend y migración de UI no son estrictamente secuenciales).

Si el objetivo inmediato es solo **AI Coach + push**, sin migrar la UI todavía, se puede hacer en **~4 semanas** dejando la UI vanilla actual intacta y agregando backend + Claude API + push por encima — es la ruta más rápida a valor, y no te compromete a la reescritura de UI hasta que decidas que vale la pena.

### Riesgos y deuda técnica (priorizados por severidad)

**Alto**
1. **Cero backend = cero sync, cero backup automático, bloqueante duro para push e IA.** No es negociable — cualquier plan de v2 empieza por aquí.
2. **Vulnerabilidad crítica en `vitest`** (`<=3.2.5`) y 13 altas en el toolchain de build — correr `npm audit fix` (y evaluar `npm audit fix --force` para `sharp`, que implica breaking change) antes de seguir desarrollando, aunque el impacto en producción sea bajo (son devDependencies).
3. **Cobertura de tests casi nula** (21 tests, solo funciones puras de cálculo) en un módulo de gamificación de ~4,000 líneas y en toda la capa de storage/normalización — cualquier refactor de UI corre el riesgo de romper silenciosamente XP, rachas o PRs sin que ningún test lo detecte.

**Medio**
4. **Todo el cálculo de volumen/XP/PRs corre sin verificación en el cliente** — aceptable hoy (app de un solo usuario, sin cuentas), pero se vuelve un problema de integridad de datos en cuanto haya login/sync multi-usuario (un usuario podría editar `localStorage` y sincronizar PRs falsos).
5. **Dependencia de un CDN de terceros no controlado** (`raw.githubusercontent.com/yuhonas/free-exercise-db`) para imágenes de ejercicios — sin fallback si el repo desaparece o se renombra.
6. **Inconsistencia de versión** entre `package.json` (3.1.0), README (4.0.0) y `APP_VERSION` en `vite.config.ts` (3.2.0) — riesgo de que el cache-busting del Service Worker no dispare correctamente en un release real.
7. **Bundle sin code-splitting** — un solo JS de ~1 MB (210 KB gzip) para toda la app; no es crítico a este tamaño, pero crecerá con cada feature nueva (chat de IA, streaming) si no se atiende ahora.

**Bajo**
8. `react-body-highlighter` en `devDependencies` sin uso real (el código se copió a mano) — limpieza trivial.
9. `exportToExcel` es un alias mal nombrado de `exportToCSV` — cosmético, pero confunde a quien lea el código.
10. Falta el meta tag `apple-mobile-web-app-capable` (legado) en `index.html` — 1 línea, sin riesgo.
11. `lucide` desactualizado (0.468.0 → 1.27.0 disponible) — probable breaking change de API de iconos, revisar antes de actualizar.

---

## Conclusión

El código que ya escribiste es una base sólida y **no es el problema** — es limpio, tipado, testeado en su núcleo matemático, y la ausencia de dead code / TODOs sugiere que se construyó con cuidado. El problema es arquitectónico y de alcance: es una app 100% local sin servidor, y todo lo que pediste para v2 (coach de IA con costos razonables, push notifications, mejor UX) requiere backend como condición previa, no como feature adicional. Mi recomendación es construir el backend primero (Supabase, siguiendo el plan que ya escribiste en `SUPABASE_INTEGRATION.md`), añadir push y la capa determinística del coach reutilizando tu código actual, y dejar la migración de UI a framework como el trabajo más grande pero menos urgente — puede convivir con la UI vanilla actual mientras tanto.
