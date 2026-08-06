# FIXES_APPLIED.md — Grupo A: fixes bloqueantes para el rediseño

Fecha: 2026-08-06
Alcance: los 11 hallazgos del Grupo A de `FULL_CODEBASE_AUDIT.md` ("Arreglar antes
de tocar el modelo de datos o migrar al rediseño"). No se tocó nada del Grupo B
(XSS/CSP), Grupo C, ni hallazgos de severidad Media/Baja.

## 1. Tabla de cambios

| ID | Qué se cambió | Archivo:línea | Cómo se verificó |
|----|----------------|----------------|-------------------|
| **CORE-01** | `setItem()` ahora devuelve `boolean` en vez de tragarse la excepción de `localStorage.setItem` (p. ej. `QuotaExceededError`). El resultado se propaga por `saveHistory` → `addToHistory` → `saveSession` hasta `saveCurrentSession()`, que ahora puede devolver `'failed'`. `saveWorkout()` muestra un mensaje de error explícito (rojo) en vez del mensaje de "guardado correctamente" cuando falla, y **no** marca la sesión como guardada ni borra el draft. `confirmRPE()`/`skipRPE()` también abortan el flujo de "terminar entrenamiento" (no cierran el modal, no recargan la página) si el guardado falla, para no perder el borrador automático. | `src/utils/storage.ts:29-35,70-105,194-196`; `src/state/session.ts:219-249`; `src/features/workout.ts:455-478,644-691` | `npx tsc --noEmit` limpio; revisión manual del flujo (no se pudo simular `QuotaExceededError` real sin un test de integración, ver sección 4) |
| **WKT-01** | `renderFromDraft()` ahora llama a `captureSessionStartPRs()` justo antes de renderizar, igual que `loadTrainingGroup()`. Antes, al restaurar un draft tras recargar la página, `sessionStartPRs` quedaba vacío y cualquier peso ya registrado se detectaba como "PR nuevo" falso. | `src/features/workout.ts:166-176` | `npx tsc --noEmit` limpio; lectura cruzada con `loadTrainingGroup()` (línea 79) para confirmar paridad |
| **WKT-02** | `updateExercise()` ya no llama a `checkAndUpdatePR()` de forma síncrona en cada `onchange`. Ahora usa un debounce de 1.2s (`schedulePRCheck`, nueva constante `PR_CHECK_DEBOUNCE_DELAY`) por índice de ejercicio, que se cancela y reprograma en cada edición y se limpia en `resetSession()`/`restoreFromDraft()`. Además, `checkAndUpdatePR()` valida que peso/sets/reps estén en un rango humano razonable (nuevas constantes `MAX_REASONABLE_PESO=500kg`, `MAX_REASONABLE_SETS=20`, `MAX_REASONABLE_REPS=100`) antes de aceptar el valor como PR real. | `src/state/session.ts:76-95,110-129,270-295`; `src/constants/index.ts:9-16` | `npx tsc --noEmit` limpio; revisión manual del flujo de edición fila a fila |
| **CARDIO-01** | Las sesiones de cardio ahora generan un `sessionId` único (mismo patrón `session_${Date.now()}_${random}` que usa el historial de pesas) antes de llamar a `addToHistory()`. Antes todas las sesiones de cardio tenían `sessionId: undefined`, así que `addToHistory()` las confundía entre sí (`findIndex` encontraba la primera coincidencia con `sessionId === undefined`) y una sesión nueva sobreescribía a la anterior en vez de añadirse. | `src/features/cardio.ts:916-928` | `npx tsc --noEmit` limpio; lectura de `addToHistory()` en `storage.ts` para confirmar que el `findIndex` ya no puede colisionar |
| **CARDIO-02** | `finishCardioWorkout()` ahora usa el contador real `amrapRounds` (incrementado por el usuario vía `incrementAmrapRound()`) cuando el modo es AMRAP, en vez de `cardioState.currentRound` (que se queda fijo en `1` para AMRAP porque solo se incrementa en los modos tabata/emom/pyramid). | `src/features/cardio.ts:907-915` | `npx tsc --noEmit` limpio; trazado de todas las lecturas/escrituras de `currentRound` vs `amrapRounds` en el archivo |
| **GAM2-01** | El recálculo completo (`migrateExistingData()`, invocado por el botón "Recalcular XP" vía `reinitGamification()`) ahora suma también XP de racha y de subida de rango, no solo entrenamientos/volumen/PRs. Se añadieron dos funciones de repetición histórica: `calculateRetroactiveStreakXP()` (recorre las fechas únicas del historial cronológicamente y otorga cada milestone de racha —3/7/14/30/60/90— la primera vez que se cruza, igual que hace `claimStreakMilestone()` en vivo) y `calculateRetroactiveRankXP()` (reconstruye los PRs acumulados sesión a sesión en orden cronológico y suma el XP de cada subida de rango detectada con `detectRankChanges()`, igual que `processCompletedSession()` en vivo). `streakData.streakMilestones` ahora se inicializa con los milestones realmente reclamados retroactivamente (antes se dejaba `[]` a propósito, lo que habría permitido re-pagar el mismo milestone en el futuro). | `src/features/gamification/migration.ts:53-172,296-390` | `npx tsc --noEmit` limpio; `npm test` (21/21) sigue en verde; revisión manual de que el recálculo con racha+rango nunca puede dar un total **menor** al que ya tenía el sistema en vivo (antes GAM2-01 podía bajar de nivel al usuario) |
| **GAM2-02** | `migrateExistingData()` acepta ahora un parámetro opcional `existingAchievements`. Si se pasa, cualquier logro que ya estaba `unlockedAt` en el estado previo se preserva (mismo `unlockedAt`, `progress` = máximo entre el anterior y el recalculado) aunque la lógica de recálculo actual (p. ej. racha rota, rango bajado por cambio de peso corporal) ya no lo desbloquearía. `reinitGamification()` e `initGamification()` (rama de migración completa) ahora pasan `getState().achievements` / `existingState.achievements` respectivamente. | `src/features/gamification/migration.ts:53,88-113`; `src/features/gamification/index.ts:141-158` | `npx tsc --noEmit` limpio; `npm test` (21/21) en verde |
| **PROF-01** | Se unificó la fórmula Navy en una única función `calculateNavyBodyFat()` (con manejo explícito del caso "no computable" devolviendo `null`, incluyendo el rango `0 < bodyFat < 60`), usada tanto por el preview en vivo (`calculateBodyFat()`) como por el guardado (`saveMeasurement()`). Antes había dos copias de la fórmula con guards de rango ligeramente distintos (una silenciaba `bodyFat === 0` de forma diferente a la otra), que podían divergir. | `src/features/profile.ts:265-345` | `npx tsc --noEmit` limpio; comparación línea a línea de las dos implementaciones antiguas para confirmar que la fórmula unificada reproduce ambos casos (macho/hembra) |
| **PROF-06** | `calculateBodyFat()` y `saveMeasurement()` ya no usan `profile.gender \|\| 'male'`. Si `profile.gender` no está configurado, el preview muestra `--%` con un mensaje explícito ("Configura tu género en el perfil para estimar la grasa corporal") en vez de calcular con un valor por defecto oculto, y el guardado simplemente no asigna `measurement.bodyFat`. Se añadió `id="bodyFatNote"` al párrafo de ayuda existente en `index.html` para poder alternar el mensaje. | `src/features/profile.ts:277,309-334`; `index.html` (línea del párrafo bajo `bodyFatEstimate`) | `npx tsc --noEmit` limpio; inspección visual del HTML modificado |
| **HIST-02** | La clave de agrupación de filas del CSV al reconstruir sesiones pasó de `fecha\|grupo` a `fecha\|grupo\|volumenTotalSesion` (el CSV exportado repite el volumen total de la sesión original en cada una de sus filas), así que dos sesiones reales distintas del mismo día y grupo muscular ya no se fusionan en una sola (es extremadamente improbable que coincidan exactamente en volumen total). La detección de duplicados contra el historial existente usa la misma clave de tres partes. Además, el volumen total de la sesión reconstruida ahora **siempre** se calcula sumando todas las filas del grupo, en vez de preferir el valor de la primera fila (que subestimaba el total si el agrupado llegaba a mezclar datos). | `src/features/history.ts:342-407` (numeración tras el fix) | `npx tsc --noEmit` limpio; `npm test` (21/21) en verde; trazado manual del caso "dos sesiones de Pecho el mismo día" para confirmar que ya no colisionan |
| **HIST-03** | El parseo de cada fila del CSV ahora valida: nombre de ejercicio no vacío, `sets` entero en `(0, 20]`, `reps` entero en `(0, 100]`, `peso` numérico en `(0, 500]` kg (mismas constantes compartidas que WKT-02: `MAX_REASONABLE_SETS/REPS/PESO`). Las filas que no cumplen se rechazan (no se guardan con valores en cero) y se acumulan en `rejectedDetails` con el número de fila y el motivo. `importFromCSV()` devuelve ahora `{ imported, duplicates, rejected, rejectedDetails }`, y `triggerCSVImport()` muestra un resumen de las primeras filas rechazadas en el `alert()` final. | `src/features/history.ts:293-368,485-508` (numeración tras el fix) | `npx tsc --noEmit` limpio; `npm test` (21/21) en verde |

## 2. Decisiones tomadas que no estaban explícitas en el audit original

1. **CORE-01 — alcance extendido a `confirmRPE`/`skipRPE`.** El hallazgo original solo citaba `saveWorkout()` (líneas 455-473), pero `confirmRPE()` y `skipRPE()` también llaman a `saveCurrentSession()` y, si esta fallaba silenciosamente, procedían a `endSession()` (que borra el draft) y `window.location.reload()` — es decir, habrían destruido la única copia restante de los datos del usuario. Es el mismo bug (guardado fallido silencioso) manifestado en la segunda pantalla del mismo flujo de "terminar entrenamiento", así que se aplicó la misma protección ahí para que el fix cumpla su propósito real (evitar pérdida de datos), no solo silenciar el mensaje de éxito falso.

2. **WKT-02 — mecanismo de "confirmar" elegido: debounce, no un botón nuevo.** El fix pedía "solo al confirmar/guardar el set completo (blur o botón de confirmar)". No existe un botón de confirmación por fila en la UI actual y añadir uno habría sido un cambio de UX fuera de alcance para esta sesión (auditoría, no rediseño). Se optó por un debounce de 1.2s por fila: sigue disparándose en el evento `onchange` existente (que ya es un blur/change nativo), pero solo persiste el PR una vez que el usuario deja de tocar esa fila en concreto, en vez de en cada campo (sets/reps/peso) que toca al tabular. Es reversible y no requiere tocar `components.ts` ni el HTML.

3. **WKT-02 — límites numéricos elegidos arbitrariamente.** El audit pedía "validación básica de rango razonable" sin dar números. Se usó 500 kg como techo de peso (por encima de cualquier récord mundial de powerlifting real, suficiente para filtrar fat-finger typos tipo "9999"), y se reutilizaron los topes que ya existen como atributos `max` en el HTML para sets (20) y reps (100) — así los tres límites quedan centralizados como constantes (`MAX_REASONABLE_*`) en vez de mágicos, y **estas mismas constantes se reutilizaron en HIST-03** para no duplicar la política de rangos razonables en dos sitios.

4. **GAM2-01 — el recálculo retroactivo de racha y de rango es una réplica completa, no una aproximación.** El audit pedía "que sea una función completa, no parcial" sin especificar el método. En vez de estimar el XP de racha/rango a partir del estado final (que habría sido impreciso, porque tanto el streak como los rank-ups dependen de la trayectoria histórica, no solo del estado actual), se implementó una repetición cronológica completa del historial que reproduce exactamente la lógica que ya usa el sistema en vivo (`claimStreakMilestone` y `processCompletedSession`/`detectRankChanges`). Es más código que una aproximación, pero es la única forma de que "Recalcular XP" nunca dé un total menor al que el usuario ya tenía — que es exactamente el bug que había que cerrar.

5. **GAM2-01 — `streakData.streakMilestones` ya no se resetea a `[]` en la migración completa.** Antes se dejaba vacío a propósito ("no reclamar milestones en migración"), lo cual era coherente con no otorgar XP de racha en la migración. Ahora que sí se otorga XP de racha retroactivo, dejar el array vacío habría permitido que el usuario volviera a cobrar el mismo milestone la próxima vez que lo alcance en vivo (doble pago). Se cambió a poblar el array con los milestones que `calculateRetroactiveStreakXP()` determinó como ya reclamados.

6. **PROF-06 — no se tocó `saveProfile()` (formulario principal de perfil) ni la línea 360 de `saveMeasurement()`.** El audit citaba específicamente `profile.ts:280,334` (las dos copias de la fórmula Navy). El formulario principal (`saveProfile()`, línea ~69) y la sincronización de peso dentro de `saveMeasurement()` (línea ~360, que reconstruye un `ProfileData` completo para volver a guardarlo) también hacen `profile.gender || 'male'`, pero ahí el default no alimenta ningún cálculo de grasa corporal — es un valor de relleno para satisfacer el tipo `ProfileData.gender: 'male' | 'female'` (no opcional). Cambiar eso habría significado modificar el tipo `ProfileData` y tocar el formulario principal de perfil, fuera del alcance explícito del hallazgo citado. Se documenta aquí como candidato a revisar en una sesión aparte si se decide hacer `gender` verdaderamente opcional en el modelo de datos.

7. **HIST-02 — no se intentó separar sesiones del mismo día sin usar el volumen total como desambiguador.** El CSV exportado no lleva hora, solo fecha (`toLocaleDateString('es-ES')`), así que no hay forma de distinguir dos sesiones reales del mismo día y grupo muscular usando solo fecha+grupo. Se usó el "Volumen Total Sesión" (columna ya presente en el export, repetida por fila) como tercera parte de la clave de agrupación: es un valor por sesión que casi nunca coincide entre dos sesiones distintas, así que separa correctamente los casos reales sin requerir cambios en el formato de exportación (fuera de alcance).

## 3. Confirmación de build/typecheck

```
$ npx tsc --noEmit
(sin salida — limpio)

$ npm test -- --run
✓ src/tests/calculations.test.ts  (21 tests)
Test Files  1 passed (1)
     Tests  21 passed (21)

$ npm run build
✓ 1594 modules transformed
✓ built in ~8s
PWA v0.17.5 — 26 entries precacheadas
```

Verificado después de cada fix individual (no solo al final) y una vez más tras
completar los 11.

## 4. Limitaciones conocidas de la verificación

- No existe suite de tests de integración para `localStorage` lleno
  (`QuotaExceededError`), flujo de import CSV, ni recálculo de gamificación —
  el único test suite del repo (`calculations.test.ts`, 21 tests) cubre
  funciones puras de cálculo, no estos flujos. La verificación de CORE-01,
  HIST-02, HIST-03, GAM2-01 y GAM2-02 fue por lectura de código y trazado
  manual de los casos descritos en el audit, no por test automatizado. Esto
  es una brecha real: recomendamos añadir tests de integración para estos
  flujos antes o durante el rediseño, ya que son exactamente el tipo de
  lógica que un rediseño con backend real necesitará poder verificar
  automáticamente.
- No se probó la UI en navegador (no se levantó el dev server durante esta
  sesión); toda la verificación fue build + typecheck + test unitario +
  lectura de código.

## 5. Hallazgos nuevos encontrados en el camino (no estaban en FULL_CODEBASE_AUDIT.md)

1. **`confirmRPE()`/`skipRPE()` como segundo punto de pérdida de datos para CORE-01** (ver decisión #1 arriba) — no es un hallazgo nuevo independiente, sino una segunda manifestación del mismo CORE-01 que el audit original no había localizado explícitamente en esas dos funciones.
2. **Posible doble pago de XP de racha antes de este fix** (ver decisión #5): antes de este cambio, cada vez que un usuario pulsaba "Recalcular XP", `streakData.streakMilestones` se reseteaba a `[]` sin otorgar el XP correspondiente — así que la *siguiente* vez que su racha en vivo volviera a cruzar, por ejemplo, el milestone de 7 días, el sistema se lo pagaría de nuevo (porque ya no estaba en la lista de "reclamados"). No estaba lo bastante caracterizado en el audit original como para tener su propio ID; se resolvió como parte de GAM2-01.
3. **`measurement.bodyFat === 0` se guardaba como válido en `saveMeasurement()` antes del fix**: el guard original `if (measurement.bodyFat && (measurement.bodyFat < 0 || measurement.bodyFat > 60))` es falsy para `0`, así que un resultado de exactamente `0%` de grasa corporal (fisiológicamente imposible) se guardaba sin marcarse como inválido. La función unificada `calculateNavyBodyFat()` ahora exige `bodyFat > 0` de forma consistente en ambos sitios, cerrando también este caso.

## 6. Qué queda fuera de esta sesión (recordatorio)

Grupo B (XSS/CSP), Grupo C, y todos los hallazgos de severidad Media/Baja/
Informativo del `FULL_CODEBASE_AUDIT.md` siguen sin tocar, como se pidió.

---

# Grupo B: seguridad (XSS + cabeceras)

Fecha: 2026-08-06
Alcance: los hallazgos del Grupo B de `FULL_CODEBASE_AUDIT.md` ("Requisitos de
seguridad a incorporar en el rediseño desde el día uno"): UI-01, UI-02, GAM2-10,
WKT-10, HIST-01, PWA-01, PWA-02. No se tocó Grupo C ni hallazgos de severidad
Media/Baja fuera de estos IDs. El Grupo A (11 fixes de integridad de datos)
sigue como se documentó arriba, sin cambios adicionales.

## 1. Tabla de cambios

| ID | Qué se cambió | Archivo:línea | Cómo se verificó |
|----|----------------|----------------|-------------------|
| **UI-01** | Se creó una función centralizada `escapeHtml()` (nuevo archivo `src/utils/sanitize.ts`) que escapa `& < > " '`. Se aplicó en **todos** los puntos donde se interpola texto de usuario dentro de `innerHTML` encontrados en el repo (más allá de los ~5 que citaba el audit, ver sección 5 — se hizo un barrido completo, no solo los puntos nombrados): nombre de ejercicio y `data-exercise-name` en `renderExercise()`, nombre de rutina en `renderHistoryItem()`, nombre de ejercicio en `renderPRItem()` (`ui/components.ts`); nombre de rutina personalizada en `renderCustomWorkoutsInHome()`, nombre de ejercicio en `renderExerciseItem()`/`updateSelectedExercisesList()`/`renderCustomExercisesList()` (`main.ts`); nombre de ejercicio en el mensaje de PR del resumen de sesión (`session-summary.ts`, ver GAM2-10 abajo); y **dos puntos que el audit no había citado explícitamente**: el nombre de grupo/rutina en la tarjeta de "entrenamiento en progreso" (draft) y el `insight.message`/`insight.subtext`/`recentPR.exercise` de la tarjeta hero del Home (`ui/navigation.ts`). | `src/utils/sanitize.ts` (nuevo); `src/ui/components.ts:146,161,297,326`; `src/main.ts:338,543,588,804,809-810`; `src/ui/navigation.ts:207,240-241,347` | `npx tsc --noEmit` limpio; barrido con grep de todos los `innerHTML =` del repo (48 sitios) y de todo campo interpolado con `.nombre`/`.grupo`/nombre de usuario, verificando caso por caso si el dato es de usuario o estático/generado (detalle en sección 5) |
| **UI-02** | Los 3 puntos donde `main.ts` interpolaba un nombre de ejercicio escrito por el usuario dentro de un string `onclick="fn('${...}')"` (rompible con una comilla simple) se reemplazaron por atributos `data-*` (ya pasados por `escapeHtml()`) leídos vía `addEventListener` después de `container.innerHTML = html`, siguiendo el mismo patrón que la app ya usaba para `data-guidance-btn`/`data-custom-workout`. Ya no hay ningún nombre de ejercicio ni de rutina interpolado directamente en un string de JavaScript. | `src/main.ts:588-611` (`updateSelectedExercisesList`), `src/main.ts:790-846` (`renderCustomExercisesList`, dos botones: seleccionar y eliminar) | `npx tsc --noEmit` limpio; grep de verificación en sección 2 (no queda ningún `onclick="...${...}"` que interpole un campo de texto libre de usuario) |
| **GAM2-10** | `pr.exercise` (nombre de ejercicio, potencialmente proveniente de un CSV importado de otra persona) ahora pasa por `escapeHtml()` antes de interpolarse en el popup de resumen de XP de la sesión. Mismo patrón de UI-01, misma función centralizada. | `src/ui/gamification/session-summary.ts:109` | `npx tsc --noEmit` limpio |
| **WKT-10** | Mismo hallazgo que UI-01 desde el ángulo de la sesión activa (`renderExercise()` en `ui/components.ts`) — ya cubierto por el fix de UI-01, sin trabajo adicional. | `src/ui/components.ts:146` (mismo cambio que UI-01) | Cubierto por la verificación de UI-01 |
| **HIST-01** | `escapeCSV()` ahora antepone un apóstrofe (`'`) a cualquier valor que empiece con `=`, `+`, `-`, `@`, tab o retorno de carro, **antes** de aplicar el escape de comillas/envoltura existente — mitigación estándar de OWASP contra CSV/Excel Formula Injection. Un nombre de ejercicio como `=HYPERLINK(...)` ahora se exporta como texto plano, no como fórmula ejecutable al abrir el CSV en Excel/Sheets. | `src/features/history.ts:95-109` | `npx tsc --noEmit` limpio; `npm test` (21/21) en verde; revisión manual de que el prefijo se aplica antes del wrap-in-quotes para que ambas protecciones compongan correctamente |
| **PWA-01** | Se añadieron a `netlify.toml` las cabeceras de bajo riesgo pendientes: `Strict-Transport-Security` (HSTS, 1 año + subdominios), `Referrer-Policy: strict-origin-when-cross-origin`, y `Permissions-Policy` desactivando explícitamente cámara/micrófono/geolocalización/pago/USB/sensores de movimiento (APIs que la app confirmadamente no usa, verificado por grep antes de desactivarlas). `X-Content-Type-Options`/`X-Frame-Options` ya existían, sin cambios. | `netlify.toml:25-37` | TOML parseado y validado (`python3 -c "import tomllib; tomllib.load(...)"` sin errores); `npm run build` limpio |
| **PWA-02** | Se añadió `Content-Security-Policy-Report-Only` (no bloqueante) con `script-src 'self'` (sin `'unsafe-inline'`), `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (la app usa 36 atributos `style=""` inline para barras de progreso/colores dinámicos, y carga Google Fonts vía `@import`), `font-src` a `fonts.gstatic.com`, `img-src` incluyendo `raw.githubusercontent.com` (origen real de las imágenes de guía de ejercicios), y el resto de directivas (`connect-src`, `worker-src`, `object-src 'none'`, `frame-ancestors 'none'`, etc.) ajustadas a lo que la app realmente usa hoy. **No se puso en modo bloqueante**: aunque los fixes 1-3 cerraron los `onclick` que sí eran explotables (interpolaban texto de usuario), quedan confirmadas **24 atributos `onclick` en `index.html`** más otros ~48 en los `.ts` (numérico/estático, no explotables, ver sección 2) que romperían la interacción de la app bajo un `script-src 'self'` sin `'unsafe-inline'`. Eliminarlos todos es el refactor grande que el propio audit marca como "decisión de producto" ligada a la migración de UI — fuera de alcance de esta sesión. | `netlify.toml:31-37` | TOML válido; revisión de que el Report-Only no bloquea nada (solo reporta), así que no hay riesgo de romper producción |

## 2. Confirmación de que no quedan `onclick`/similares inline con datos de usuario interpolados

Grep de verificación ejecutado tras los 4 primeros fixes:

```
$ grep -rn 'onclick="[^"]*\${' src/ --include=*.ts

src/ui/components.ts:31   onclick="${onClick}"                                     → parámetro de función (iconButton/buttonPrimary/buttonSecondary);
                                                                                       únicos call-sites reales pasan `window.deleteHistoryItem(${index})`
                                                                                       (índice numérico, no texto de usuario)
src/ui/components.ts:50   onclick="${onClick}"                                     → ídem (buttonSecondary, sin call-sites — código muerto, UI-07)
src/ui/components.ts:75   onclick="${onClick}"                                     → ídem (iconButton)
src/ui/components.ts:130  onclick="window.toggleCompletado(${index})"              → índice numérico
src/features/cardio.ts:78 onclick="window.selectCardioMode('${mode}')"             → `mode: CardioMode`, literal fijo ('tabata'|'emom'|...), nunca texto libre
src/features/profile.ts:466 onclick="window.deleteMeasurementEntry('${m.date}')"   → `date: new Date().toISOString()`, generado por la app, no editable por el usuario
src/main.ts:343           onclick="...deleteCustomWorkout('${workout.id}')"        → `id: \`custom_${Date.now()}\``, generado por la app, no el nombre que el usuario escribió
src/main.ts:539            onclick="window.toggleExerciseSelection('${nombre}', ...)" → renderExerciseItem() solo recibe nombres de `trainingGroups`/`allExercises`
                                                                                       (base de datos estática); los ejercicios personalizados NO pasan por esta función
                                                                                       (usan renderCustomExercisesList(), ya convertido a data-*/addEventListener)
```

Los 8 restantes se revisaron uno por uno y **ninguno interpola texto libre escrito por el usuario** — todos son índices numéricos, valores de un enum fijo, IDs/fechas generados por la app, o nombres que solo pueden venir de la base de datos estática de ejercicios. Los 3 que sí lo hacían (`main.ts:589,789,797` en la numeración pre-fix, citados por UI-02) ya no existen como `onclick` — se convirtieron a `data-*` + `addEventListener`.

También se confirmó que `escapeHtml()` se usa en 5 archivos (`sanitize.ts` mismo, `components.ts`, `main.ts`, `navigation.ts`, `session-summary.ts`) y que no quedó ningún `innerHTML` de los 48 sitios del repo interpolando `.nombre`/`.grupo`/nombre de rutina sin pasar por ella (barrido completo documentado en la sección 5).

## 3. Estado de la CSP: Report-Only, no bloqueante

Se dejó en modo **Report-Only** (`Content-Security-Policy-Report-Only`, no
`Content-Security-Policy`) porque, aun después de cerrar los vectores de XSS
reales (fixes 1-3), la app sigue usando `onclick` inline en:

- **24 atributos** en `index.html` (botones de navegación, guardar, timer, etc. — todos llaman funciones sin argumentos o con literales fijos)
- **~48 más** repartidos en `.ts` (`cardio.ts`: 37, `components.ts`: 4, `navigation.ts`: 3, `main.ts`: 2, `profile.ts`: 1, `modals.ts`: 1) — todos confirmados no explotables (sección 2), pero un `script-src 'self'` sin `'unsafe-inline'` los bloquearía a todos por igual, sean o no seguros, rompiendo el guardado de entrenamientos, el timer, cardio, y la navegación completa.

Eliminar la totalidad de esos `onclick` (no solo los explotables) es exactamente
el "refactor grande / decisión de producto" que `PWA-02` describe — ligado a la
migración de la UI a un framework con event binding nativo (React/Svelte), no a
esta sesión de seguridad puntual. El modo Report-Only permite:
1. Confirmar en producción (vía la consola del navegador o un endpoint de
   reporte, si se configura `report-to`/`report-uri` más adelante) que la
   política propuesta es correcta antes de activarla.
2. Servir de especificación exacta para el equipo que haga el rediseño de UI:
   el día que se elimine el último `onclick` inline, cambiar
   `Content-Security-Policy-Report-Only` a `Content-Security-Policy` en
   `netlify.toml` activa la protección sin tocar nada más.

## 4. Confirmación de build/typecheck/test

```
$ npx tsc --noEmit
(sin salida — limpio)

$ npm test -- --run
✓ src/tests/calculations.test.ts  (21 tests)
Test Files  1 passed (1)
     Tests  21 passed (21)

$ npm run build
✓ 1594 modules transformed
✓ built in ~8s
PWA v0.17.5 — 26 entries precacheadas

$ python3 -c "import tomllib; tomllib.load(open('netlify.toml','rb'))"
TOML OK
```

## 5. Decisiones tomadas que no estaban explícitas en el fix original

1. **UI-01 se aplicó en más puntos de los que el audit citó explícitamente.**
   El audit decía "al menos 5 puntos" y listaba `renderExercise`,
   `renderHistoryItem`, `renderCustomWorkoutsInHome`, listas del Workout
   Builder. Se hizo un barrido completo de los 48 `innerHTML =` del repo
   buscando cualquier campo `.nombre`/`.grupo`/nombre de usuario sin escapar,
   y se encontraron **dos puntos adicionales no citados**: `renderPRItem()`
   (nombre de ejercicio en la lista de PRs) y, más importante, la tarjeta
   "Entrenamiento en progreso" (`draft.grupo`) y la tarjeta hero de Home
   (`insight.message`/`insight.subtext`/`recentPR.exercise` en
   `ui/navigation.ts`) — esta última se dispara automáticamente cada vez que
   el usuario abre la app con un draft pendiente o un insight generado, sin
   ninguna acción explícita, por lo que es una superficie de ataque más
   directa que varias de las citadas originalmente. Se documentan en la
   sección 5 del reporte porque el mandato explícito era "aplicarla en TODOS
   los puntos", no solo los nombrados.

2. **Se revisó `coach.ts` e `insights.ts` y se decidió NO tocarlos.**
   Ambos interpolan `ejercicio.nombre` sin escapar en sus strings de
   `message`, pero esos strings se asignan con `element.textContent = ...`
   (no `innerHTML`) en el único lugar donde se renderizan
   (`coach.ts:329-338`) — `textContent` no interpreta HTML, así que no hay
   vector ahí pese a la interpolación sin escapar. Se decidió no envolver
   estos casos en `escapeHtml()` innecesariamente (produciría entidades
   `&amp;`/`&#39;` visibles como texto literal en la UI, un bug cosmético
   nuevo) — la mitigación correcta ya existe (`textContent`), solo se
   documenta aquí para que quede constancia de que se revisó y no es un
   punto pendiente.

3. **`renderExerciseItem()` (`main.ts`, antes línea 538) no se convirtió a
   `addEventListener` pese a tener el mismo patrón `onclick="fn('${nombre}')"`
   que UI-02.** Se verificó que sus únicos llamadores (`renderExerciseGroups()`)
   solo le pasan nombres de `trainingGroups`/`allExercises`, ambos arrays
   estáticos hardcodeados en el repo — nunca ejercicios personalizados
   (esos se renderizan aparte, en `renderCustomExercisesList()`, que sí se
   convirtió). No es explotable hoy. Se dejó como `onclick` para no exceder
   el alcance ("no refactorices más allá de lo necesario"); si en el futuro
   esta función empieza a recibir nombres de ejercicios personalizados,
   deberá convertirse con el mismo patrón.

4. **`deleteCustomWorkout('${workout.id}')` (`main.ts:343`) tampoco se
   convirtió.** `workout.id` se genera siempre como `` `custom_${Date.now()}` ``
   (`main.ts`, `saveCustomWorkout()`), nunca a partir de texto que el usuario
   escriba — no es el vector que UI-02 describe (que es específicamente sobre
   el *nombre*, no el id). Revisado y confirmado seguro.

5. **Permissions-Policy: se verificó con grep que la app no usa cámara,
   micrófono, geolocalización, pagos, USB ni sensores de movimiento antes de
   desactivar esas APIs.** Si el futuro AI Coach o alguna función de
   redespecializado más adelante necesitara alguna de ellas, esta cabecera
   tendría que revisarse — se deja documentado aquí explícitamente para que
   no se olvide en el rediseño.

6. **CSP con `style-src 'unsafe-inline'` explícito, en vez de intentar
   eliminar los estilos inline en esta sesión.** Hay 36 atributos
   `style="..."` inline (mayormente anchos de barra de progreso y colores
   dinámicos en `ui/gamification/gamification-ui.ts`). Migrarlos a clases
   CSS o a `style.setProperty()` vía JS (que si sería compatible con una CSP
   estricta) es un refactor de UI no relacionado con el vector de XSS que
   esta sesión debía cerrar — se deja fuera, documentado, y `'unsafe-inline'`
   en `style-src` es de severidad mucho menor que en `script-src` (no permite
   ejecución de JavaScript).

## 6. Qué queda fuera de esta sesión (recordatorio)

Grupo C y todos los hallazgos de severidad Media/Baja/Informativo del
`FULL_CODEBASE_AUDIT.md` siguen sin tocar. Dentro del propio Grupo B, la
eliminación completa de `onclick` inline (para poder pasar la CSP a modo
bloqueante) y la migración de estilos inline a clases CSS quedan explícitamente
para la sesión de rediseño de UI, como anticipaba `PWA-02` en el audit
original.
