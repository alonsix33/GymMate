# GymMate — Auditoría Exhaustiva de Código (multi-agente)

**Fecha:** 2026-07-29
**Metodología:** 8 subagentes independientes en paralelo, cada uno con lectura completa de su dominio de archivos (no muestreo superficial), instruidos para no repetir hallazgos ya documentados en `AUDIT.md`, `FEATURES.md` y `GAMIFICATION_DEEP_DIVE.md`. Cada subagente reportó en un formato unificado (ID, título, ubicación, descripción, impacto, severidad, recomendación, esfuerzo). Este documento consolida sus 8 reportes, resuelve solapamientos entre ellos, y añade una recomendación de secuenciación para la fase de rediseño.
**Alcance:** Solo investigación y diagnóstico. Ningún fix se implementó.

Dominios auditados: **CORE** (estado/storage/main.ts), **GAM2** (gamificación, extensión de GAMIFICATION_DEEP_DIVE.md), **WKT** (entrenamiento/coach/timer de descanso), **CARDIO** (cardio & HIIT), **HIST** (historial/CSV/gráficos/calculadoras), **PROF** (perfil/medidas corporales), **UI** (componentes/modales/accesibilidad), **PWA** (infraestructura/configuración/dependencias).

---

## 1. Resumen ejecutivo

**97 hallazgos** en total, de los cuales **26 son bugs funcionales que corrompen o pierden datos del usuario de forma silenciosa** (sin ningún mensaje de error visible) — no deuda técnica cosmética, sino comportamiento que un usuario real experimentaría como "mis datos no cuadran" sin saber por qué.

| Severidad | Cantidad | Significado práctico |
|---|---|---|
| **Crítica** | 5 | Pérdida o corrupción de datos activa, reproducible con uso normal de la app, sin ningún aviso al usuario |
| **Alta** | 21 | Bug funcional real con impacto directo y frecuente, o riesgo de seguridad explotable hoy |
| **Media** | 35 | Bug funcional real pero de impacto acotado/infrecuente, o deuda técnica con consecuencia visible |
| **Baja** | 23 | Código muerto, duplicación sin consecuencia activa, o bug cosmético |
| **Informativo** | 13 | Confirmaciones de hallazgos ya conocidos, notas de verificación, o decisiones de producto pendientes |

**Panorama general:** el problema no es que el código esté mal escrito — la lógica de negocio (fórmulas, cálculos, estructura modular) es en general correcta y legible. El problema es un patrón sistemático que se repite en los 8 dominios: **el código asume que las operaciones de `localStorage`/formularios siempre tienen éxito y que los inputs del usuario siempre son razonables**, y cuando esa asunción falla, la app no lo comunica — muestra "éxito" de todas formas. Las 5 críticas son todas de esta naturaleza (guardado silencioso fallido, PR falsos por no recapturar estado al reanudar, sesiones de cardio que se sobrescriben entre sí, rondas de AMRAP que nunca se registran). A esto se suma un vector de seguridad real y no trivial: nombres de ejercicio/rutina escritos por el usuario se interpolan sin escapar tanto en `innerHTML` como (más grave) dentro de atributos `onclick`, lo que permite inyectar JavaScript ejecutable con una comilla simple bien colocada — hoy es "auto-XSS" de bajo impacto, pero se vuelve un vector real en cuanto exista sync entre dispositivos (ya planeado en `AUDIT.md`).

Los tres documentos previos (`AUDIT.md`, `FEATURES.md`, `GAMIFICATION_DEEP_DIVE.md`) siguen vigentes; esta auditoría los extiende, no los reemplaza.

---

## 2. Tabla maestra de hallazgos (ordenada por severidad)

### Crítica

| ID | Título | Ubicación | Esfuerzo |
|---|---|---|---|
| CORE-01 | Guardado "exitoso" aunque `localStorage.setItem` falle por cuota llena | `utils/storage.ts:29-35`, `features/workout.ts:455-473` | Pequeño |
| WKT-01 | Reanudar un draft nunca recaptura los PRs base → celebra "PR nuevo" falso en cada ejercicio con historial | `features/workout.ts:166-173` vs `:79` | Trivial |
| WKT-02 | PR se persiste en cada `onchange` sin validación ni forma de revertir → typo de peso graba un PR falso permanente | `features/workout.ts:179-213`, `state/session.ts:260-274` | Mediano / decisión de producto |
| CARDIO-01 | Sesiones de cardio nunca reciben `sessionId` → cada sesión nueva sobrescribe la anterior en el historial | `features/cardio.ts:916-927`, `utils/storage.ts:76-98` | Trivial |
| CARDIO-02 | Contador de rondas de AMRAP nunca se guarda; el historial siempre registra 1 ronda | `features/cardio.ts:459,564-573,907-913` | Trivial |

### Alta

| ID | Título | Ubicación | Esfuerzo |
|---|---|---|---|
| CORE-02 | Draft corrupto/de esquema antiguo evita su propia expiración y rompe el render al restaurarlo | `state/session.ts:190-213`, `utils/storage.ts:167-169` | Pequeño |
| CORE-03 | `resumeDraft()` no comprueba cambios sin guardar antes de sobrescribir la sesión activa | `ui/navigation.ts:419-429` | Trivial |
| CORE-04 | `dismissDraft()` resetea el singleton de sesión sin garantía de correspondencia con el draft mostrado | `ui/navigation.ts:431-436`, `state/session.ts:251-254` | Mediano |
| CORE-06 | Accesos directos a `localStorage` sin `try/catch` en Home pueden romper la pantalla completa ante JSON corrupto | `ui/navigation.ts:295-303,376-377` | Trivial |
| GAM2-01 | "Recalcular XP" puede bajar el XP/nivel del usuario (omite XP de racha y de rango) | `gamification/migration.ts:160-238`, `gamification/index.ts:153-157` | Mediano |
| GAM2-02 | "Recalcular XP" puede des-desbloquear logros de racha/rango ya obtenidos (y quitarles su XP) | `gamification/migration.ts:89-96` vs `achievements.ts:107-111` | Pequeño |
| GAM2-05 | Borrar una sesión del historial no revierte XP/PRs/rangos/logros que otorgó ("XP fantasma" permanente) | `utils/storage.ts:100-104`, `features/history.ts:41-46` | Pequeño (aviso) / Mediano (recalculo) |
| WKT-03 | Sin validación de rango/signo en inputs de sets/reps/peso (negativos, absurdos) | `features/workout.ts:179-213` | Pequeño |
| WKT-04 | Fórmula de Brzycki da resultados negativos/infinitos con reps ≥ 37, mostrados sin advertencia | `utils/calculations.ts:78`, `features/calculators.ts:132-157` | Trivial |
| CARDIO-03 | Sin autoguardado/draft de cardio: cerrar la pestaña a mitad de sesión pierde todo sin registro | `features/cardio.ts` (archivo completo) | Mediano |
| CARDIO-04 | El timer de cardio no se detiene al navegar fuera de la vista: temporizador fantasma en segundo plano | `features/cardio.ts:11,579-609`, `ui/navigation.ts:50-100` | Pequeño |
| CARDIO-05 | Sin corrección de drift del timer; `startTime` se guarda pero nunca se usa para resincronizar | `features/cardio.ts:542,579-609` | Mediano |
| CARDIO-06 | Circuito: piso de configuración (5) mayor que el default de rondas (3) → botón "−" incrementa | `features/cardio.ts:22,383-388` | Trivial |
| HIST-02 | Fusión incorrecta de sesiones distintas del mismo día+grupo al importar CSV (volumen subestimado o pérdida de datos) | `features/history.ts:342-402` | Mediano |
| HIST-03 | Importación CSV sin validación de rangos/tipos; valores negativos/absurdos se persisten silenciosamente | `features/history.ts:317-335` | Pequeño |
| PROF-01 | Método Navy con dos implementaciones divergentes: preview oculta un negativo que el guardado sí acepta y persiste | `features/profile.ts:277-347` | Pequeño |
| PROF-06 | Género "male" por defecto se asume silenciosamente si el perfil no está configurado, distorsionando el % de grasa | `features/profile.ts:280,334` | Pequeño |
| PROF-10 | Sin exportación/backup de `ProfileData`/`BodyMeasurement[]`; pérdida total posible sin recuperación | `features/profile.ts` (archivo completo) | Mediano |
| UI-01 | XSS persistente vía `innerHTML` con nombres de ejercicio/rutina personalizados sin escapar | `ui/components.ts:145,296`, `main.ts:337,587,793` | Pequeño |
| UI-02 | Ruptura de atributo `onclick` por comilla simple en nombres de usuario → inyección de JS ejecutable con un clic | `main.ts:589,789,797` | Mediano |
| UI-03 | `aria-hidden="true"` estático nunca se actualiza al abrir/cerrar modales; contenido invisible queda tabulable | `index.html` (6 modales), `ui/modals.ts:43,117,125` | Pequeño-Mediano |

