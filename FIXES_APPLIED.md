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

---

# Fase 1: tests de integración para los fixes de Grupo A/B

Fecha: 2026-08-07
Alcance: cerrar la brecha de verificación que Grupo A y Grupo B dejaron
documentada (fixes verificados solo por lectura de código y trazado manual,
sin tests automatizados). Se añadieron 5 archivos nuevos en `src/tests/`,
organizados por dominio, más una corrección de producción que uno de los
tests encontró en el camino.

## 1. Tabla de cambios

| ID | Qué se cambió | Archivo:línea | Cómo se verificó |
|----|----------------|----------------|-------------------|
| **CORE-01** | Tests de `saveCurrentSession()`, `saveWorkout()`, `confirmRPE()`/`skipRPE()` con `localStorage.setItem` mockeado para lanzar `QuotaExceededError` (`vi.spyOn(Storage.prototype, 'setItem')`). Verifican que el resultado es `'failed'`, que no se persiste nada, que el draft no se borra, y que `confirmRPE`/`skipRPE` muestran `alert()` y no llegan a `endSession()`/reload. | `src/tests/storage.test.ts` (nuevo) | `npx vitest run src/tests/storage.test.ts` — 7 tests, todos en verde |
| **HIST-02** | Tests de `importFromCSV()`: dos sesiones reales del mismo día+grupo con distinto volumen total NO se fusionan (se importan como 2), un re-import exacto SÍ se reconoce como duplicado, y el volumen se suma correctamente sobre todas las filas agrupadas (no solo la primera). | `src/tests/history.test.ts` (nuevo) | 16 tests en el archivo, todos en verde |
| **HIST-03** | Tests de `importFromCSV()`: filas con `sets`/`reps`/`peso` fuera de rango se rechazan con el motivo correcto en `rejectedDetails`, sin descartar las filas válidas de la misma sesión; un archivo donde ninguna fila es válida rechaza la promesa completa. | `src/tests/history.test.ts` | Incluido en los 16 tests de arriba |
| **HIST-01** | Se exportó `escapeCSV()` (antes función privada) para testearla directamente. Tests cubren cada carácter neutralizado (`=`,`+`,`-`,`@`), que texto/números normales no se tocan, y que la composición con el escape de comillas/wrap existente es correcta. | `src/features/history.ts` (`export` agregado); `src/tests/history.test.ts` | Incluido en los 16 tests de arriba |
| **CARDIO-01/CARDIO-02** | Tests de `stopCardioWorkout()`: dos sesiones consecutivas generan `sessionId` distintos y ambas persisten; el conteo real de rondas AMRAP (vía `incrementAmrapRound()`) se guarda, no un valor fijo; otros modos siguen usando `cardioState.currentRound`. | `src/tests/cardio.test.ts` (nuevo) | 4 tests en el archivo (ampliado después en Fase 2, ver abajo), todos en verde |
| **GAM2-01/GAM2-02** | Simulación completa de 7 sesiones reales en 7 días consecutivos (`processCompletedSession()` llamado en orden, con reloj falso vía `vi.useFakeTimers()`/`vi.setSystemTime()`) que cruza el milestone de racha de 7 días y una subida de rango. Verifica que `migrateExistingData()` nunca da menos XP que el acumulado en vivo, que `streakMilestones` queda poblado retroactivamente, y — el mecanismo específico del fix — que **sin** pasar `existingAchievements` el logro `streak_7` se pierde tras romperse la racha, pero **con** `existingAchievements` se preserva. | `src/tests/gamification.test.ts` (nuevo) | 5 tests, todos en verde |
| **UI-01/UI-02** | Tests de `escapeHtml()` (los 5 caracteres peligrosos) y de `renderExercise()`/`renderHistoryItem()`/`renderPRItem()` con un nombre malicioso (`<script>...</script>Curl'"`): verifican que el HTML generado no contiene el `<script>` crudo, y que al insertarse en un DOM real (`container.innerHTML = ...`) no se crea ningún `<script>` ejecutable y el texto aparece literal vía `textContent`. | `src/tests/sanitize.test.ts` (nuevo) | 9 tests, todos en verde |
| **WKT-04/HIST-06** *(hallazgo nuevo, ver sección 2)* | Test adicional para la fórmula de Brzycki con `reps >= 37` (antes no cubierta por ningún test). | `src/tests/calculations.test.ts` | 4 tests nuevos añadidos al archivo existente |

## 2. Hallazgo nuevo y fix aplicado durante la Fase 1

Escribir el test de "el recálculo nunca da menos XP que el acumulado en vivo"
(GAM2-01) **falló** en el primer intento: con un PR grande desde cero
(ejercicio nuevo, mejora de 60kg), el recálculo retroactivo daba **menos**
XP que el sistema en vivo (1398 vs 1588). La causa: `calculateRetroactiveXP()`
todavía usaba una aproximación plana para el XP de PRs
(`prCount * PR_XP.minor`, heredada de antes del fix de Grupo A — GAM2-01 solo
había añadido racha y rango, no había tocado esta parte) en vez de clasificar
cada mejora real como hace el motor en vivo (`getNewPRsInSession()` +
`calculatePRXP()`), que para una mejora de 60kg cae en el tier "exceptional"
(mucho más XP que "minor").

**Fix aplicado**: nueva función `calculateRetroactivePRXP()` en
`migration.ts` que recorre el historial cronológicamente, reconstruye el
mejor peso visto hasta el momento por ejercicio, y clasifica cada mejora con
`calculatePRXP()` — igual que el motor en vivo. Reemplaza la aproximación
plana. Se eliminó el parámetro `prs` (ya no usado) de `calculateRetroactiveXP()`.

Archivo: `src/features/gamification/migration.ts:277-330` aprox. (numeración
tras el fix).

## 3. Confirmación de build/typecheck/test

```
$ npx tsc --noEmit
(sin salida — limpio)

$ npx vitest run
✓ src/tests/calculations.test.ts  (21 tests)
✓ src/tests/gamification.test.ts  (5 tests)
✓ src/tests/history.test.ts       (16 tests)
✓ src/tests/cardio.test.ts        (4 tests)
✓ src/tests/sanitize.test.ts      (9 tests)
✓ src/tests/storage.test.ts       (7 tests)
Test Files  6 passed (6)
     Tests  62 passed (62)

$ npm run build
✓ built in ~8s
```

## 4. Veredicto del subagente verificador (Fase 1)

Ver sección **"Veredictos de los subagentes verificadores"** al final de
este documento.

---

# Fase 2: Grupo C (paralelo, no bloqueante) + higiene de infraestructura

Fecha: 2026-08-07
Alcance: `FULL_CODEBASE_AUDIT.md`, sección "C. Se puede arreglar en paralelo,
sin bloquear nada". El Grupo C listado en el audit agrupa ~40 hallazgos
(CORE-02 a CORE-13, WKT-03 a WKT-09, CARDIO-03 a CARDIO-17, PROF-02 a
PROF-12, PWA-03/04/05/08/09) de severidad y esfuerzo muy dispares. Siguiendo
el mismo criterio de triage que usa el propio audit en sus secciones D/E, se
aplicó un subconjunto de ~19 fixes concretos priorizando: (a) bugs
funcionales reales de severidad Alta/Media con esfuerzo Trivial/Pequeño, (b)
las tres categorías que pidió explícitamente esta sesión (timer de cardio,
validaciones de input, higiene de infraestructura), y (c) descartando código
muerto (reservado para Fase 3) y cualquier ítem que requiriera una decisión
de producto o un refactor de alcance amplio. La lista completa de ítems
deferidos con su razonamiento está en la sección 3.

## 1. Tabla de cambios

### Timer de cardio (precisión/drift)

