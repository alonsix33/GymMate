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