### Media

35 hallazgos — ver detalle completo en la Sección 3 por dominio. Resumen de títulos:

| ID | Título | Dominio |
|---|---|---|
| CORE-05 | Drafts "stale" (&gt;24h) nunca se borran de localStorage, solo se ocultan | CORE |
| CORE-08 | `gymmate_session` es storage "write-only": se escribe siempre, nunca se lee | CORE |
| CORE-10 | Singleton `_state` de gamificación puede desincronizarse entre pestañas del navegador | CORE |
| CORE-12 | Sin versionado de esquema real para `session`/`history`/`PRs` (solo gamificación lo tiene) | CORE |
| GAM2-03 | "Recalcular XP" destruye el historial granular de `xpHistory`, sustituyéndolo por fechas ficticias | GAM2 |
| GAM2-04 | Sin protección de idempotencia contra procesar el mismo `sessionId` dos veces | GAM2 |
| GAM2-06 | Fallback de `loadGamificationState()` re-etiqueta versión de esquema sin migrar nada (riesgo en downgrade) | GAM2 |
| GAM2-07 | Cadena de migración manual: subir `GAMIFICATION_SCHEMA_VERSION` sin el paso correspondiente atasca el estado en bucle perpetuo | GAM2 |
| GAM2-10 | `pr.exercise` sin escapar en el resumen de sesión (mismo patrón que UI-01, vector vía import CSV) | GAM2 |
| WKT-05 | Detección de PR duplicada en 3 lugares divergentes (una de ellas código muerto) | WKT |
| WKT-06 | Alias "tríceps cuerda" fusiona incorrectamente dos ejercicios distintos en el normalizador | WKT |
| WKT-07 | Sistema de prioridad de mensajes del coach descarta (no encola) mensajes de eventos puntuales | WKT |
| WKT-08 | `AudioContext` nunca se cierra tras cada aviso sonoro del timer de descanso (acumulación) | WKT |
| CARDIO-07 | Piso de `duration` (AMRAP) en segundos con display sin redondear → "0.0833...minutos" en pantalla | CARDIO |
| CARDIO-08 | Escalado de pirámide converge a niveles planos tras clics repetidos, perdiendo la forma piramidal | CARDIO |
| CARDIO-09 | Clase Tailwind dinámica `h-${n}` en barras de nivel de pirámide, probablemente purgada por el JIT | CARDIO |
| CARDIO-10 | `estimateCalories()` usa tarifa fija ignorando modo/ejercicio real, presentada con falsa precisión | CARDIO |
| CARDIO-11 | `roundsCompleted` sobreestima en 1 al detener manualmente a mitad de ronda | CARDIO |
| HIST-01 | Inyección de fórmulas CSV (CSV/Excel Formula Injection) sin neutralizar en la exportación | HIST |
| HIST-05 | Validación de encabezados CSV débil (substring), mapeo de columnas puramente posicional | HIST |
| HIST-06 | Fórmula de Brzycki en calculadora 1RM da negativos/infinito con reps altas (duplicado de WKT-04, mismo origen) | HIST |
| HIST-07 | Calculadora de calorías solo valida "no vacío", no rangos fisiológicos razonables | HIST |
| PROF-02 | Campos numéricos de perfil/medidas aceptan negativos/cero sin validación de rango | PROF |
| PROF-04 | % de grasa fuera de rango se oculta sin explicación al usuario | PROF |
| PROF-05 | `saveMeasurement()` sobrescribe silenciosamente la medición del mismo día sin confirmación | PROF |
| PROF-11 | Al superar 100 mediciones, las más antiguas se descartan silenciosamente sin aviso | PROF |
| PROF-12 | Fallos de escritura en localStorage solo van a consola; la UI de Perfil siempre confirma éxito | PROF |
| UI-04 | Ningún modal implementa "focus trap" ni gestión de foco | UI |
| UI-05 | Escape solo cierra 2 de ≥6 modales de la app | UI |
| UI-06 | Botones de solo-ícono sin `aria-label` en acciones frecuentes/destructivas | UI |
| PWA-01 | Ausencia casi total de cabeceras de seguridad HTTP (CSP, HSTS, Referrer-Policy, Permissions-Policy) | PWA |
| PWA-02 | Uso masivo de `onclick` inline hace inviable una CSP estricta sin refactor grande | PWA |
| PWA-03 | Scripts `test:ui`/`test:coverage` rotos por dependencias faltantes nunca instaladas | PWA |
| PWA-04 | Ausencia total de linting/formateo automatizado (sin ESLint/Prettier) | PWA |
| PWA-08 | Intento de code-splitting neutralizado por imports estáticos redundantes (warning real de build) | PWA |

### Baja

23 hallazgos — código muerto sin consumidores, duplicación sin consecuencia hoy, o bugs puramente cosméticos. Lista de IDs (detalle completo en Sección 3): CORE-07, CORE-09, CORE-11, CORE-14, GAM2-08, GAM2-09, GAM2-12, WKT-09, WKT-10, CARDIO-12, CARDIO-13, CARDIO-14, HIST-04, PROF-03, PROF-07, PROF-08, PROF-09, UI-07, UI-08, PWA-05, PWA-07, PWA-09, PWA-10.

### Informativo

CORE-13, CORE-15, GAM2-11, CARDIO-15, CARDIO-16 (confirma hallazgo ya conocido de FEATURES.md), CARDIO-17 (ídem), PROF-13, UI-09, UI-10, PWA-06, PWA-11, PWA-12, PWA-13 (nota de verificación: no se pudo reproducir un supuesto warning de `tsconfig.json`).

---

## 3. Detalle completo por dominio

### 3.1 CORE — Estado, storage, main.ts (15 hallazgos)

**Archivos auditados:** `state/session.ts`, `main.ts`, `utils/storage.ts`, `constants/index.ts`, más referencias cruzadas a `features/workout.ts`, `ui/navigation.ts`, `features/gamification/*`.

**CORE-01 — Guardado "exitoso" aunque `localStorage.setItem` falle por cuota llena**
Severidad: Crítica. Esfuerzo: Pequeño.
`setItem()` en `storage.ts:29-35` atrapa cualquier excepción (incluida `QuotaExceededError`) y solo hace `console.error`, sin propagar el fallo. `saveCurrentSession()` siempre devuelve `'new'|'updated'` sin saber si el `setItem` interno tuvo éxito, y `saveWorkout()` usa ese valor para mostrar siempre "guardado correctamente". Si el localStorage del dispositivo está lleno (plausible tras meses de historial + gamificación + mediciones), el usuario ve éxito y el draft se borra, pero el entrenamiento no se persistió — se pierde sin ningún indicio.
Recomendación: hacer que `setItem` devuelva `boolean` de éxito/fallo y propagarlo hasta `saveWorkout`/`finishWorkout` para mostrar error explícito y no borrar el draft si el guardado real falló.

**CORE-02 — Draft corrupto puede evitar su propia expiración y romper el render al restaurarlo**
Severidad: Alta. Esfuerzo: Pequeño.
`getDraft()` no valida la forma del objeto leído. Si `draftTimestamp` falta/es corrupto, `Date.now() - draft.draftTimestamp` da `NaN`, y `NaN > DRAFT_MAX_AGE` es `false` ⇒ nunca expira. Si además `draft.ejercicios` no existe, `renderFromDraft()` ejecuta `.length` sobre `undefined`, lanzando `TypeError` no controlado al pulsar "Continuar".
Recomendación: validar forma mínima del draft antes de ofrecerlo como recuperable; tratar timestamp inválido como "stale" por defecto.