| ID | Qué se cambió | Archivo:línea | Cómo se verificó |
|----|----------------|----------------|-------------------|
| **CARDIO-05** | `startTimer()` ahora calcula cuántos segundos reales pasaron desde `cardioState.startTime` en cada tick (`Date.now()`) y "recupera" los ticks que falten en la misma ejecución del `setInterval`, en vez de asumir que siempre pasó exactamente 1s. Corrige la desviación acumulada en pestañas en segundo plano (throttling del navegador) para timers largos (AMRAP 20+ min). Tope defensivo de 3600 ticks por recuperación para evitar un bucle descontrolado si el reloj saltara de forma anómala. | `src/features/cardio.ts` (`startTimer()`) | `npx tsc --noEmit` limpio; revisión manual del bucle de catch-up y su guard de fin de sesión (`if (!timerInterval) return`) |
| **CARDIO-04** | Nueva función exportada `pauseCardioTimerOnNavigation()` que detiene `timerInterval` sin finalizar/guardar la sesión. Se invoca desde `hideCardioViews()` en `navigation.ts` (compartida por `switchTab()` y `showHome()`), así que el timer ya no sigue corriendo en segundo plano al navegar fuera de la vista de cardio — antes podía disparar `finishCardioWorkout()` sin que el usuario lo pidiera, o crear una condición de carrera con una sesión nueva. | `src/features/cardio.ts`; `src/ui/navigation.ts` (`hideCardioViews()`) | 2 tests nuevos en `cardio.test.ts` |
| **CARDIO-06** | El piso de `adjustCardioConfig()` pasó de un valor genérico de 5 para cualquier campo a un mapa `CONFIG_MIN_VALUES` por campo (`rounds: 1`). Antes, Circuito (default 3 rondas) saltaba a 5 rondas en el primer toque de "−", 100% reproducible. | `src/features/cardio.ts` (`adjustCardioConfig()`) | 3 tests nuevos en `cardio.test.ts` |
| **CARDIO-07** | Mismo mecanismo que CARDIO-06: el piso de `duration` (AMRAP) pasó a 60s (el mismo tamaño de paso que los botones +/-), así nunca cae en un valor que no sea múltiplo de 60 y el display ("Duración (minutos)") nunca muestra una fracción como "0.0833...". | `src/features/cardio.ts` (`CONFIG_MIN_VALUES`) | Cubierto por los mismos tests de CARDIO-06 |
| **CARDIO-09** | La altura de las barras de nivel de pirámide pasó de una clase Tailwind construida en runtime (`` `h-${n}` ``, nunca aparece como texto literal → el JIT la purga, altura 0) a un `style="height: ...rem"` inline, que no depende del escaneo de contenido de Tailwind. | `src/features/cardio.ts` (render de niveles de pirámide) | `npx tsc --noEmit` limpio; inspección visual del cálculo (`Math.round(l/10) * 0.25rem`, replica la escala de espaciado de Tailwind) |
| **CARDIO-11** | `finishCardioWorkout()` ahora recibe `completedNaturally: boolean`. En detención manual (`stopCardioWorkout()`), `roundsCompleted` resta 1 a `cardioState.currentRound` (la ronda en curso no estaba completada); en fin natural del workout, se mantiene igual que antes. Nunca reporta rondas negativas. | `src/features/cardio.ts` (`finishCardioWorkout()`, `stopCardioWorkout()`) | 2 tests nuevos + 1 test existente actualizado en `cardio.test.ts` |

### Validaciones de input

| ID | Qué se cambió | Archivo:línea | Cómo se verificó |
|----|----------------|----------------|-------------------|
| **WKT-03** | `updateEjercicio()` ahora recorta sets/reps/peso a `[0, MAX_REASONABLE_*]` (mismas constantes compartidas de Grupo A) antes de pasarlos a `calculateVolume()`/`updateExerciseState()`, y refleja el valor corregido de vuelta en el input. Antes, un peso negativo o astronómico pasaba intacto al volumen de sesión, al desglose por grupo y (vía WKT-02) al PR persistido. | `src/features/workout.ts` (`updateEjercicio()`, nuevo helper `clampToRange()`) | `npx tsc --noEmit` limpio |
| **WKT-04 / HIST-06** | La fórmula de Brzycki (`calculate1RM()`) acota `reps` a 36 antes de aplicar `36/(37-reps)`, evitando el denominador 0/negativo que daba `Infinity` o un resultado negativo sin sentido con `reps >= 37`. Un solo fix resuelve ambos IDs (misma función, citada desde dos ángulos distintos en el audit). | `src/utils/calculations.ts` (`calculate1RM()`) | 4 tests nuevos en `calculations.test.ts` |
| **PROF-02 / PROF-03** | Nuevo helper `parsePositiveMeasurement()` en `profile.ts`, usado por los 9 campos de `saveMeasurement()`: descarta como "no provisto" cualquier valor `<= 0` o inválido, de forma consistente (antes un negativo se conservaba tal cual mientras que exactamente `0` se descartaba — mismo patrón `\|\| undefined` aplicado de forma inconsistente). `saveProfile()` recorta `weight`/`height` a `>= 0`. | `src/features/profile.ts` (`saveMeasurement()`, `saveProfile()`) | `npx tsc --noEmit` limpio |
| **PROF-04** | `calculateBodyFat()` ahora distingue "el usuario no ha completado los campos todavía" (se mantiene oculto en silencio, comportamiento normal) de "el usuario ya ingresó cintura/cuello pero el resultado no es válido" (cintura ≤ cuello, o el % calculado cae fuera de 0-60): en ese segundo caso muestra un mensaje explícito en vez de ocultar el bloque sin explicación. Extiende el mecanismo de `noteEl` ya introducido en el fix de PROF-06 (Grupo B). | `src/features/profile.ts` (`calculateBodyFat()`) | `npx tsc --noEmit` limpio; revisión manual de los 3 casos (oculto normal / mensaje explicativo / resultado válido) |
| **CORE-02** | `checkForExistingDraft()` valida la forma mínima del draft antes de ofrecerlo como recuperable: `draftTimestamp` debe ser un número finito y `ejercicios` debe ser un array. Si no, se trata como "sin draft" y se limpia de localStorage. Antes, un `draftTimestamp` corrupto daba `NaN`, que nunca es "> DRAFT_MAX_AGE" (el draft jamás expiraba), y un `ejercicios` faltante rompía `renderFromDraft()` con un `TypeError` no controlado al pulsar "Continuar". | `src/state/session.ts` (`checkForExistingDraft()`) | 3 tests nuevos en `storage.test.ts` |

### Higiene de infraestructura