**CORE-03 — `resumeDraft()` no comprueba cambios sin guardar antes de sobrescribir la sesión activa**
Severidad: Alta. Esfuerzo: Trivial.
A diferencia de `loadTrainingGroup()` y `showHome()`, que sí verifican `hasUnsavedData()` antes de mutar la sesión, `resumeDraft()` llama directo a `restoreFromDraft(draft)`. Si hay un entrenamiento en curso con cambios no guardados, pulsar "Continuar" sobre un draft distinto los descarta sin confirmación.
Recomendación: aplicar el mismo guard `hasUnsavedData()` + `confirm()`.

**CORE-04 — `dismissDraft()` resetea el singleton de sesión sin garantía de correspondencia con el draft mostrado**
Severidad: Alta. Esfuerzo: Mediano.
`dismissDraft()` llama a `endSession()`, que resetea el único `sessionData` global — no un draft aislado. Si hay una sesión activa en memoria distinta al draft persistido mostrado en Home, se pierde esa sesión, y el DOM ya renderizado queda desincronizado (ediciones posteriores fallan silenciosamente porque `updateExercise` hace `if (!ejercicio) return` sobre un índice inexistente).
Recomendación: ligar el draft mostrado/descartado a un identificador concreto en vez de operar sobre el singleton global.

**CORE-05 — Drafts "stale" nunca se borran de localStorage, solo se ocultan**
Severidad: Media. Esfuerzo: Trivial.
Cuando `isStale` es `true`, solo se oculta la tarjeta; no se llama `clearDraft()`. El dato queda huérfano hasta que otra acción lo sobrescriba.
Recomendación: llamar `clearDraft()` cuando se detecta `isStale`.

**CORE-06 — Accesos directos a localStorage sin try/catch en Home pueden romper la pantalla completa**
Severidad: Alta. Esfuerzo: Trivial.
`getWeeklyVolume()` y `getQuickHomeStats()` en `navigation.ts` bypasean el wrapper seguro de `storage.ts` y hacen `JSON.parse(localStorage.getItem(...) || '[]')` sin manejo de error, duplicando además las claves mágicas. Si el JSON de `gymmate_history`/`gymmate_prs` se corrompe, la excepción no capturada rompe `updateHomeUI()` completa — la pantalla de inicio deja de renderizarse.
Recomendación: reemplazar por `getHistory()`/`getPRs()` de `utils/storage.ts`.

**CORE-07 — `hasChangesToSave()` es código muerto que duplica `hasUnsavedData()`**
Severidad: Baja. Esfuerzo: Trivial. Sin consumidores; reimplementa con ligeras diferencias el mismo diffing por `JSON.stringify`.

**CORE-08 — `gymmate_session` es storage "write-only"**
Severidad: Media. Esfuerzo: Trivial. `getSession()`/`clearSession()` no tienen consumidores; solo `saveSession()` se usa, únicamente para escribir en cada guardado — I/O innecesario y clave vestigial que puede confundir a quien audite el storage pensando que es el mecanismo de recuperación (rol real de `gymmate_draft`).

**CORE-09 — `resetGamificationState()` código muerto que desincronizaría el singleton si se usara**
Severidad: Baja. Esfuerzo: Trivial. Hace `removeItem` directo sin pasar por `persistState()`; si se llamara, `_state` en memoria "resucitaría" el estado borrado en el siguiente `persistState()`.

**CORE-10 — El singleton `_state` de gamificación puede desincronizarse entre pestañas**
Severidad: Media. Esfuerzo: Pequeño. No hay listener de evento `storage`. Con la PWA abierta en dos pestañas, terminar un entrenamiento en A y luego en B (con copia en memoria desactualizada) hace que B sobrescriba en localStorage el estado de A, perdiendo XP/logros/rangos de la sesión A.

**CORE-11 — `needsMigration()` usa clave de storage mágica en vez de la constante compartida**
Severidad: Baja. Esfuerzo: Trivial. Riesgo de desincronización si la clave se renombra en el futuro sin que el compilador lo detecte.

**CORE-12 — Sin versionado de esquema real para `session`/`history`/`PRs`**
Severidad: Media. Esfuerzo: Requiere decisión de producto. `__APP_VERSION__` se define en `vite.config.ts` pero no se referencia en ningún archivo de `src/` (cero coincidencias). Solo gamificación tiene su propio mecanismo de migración; un cambio futuro de forma en `HistorySession` no tiene ningún gate que lo detecte.

**CORE-13 — Generación de `sessionId` con `Date.now()+Math.random()`: riesgo de colisión**
Severidad: Informativo (no es un problema real en el uso normal de la app). Esfuerzo: Trivial (opcional, `crypto.randomUUID()`).

**CORE-14 — "PR" se define solo por peso bruto, ignorando reps/volumen; sobrescribe sin conservar histórico**
Severidad: Informativo/Baja (posible decisión de producto deliberada). Un set de más peso pero muchas menos repeticiones sobrescribe un PR de mayor volumen/1RM estimado, perdiendo ese dato sin explicación de criterio en la UI.

**CORE-15 — `window.location.reload()` tras terminar entrenamiento: diseño válido pero con costo de UX**
Severidad: Informativo/Baja. No se encontró pérdida de datos asociada (el `reload()` ocurre después de que el guardado y el `await` del resumen de XP se completan); es una elección de arquitectura para forzar el re-render completo de la UI derivada, con costo de "parpadeo" perceptible.

---

### 3.2 GAM2 — Gamificación, áreas no cubiertas por GAMIFICATION_DEEP_DIVE.md (12 hallazgos)

**Archivos auditados:** `gamification/migration.ts`, `state.ts`, `index.ts` (funciones no cubiertas por el deep dive previo), `levels.ts`, `achievements.ts` (lógica de re-evaluación), `muscle-ranks.ts`, los seis archivos de `ui/gamification/`, el botón "Recalcular XP".

**GAM2-01 — "Recalcular XP" puede bajar el XP total del usuario**
Severidad: Alta. Esfuerzo: Mediano.
`calculateRetroactiveXP()` (usada por `reinitGamification()`, el botón "Recalcular XP") solo suma XP base de sesión, volumen, cardio y un XP plano por conteo histórico de PRs — **omite por completo XP de rank-up y de milestones de racha**, confirmado por grep (`RANK_UP_XP`/`calculateStreakXP` no se referencian en `migration.ts`). Un usuario con una racha histórica de 90 días (2,550 XP) y un rank-up a Diamante (400 XP) vería su XP total caer más de 3,000 puntos —y posiblemente de nivel— la primera vez que presione un botón cuyo texto promete "útil si falta XP de alguna sesión".
Recomendación: extender `calculateRetroactiveXP()` para reconstruir también XP de rank-ups y de cada milestone de racha alguna vez alcanzado.

**GAM2-02 — "Recalcular XP" puede des-desbloquear logros de racha/rango ya obtenidos**
Severidad: Alta. Esfuerzo: Pequeño.
`migrateExistingData()` no reutiliza el array de logros existente — construye uno nuevo con `initializeAchievements()` (todo bloqueado) y re-evalúa contra el `currentStreak`/`muscleRanks` del instante actual, que pueden haber bajado. Un logro "permanente" en el uso normal (nunca se re-evalúa una vez `unlockedAt` tiene fecha) se pierde —junto con su XP— al pulsar este botón de "mantenimiento".
Recomendación: partir de los `achievements` actuales del estado previo (preservando `unlockedAt`) en vez de reinicializar.

**GAM2-03 — "Recalcular XP" destruye el historial granular de `xpHistory`**
Severidad: Media. Esfuerzo: Pequeño (viene incluido al resolver GAM2-01/02).
Cada recálculo sustituye `xpHistory` por transacciones sintéticas agregadas con timestamps ficticios ("ahora" para PRs/logros que en realidad ocurrieron en fechas pasadas).

**GAM2-04 — Sin protección de idempotencia contra procesar el mismo `sessionId` dos veces**
Severidad: Media. Esfuerzo: Pequeño.
No existe ningún chequeo "¿ya procesé este `sessionId`?" en `processCompletedSession()`. Hay una ventana real entre que la función ya persistió XP y que `hasSessionData` se resetea a `false` (solo tras resolverse el `await` de `showSessionSummary()`), durante la cual un segundo disparo del flujo duplicaría XP sin ningún guardarraíl.
Recomendación: verificar si `session.sessionId` ya tiene una transacción `workout_complete` en `xpHistory` antes de reprocesar.

**GAM2-05 — Borrar una sesión del historial no revierte XP/PRs/rangos/logros ("XP fantasma" permanente)**
Severidad: Alta. Esfuerzo: Pequeño (aviso) / Mediano (recalculo automático).
`deleteFromHistory()` hace `splice` y guarda — no toca `xpHistory`, `totalXP`, `muscleRanks`, `achievements` ni `streakData`. Si la sesión borrada había dado un PR, subido un rango o desbloqueado un logro, todo permanece intacto para siempre, sin ninguna sesión que lo respalde.
Recomendación: como mínimo, advertir explícitamente en la confirmación de borrado; idealmente, ejecutar `reinitGamification()` (una vez arreglado GAM2-01/02) tras el borrado.

**GAM2-06 — Fallback de `loadGamificationState()` re-etiqueta versión sin migrar (riesgo en downgrade de PWA)**
Severidad: Media. Esfuerzo: Pequeño.
`if (saved.version !== GAMIFICATION_SCHEMA_VERSION) { saved.version = GAMIFICATION_SCHEMA_VERSION; }` no aplica ninguna migración real. En un escenario de downgrade (bundle cacheado antiguo del Service Worker ejecutándose contra localStorage ya escrito por una versión más nueva), esto fuerza el número de versión hacia abajo sin tocar el contenido, dejando una etiqueta de versión incorrecta persistida.

**GAM2-07 — Cadena de migración manual: subir la versión de esquema sin el paso correspondiente atasca el estado en bucle perpetuo**
Severidad: Media. Esfuerzo: Pequeño.
La cadena de `if` hardcodeados en `initGamification()` no tiene salvaguarda: si se sube `GAMIFICATION_SCHEMA_VERSION` a 4 sin añadir su migración, el estado queda en un ciclo de "necesita migración" en cada carga de la app, para siempre, y cualquier feature de v4 que dependa de `version >= 4` nunca se activa para usuarios existentes.
Recomendación: reemplazar por un bucle genérico sobre una tabla de migraciones registradas.

**GAM2-08 — El `switch` de `checkAchievements()` no tiene rama `default`**
Severidad: Baja. Esfuerzo: Trivial. Un logro futuro sin `case` implementado queda permanentemente inalcanzable, sin ningún aviso de consola que delate el olvido.

**GAM2-09 — Colisión de IDs de gradiente SVG en `renderRankEmblem()` cuando dos músculos suben al mismo rango en la misma sesión**
Severidad: Baja. Esfuerzo: Trivial. El ID único se construye solo con `Date.now()` (resolución de milisegundo); dos llamadas síncronas en el mismo `.map()` pueden colisionar, corrompiendo visualmente el segundo emblema.

**GAM2-10 — `pr.exercise` sin escapar en el resumen de sesión**
Severidad: Media. Esfuerzo: Trivial. Mismo patrón que UI-01/UI-02 (ver Sección 3.7), aquí específicamente en `session-summary.ts:106-111`. El vector más realista no es auto-inyección sino **importar un CSV compartido por otra persona** con un nombre de ejercicio malicioso, que se ejecutaría al mostrarse en un futuro popup de PR.

**GAM2-11 — `xpHistory` se calcula y persiste pero no tiene ningún consumidor en la UI**
Severidad: Informativo. Esfuerzo: Requiere decisión de producto. Todo el mecanismo (capado a 100 entradas) existe activamente sin ninguna pantalla que lo muestre.

**GAM2-12 — `window.recalculateXP` no maneja errores: fallo silencioso sin feedback**
Severidad: Baja. Esfuerzo: Trivial. Sin `try/catch`; si `reinitGamification()` lanza excepción, el usuario no ve ni éxito ni error.

---

### 3.3 WKT — Entrenamiento, Coach, Timer de descanso (10 hallazgos)

**Archivos auditados:** `features/workout.ts`, `features/coach.ts`, `features/timer.ts`, `utils/calculations.ts`, `utils/exercise-normalizer.ts`, `ui/components.ts::renderExercise()`.

**WKT-01 — Reanudar un draft nunca recaptura los PRs base: genera "PRs nuevos" falsos**
Severidad: Crítica. Esfuerzo: Trivial.
`sessionStartPRs` solo se recaptura en `loadTrainingGroup()`, nunca en el flujo de "Continuar entrenamiento" (`resumeDraft()` → `restoreFromDraft()` + `renderFromDraft()`). Tras un `reload()` real, `sessionStartPRs` queda en `{}` durante toda la sesión reanudada. Al terminar, `getNewPRsInSession()` compara contra `{}`, así que **cada ejercicio con algún PR histórico** —lo haya tocado o no ese día— se reporta como "PR completamente nuevo", inflando XP/logros con celebraciones falsas.
Recomendación: llamar `captureSessionStartPRs()` también en `renderFromDraft()`/`resumeDraft()`.

**WKT-02 — El PR se persiste en cada `onchange` sin confirmación ni forma de revertirlo**
Severidad: Crítica. Esfuerzo: Mediano / decisión de producto.
Cada cambio de campo dispara `checkAndUpdatePR`, que sobrescribe el PR inmediatamente en localStorage si `peso` es mayor, sin debounce, sin tope de sanidad, y solo puede subir (nunca baja). Un typo ("800" en vez de "80") graba un PR falso permanente incluso si el entrenamiento nunca se guarda (`finishWorkout()` → "Cancelar" → `endSession()` + reload sin pasar por RPE). No existe en toda la app ninguna función para editar/eliminar un PR manualmente.
Recomendación: validar plausibilidad de incrementos grandes y/o debounce del write; agregar una vía de UI para corregir un PR erróneo.

**WKT-03 — Sin validación de rango/signo en inputs de sets/reps/peso**
Severidad: Alta. Esfuerzo: Pequeño.
Los atributos `min`/`max` del HTML son cosméticos; `parseFloat(...) || 0` solo protege contra `NaN`/vacío. Un peso negativo o astronómico pasa intacto a `calculateVolume` y de ahí (vía WKT-02) al PR persistido, corrompiendo también volumen de sesión, desglose por grupo y estadísticas.

**WKT-04 — Fórmula de Brzycki produce resultados negativos/infinitos con reps ≥ 37**
Severidad: Alta. Esfuerzo: Trivial. Sin tope de reps antes de aplicar la fórmula; el resultado roto se mezcla en el promedio final mostrado al usuario sin advertencia. (Mismo hallazgo reportado independientemente como HIST-06 desde el ángulo de la calculadora — un solo fix resuelve ambos.)

**WKT-05 — Detección de PR duplicada en 3 lugares divergentes; una es código muerto**
Severidad: Media. Esfuerzo: Pequeño. `checkForPR` (calculations.ts) sin consumidores; `checkAndUpdatePR` (session.ts, la que persiste) y `updateCoachOnExerciseUpdate` (coach.ts, reimplementa la comparación inline) coexisten sin compartir una única fuente de verdad.

**WKT-06 — Alias "tríceps cuerda" fusiona incorrectamente dos ejercicios distintos**
Severidad: Media. Esfuerzo: Trivial. "tríceps cuerda"/"triceps cuerda" mapean a "Extensión de Tríceps en Polea" en vez de a "Extensión Tríceps con Cuerda" (que existe como ejercicio propio con su propio alias "rope pushdown"), mezclando el historial/PR de dos variantes distintas.

**WKT-07 — El sistema de prioridad de mensajes del coach descarta (no encola) mensajes de eventos puntuales**
Severidad: Media. Esfuerzo: Pequeño. Un mensaje de menor prioridad ligado a un evento único (ej. "completaste todos los ejercicios") se pierde para siempre si un mensaje de mayor prioridad (ej. PR) está "vivo" en ese momento — no hay cola ni reintento tras expirar el bloqueo.

**WKT-08 — `AudioContext` nunca se cierra tras cada aviso sonoro del timer de descanso**
Severidad: Media. Esfuerzo: Trivial. Se crea un `new AudioContext()` por notificación sin llamar `close()`; en sesiones largas con muchos descansos se acumulan contextos vivos, pudiendo agotar el límite del navegador (especialmente Safari/iOS) y silenciar el beep sin ningún indicio.