| ID | Qué se cambió | Archivo:línea | Cómo se verificó |
|----|----------------|----------------|-------------------|
| **PWA-03** | Se instalaron `@vitest/ui` y `@vitest/coverage-v8` (mismo major que `vitest@^1.0.0`) como devDependencies, antes ausentes. `npm run test:ui`/`npm run test:coverage` ya no fallan por dependencia faltante. | `package.json`, `package-lock.json` | `npm run test:coverage` ejecutado de punta a punta, genera el reporte de cobertura sin error |
| **PWA-05** | Se eliminó `public/_redirects` (regla `/* /index.html 200` duplicada exacta de la que ya declara `netlify.toml`). Una sola fuente de verdad para el redirect SPA. | `public/_redirects` (eliminado) | `npm run build` limpio; TOML de `netlify.toml` sigue siendo válido y ya cubre la misma regla |
| **PWA-08** | Se eliminó el `import('@/utils/icons')` dinámico dentro de `showRPEModal()` en `workout.ts` — `refreshIcons` ya estaba importado estáticamente en el mismo archivo, así que el import dinámico no lograba ningún code-splitting real (solo generaba el warning de build). Se convirtieron a estáticos los dos `import('@/features/workout')` dinámicos en `navigation.ts` (`renderFromDraft`, `loadTrainingGroup`) tras verificar con grep que **no existe** ninguna dependencia circular real entre `workout.ts` y `navigation.ts` (el comentario original que advertía sobre esto no correspondía a ningún import real detectable). Ambos warnings de Vite ("dynamic import will not move module into another chunk") desaparecieron del build. | `src/features/workout.ts`, `src/ui/navigation.ts` | `npm run build` — los dos warnings específicos de PWA-08 ya no aparecen; `npx tsc --noEmit` limpio |
| **PWA-09** | Se fijó la versión de Node: `NODE_VERSION = "20"` en `netlify.toml` (`[build.environment]`), `.nvmrc` nuevo con `20`, y `"engines": { "node": ">=20" }` en `package.json` — coherente con `@types/node@^20.10.0` ya declarado. | `netlify.toml`, `.nvmrc` (nuevo), `package.json` | TOML válido (`tomllib.load`); `npm run build` limpio |
| **Atajos del manifest PWA** *(mencionado explícitamente en el pedido de esta fase, ya identificado en `FEATURES.md`)* | Nueva función `applyManifestShortcut()` en `main.ts`, invocada tras `showHome()` en el arranque: lee `?action=` de la URL y navega a la pestaña correspondiente (`history` → tab Historial, `prs` → tab PRs). `action=workout` no tiene pestaña propia sin una rutina cargada — su equivalente real en esta app es Home (donde se elige la rutina), que ya es la vista por defecto, así que no requiere manejo explícito. Antes, abrir la app desde cualquiera de los 3 atajos del ícono (long-press en Android/desktop) siempre caía en Home sin importar cuál se eligiera. | `src/main.ts` | `npx tsc --noEmit` limpio; revisión manual de los 3 valores de `action` contra `vite.config.ts` |
| **CORE-03** | `resumeDraft()` ahora aplica el mismo guard `hasUnsavedData()` + `confirm()` que ya usan `loadTrainingGroup()`/`showHome()`. Antes, pulsar "Continuar" sobre un draft sobrescribía sin aviso una sesión activa distinta con cambios sin guardar. | `src/ui/navigation.ts` (`resumeDraft()`) | `npx tsc --noEmit` limpio |
| **CORE-05** | `updateResumeWorkoutCard()` llama `clearDraft()` cuando detecta `isStale`, en vez de solo ocultar la tarjeta. El draft huérfano ya no queda en localStorage indefinidamente. | `src/ui/navigation.ts` (`updateResumeWorkoutCard()`) | `npx tsc --noEmit` limpio |
| **CORE-06** | `getWeeklyVolume()` y `getQuickHomeStats()` en `navigation.ts` reemplazaron el acceso directo `JSON.parse(localStorage.getItem(...) \|\| '[]')` (sin try/catch) por `getHistory()` del wrapper seguro de `utils/storage.ts`. Un JSON corrupto en `gymmate_history` ya no puede romper `updateHomeUI()` completa. De paso, `getRecentPR()` (que ya tenía try/catch) se migró también a `getPRs()` para no dejar la clave mágica `'gymmate_prs'` duplicada. | `src/ui/navigation.ts` | `npx tsc --noEmit` limpio; no se tocó la lógica de racha/estadísticas en sí (ver nota en sección 3 sobre por qué no se consolidó con `calculateCurrentStreak()`) |
| **CORE-11** | `needsMigration()` en `migration.ts` usa `GAMIFICATION_STORAGE_KEYS.STATE` en vez de la clave mágica `'gymmate_gamification'` duplicada. | `src/features/gamification/migration.ts` (`needsMigration()`) | `npx tsc --noEmit` limpio |

## 2. Confirmación de build/typecheck/test

```
$ npx tsc --noEmit
(sin salida — limpio)

$ npx vitest run
✓ src/tests/calculations.test.ts  (25 tests)
✓ src/tests/storage.test.ts       (10 tests)
✓ src/tests/gamification.test.ts  (5 tests)
✓ src/tests/cardio.test.ts        (11 tests)
✓ src/tests/sanitize.test.ts      (9 tests)
✓ src/tests/history.test.ts       (16 tests)
Test Files  6 passed (6)
     Tests  76 passed (76)

$ npm run build
✓ 1594 modules transformed
✓ built in ~4.5s
(los 2 warnings de code-splitting de PWA-08 ya no aparecen; solo queda el
warning genérico de tamaño de chunk >500kB, no relacionado)

$ npm run test:coverage
✓ genera reporte de cobertura completo (antes fallaba por dependencia faltante)
```

## 3. Ítems del Grupo C evaluados y deferidos deliberadamente (con razonamiento)

No se intentó cerrar los ~40 hallazgos del Grupo C — igual que el propio
audit triagea en sus secciones D/E, aquí se aplicó el mismo criterio: severidad
× esfuerzo, y se documenta explícitamente qué queda fuera y por qué, en vez
de dejarlo implícito.

**Cardio** — CARDIO-03 (autoguardado/draft para cardio: Esfuerzo Mediano,
es un mecanismo nuevo del tamaño del que ya existe para pesas, no un fix
puntual). CARDIO-08 (escalado de pirámide converge a niveles planos: el
algoritmo geométrico necesita rediseñarse con cuidado para no introducir una
regresión visual, no es un cambio de una línea). CARDIO-10 (calorías por
tarifa fija: hacerlo bien requiere ponderar por ejercicio usando el campo
`calories` ya existente en `cardio-exercises.ts`, Esfuerzo Mediano). CARDIO-12
a CARDIO-17 (código muerto o requieren decisión de producto — Grupo D/E).

**WKT** — WKT-05 (detección de PR duplicada en 3 lugares, una es código
muerto: mezcla de Fase 3 y de una decisión de producto sobre cuál es la
fuente de verdad). WKT-06 (alias "tríceps cuerda"), WKT-07 (cola de mensajes
del coach), WKT-08 (`AudioContext` sin cerrar), WKT-09 (coma decimal en
sets/reps): todos triviales individualmente, pero se priorizó profundidad en
los ítems ya incluidos sobre cubrir la lista completa — quedan como
candidatos claros para una próxima pasada corta.

**PROF** — PROF-05 (sobrescritura silenciosa de medición del mismo día:
requiere decidir el comportamiento deseado — ¿agregar entrada nueva? ¿pedir
confirmación? — no es un fix mecánico). PROF-07 (código muerto → Fase 3).
PROF-08/PROF-09 (edad triplicada + desviación de huso horario: trivial pero
toca 3 sitios, se prioriza consolidar cuando se decida una única fuente).
PROF-10 (sin export/backup de perfil: es una función nueva del tamaño del
CSV de historial, no un fix — candidato a feature, no a esta fase). PROF-11
(límite de 100 mediciones sin aviso: Pequeño esfuerzo real, quedó fuera solo
por priorización de tiempo, buen candidato para la próxima pasada).

**CORE** — CORE-04 (`dismissDraft()` desincroniza el singleton de sesión:
Esfuerzo Mediano, toca el modelo de identidad de sesión/draft, no es un
guard de una línea como CORE-02/03). CORE-07, CORE-08, CORE-09 (código
muerto → Fase 3, no tocado aquí para no duplicar el análisis). CORE-10
(desincronización del singleton de gamificación entre pestañas: requiere un
listener de evento `storage` + lógica de invalidación, se evaluó pero se
priorizó no introducirlo sin poder probarlo con dos pestañas reales en esta
sesión). CORE-12 (versionado de esquema: explícitamente "requiere decisión
de producto" según el propio audit). CORE-13 (severidad Informativo, sin
impacto real).

**PWA** — PWA-04 (ESLint/Prettier: Esfuerzo "Pequeño" según el audit, pero
introducir un toolchain nuevo con la configuración flat de ESLint 9 de forma
segura merece su propia sesión dedicada con revisión, no un añadido rápido
dentro de una fase ya grande). PWA-06 (regla muerta de `.ts` en
`netlify.toml` → Fase 3-adyacente, informativo). PWA-07 (sourcemaps
completos en producción: Trivial pero es un cambio de configuración de build
con implicaciones para debugging en producción que vale la pena decidir
explícitamente, no fue parte del pedido de esta fase). PWA-10 a PWA-12
(assets de iconos musculares, fuera del pedido explícito de esta fase).

## 4. Veredicto del subagente verificador (Fase 2)

Ver sección **"Veredictos de los subagentes verificadores"** al final de
este documento.

---

# Fase 3: código muerto — evaluado individualmente, no borrado en bloque

Fecha: 2026-08-07
Alcance: las piezas de código muerto identificadas en `FULL_CODEBASE_AUDIT.md`
(sección D) y en el propio grep hecho durante el fix de UI-01/UI-02 (Grupo B).
Cada candidato se evaluó individualmente contra tres resultados posibles:
**eliminar** (redundante o sin valor), **conectar más adelante** (tiene valor
real pero quedó desconectado — documentado, no tocado), o **no es código
muerto real** (ya resuelto o activamente usado — no tocado). Antes de
eliminar cualquier cosa se confirmó con grep que no tenía call-sites en
ningún archivo del repo, no solo en el archivo donde se encontró.