**WKT-09 — La corrección de coma decimal solo se aplica al campo de peso, no a sets/reps**
Severidad: Baja. Esfuerzo: Trivial. `parseFloat("12,5")` en el campo de reps trunca a `12` en silencio, sin la animación de aviso que sí tiene el campo de peso.

**WKT-10 — Nombres de ejercicio personalizados sin escapar en `innerHTML` (renderExercise)**
Severidad: Baja/Informativo (subsume en el hallazgo más completo UI-01/UI-02 de Sección 3.7). Mismo patrón, reportado independientemente desde el ángulo de la sesión activa.

---

### 3.4 CARDIO — Cardio & HIIT (17 hallazgos, 2 son confirmaciones de FEATURES.md)

**Archivos auditados:** `features/cardio.ts` (completo), `data/cardio-exercises.ts`, tipos de cardio en `types/index.ts`.

**CARDIO-01 — Las sesiones de cardio nunca reciben `sessionId`: sobrescriben la anterior en el historial**
Severidad: Crítica. Esfuerzo: Trivial.
El objeto de sesión construido en `finishCardioWorkout()` no incluye `sessionId`. `addToHistory()` decide actualizar-vs-insertar comparando `sessionId`; como `undefined === undefined` es `true`, `findIndex` encuentra la primera entrada existente (casi siempre la sesión de cardio anterior) y la **sobrescribe**. Tras dos o más sesiones de cardio, solo la más reciente sobrevive — todas las anteriores se pierden silenciosamente, corrompiendo Historial, CSV y estadísticas agregadas.
Recomendación: generar un `sessionId` único (mismo patrón que `state/session.ts:222`) antes de `addToHistory`.

**CARDIO-02 — El contador de rondas de AMRAP nunca se guarda en las estadísticas**
Severidad: Crítica. Esfuerzo: Trivial.
`finishCardioWorkout()` construye `stats.roundsCompleted` desde `cardioState.currentRound`, que para AMRAP queda fijo en `1` durante toda la sesión — nunca se actualiza con `amrapRounds` (el contador real que el usuario incrementa tocando el botón). Un AMRAP de 15 rondas reales registra "1 ronda" en el historial y CSV.
Recomendación: usar `amrapRounds` cuando `mode === 'amrap'`.

**CARDIO-03 — Sin autoguardado/draft para cardio: cierre de pestaña = pérdida total**
Severidad: Alta. Esfuerzo: Mediano. A diferencia de pesas, cardio no escribe nada en localStorage hasta que el workout termina naturalmente o se detiene con confirmación. Cerrar la pestaña a mitad de un Tabata/AMRAP de 20 minutos pierde absolutamente todo, sin ningún registro parcial.

**CARDIO-04 — El timer no se detiene al navegar fuera de la vista: temporizador fantasma en segundo plano**
Severidad: Alta. Esfuerzo: Pequeño. No existe ninguna función exportada que `navigation.ts` pueda invocar para detener `timerInterval` al ir a Home. El timer sigue mutando `cardioState` en segundo plano, puede disparar `finishCardioWorkout()` (escribiendo una sesión "fantasma") sin que el usuario lo pida, y crea una condición de carrera real si se inicia una segunda sesión antes de que la primera termine en segundo plano.

**CARDIO-05 — Sin corrección de drift del timer**
Severidad: Alta. Esfuerzo: Mediano. `cardioState.startTime` se guarda pero nunca se lee para resincronizar contra `Date.now()`. En pestañas en segundo plano (throttling del navegador) o modo de ahorro de energía, un AMRAP de 20+ minutos puede desviarse varios minutos del tiempo real sin ninguna corrección al volver.

**CARDIO-06 — Circuito: piso de configuración mayor que el default de rondas**
Severidad: Alta. Esfuerzo: Trivial. Default `rounds: 3` para Circuito, pero `adjustCardioConfig` aplica un piso genérico de `5` a cualquier clave — el botón "−" incrementa de 3 a 5 en el primer toque, 100% reproducible.

**CARDIO-07 — Piso de `duration` (AMRAP) en segundos sin redondear en el display**
Severidad: Media. Esfuerzo: Trivial. Tras decrementar repetidamente, el valor colapsa a 5 segundos y se muestra literalmente "0.08333333333333333" como minutos.

**CARDIO-08 — Escalado de pirámide converge a niveles planos**
Severidad: Media. Esfuerzo: Pequeño. Los botones "Aumentar"/"Reducir" aplican un factor geométrico a todos los niveles por igual; tras ~9-11 clics todos convergen al techo (120s) o piso (15s), perdiendo la forma de pirámide.

**CARDIO-09 — Clase Tailwind dinámica en barras de nivel de pirámide, probablemente purgada por el JIT**
Severidad: Media. Esfuerzo: Trivial. `` `h-${Math.round(l/10)}` `` construida en runtime nunca aparece como texto literal para el escáner de contenido de Tailwind; las barras del indicador durante el timer activo pueden renderizarse sin altura.

**CARDIO-10 — `estimateCalories()` usa tarifa fija ignorando modo/ejercicio real**
Severidad: Media. Esfuerzo: Mediano (si se pondera por ejercicio) / Trivial (si solo se aclara el disclaimer). Misma fórmula (~10 kcal/min) para cualquier modo o ejercicio, pese a que `cardio-exercises.ts` ya tiene un campo `calories` por ejercicio nunca consultado; se presenta como dato preciso en resumen y CSV.

**CARDIO-11 — `roundsCompleted` sobreestima en 1 al detener manualmente a mitad de ronda**
Severidad: Media. Esfuerzo: Pequeño. `currentRound` solo avanza al completar el descanso de una ronda; detener manualmente a mitad de ronda persiste una ronda de más de las realmente completadas.

**CARDIO-12 — Intervalo de EMOM nunca configurable desde la UI (siempre fijo en 60s)**
Severidad: Baja. Esfuerzo: Pequeño. El modelo de datos soporta intervalos distintos (E2MOM, etc.) pero no hay ningún control para ajustarlo.

**CARDIO-13 — Base de datos de ejercicios de cardio (dificultad, calorías, músculos, descripción) nunca se usa en ninguna UI**
Severidad: Baja. Esfuerzo: Pequeño. `getCardioExerciseInfo()` sin consumidores; el usuario elige ejercicio de un `<select>` plano sin ver ninguno de esos datos ya construidos.

**CARDIO-14 — `cardioState.timer` es un campo muerto**
Severidad: Baja. Esfuerzo: Trivial. `resetCardioState()` intenta limpiar un intervalo que nunca se asignó (el handle real vive en una variable de módulo privada de `cardio.ts`), dando una falsa sensación de red de seguridad que contribuye a que CARDIO-04 pase desapercibido.

**CARDIO-15 — La fase `roundRest` y `config.exercises`/`roundRest` de Circuito son código muerto también en el motor de ejecución del timer, no solo en la configuración**
Severidad: Informativo. Esfuerzo: Requiere decisión de producto. Confirma que completar Circuito requiere tocar `handlePhaseEnd()`, no solo la pantalla de configuración.

**CARDIO-16 / CARDIO-17 — Confirmaciones de FEATURES.md**
Severidad: Informativo. "For Time" inalcanzable desde la UI, y Circuito reutiliza la configuración genérica de Personalizado — ambos ya documentados, confirmados con líneas de código exactas.

---

### 3.5 HIST — Historial, CSV, Gráficos, Calculadoras (7 hallazgos)

**Archivos auditados:** `features/history.ts`, `features/charts.ts`, `features/calculators.ts`, funciones de calculadora en `utils/calculations.ts`.

**HIST-01 — Inyección de fórmulas CSV (CSV/Excel Formula Injection) sin neutralizar**
Severidad: Media. Esfuerzo: Trivial.
`escapeCSV()` solo escapa comillas dobles y envuelve en comillas si hay `,`/`"`/`\n` — no neutraliza valores que empiecen con `=`, `+`, `-`, `@`, tab o CR (los caracteres que Excel/Sheets interpretan como inicio de fórmula). Un nombre de ejercicio/rutina personalizada como `=1+1` o `=HYPERLINK(...)` queda crudo en el CSV exportado. Impacto acotado hoy (auto-explotación), relevante si el CSV se comparte con terceros o en una v2 con sync.
Recomendación: anteponer un apóstrofe a valores que empiecen con esos caracteres, siguiendo la mitigación estándar de OWASP.