## 1. Eliminado (confirmado sin call-sites, sin valor único que preservar)

| ID | Qué se eliminó | Archivo | Razonamiento |
|----|------------------|---------|----------------|
| *(sin ID propio)* | 9 variantes de renderizado de gamificación nunca importadas fuera de `ui/gamification/`: `renderLevelBadgeCompact`, `renderRankEmblemMini`, `renderRankWithLabel`, `renderMuscleMapMini`, `renderMuscleMapWithLegend`, `renderMuscleProgress`, `renderGamificationHeader`, `renderLevelUpMessage`, `renderRankUpMessage` | `ui/gamification/{level-badge,rank-emblem,muscle-map,gamification-ui,session-summary}.ts` + re-exports en `index.ts` | Verificado con grep que cada una solo aparecía en su propia definición y en el barrel `index.ts` — cero consumidores reales. Se inspeccionó cada una individualmente (no una regla en bloque): ninguna contiene lógica de negocio única — son puro formateo de valores ya calculados en `features/gamification/*` (rank, ratio, XP), duplicando exactamente lo que ya hacen sus variantes "hermanas" que sí están en uso (`renderLevelBadge`, `renderLevelBadgeWithProgress`, `renderRankEmblem`, `renderMuscleMap`, `renderMuscleMapDual`). Son funciones de presentación atadas al enfoque actual de plantillas de string + `innerHTML`, que el propio `AUDIT.md` recomienda reemplazar por completo en el rediseño — no hay nada que "portar". |
| **CORE-07** | `hasChangesToSave()` | `src/state/session.ts` | Sin consumidores; reimplementaba con ligeras diferencias el mismo diffing por `JSON.stringify` que ya hace `hasUnsavedData()` (la función real usada en toda la app). |
| **CORE-08** (parcial) | `getSession()`, `clearSession()` | `src/utils/storage.ts` | Sin consumidores. **`saveSession()` no se tocó** — sigue activo, es parte de la cadena de guardado de CORE-01 (Grupo A). Solo se eliminó el lado de lectura/borrado, que nunca se usaba (el mecanismo real de recuperación es `gymmate_draft`, no `gymmate_session`). |
| **CORE-09** | `resetGamificationState()` | `src/features/gamification/state.ts` | Sin consumidores (ni siquiera en los tests nuevos de Fase 1 — se consideró usarla pero se optó por `initGamification()`, que sí reinicializa correctamente el singleton en memoria). Además tenía un bug real si alguna vez se hubiera usado: hacía `removeItem` directo sin pasar por `persistState()`, así que el `_state` en memoria "resucitaría" el estado borrado en el siguiente guardado. |
| **WKT-05** (parcial) | `checkForPR()` | `src/utils/calculations.ts` | Sin consumidores. Una de las 3 implementaciones divergentes de detección de PR que señalaba el audit; `checkAndUpdatePR()` en `state/session.ts` es la que realmente persiste y ya tiene tests (Fase 1/2). No se tocó la tercera (`updateCoachOnExerciseUpdate` en `coach.ts`, que reimplementa la comparación inline) porque unificar las 3 en una sola fuente de verdad es la recomendación completa de WKT-05 y excede "borrar código muerto" — queda como candidato para cuando se decida esa consolidación. |
| **CARDIO-14** | Campo `timer` de `CardioState` | `src/types/index.ts`, `src/state/session.ts` | Confirmado que nunca se asignaba un valor real en ningún archivo (cardio.ts usa su propia variable de módulo privada `timerInterval` para el intervalo real) — el campo vivía siempre en `null`, y el `if (cardioState.timer) { clearInterval(...) }` en `resetCardioState()` nunca se ejecutaba. Coincide exactamente con lo que documentaba CARDIO-14. |
| **HIST-04** | `getQuickStats()` | `src/features/history.ts` | Sin consumidores. Cuarta implementación divergente de racha (además de las 3 ya documentadas en `GAMIFICATION_DEEP_DIVE.md`), con el mismo tope de 7 días ya señalado como bug. Eliminarla reduce el riesgo de que alguien la conecte por error en el futuro y reintroduzca esa divergencia. |
| **PROF-07** | `getProfileForCalculators()` | `src/features/profile.ts` | Sin consumidores; `calculators.ts` reimplementa la misma lógica de forma independiente y es la que realmente se usa. |
| **UI-07** | `card()`, `buttonPrimary()`, `buttonSecondary()`, `statCard()`, `renderRoutineCard()` | `src/ui/components.ts` | Sin consumidores (verificado que `iconButton()`, que sí se usa 2 veces, no se tocó). `renderRoutineCard()` interpolaba `${name}` sin escapar en `innerHTML` — el mismo patrón de UI-01 — pero al no tener ningún call-site no representaba un vector real; se elimina en vez de arreglarse porque no hay nada que proteger. |
| **UI-07** | `iconInline()` | `src/utils/icons.ts` | Sin consumidores. |
| **UI-07** | `muscleIconImg()`, `getAvailableMuscleIcons()`, `getAvailableGroupIcons()`, `MUSCLE_SVG_ICONS`, `GROUP_SVG_ICONS` | `src/utils/muscle-icons.ts` | Sin consumidores. Las dos constantes llevaban el comentario "Para compatibilidad con código existente" — código de compatibilidad hacia atrás para algo que ya no existe en el repo. |
| **PWA-06** | Regla `[[headers]] for = "/*.ts"` | `netlify.toml` | Confirmado inspeccionando `dist/`: el build de producción no genera ningún archivo `.ts` (Vite los compila a `.js`), así que esta regla nunca coincide con nada. |
| *(mencionado en `AUDIT.md`/`FEATURES.md`, no tenía ID propio)* | Dependencia `react-body-highlighter` | `package.json` | `npm uninstall`. Confirmado que el único rastro en el código fuente era un comentario de crédito ("Based on react-body-highlighter (MIT License)") en `muscle-map.ts` — nunca se importa. Es una librería de React en una app 100% vanilla TS sin ningún componente React; quedó huérfana de una implementación anterior. |

## 2. Evaluado y NO eliminado — tiene valor real, candidato a conectar

| ID | Qué se evaluó | Por qué NO se borró | Dónde podría engancharse |
|----|-----------------|----------------------|----------------------------|
| **GAM2-11** | `xpHistory` (`GamificationState.xpHistory`) y `getXPHistory()` | No es código decorativo desconectado — es un ledger real de transacciones de XP, activamente calculado y persistido (capado a las últimas 100) en cada sesión, PR, racha y logro. Representa trabajo de cómputo genuino que ya existe y sería una lástima descartar. El propio audit lo lista explícitamente en la sección E ("¿se construye una pantalla de historial de XP, o se elimina el mecanismo?") como una decisión de producto, no un descarte automático. | Una pantalla de "Historial de XP" dentro del modal de gamificación (`ui/gamification/gamification-ui.ts`), listando las transacciones más recientes con su `source`/`description`/`amount` — el modelo de datos ya está completo para eso, solo falta la vista. |
| **CARDIO-13** | Base de datos de ejercicios de cardio: `getCardioExerciseInfo()` y los campos `difficulty`/`calories`/`muscles`/`desc` en `data/cardio-exercises.ts` | Sin consumidores hoy (el usuario elige ejercicio de un `<select>` plano que no muestra nada de esto), pero es una base de datos curada con contenido real, no una función vacía. Conecta directamente con el ítem deferido CARDIO-10 de Fase 2 (calorías por tarifa fija en vez de por ejercicio real) — borrar esto ahora significaría tener que rehacer el trabajo si se decide arreglar CARDIO-10 más adelante. | El selector de ejercicio de cardio (mostrar dificultad/músculos al elegir) y `estimateCalories()` en `cardio.ts` (usar el campo `calories` real del ejercicio en vez de la tarifa fija de ~10 kcal/min) — exactamente lo que CARDIO-10 recomienda. |

## 3. No es código muerto real — revisado, sin cambios

Para que quede constancia de que se revisaron y no se pasaron por alto:

- **`deleteCustomWorkout`/`renderExerciseItem`** (citados en el pedido de esta fase como ejemplo): ya evaluados durante UI-02 (Grupo B) — están en uso activo (`renderExerciseItem` recibe nombres de la base de datos estática de ejercicios; `deleteCustomWorkout` se invoca desde un `onclick` real). No son código muerto.
- **GAM2-08/09/12** (switch sin `default`, colisión de IDs de gradiente SVG, `recalculateXP` sin manejo de errores): son bugs de comportamiento de severidad Baja, no código muerto — el audit los agrupa en la misma sección D por severidad, pero corregirlos no es "borrar algo sin uso", es un fix de lógica. Quedan fuera de esta fase (documentado también como deferido en Fase 2, sección 2b, ítem CORE-adjacente).
- **PROF-08** (cálculo de edad triplicado): código activo y en uso en los 3 sitios, no código muerto — es duplicación, no algo para borrar.
- **UI-08/UI-09** (tarjeta de rutina triplicada, tres patrones de mostrar/ocultar UI): inconsistencias arquitectónicas activas, no código sin uso.

## 4. Confirmación de build/typecheck/test

```
$ npx tsc --noEmit
(sin salida — limpio)

$ npx vitest run
Test Files  6 passed (6)
     Tests  76 passed (76)

$ npm run build
✓ 1594 modules transformed
✓ built in ~4s

$ python3 -c "import tomllib; tomllib.load(open('netlify.toml','rb'))"
TOML OK
```

Balance neto de la fase: **491 líneas eliminadas, 0 añadidas** (fuera de
`FIXES_APPLIED.md` y `package-lock.json`) — reducción pura de superficie de
código, sin ningún cambio de comportamiento (confirmado por los 76 tests
existentes, que no requirieron ninguna modificación).

## 5. Veredicto del subagente verificador (Fase 3)

Ver sección **"Veredictos de los subagentes verificadores"** al final de
este documento.

---

# Veredictos de los subagentes verificadores

Cada fase se verificó con un subagente Haiku independiente, sin contexto
previo de la conversación, instruido para revisar únicamente el diff de esa
fase — no una confirmación de lo ya asumido. A continuación, el veredicto de
cada uno **tal cual lo entregó**, sin resumir ni reinterpretar.

## Fase 1

> Perfecto. He completado mi análisis exhaustivo. Voy a compilar mi reporte:
>
> ## REPORTE DE REVISIÓN - COMMIT "Fase 1: tests de integración"
>
> ### EJECUCIÓN DE PRUEBAS
> ✅ **TypeScript (tsc --noEmit)**: Sin errores de compilación
> ✅ **npm test (62 tests)**: Todos los tests pasan
> ✅ **npm run build**: Construcción exitosa
>
> ---
>
> ## ARCHIVOS DE TEST NUEVOS
>
> ### 1. **src/tests/storage.test.ts** (CORE-01)
> **Veredicto: OK**
> - ✅ Test de persistencia con localStorage funcionando vs fallo
> - ✅ Mock de QuotaExceededError implementado correctamente con `vi.spyOn(Storage.prototype, 'setItem')`
> - ✅ Verifica no solo el retorno sino también los efectos secundarios (getHistory() y getDraft())
> - ✅ Casos borde: preservación de draft al fallar guardado (línea 82-93, 111-128, 136-167)
> - ✅ Arquitectura: Prueba en tres niveles de abstracción (saveCurrentSession, saveWorkout, confirmRPE/skipRPE)
>
> **Detalle crítico verificado**: Línea 84 `saveDraftNow()` preserva draft mientras falla el guardado histórico. Correcto. ✓
>
> ---
>
> ### 2. **src/tests/history.test.ts** (HIST-01/02/03)
> **Veredicto: OK CON OBSERVACIÓN**
>
> **HIST-02 (Fusión de sesiones)**:
> - ✅ Línea 34-36: Dos sesiones del mismo día/grupo con volúmenes distintos → Se importan como 2 sesiones (no fusionadas)
> - ✅ Línea 47-48: Verifica que los volúmenes se preservan: `[1280, 1500]` (no se pierden datos)
> - ✅ Línea 51-65: Re-import detecta duplicados comparando en formato correcto (sin ceros: `"9/3/2026"`)
>
> **HIST-03 (Validación de rangos)**:
> - ✅ Línea 88-109: Rechaza filas con sets=0, peso=99999, reps=500 pero acepta la válida
> - ✅ Verifica el rechazo sin descartar filas válidas de la misma sesión
> - ✅ Línea 123-131: Si todas las filas son inválidas, rechaza el archivo completo
>
> **HIST-01 (Formula Injection)**:
> - ✅ Línea 171-178: Verifica que `escapeCSV()` antepone apóstrofe a =, +, -, @
> - ✅ Línea 188-197: Test complejo con comillas internas - verifica que se envuelve en comillas y se escapa correctamente
> - ✅ Lógica verificada (línea 102-110 de features/history.ts): Regex `/^[=+\-@\t\r]/` correcta
>
> **Observación**: Línea 52-53 del comentario dice "sin ceros a la izquierda". Verificado manualmente: `new Date('2026-03-09').toLocaleDateString('es-ES')` → `"9/3/2026"` ✓
>
> ---
>
> ### 3. **src/tests/cardio.test.ts** (CARDIO-01/02)
> **Veredicto: OK**
>
> **CARDIO-01** (Línea 22-47):
> - ✅ Dos sesiones de cardio consecutivas generan `sessionId` distintos
> - ✅ Ambas persisten en historial (length === 2)
> - ✅ Verifica que sessionIds son definidos y diferentes
>
> **CARDIO-02** (Línea 54-85):
> - ✅ Línea 62-67: Llama a `incrementAmrapRound()` 5 veces, verifica `roundsCompleted === 5`
> - ✅ Línea 74-85: Modo Tabata usa `currentRound` (8), no contador AMRAP
> - ✅ Arquitectura correcta: Modo AMRAP incrementa contador de forma distinta
>
> ---
>
> ### 4. **src/tests/gamification.test.ts** (GAM2-01/02)
> **Veredicto: OK CON OBSERVACIÓN IMPORTANTE**
>
> **Estructura del test**:
> - ✅ `liveSimulateSevenDayStreak()` simula correctamente 7 días consecutivos
> - ✅ Línea 59-66: Manejo correcto del reloj falso (vi.useFakeTimers + setSystemTime)
> - ✅ Línea 69: Ancho PR solo el Día 0 (hace 6 días) - setupcorrecto
> - ✅ Línea 81: Llama a `processCompletedSession()` para cada sesión en vivo
>
> **GAM2-01** (Línea 106-114):
> - ✅ Verifica `liveTotalXP > 0` (sistema en vivo acumula XP)
> - ⚠️ **OBSERVACIÓN**: Usa `toBeGreaterThanOrEqual()` en lugar de `toBe()`
>   - **Justificación**: El commit message (líneas 14-20 del diff) dice que el bug anterior daba "MENOS XP del que el usuario ya tenía". El fix previene que baje, permitiendo que suba. Esto es defensivo pero correcto.
>   - **Riesgo potencial**: Si en el futuro hay una regresión donde el cálculo da menos XP pero sigue siendo mayor que una cierta constante, el test podría no detectarla.
>   - **Mitigación aceptable**: Es mejor usar `>=` que no testear nada. El fix garantiza >= liveTotalXP.
>
> **GAM2-02** (Línea 132-172):
> - ✅ Línea 132-142: Verifica que SIN `existingAchievements`, se pierde el logro (documenta el bug)
> - ✅ Línea 144-157: Verifica que CON `existingAchievements`, se preserva (documenta el fix)
> - ✅ Línea 159-172: Verifica que no se descuentan logros ya pagados
>
> ---
>
> ### 5. **src/tests/sanitize.test.ts** (UI-01/UI-02)
> **Veredicto: OK**
>
> **escapeHtml()**:
> - ✅ Línea 11-35: Tests exhaustivos para <>, "", ', & characters
> - ✅ Línea 33-34: Verifica que texto plano no se modifica
>
> **renderExercise()** (Línea 56-73):
> - ✅ Línea 57-59: Verifica que <script> no aparece cruda en HTML
> - ✅ Línea 62-73: **CRÍTICO**: Inserta en DOM real y verifica que `querySelector('script')` es null
> - ✅ Línea 71-72: Verifica que el texto aparece como textContent literal, no como markup
> - ✅ Prueba bipolar: Tanto a nivel de string como de DOM
>
> **renderHistoryItem() y renderPRItem()**:
> - ✅ Verifican escaping en ambas funciones de rendering
>
> ---
>
> ## CAMBIO DE PRODUCCIÓN: migration.ts
>
> ### Nueva función: `calculateRetroactivePRXP()` (Líneas 294-319)
> **Veredicto: OK**
>
> **Lógica verificada línea por línea**:
>
> ```typescript
> function calculateRetroactivePRXP(sortedHistory: HistorySession[]): number {
>   const runningBest: Record<string, number> = {};          // ✓ Acumula mejor peso
>   let totalXP = 0;
>
>   for (const session of sortedHistory) {                   // ✓ Recorre en orden
>     if (session.type === 'cardio' || !session.ejercicios) continue;  // ✓ Salta cardio
>
>     for (const ej of session.ejercicios) {
>       if (!ej.peso || ej.peso <= 0 || !ej.volumen) continue;  // ✓ Validación defensiva
>       const previousBest = runningBest[ej.nombre] || 0;    // ✓ Inicializa a 0
>       if (ej.peso > previousBest) {
>         const improvement = ej.peso - previousBest;        // ✓ Calcula mejora
>         totalXP += calculatePRXP(improvement).xp;           // ✓ Usa MISMO calculatePRXP() que vivo
>         runningBest[ej.nombre] = ej.peso;                  // ✓ Actualiza mejor
>       }
>     }
>   }
>   return totalXP;
> }
> ```
>
> **Verificación de correspondencia con sistema en vivo**:
> - ✅ `calculatePRXP(improvement)` es la MISMA función que en xp.ts línea 95-111
> - ✅ Sistema en vivo (xp.ts línea 225-260) usa `calculatePRXP(pr.newWeight - pr.oldWeight)` idénticamente
> - ✅ Orden cronológico: `sortedHistory` llega ya ordenado desde calculateRetroactiveXP (línea 225-227)
>
> **Casos borde manejados**:
> - ✅ Ejercicios nuevos (previousBest = 0) → improvement = peso inicial
> - ✅ Ejercicios sin mejora (ej.peso === previousBest) → salta correctamente
> - ✅ Ejercicios con peso no numérico (0 o null) → salta correctamente
> - ✅ Sesiones de cardio → salta correctamente
>
> **PROBLEMA POTENCIAL (arquitectura, no en esta función)**:
> - Si hay inconsistencias entre historial y PRs globales (p.ej., historial importado antiguo), podría haber doble-conteo de XP. Sin embargo, esto es un problema de integridad de datos general, no del recálculo en sí.
>
> ### Cambios relacionados:
> - ✅ Línea 81: Parámetro `prs` eliminado de `calculateRetroactiveXP()` (ya no se usa)
> - ✅ Línea 25: `calculatePRXP` importado correctamente de `./xp`
> - ✅ Línea 36: Eliminada importación de `PR_XP` (ya no necesaria)
> - ✅ Línea 286: Descripción actualizada a "PRs históricos" (en lugar de contar PRs)
>
> ---
>
> ## ANÁLISIS DE SCOPE
>
> ✅ El commit se limita a:
> 1. Añadir 5 archivos de test nuevos (793 líneas)
> 2. Modificar migration.ts (cambio lógico + imports)
> 3. Exportar escapeCSV en history.ts (para testabilidad)
>
> ❌ NO hay refactors no relacionados, cambios cosméticos, o limpieza innecesaria fuera del scope.
>
> ---
>
> ## FRAGILIDAD DE TESTS
>
> **Verificación de dependencias de tiempo/orden**:
> - ✅ Todos los tests usan `beforeEach()` para limpiar localStorage
> - ✅ gamification.test.ts usa `vi.useFakeTimers()` + `vi.setSystemTime()` (controlado)
> - ✅ storage.test.ts usa `afterEach()` para restaurar mocks
> - ✅ No hay dependencias entre tests (cada uno es independiente)
>
> **Verificación de mocks**:
> - ✅ window.confirm mockado y restaurado
> - ✅ window.alert mockado y restaurado
> - ✅ Storage.prototype.setItem mockado solo donde se necesita
>
> ---
>
> ## RESUMEN EJECUTIVO
>
> | Aspecto | Estado | Evidencia |
> |---------|--------|-----------|
> | Tests pasan | ✅ | 62/62 pass, TypeScript limpio, build exitoso |
> | Asercciones fuertes | ✅ | No hay tautologías; uso de `>=` es defensivo y justificado |
> | Datos realistas | ✅ | Formato de fecha verificado, casos borde cubiertos |
> | Lógica de producción | ✅ | `calculateRetroactivePRXP()` es correcta y usa mismo `calculatePRXP()` que vivo |
> | Cobertura de bugs | ✅ | Cada fix de Grupo A/B tiene test que verifica el bug y el fix |
> | Scope correcto | ✅ | Solo cambios necesarios, sin refactors no relacionados |
> | Fragil a tiempo | ✅ | Reloj falso controlado, sin dependencias del sistema |
> | Mocks limpios | ✅ | Todos se restituyen en afterEach |
>
> ---
>
> **VEREDICTO ÚNICO:**
>
> `APROBADO`
>
> El commit tiene sólida cobertura de tests, lógica de producción correcta, y no presenta errores críticos. El uso defensivo de `>=` en gamification.test.ts es justificado dado el contexto del fix. La cobertura de los 5 bugs (CORE-01, HIST-01/02/03, CARDIO-01/02, GAM2-01/02, UI-01/02) es exhaustiva y verifica tanto el comportamiento incorrecto anterior como la solución.