**HIST-02 — Fusión incorrecta de sesiones distintas del mismo día y grupo al importar CSV**
Severidad: Alta. Esfuerzo: Mediano.
La clave de reconstrucción de sesión es solo `fecha|grupo`, sin distinguir hora ni `sessionId` original. Dos entrenamientos genuinamente distintos del mismo grupo el mismo día (mañana y tarde) se fusionan en una sola sesión al reimportar, con `volumenTotal` tomado de solo una de las dos (`firstRow.volumenTotalSesion`), subestimando el volumen real sin ningún aviso. Si la combinación ya existe en el historial local, el chequeo de duplicados descarta directamente todas las filas de esa clave — pérdida de datos silenciosa en ese escenario.
Recomendación: incluir un identificador más granular en la clave de agrupación/deduplicación, o sumar correctamente todos los `volumen` de las filas agrupadas.

**HIST-03 — Importación de CSV sin validación de rangos ni tipos, con fallback silencioso a 0**
Severidad: Media-Alta. Esfuerzo: Pequeño.
`sets`/`reps`/`peso` se parsean con `parseInt(...) || 0`/`parseFloat(...) || 0` sin ningún piso/techo razonable; `grupoMuscular` se castea sin validar contra el enum real. Un CSV corrupto o editado a mano puede generar sesiones con pesos negativos o absurdos persistidas como "importación exitosa".
Recomendación: validar rangos razonables y rechazar/reportar filas inválidas en vez de convertirlas silenciosamente en 0.

**HIST-04 — `getQuickStats()` es código muerto (sin consumidores)**
Severidad: Baja. Esfuerzo: Trivial. Confirmado por grep: sin ningún import/llamada en todo el proyecto. Mantiene una cuarta implementación de racha con el mismo tope de 7 días ya documentado como bug en `GAMIFICATION_DEEP_DIVE.md`.

**HIST-05 — Validación de encabezados CSV débil (substring), mapeo de columnas puramente posicional**
Severidad: Media. Esfuerzo: Pequeño. La validación de headers acepta coincidencias parciales, pero el mapeo real de valores es por posición fija (`values[0]`, `values[1]`...) sin usar los headers detectados — un CSV con columnas reordenadas pero headers "parecidos" pasa la validación y mapea datos erróneos silenciosamente.

**HIST-06 — Fórmula de Brzycki produce resultados sin sentido con reps altas**
Severidad: Media (mismo hallazgo que WKT-04, reportado independientemente desde el ángulo de la calculadora — un solo fix resuelve ambos IDs).

**HIST-07 — Calculadora de calorías solo valida "no vacío", no rangos fisiológicos**
Severidad: Media. Esfuerzo: Trivial-Pequeño. Edad/peso/altura negativos o absurdos (truthy en JS) pasan la única validación existente, generando un BMR/TDEE sin sentido presentado con la misma confianza visual que un resultado correcto.

---

### 3.6 PROF — Perfil y Medidas Corporales (13 hallazgos)

**Archivo auditado:** `features/profile.ts` (completo), más referencias a `utils/storage.ts` y tipos relevantes.

**PROF-01 — Método Navy con dos implementaciones divergentes: negativos aceptados en el guardado pero no en la preview**
Severidad: Alta. Esfuerzo: Pequeño.
La preview exige `waist > 0 && neck > 0 && height > 0`; el guardado solo comprueba veracidad (`measurement.waist && measurement.neck && height`), sin exigir positivos. Un cuello negativo por typo pasa el guardado (80 > -5 es verdadero) y produce un % de grasa "válido" (dentro de 0-60) que se persiste sin que el usuario lo haya visto nunca en la preview antes de guardar.
Recomendación: unificar en una sola función de cálculo Navy con la misma validación estricta en ambos lugares.

**PROF-02 — Campos numéricos de perfil/medidas aceptan negativos o cero sin validación de rango**
Severidad: Media. Esfuerzo: Pequeño. Mismo patrón `parseFloat(v||'0')||0` que en el resto de la app; sin `min="0"` en los inputs HTML tampoco.

**PROF-03 — El valor "0" se descarta como `undefined` pero un negativo se conserva (inconsistencia del mismo patrón)**
Severidad: Baja. Esfuerzo: Trivial.

**PROF-04 — % de grasa fuera de rango se oculta sin explicación al usuario**
Severidad: Media. Esfuerzo: Pequeño. Sin ningún mensaje que explique por qué el bloque de estimado no aparece (falta altura, cintura menor que cuello, resultado fuera de 0-60) — un usuario con geometría corporal atípica nunca ve el estimado sin saber por qué.

**PROF-05 — `saveMeasurement()` sobrescribe silenciosamente la medición del mismo día**
Severidad: Media. Esfuerzo: Pequeño. Comparación solo por fecha (no hora); una segunda medición el mismo día reemplaza completamente a la primera sin confirmación, con riesgo de mezclar valores antiguos y nuevos vía el pre-rellenado del modal.

**PROF-06 — Género "male" por defecto asumido silenciosamente si el perfil no está configurado**
Severidad: Alta. Esfuerzo: Pequeño. Una usuaria que abre el modal de medidas sin haber completado antes su perfil obtiene silenciosamente la fórmula masculina de Navy (que ignora cadera), un resultado sistemáticamente incorrecto calculado y guardado sin ningún aviso.

**PROF-07 — `getProfileForCalculators()` es código muerto**
Severidad: Baja. Esfuerzo: Trivial. Sin consumidores; `calculators.ts` reimplementa la misma lógica de forma independiente.

**PROF-08 — Cálculo de edad triplicado (mismo algoritmo copiado 3 veces)**
Severidad: Baja. Esfuerzo: Trivial. Sin divergencia hoy, pero riesgo de que un fix futuro (ej. PROF-09) se aplique en una copia y se olvide en las otras.

**PROF-09 — Cálculo de edad puede desviarse un día en husos horarios negativos**
Severidad: Baja. Esfuerzo: Trivial. `new Date(birthdateInput.value)` interpreta el string `YYYY-MM-DD` como medianoche UTC, mientras los getters leen componentes en hora local — desviación de un día cerca del cumpleaños para usuarios en husos horarios negativos (gran parte de América).

**PROF-10 — Sin exportación/backup para `ProfileData`/`BodyMeasurement[]`**
Severidad: Alta. Esfuerzo: Mediano. A diferencia del historial de entrenamientos (que sí tiene CSV), no existe ninguna función de exportación; borrar datos del sitio o cambiar de dispositivo pierde perfil y hasta 100 mediciones sin ninguna vía de recuperación.

**PROF-11 — Al superar 100 mediciones, las más antiguas se descartan silenciosamente**
Severidad: Media. Esfuerzo: Pequeño. Sin ningún aviso al usuario cuando esto ocurre por primera vez; combinado con PROF-10, pérdida de datos históricos garantizada a largo plazo para usuarios consistentes.

**PROF-12 — Fallos de escritura en localStorage solo van a consola; la UI siempre confirma éxito**
Severidad: Media. Esfuerzo: Pequeño. Ni `saveProfile()` ni `saveMeasurement()` verifican ningún resultado de la escritura; ambas asumen éxito incondicionalmente.

**PROF-13 — Cero cobertura de tests para `profile.ts`**
Severidad: Informativo. Esfuerzo: Pequeño. Agrava el riesgo de que PROF-01/PROF-08 diverjan sin que nada lo detecte.

---

### 3.7 UI — Componentes transversales, modales, accesibilidad (10 hallazgos)

**Archivos auditados:** `ui/modals.ts`, `ui/components.ts`, `ui/navigation.ts`, `utils/icons.ts`, `utils/muscle-icons.ts`.

**UI-01 — XSS persistente vía `innerHTML` con nombres de ejercicio/rutina personalizados sin escapar**
Severidad: Alta. Esfuerzo: Pequeño.
No existe ninguna función `escapeHtml`/`sanitize` en todo el proyecto (confirmado por grep). Nombres de ejercicio personalizado y de rutina personalizada, escritos libremente por el usuario, se interpolan sin escapar en al menos 5 puntos (`renderExercise`, `renderHistoryItem`, `renderCustomWorkoutsInHome`, listas del Workout Builder) y se persisten en localStorage — se ejecutarían cada vez que la app renderiza Home/Workout Builder/Historial. Hoy es self-XSS persistente entre sesiones del mismo navegador; se vuelve XSS persistente entre dispositivos/usuarios en cuanto exista sync (ya planeado según `AUDIT.md`).
Recomendación: crear una función `escapeHtml()` centralizada y aplicarla en los ~6 puntos de interpolación identificados.

**UI-02 — Ruptura de atributo `onclick` por comilla simple: inyección de JS ejecutable con un clic**
Severidad: Alta. Esfuerzo: Mediano.
Más grave que UI-01: `ex.nombre`/`exercise.nombre` se interpolan directamente dentro de un string JavaScript que vive en un atributo `onclick` (`main.ts:589,789,797`). Un nombre con una comilla simple (ej. `Curl'); alert(document.cookie); //`) rompe la llamada e inyecta JavaScript arbitrario ejecutable con un simple clic — no requiere `<script>` ni siquiera `innerHTML` sin escapar, solo un carácter sin neutralizar. Sigue siendo explotable aunque se arregle UI-01 escapando solo `<`/`>` (un error de escaping parcial común).
Recomendación: reemplazar el patrón de `onclick="fn('${valor}')"` por `data-*` + listener delegado (patrón que la app ya usa correctamente para `data-guidance-btn`).

**UI-03 — `aria-hidden="true"` estático nunca se actualiza al abrir/cerrar modales**
Severidad: Alta. Esfuerzo: Pequeño-Mediano.
Los 6+ modales llevan `aria-hidden="true"` fijo en el HTML; ningún archivo JS lo cambia jamás (confirmado por grep). El "abrir" un modal solo cambia `opacity`/`pointer-events` vía CSS, sin `display:none` — el contenido "cerrado" permanece en el flujo de tabulación del teclado. Un usuario de lector de pantalla nunca puede percibir ningún modal (siempre reportado como oculto); un usuario de teclado puede tabular hacia botones invisibles de un modal "cerrado".
Recomendación: alternar `aria-hidden` junto con la clase `active` en cada open/close; considerar `inert` en el contenido oculto.

**UI-04 — Ningún modal implementa "focus trap" ni gestión de foco**
Severidad: Media. Esfuerzo: Mediano. Al abrir un modal no se mueve el foco hacia dentro ni se restaura al cerrar; Tab/Shift+Tab puede escapar hacia contenido de fondo tapado visualmente.

**UI-05 — Escape solo cierra 2 de ≥6 modales de la aplicación**
Severidad: Media. Esfuerzo: Pequeño. Solo `animationModal` y `confirmModal` responden a Escape; Workout Builder, RPE, Rest Timer, Medidas e Historial de medidas no.

**UI-06 — Botones de solo-ícono sin `aria-label` en acciones frecuentes/destructivas**
Severidad: Media. Esfuerzo: Trivial-Pequeño. El botón de eliminar entrada de historial (acción destructiva e irreversible) y el botón de marcar ejercicio completado (el control más usado durante un entrenamiento) no tienen etiqueta accesible; `iconButton()` ni siquiera acepta un parámetro para ello.

**UI-07 — Biblioteca de componentes de UI construida y abandonada (código muerto adicional)**
Severidad: Baja/Informativo. Esfuerzo: Trivial. Más allá de `showConfirmModal`/`showToast` ya documentados: `card()`, `buttonPrimary()`, `buttonSecondary()`, `statCard()`, `renderRoutineCard()`, `iconInline()`, `muscleIconImg()`, `getAvailableMuscleIcons/GroupIcons()` sin ningún consumidor real.

**UI-08 — Lógica de "tarjeta de rutina" triplicada y divergente**
Severidad: Baja. Esfuerzo: Mediano/decisión de producto. `renderRoutineCard()` (sin uso) vs. dos implementaciones manuales distintas en `main.ts` para rutinas predefinidas y personalizadas — riesgo de que un fix de accesibilidad/escape se aplique en una y se olvide en las otras dos.

**UI-09 — Tres patrones distintos de mostrar/ocultar UI conviven en la misma base de código**
Severidad: Informativo. Toggle de clase CSS, `createElement`+`.remove()`, y `style.display` inline coexisten con semánticas de accesibilidad distintas — causa raíz de por qué UI-03 solo afecta a un subconjunto de modales.

**UI-10 — Evidencia de que el escape ya se aplicó parcialmente en otro lugar del mismo archivo**
Severidad: Informativo. `components.ts` ya escapa comillas dobles para `guidance.content` (dato estático, no de usuario) dos líneas antes de no escapar `ejercicio.nombre` (dato de usuario) — confirma que el fix de UI-01 es de bajo esfuerzo, el patrón ya existe.

---

### 3.8 PWA — Infraestructura, configuración, dependencias (13 hallazgos)

**Archivos auditados:** `index.html` (completo), `netlify.toml`, `package.json`, `tsconfig.json`, `postcss.config.js`, `tailwind.config.js`, `.gitignore`, `public/_redirects`, `scripts/generate-icons.js`, `vite.config.ts`. Validado ejecutando `npm run build`, `npx tsc --version`, inspección de `dist/` generado.

**PWA-01 — Ausencia casi total de cabeceras de seguridad HTTP**
Severidad: Media (Alta de cara a v2 con backend/IA). Esfuerzo: Pequeño (HSTS/Referrer-Policy/Permissions-Policy) / Requiere decisión de producto (CSP). Solo `X-Frame-Options`/`X-Content-Type-Options` configurados; sin CSP, HSTS, Referrer-Policy ni Permissions-Policy.

**PWA-02 — El uso masivo de `onclick` inline hace inviable una CSP estricta sin refactor grande**
Severidad: Media. Esfuerzo: Grande / decisión de producto. 24 atributos `onclick` confirmados en `index.html` más generación dinámica vía `innerHTML` en 6 archivos. Una CSP con `script-src 'self'` (sin `'unsafe-inline'`) rompería toda la interacción de la app. Este hallazgo conecta directamente con UI-02: el mismo patrón que permite la CSP-hostilidad es el que permite la inyección de JS por comilla simple.

**PWA-03 — Scripts `test:ui`/`test:coverage` rotos por dependencias faltantes**
Severidad: Media. Esfuerzo: Trivial. Confirmado ejecutando ambos comandos: fallan por `@vitest/coverage-v8` y `@vitest/ui` no declarados en `devDependencies`.

**PWA-04 — Ausencia total de linting y formateo automatizado**
Severidad: Media. Esfuerzo: Pequeño. Sin ESLint/Prettier configurado ni script `lint`, pese a que el proyecto se va a reescribir parcialmente.

**PWA-05 — Redirect SPA duplicado en dos archivos de configuración**
Severidad: Baja. Esfuerzo: Trivial. `netlify.toml` y `public/_redirects` declaran la misma regla; riesgo de drift si se edita solo uno.

**PWA-06 — Regla de cabecera para archivos `.ts` en `netlify.toml` es código muerto**
Severidad: Informativo. Confirmado inspeccionando `dist/`: Vite nunca sirve `.ts` directamente.

**PWA-07 — Sourcemaps completos habilitados en el build de producción**
Severidad: Baja/Informativo. Esfuerzo: Trivial. `sourcemap: true` genera un `.map` de 3.19MB (para un bundle de 1.03MB) que expone todo el código fuente legible en producción.

**PWA-08 — Intento de code-splitting neutralizado por imports estáticos redundantes**
Severidad: Baja-Media. Esfuerzo: Pequeño-Mediano. Warnings reales del build confirman que `icons.ts` y `workout.ts` se importan dinámicamente en un punto pero estáticamente en otro, anulando el `import()` — más específico que la observación genérica de `AUDIT.md`.

**PWA-09 — Sin versión de Node fijada para el build en Netlify**
Severidad: Baja. Esfuerzo: Trivial. Sin `NODE_VERSION` en `netlify.toml` ni `.nvmrc`/`engines`.