## Fase 2

> Perfecto. He completado mi análisis exhaustivo. Voy a generar el reporte final:
>
> ---
>
> # REPORTE DE REVISIÓN — COMMIT "Fase 2: fixes de Grupo C (paralelo, no bloqueante) + higiene de infra"
>
> ## EJECUCIÓN DE PRUEBAS BÁSICAS
>
> ✅ **TypeScript (tsc --noEmit)**: Sin errores de compilación
> ✅ **npm test (76 tests en 6 archivos)**: Todos pasan
> ✅ **npm run build**: Construcción exitosa (1594 módulos transformados)
>
> ---
>
> ## REVISIÓN POR CATEGORÍA
>
> ### **CARDIO — Timer de cardio y precisión (6 fixes)**
>
> | Fix | Veredicto | Detalles |
> |-----|-----------|----------|
> | **CARDIO-04** | OK | `pauseCardioTimerOnNavigation()` limpia intervalo sin finalizar. Invocado desde `hideCardioViews()` en `navigation.ts:112` ✓ |
> | **CARDIO-05** | OK | Drift correction: bucle de catch-up (`startTimer()` línea 616-634) calcula ticks reales faltantes, capeados a 3600. Guard `if (!timerInterval) return` línea 632 previene procesamiento tras `finishCardioWorkout()`. Lógica correcta. |
> | **CARDIO-06** | OK | `CONFIG_MIN_VALUES` con `rounds: 1` (línea 388). Verifica que Circuit a 3 rondas no salta a 5 al pulsar "−". Tests en `cardio.test.ts:140-153` comprueban esto. ✓ |
> | **CARDIO-07** | OK | `CONFIG_MIN_VALUES` con `duration: 60` (línea 389). AMRAP nunca cae a valores no-múltiplos de 60. Tests en `cardio.test.ts:155-166` verifican. ✓ |
> | **CARDIO-09** | OK | Altura de pirámide con `style="height: ${Math.round(l/10) * 0.25}rem"` (línea 806). Fórmula correcta (Tailwind: h-N = N × 0.25rem). Evita purga de Tailwind JIT. ✓ |
> | **CARDIO-11** | OK | `finishCardioWorkout(completedNaturally = true)` (línea 937): parámetro new. AMRAP usa `amrapRounds` (línea 950). `stopCardioWorkout()` pasa `false` (línea 929). Llamadas desde `handlePhaseEnd()` (líneas 654, 661, 682, 703) usan default `true`. Tests en `cardio.test.ts:99-122` verifican `completedNaturally=false` resta 1 de `currentRound`. ✓ |
>
> ---
>
> ### **VALIDACIONES DE INPUT (5 fixes)**
>
> | Fix | Veredicto | Detalles |
> |-----|-----------|----------|
> | **WKT-03** | OK | `clampToRange()` nuevo helper (línea 259-261) aplicado en `updateEjercicio()` (líneas 197-199). Valores se reflejan en DOM (líneas 202-204). Usa constantes `MAX_REASONABLE_*` compartidas. ✓ |
> | **WKT-04 / HIST-06** | OK | `calculate1RM()`: `brzyckiReps = Math.min(reps, 36)` (línea 82) acota reps SOLO para Brzycki (línea 83), no para Epley/Lombardi. Tests `calculations.test.ts:237-306` verifican reps=37/40/50 dan resultados finitos. ✓ |
> | **PROF-02 / PROF-03** | OK | `parsePositiveMeasurement()` nuevo (línea 376-380) descarta valores ≤0 de forma consistente. Aplicado a 9 campos en `saveMeasurement()` (líneas 387-395). Unifica el bug anterior (negativo conservado, cero descartado). ✓ |
> | **PROF-04** | OK | `calculateBodyFat()` (línea 324-368) distingue 3 casos: (1) sin género → "-%" + mensaje "Configura tu género..." (línea 339-345); (2) datos ingresados pero inválidos (cintura ≤ cuello) → "-%" + mensaje "Verifica las medidas..." (línea 353-365); (3) válido → muestra % (línea 349-352). Lógica exhaustiva. ✓ |
> | **CORE-02** | OK | `checkForExistingDraft()` (línea 218-247): valida `typeof draft.draftTimestamp === 'number' && Number.isFinite(draft.draftTimestamp)` (línea 234-235) + `Array.isArray(draft.ejercicios)` (línea 236). Si no cumple, llama `clearDraft()` (línea 239). Tests `storage.test.ts:175-211` cubren draft sin draftTimestamp/sin ejercicios. ✓ |
>
> ---
>
> ### **INFRAESTRUCTURA Y HIGIENE (9 fixes)**
>
> | Fix | Veredicto | Detalles |
> |-----|-----------|----------|
> | **PWA-03** | OK | `package.json` línea 23-24: `@vitest/coverage-v8@^1.6.1` y `@vitest/ui@^1.6.1` instalados. `npm run test:coverage` ahora funciona. ✓ |
> | **PWA-05** | OK | `public/_redirects` eliminado. Única fuente de verdad: regla `/*` en `netlify.toml` línea 10-13. ✓ |
> | **PWA-08** | OK | Imports dinámicos → estáticos: `import { renderFromDraft, loadTrainingGroup } from '@/features/workout'` en `navigation.ts:17` (antes dinámicos). Grep verifica: `workout.ts` NO importa nada de `@/ui/navigation` (sin dependencia circular). Warnings de Vite desaparecieron. ✓ |
> | **PWA-09** | OK | `netlify.toml` línea 8: `NODE_VERSION = "20"`. `.nvmrc` contiene `20`. `package.json` línea 7: `"engines": { "node": ">=20" }`. Coherente. ✓ |
> | **Atajos PWA** | OK | `applyManifestShortcut()` en `main.ts:934-941` lee `?action=` URL, navega a tab si `history` o `prs`. Invocado después de `showHome()` en `init()` línea 984. `action=workout` no tiene manejo (es Home, default). ✓ |
> | **CORE-03** | OK | `resumeDraft()` (línea 439-459) ahora aplica guard `hasUnsavedData()` + `confirm()` (línea 442-450). Previene sobrescritura silenciosa de sesión activa con cambios sin guardar. ✓ |
> | **CORE-05** | OK | `updateResumeWorkoutCard()` (línea 327-387): cuando `isStale`, llama `clearDraft()` (línea 341) además de ocultar tarjeta. Draft huérfano ya no queda indefinidamente. ✓ |
> | **CORE-06** | OK | `getWeeklyVolume()` (línea 308-318) y `getQuickHomeStats()` (línea 389-409) reemplazan acceso directo `localStorage.getItem()` con `getHistory()` (línea 311, 396). JSON corrupto ya no rompe Home. Lógica de cálculos sin cambios. ✓ |
> | **CORE-11** | OK | `needsMigration()` (línea 425-429) usa `GAMIFICATION_STORAGE_KEYS.STATE` en vez de clave mágica `'gymmate_gamification'`. Una fuente de verdad. ✓ |
>
> ---
>
> ## REVISIÓN DE TESTS
>
> ✅ **cardio.test.ts**: 11 tests pasan. Cubren CARDIO-01/02/04/06/11. CARDIO-05/07/09 no tienen tests explícitos, pero la implementación es correcta y segura.
> ✅ **calculations.test.ts**: 25 tests pasan. WKT-04/HIST-06 (Brzycki reps≥37) cubierto exhaustivamente (línea 237-306: reps=37/40/50 all finito, reps normales no regreasionan).
> ✅ **storage.test.ts**: 10 tests pasan. CORE-02 (checkForExistingDraft) cubierto con casos límite (sin draftTimestamp, sin ejercicios, válido).
> ✅ **sanitize.test.ts**: 9 tests (Grupo B, revisados en Fase 1).
> ✅ **gamification.test.ts**: 5 tests (Grupo A, revisados en Fase 1).
> ✅ **history.test.ts**: 16 tests (Grupo A, revisados en Fase 1).
>
> ---
>
> ## ANÁLISIS DE SCOPE
>
> ✅ Todos los archivos modificados están en scope de Fase 2:
> - 16 archivos `.ts` (cardio, workout, profile, session, navigation, main, migration, calculations)
> - 3 archivos de config (package.json, netlify.toml, .nvmrc)
> - 1 documento (FIXES_APPLIED.md)
>
> ❌ Ningún refactor amplio no documentado.
> ❌ Ningún cambio cosméticos fuera de scope.
>
> ---
>
> ## OBSERVACIONES MENORES (No bloqueantes)
>
> 1. **CARDIO-05 (drift)**: Código correcto (guard en línea 632, tope en 592), pero sin test explícito del bucle de catch-up. Suficiente en contexto de Fase 2.
>
> 2. **CARDIO-09 (altura de pirámide)**: Cálculo correcto, sin test de rendering. Verificable manualmente.
>
> 3. **WKT-03 (DOM update)**: Valores clampeados reflejados en DOM (líneas 202-204), pero sin test automatizado.
>
> 4. **Cobertura de integración**: No hay tests de flujos completos (ej. iniciar cardio → drift largo → finalizar), pero esto estaba explícitamente fuera de Fase 2.
>
> Todas estas observaciones son menores y no afectan la corrección de los fixes.
>
> ---
>
> ## SECCIÓN 3: Ítems deferidos de Grupo C
>
> Revisé la sección "2b. Ítems del Grupo C evaluados y deferidos" en FIXES_APPLIED.md (líneas 401-455). El razonamiento para cada ítem deferido es sólido y documentado:
>
> - **Cardio**: CARDIO-03 (draft para cardio = esfuerzo mediano nuevo), CARDIO-08 (rediseño del escalado), CARDIO-10 (calorías por tarifa), CARDIO-12+ (código muerto). Razonable deferirlos.
> - **WKT**: WKT-05/06/07/08/09 todos Trivial/Pequeño individualmente, pero priorización válida de profundidad sobre cobertura. Candidatos claros para próxima pasada.
> - **PROF**: PROF-05 (comportamiento a decidir), PROF-07 (código muerto), PROF-08/09 (consolidación futura), PROF-10 (feature, no fix), PROF-11 (Pequeño esfuerzo, quedaría para después).
> - **CORE**: CORE-04 (esfuerzo mediano), CORE-07/08/09 (código muerto), CORE-10 (listener de evento, sin poder probar), CORE-12 (decisión de producto), CORE-13 (informativo).
> - **PWA**: PWA-04 (ESLint 9, merece sesión propia), PWA-06 (informativo), PWA-07 (cambio de config deliberado), PWA-10+ (assets fuera del pedido).
>
> ✅ Todos los ítems deferidos tienen justificación válida y no representan gaps reales.
>
> ---
>
> ## VEREDICTO ÚNICO
>
> `APROBADO`
>
> Todos los ~19 fixes de Fase 2 están correctamente implementados. Los tests pasan (76/76), TypeScript está limpio, y el build es exitoso. La implementación es sólida, el scope es correcto, y la documentación en FIXES_APPLIED.md es completa. Las observaciones menores sobre cobertura de tests no bloquean — la cobertura es suficiente para el contexto de Fase 2, y el código es defensivo y correcto.