**PWA-10 — Assets de `Muscle Icons` con espacios/paréntesis en nombres, SVGs pesados sin optimizar**
Severidad: Baja. Esfuerzo: Pequeño. 8 archivos con nombres frágiles (espacios, paréntesis); algunos SVG de ~67KB para un ícono de silueta, sugiriendo exportación sin optimizar.

**PWA-11 — Sin licencia/atribución documentada para los íconos de terceros de "Muscle Icons"**
Severidad: Informativo. El propio código atribuye a "IconScout" en un comentario, sin ningún archivo de licencia ni nota visible en la app.

**PWA-12 — `.gitignore` no cubre `.netlify/`**
Severidad: Informativo. Brecha preventiva barata.

**PWA-13 — No se pudo reproducir el supuesto warning de deprecación de `baseUrl` en `tsconfig.json`**
Severidad: Informativo (nota de verificación, no un hallazgo confirmado). Con TypeScript 5.9.3 vía CLI, el build compila limpio sin ningún warning relacionado — se documenta para no propagar una afirmación no verificable con el entorno actual.

---

## 4. Recomendaciones de secuenciación

El criterio de esta sección: **¿el hallazgo corrompe datos o lógica que el rediseño va a heredar/portar?** Si sí, arreglarlo antes de migrar es obligatorio — de lo contrario el bug simplemente se traslada al nuevo sistema (o peor, se traslada ya "horneado" dentro de datos de usuario corruptos). Si el hallazgo vive exclusivamente en la capa de presentación vanilla que de todas formas se va a reescribir, no vale la pena parchear el código que se va a descartar — pero sí vale la pena registrar la lección como **requisito de diseño** para que el código nuevo no repita el mismo patrón.

### A. Arreglar antes de tocar el modelo de datos o migrar al rediseño (bloqueante)

Estos afectan directamente la integridad de los datos que el nuevo sistema (backend, sync, o simplemente una UI reescrita que siga leyendo el mismo `localStorage`) va a consumir. Portar el bug es peor que arreglarlo ahora, porque una vez migrado a un backend real se vuelve mucho más caro de corregir (potencialmente hay que limpiar datos ya sincronizados entre dispositivos):

- **CORE-01** (guardado silencioso fallido) — si se va a introducir sync/backend, la garantía "lo que veo guardado, está guardado" tiene que existir antes de confiar en ese storage como fuente de verdad a migrar.
- **WKT-01, WKT-02** (PRs falsos/corruptos) — los PRs alimentan directamente el sistema de rangos musculares que el usuario explícitamente pidió conservar (el mapa muscular). Migrar PRs corruptos corrompe el rango mostrado en el rediseño desde el primer día.
- **CARDIO-01, CARDIO-02** (sesiones de cardio que se sobrescriben / rondas de AMRAP perdidas) — el historial de cardio no es confiable hoy; cualquier importación/migración de historial a un nuevo esquema debería esperar a que estos dos se arreglen, o el nuevo sistema heredará un historial ya empobrecido sin poder distinguirlo.
- **GAM2-01, GAM2-02** (recalcular XP baja el nivel / quita logros) — si el motor de gamificación se porta tal cual a un backend, este bug se ejecutaría ahí también. Arreglar antes de portar la lógica, no después.
- **PROF-01, PROF-06** (fórmula Navy divergente, género por defecto) — antes de migrar `ProfileData`/`BodyMeasurement` a cualquier esquema nuevo, vale la pena corregir la lógica de cálculo para no arrastrar estimados de grasa corporal ya calculados con una fórmula/género incorrectos.
- **HIST-02, HIST-03** (corrupción de datos en import/export CSV) — si el CSV sigue siendo el mecanismo de backup/portabilidad en la v2 (razonable, dado que `AUDIT.md` lo marca como "no negociable"), su integridad debe garantizarse antes de que los usuarios dependan de él para migrar de un dispositivo a otro.

### B. Requisitos de seguridad a incorporar en el rediseño desde el día uno (no parchear el código viejo, pero no repetir el patrón)

- **UI-01, UI-02, GAM2-10, WKT-10** (XSS vía `innerHTML` y `onclick` sin escapar) — no vale la pena parchear extensivamente la capa de renderizado vanilla si se va a reemplazar por un framework (React/Svelte, como recomienda `AUDIT.md`), porque un framework moderno escapa por defecto y elimina esta clase de bug estructuralmente. **Pero** si cualquier parte de esta UI sobrevive en el corto plazo (por ejemplo, si el AI Coach + push se implementan antes de la migración de UI, como también sugiere `AUDIT.md`), aplicar como mínimo el escape centralizado de UI-01 es barato y cierra el vector mientras tanto.
- **PWA-01, PWA-02** (sin CSP/cabeceras de seguridad) — diseñar el nuevo frontend con event listeners (no `onclick` inline) desde el principio deja la puerta abierta a una CSP estricta sin deuda técnica retroactiva. Añadir HSTS/Referrer-Policy/Permissions-Policy en `netlify.toml` es independiente y se puede hacer ya.
- **HIST-01** (CSV formula injection) — bajo esfuerzo, aplicar ya sin esperar al rediseño.

### C. Se puede arreglar en paralelo, sin bloquear nada

Bugs funcionales acotados en módulos que van a seguir existiendo conceptualmente en el rediseño (cardio, calculadoras, timer) pero cuyo arreglo no depende de ninguna decisión de arquitectura:

- CARDIO-03 a CARDIO-11 (drift del timer, autoguardado de cardio, piso de configuración de Circuito, escalado de pirámide, calorías, rondas al detener manualmente).
- WKT-03 a WKT-09 (validación de inputs, fórmula de Brzycki, alias del normalizador, cola de mensajes del coach, `AudioContext`).
- PROF-02 a PROF-12 (validación de rangos, mensajes de error explicativos, sobrescritura de medición, backup de perfil/medidas).
- CORE-02 a CORE-12 (validación de drafts, desincronización entre pestañas, versionado de esquema).
- PWA-03, PWA-04, PWA-05, PWA-08, PWA-09 (dependencias de test rotas, linting, redirects duplicados, code-splitting, versión de Node) — trabajo de higiene de infraestructura, cero dependencia de decisiones de producto.

### D. Limpieza de deuda técnica / código muerto — bajo impacto, se resuelve solo o casi solo al reescribir

La mayoría de los hallazgos de severidad Baja/Informativo (funciones exportadas sin consumidor: CORE-07/09, GAM2-08/09/11/12, WKT-05 parcial, CARDIO-12/13/14, HIST-04, PROF-07/08, UI-07/08/09, PWA-06/07/10/11/12) desaparecen automáticamente si el rediseño de UI parte de cero y no copia funciones sin usar. No vale la pena invertir tiempo en borrarlas del código vanilla actual salvo que se decida mantener esa base por más tiempo del previsto — la excepción es **UI-07/UI-08** si se decide reutilizar código de presentación existente en vez de reescribir desde cero, en cuyo caso conviene decidir cuál de las variantes duplicadas es la canónica antes de portarla.

### E. Requiere decisión de producto antes de poder clasificarse

- **WKT-02** (¿qué validación de "PR sospechoso" es razonable? ¿se permite editar PRs manualmente?)
- **CORE-12** (¿vale la pena introducir versionado de esquema completo para historial/perfil, o se resuelve solo al migrar a un backend con su propio esquema versionado?)
- **CORE-14** (¿"PR" debe seguir siendo solo peso máximo, o debe considerar 1RM estimado/volumen?)
- **GAM2-11** (¿se construye una pantalla de historial de XP, o se elimina el mecanismo si nunca se usará?)
- **CARDIO-15/16/17** (completar Circuito/For Time, o formalizar su eliminación del selector de modos)
- **UI-08** (unificar el diseño visual de "tarjeta de rutina" entre predefinidas y personalizadas)
- **PWA-02** (si se prioriza CSP antes o después de la migración de UI — ligado a esa migración de todas formas)

Ningún fix se implementó en esta sesión. Este documento, junto con `AUDIT.md`, `FEATURES.md` y `GAMIFICATION_DEEP_DIVE.md`, es el insumo completo para decidir el alcance y la secuenciación de la fase de implementación.