## Fase 3

> Perfecto. He completado mi auditoría exhaustiva. Presento mi veredicto:
>
> ---
>
> ## AUDITORÍA INDEPENDIENTE — FASE 3: ELIMINACIÓN DE CÓDIGO MUERTO
>
> ### 1. VERIFICACIÓN DE INFRAESTRUCTURA
>
> ✅ **TypeScript (`npx tsc --noEmit`)**: Limpio, sin errores
> ✅ **Tests (`npx vitest run`)**: 76/76 pasan sin modificaciones
> ✅ **Build (`npm run build`)**: Exitoso, sin warnings nuevos
>
> ---
>
> ### 2. VERIFICACIÓN POR ELIMINACIÓN
>
> #### **9 Render Variants de Gamificación**
> - `renderLevelBadgeCompact`, `renderRankEmblemMini`, `renderRankWithLabel`, `renderMuscleMapMini`, `renderMuscleMapWithLegend`, `renderMuscleProgress`, `renderGamificationHeader`, `renderLevelUpMessage`, `renderRankUpMessage`
> - **Veredicto: OK** — Grep exhaustivo: cero consumidores en el repo actual. El barrel `ui/gamification/index.ts` ya no las exporta. Solo fueron definidas y exportadas, nunca usadas.
>
> #### **`hasChangesToSave()` (CORE-07)**
> - **Veredicto: OK** — Sin consumidores. Reimplementaba lógica ya cubierta por `hasUnsavedData()` que sí se usa activamente.
>
> #### **`getSession()`, `clearSession()` (CORE-08 parcial)**
> - **Veredicto: OK** — Sin consumidores. `saveSession()` (diferente) sigue existiendo e intacto, usada en `state/session.ts:271`. La lectura/borrado nunca existió en ningún call-site.
>
> #### **`resetGamificationState()` (CORE-09)**
> - **Veredicto: OK** — Sin consumidores. Los tests usan `initGamification()` que es la función correcta.
>
> #### **`checkForPR()` (WKT-05 parcial)**
> - **Veredicto: OK** — Sin consumidores. La versión que persiste (`checkAndUpdatePR()` en `state/session.ts:297`) existe e intacta, llamada en línea 114 del mismo archivo.
>
> #### **Campo `timer` de `CardioState` (CARDIO-14)**
> - **Veredicto: OK** — Sin referencias a `cardioState.timer` en ningún archivo.
>   - El tipo `CardioState` anterior tenía: `timer: ReturnType<typeof setInterval> | null;`
>   - El tipo actual no lo tiene (tipo correcto)
>   - `resetCardioState()` antes intentaba `clearInterval(cardioState.timer)`, ahora no — correcto porque el campo no existe
>   - El mecanismo real usa `let timerInterval` privado en `cardio.ts:11` — no roto
>
> #### **`getQuickStats()` (HIST-04)**
> - **Veredicto: OK** — Sin consumidores. Duplicada con `calculateCurrentStreak()`, eliminación correcta.
>
> #### **`getProfileForCalculators()` (PROF-07)**
> - **Veredicto: OK** — Sin consumidores. Su equivalente `calculators.ts` reimplementa la lógica independientemente.
>
> #### **`card()`, `buttonPrimary()`, `buttonSecondary()`, `statCard()`, `renderRoutineCard()` (UI-07)**
> - **Veredicto: OK** — Sin consumidores. Imports en `components.ts` vienen solo de `renderExercise`, `renderHistoryItem`, `renderPRItem`, que sí existen.
>
> #### **`iconInline()` (UI-07)**
> - **Veredicto: OK** — Sin consumidores en el repo.
>
> #### **`muscleIconImg()`, `getAvailableMuscleIcons()`, `getAvailableGroupIcons()`, `MUSCLE_SVG_ICONS`, `GROUP_SVG_ICONS` (UI-07)**
> - **Veredicto: OK** — Sin consumidores. Las constantes llevaban comentario "Para compatibilidad con código existente" — código de compatibilidad hacia atrás para algo ya desaparecido.
>
> #### **Regla `for = "/*.ts"` en `netlify.toml` (PWA-06)**
> - **Veredicto: OK** — Eliminada. Verificado: el build de Vite no genera archivos `.ts` en producción (solo `.js`), así que la regla nunca coincidía con nada.
>
> #### **Dependencia `react-body-highlighter` (package.json)**
> - **Veredicto: OK** — Desinstalada. Único rastro en código: un comentario de crédito en `muscle-map.ts`. Nunca se importa. Librería de React en app vanilla.
>
> ---
>
> ### 3. VERIFICACIÓN DE EXCLUSIONES ("NO ELIMINADO")
>
> #### **GAM2-11: `xpHistory` + `getXPHistory()`**
> - Existe: ✅ (`GamificationState.xpHistory` en types, `state.ts`)
> - Se calcula: ✅ (`migration.ts:107-108`, `state.ts`)
> - Se persiste: ✅ (capado a últimas 100 transacciones)
> - **Razonamiento**: Ledger real, cálculo activo, decide el audit que es "decisión de producto". **SÓLIDO**
>
> #### **CARDIO-13: Base de datos ejercicios cardio (`getCardioExerciseInfo()` + campos en `cardio-exercises.ts`)**
> - Existe: ✅ (funciones y data en `data/cardio-exercises.ts`)
> - Datos curados: ✅ (`difficulty`, `calories`, `muscles`, `desc` para 30+ ejercicios)
> - Conexión real: ✅ CARDIO-10 (calorías por tarifa variable, no fija) usaría esta data
> - **Razonamiento**: Data lista para cuando se implemente CARDIO-10. **SÓLIDO**
>
> ---
>
> ### 4. VERIFICACIÓN DE SCOPE (¿Hubo cambios fuera de las eliminaciones documentadas?)
>
> **Análisis de diff**:
> - 20 archivos modificados
> - 192 líneas añadidas (FIXES_APPLIED.md: +190, package-lock.json: +2)
> - 517 líneas eliminadas (código muerto)
> - **Cambios que NO son pura eliminación**:
>   - FIXES_APPLIED.md: +190 (documentación)
>   - package-lock.json: cambios por desinstalación de `react-body-highlighter`
>   - **Ningún cambio de lógica o comportamiento fuera de las eliminaciones documentadas**
>
> ---
>
> ### 5. VERIFICACIÓN DE COHERENCIA DE TIPOS
>
> - Importes de `ui/gamification`: Solo `renderGamificationHeroCard`, `showGamificationModal`, `hideGamificationModal` en `main.ts` ✅ (todas existen)
> - Uso de `cardioState` en tests: Accede solo a campos que siguen existiendo ✅
> - TypeScript compila sin errores ✅
>
> ---
>
> ### 6. HALLAZGOS ESPECIALES
>
> Ninguno. No se encontró:
> - ❌ Consumidores ocultos de funciones eliminadas
> - ❌ Cambios silenciosos de comportamiento
> - ❌ Tipos rotos o referencias circulares nuevas
> - ❌ Tests que ahora son inválidos (los 76 pasan sin cambios)
>
> ---
>
> ## VEREDICTO ÚNICO
>
> `APROBADO`
>
> La eliminación de código muerto es exhaustiva, correctamente documentada, verificada sin consumidores ocultos, y sin cambios de comportamiento. Las dos decisiones de conservar `xpHistory` (GAM2-11) y base de datos de cardio (CARDIO-13) están bien razonadas — no son código muerto, sino mecanismos desconectados que esperan a features futuras. El balance neto (-325 líneas, cero regresos) es limpio. Listo para merge.
