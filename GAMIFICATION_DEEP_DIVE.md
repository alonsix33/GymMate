# GymMate — Investigación Profunda: Sistema de Gamificación

**Fecha:** 2026-07-29
**Contexto:** Sigue a `AUDIT.md` (técnico) y `FEATURES.md` (inventario UX/UI). Este documento resuelve puntos específicos de gamificación que quedaron abiertos: desglose completo de logros, calibración de multiplicadores de ejercicio, el bug de peso corporal desactualizado, y la triplicación de la lógica de racha.
**Alcance:** Solo investigación y diagnóstico — ningún fix se aplica aquí.

---

## FASE 1 — Desglose exacto de los 25 logros

Fuente: `src/features/gamification/constants.ts::ACHIEVEMENT_DEFINITIONS`.

**Sobre íconos/emoji (pregunta 5):** los 25 logros **no tienen ningún ícono ni emoji propio en el modelo de datos** — el `Achievement` interface (`types/gamification.ts`) solo tiene `id`, `name`, `description`, `category`, `xpReward`, `unlockedAt`, `progress`, `target`. Ningún campo de ícono. En la UI (`ui/gamification/gamification-ui.ts::renderAchievementsList()`), cada logro se renderiza con uno de solo **dos íconos genéricos según su estado**: ✓ verde (`check`) si está desbloqueado, 🎯 gris (`target`) si está pendiente — no hay diferenciación visual entre "Primera Sesión" y "Titán", por ejemplo. Por separado, el popup de resumen de sesión (`session-summary.ts`) sí usa emoji fijos, pero **por categoría de fuente de XP**, no por logro específico: 🏆 para cualquier PR, 🔥 para racha, 🎖️ para cualquier logro desbloqueado, ⬆️ para cualquier subida de rango. Por eso la columna "ícono" de la tabla dice "genérico (✓/🎯 según estado)" para los 25 — no hay nada más granular que documentar porque no existe en el código.

| # | Nombre exacto | Categoría | Condición exacta de desbloqueo | XP | Ícono/emoji |
|---|---|---|---|---|---|
| 1 | Primera Sesión | Sesiones | `countSessions(history) >= 1` (cualquier sesión guardada, pesas o cardio cuentan igual porque `history.length` no filtra tipo) | 100 | Genérico (✓/🎯 según estado) |
| 2 | Constante | Sesiones | `countSessions(history) >= 10` | 200 | Genérico |
| 3 | Dedicado | Sesiones | `countSessions(history) >= 25` | 500 | Genérico |
| 4 | Veterano | Sesiones | `countSessions(history) >= 100` | 1,500 | Genérico |
| 5 | Leyenda | Sesiones | `countSessions(history) >= 500` | 5,000 | Genérico |
| 6 | Titán | Sesiones | `countSessions(history) >= 1000` | 12,000 | Genérico |
| 7 | Volumen 100K | Volumen | `calculateTotalVolume(history) >= 100,000` kg acumulados (suma de `volumenTotal` de **todas** las sesiones, incluye 0 de cardio) | 250 | Genérico |
| 8 | Volumen 500K | Volumen | `>= 500,000` kg | 1,000 | Genérico |
| 9 | Volumen 1M | Volumen | `>= 1,000,000` kg | 2,500 | Genérico |
| 10 | Volumen 5M | Volumen | `>= 5,000,000` kg | 7,500 | Genérico |
| 11 | Volumen 10M | Volumen | `>= 10,000,000` kg | 17,500 | Genérico |
| 12 | Primer PR | PRs | `countPRs(prs) >= 1` (nº de claves en el diccionario de PRs, no distingue cuándo se consiguieron) | 75 | Genérico |
| 13 | 10 PRs | PRs | `>= 10` | 250 | Genérico |
| 14 | 50 PRs | PRs | `>= 50` | 1,000 | Genérico |
| 15 | 100 PRs | PRs | `>= 100` | 2,500 | Genérico |
| 16 | Semana Perfecta | Rachas | `currentStreak >= 7` (racha "oficial" de `calculateCurrentStreak`, ver Fase 4) | 200 | Genérico |
| 17 | Mes Imparable | Rachas | `currentStreak >= 30` | 1,000 | Genérico |
| 18 | Trimestre de Hierro | Rachas | `currentStreak >= 90` | 4,000 | Genérico |
| 19 | Primer Oro | Rangos | Al menos 1 de los 8 músculos con rango ≥ Oro (`countMusclesWithRank(ranks, 'Oro') >= 1`) | 300 | Genérico |
| 20 | Cuerpo de Plata | Rangos | Los 8 músculos con rango ≥ Plata (`>= 8`) | 1,000 | Genérico |
| 21 | Primer Diamante | Rangos | Al menos 1 músculo con rango ≥ Diamante | 2,000 | Genérico |
| 22 | Primer Simétrico | Rangos | Al menos 1 músculo con rango = Simétrico | 5,000 | Genérico |
| 23 | Cuerpo Simétrico | Rangos | Los 8 músculos con rango Simétrico | 25,000 | Genérico |
| 24 | Explorador | Especial | `countUniqueExercises(history) >= 10` ejercicios distintos usados alguna vez (por nombre en minúsculas, sin normalizar alias — ver nota abajo) | 200 | Genérico |
| 25 | Maestro de Variedad | Especial | `>= 30` ejercicios distintos | 600 | Genérico |

**Notas de comportamiento no evidentes en la tabla:**

- **"Sesiones" cuenta cardio igual que pesas.** `countSessions()` es simplemente `history.length` — una racha de 100 sesiones de solo Tabata desbloquea "Veterano" igual que 100 sesiones de pesas. Esto es consistente con el resto del sistema tratando el historial como unificado, pero vale la pena confirmarlo como decisión de diseño explícita antes de rediseñar (¿debería "Veterano" reflejar específicamente progreso de fuerza, o cualquier actividad física es igualmente válida?).
- **Los logros "Rangos" nunca se des-desbloquean.** Una vez que `unlockedAt` tiene fecha, `checkAchievements()` no vuelve a evaluar ese logro (`if (achievement.unlockedAt) return achievement;` al inicio del `.map()`). Si un usuario alcanza Oro en un músculo y luego ese rango baja (por ejemplo, por el bug de peso corporal de la Fase 3, o simplemente porque un PR más reciente en un ejercicio con multiplicador distinto desplaza el "mejor ejercicio"), el logro "Primer Oro" permanece desbloqueado — es un snapshot histórico, no un estado en vivo. Esto es razonable para un sistema de logros (no se le "quitan" logros a nadie), pero significa que el logro no es una fuente confiable de "¿tengo Oro en algo *ahora mismo*?" — para eso hay que mirar `muscleRanks` directamente.
- **"Explorador"/"Maestro de Variedad" cuentan por nombre en minúsculas (`.toLowerCase()`), no por nombre normalizado.** `exercise-normalizer.ts` tiene un sistema completo de alias ("prensa" = "leg press" = "press de piernas") para evitar duplicados en PRs e historial de gráficos, pero `countUniqueExercises()` en `achievements.ts` **no usa ese normalizador** — solo hace `.toLowerCase()` sobre el nombre tal cual quedó guardado en cada sesión histórica. Si un usuario registró el mismo ejercicio bajo dos alias distintos antes de que existiera/corriera la normalización (o si hay sesiones antiguas con el nombre "crudo" pre-normalización), esos dos alias cuentan como 2 ejercicios distintos para este logro en vez de 1 — puede inflar el contador de "variedad" de forma inconsistente con el resto de la app, que sí trata esos alias como el mismo ejercicio en PRs/gráficos/1RM.

---

## FASE 2 — Auditoría del multiplicador de ejercicios

Fuente: `src/features/gamification/constants.ts::EXERCISE_MULTIPLIERS` (fórmula: `adjustedRatio = (1RM_estimado / peso_corporal) / multiplicador`; multiplicador más alto = el ejercicio "cuenta menos" por kilo porque se espera mover más peso en él).

### Tabla completa (agrupada como está en el código fuente)

| Ejercicio | Multiplicador | Ejercicio | Multiplicador |
|---|---|---|---|
| Press Banca | 1.0 | Extensión Tríceps Overhead | 0.4 |
| Press Inclinado | 1.0 | Press Francés | 0.45 |
| Press Declinado | 1.0 | Press Francés con Mancuernas | 0.45 |
| Press Banca Mancuernas | 1.0 | Patada de Tríceps | 0.25 |
| Press Inclinado Mancuernas | 1.0 | Fondos en Máquina | 0.9 |
| Press Militar | 1.0 | Fondos en Banco | 0.7 |
| Press Arnold | 1.0 | Extensión Polea Invertida | 0.35 |
| Press Mancuernas Sentado | 1.0 | Elevación Lateral | 0.2 |
| Press en Máquina | 1.0 | Elevación Frontal / Y-Raise | 0.22 |
| Press Cerrado | 1.0 | Pájaros (rear delts) | 0.18 |
| Sentadilla | 1.25 | Face Pull | 0.3 |
| Sentadilla Hack | 1.2 | Elevación Lateral en Polea | 0.2 |
| Sentadilla Sumo | 1.2 | Pájaros en Máquina | 0.2 |
| Sentadilla Búlgara | 0.9 | Remo al Mentón | 0.5 |
| Sentadilla Goblet | 0.8 | Vuelos Inversos en Banco | 0.18 |
| Peso Muerto Convencional | 1.5 | Jalón al Pecho | 0.75 |
| Peso Muerto Sumo | 1.5 | Jalón Agarre Cerrado | 0.75 |
| RDL / Peso Muerto Rumano | 1.3 | Jalón Tras Nuca | 0.7 |
| Prensa de Piernas | 2.0 | Remo en Máquina | 0.8 |
| Hip Thrust | 1.4 | Remo Mancuerna | 0.7 |
| Puente de Glúteo | 1.2 | Remo con Barra | 0.85 |
| Buenos Días | 0.8 | Remo en Polea Baja | 0.8 |
| Curl Martillo | 0.4 | Remo T-Bar | 0.85 |
| Curl Martillo Cross-body | 0.4 | Remo en Máquina Hammer | 0.8 |
| Curl con Barra | 0.4 | Dominadas | 0.9 |
| Curl con Barra Z | 0.4 | Dominadas Agarre Neutro | 0.9 |
| Curl Mancuernas Alterno | 0.4 | Pull-Over en Polea | 0.5 |
| Curl Concentrado | 0.35 | Pull-Over con Mancuerna | 0.5 |
| Curl en Banco Inclinado | 0.38 | Encogimientos de Hombros | 0.7 |
| Curl en Polea | 0.4 | Aperturas con Mancuernas | 0.4 |
| Curl Predicador | 0.38 | Aperturas en Polea | 0.35 |
| Curl Spider | 0.35 | Cruce de Poleas Bajo | 0.35 |
| Extensión de Tríceps en Polea | 0.35 | Fondos en Paralelas (Pecho) | 0.9 |
| Extensión Tríceps con Cuerda | 0.35 | Flexiones | 0.6 |
| Extensión de Cuádriceps | 0.5 | Zancadas con Barra | 0.9 |
| Curl Femoral Tumbado | 0.45 | Zancadas con Mancuernas | 0.8 |
| Curl Femoral Sentado | 0.45 | Step Ups | 0.7 |
| Aductora Máquina | 0.6 | Elevación de Talones (Gemelos) | 0.8 |
| Gemelos Sentado | 0.6 | Prensa de Gemelos | 1.5 |
| Abductora Máquina | 0.6 | Patada de Glúteo en Máquina | 0.5 |
| Patada de Glúteo en Polea | 0.4 | Abducción en Polea | 0.3 |
| Abdominales en Máquina | 0.4 | Crunch en Polea | 0.35 |
| Elevación de Piernas Colgado | 0.3 | Elevación de Rodillas Colgado | 0.25 |
| Russian Twist | 0.2 | Leñador en Polea | 0.3 |
| Ab Rollout | 0.3 | Crunch Bicicleta | 0.15 |
| Dead Bug | 0.15 | Pallof Press | 0.25 |

Cualquier ejercicio no listado aquí (incluyendo **todos los ejercicios personalizados que un usuario cree** vía Workout Builder) usa `DEFAULT_EXERCISE_MULTIPLIER = 1.0` — el mismo valor que Press Banca. Esto es relevante: un ejercicio personalizado de aislamiento (ej. "Curl personalizado en banco Scott") se tratará como si fuera tan "pesado por naturaleza" como un press banca, inflando artificialmente su ratio ajustado y potencialmente el rango del músculo asociado.

### Hallazgos de calibración

1. **Sentadilla Hack (1.2) por debajo de Sentadilla libre (1.25) es cuestionable.** En la práctica, la sentadilla en máquina Hack permite mover **más** peso absoluto que la sentadilla libre para el mismo nivel de fuerza real, porque la máquina guía la trayectoria y elimina el componente de equilibrio/estabilización — el patrón típico en la mayoría de sistemas de "peso relativo por ejercicio" (incluyendo tablas de fuerza estándar de la industria) es que las variantes en máquina tengan multiplicador **igual o mayor** que su equivalente libre (como sí ocurre correctamente con Prensa de Piernas = 2.0 vs Sentadilla = 1.25). Que Sentadilla Hack esté *por debajo* de la sentadilla libre es inconsistente con ese patrón y con cómo se calibró Prensa de Piernas para el mismo grupo muscular.
2. **"Remo al Mentón" (0.5) está agrupado como aislamiento de hombro (junto a Elevación Lateral 0.2, Face Pull 0.3) pero tiene un valor mucho más alto**, cercano a movimientos multiarticulares de espalda (Jalón Tras Nuca 0.7, Remo Mancuerna 0.7). El upright row sí es más compuesto que una elevación lateral (involucra trapecio/espalda alta), así que un valor más alto que 0.2-0.3 tiene sentido — pero 0.5 puesto junto a ejercicios de aislamiento pura sin ninguna nota que explique el salto puede confundir a quien mantenga esta tabla en el futuro. Vale la pena una nota explícita o revisar si 0.5 es demasiado alto/bajo comparado con Encogimientos de Hombros (0.7, también semi-compuesto de la zona alta de espalda/trapecio).
3. **Dominadas (0.9) y variantes bodyweight — el problema no es el multiplicador, es que la mecánica de PR no los puede registrar en absoluto.** Este es el hallazgo de mayor severidad de esta fase, y no es "un número mal calibrado" sino una limitación estructural del modelo:
   - El PR y el volumen se calculan siempre sobre el campo `peso` que el usuario escribe manualmente (`calculateVolume(sets, reps, peso, esMancuerna)`).
   - Si un usuario hace dominadas/fondos/flexiones a peso corporal puro (sin lastre añadido), lo natural es que ingrese `peso = 0` (no tiene "kg" que registrar).
   - `calculateVolume` con `peso = 0` da `volumen = 0`.
   - `checkAndUpdatePR()` en `state/session.ts` tiene la guarda explícita `if (ejercicioData.volumen === 0) return;` — **nunca se crea ni actualiza un PR** para esa serie, sin importar cuántas repeticiones se hicieron.
   - Consecuencia en cascada: sin PR, no hay `estimated1RM`, no hay `ExerciseStrength`, el ejercicio nunca entra al cálculo de rango del músculo (`calculateAllMuscleRanks` solo itera sobre `Object.entries(prs)`), y tampoco aporta XP por volumen (el volumen de la sesión tampoco lo suma, porque `volumen = 0`).
   - En la práctica: un usuario cuyo entrenamiento se basa en calistenia/dominadas/fondos a peso corporal (sin discos añadidos) puede entrenar espalda y tríceps de forma real y consistente, y su rango en esos músculos permanecerá en **Hierro para siempre**, porque el sistema entero de rangos/PR/volumen-XP está diseñado alrededor de peso externo cargado, no de peso corporal. Esto afecta a "Dominadas", "Dominadas Agarre Neutro", "Fondos en Banco", "Flexiones" y cualquier variante bodyweight de la tabla — todas tienen multiplicador asignado (por lo que *parece* que el sistema las contempla), pero en la práctica son inalcanzables salvo que el usuario adopte la convención no documentada de escribir su propio peso corporal en el campo "Kg" (lo cual además duplicaría el peso corporal en la fórmula de ratio: `1RM_estimado(peso_corporal) / peso_corporal` ≈ 1.0 fijo, sin relación real con la dificultad del movimiento).
   - Esto es un hallazgo para decidir explícitamente en el rediseño: o se añade un modo "peso corporal + lastre opcional" al input de peso (común en apps de tracking serias), o se acepta como limitación conocida y se documenta para el usuario.

4. **El resto de la tabla está internamente consistente.** Los clusters de curls (0.35-0.4), extensiones de tríceps (0.35-0.45), ejercicios de espalda compuestos (0.7-0.9), y aislamiento de core (0.15-0.4) tienen gradientes razonables entre variantes similares (unilateral vs bilateral, máquina vs libre, aislamiento vs compuesto) sin saltos evidentes salvo los dos puntos señalados arriba.

### Cómo se decide "el mejor ejercicio de cada grupo" (pregunta 3)

Confirmado en `muscle-ranks.ts::calculateMuscleRank()`: es **exclusivamente el ejercicio con el `adjustedRatio` más alto** entre todos los PRs vigentes que pertenecen a ese grupo muscular — **no hay ningún criterio de recencia**. El campo `lastUpdated` existe en `MuscleRankData`/`ExerciseStrength` pero solo se rellena con la fecha del *cálculo* (siempre "ahora"), no con la fecha real del PR — no se usa para desempatar ni para "decaer" un PR viejo. Efecto práctico: si un usuario hizo un PR excepcional en un ejercicio hace 8 meses y no lo ha vuelto a entrenar desde entonces, ese PR sigue siendo "el mejor ejercicio" del músculo y sostiene su rango indefinidamente, aunque el usuario ya no practique ese movimiento. Esto es coherente con el hecho de que los PRs en general no expiran en esta app (no hay ningún mecanismo de "PR obsoleto"), pero vale la pena decidir conscientemente si se quiere ese comportamiento en el rediseño o si un sistema de fuerza "real" debería ponderar por recencia.

---

## FASE 3 — Bug de peso corporal desactualizado

### 1. Flujo exacto: ¿cuándo se lee `profile.weight`?

Hay **dos puntos de lectura**, ambos completos y correctos en sí mismos — el problema no es un cálculo erróneo sino la falta de un tercer punto de disparo:

1. **Al completar una sesión de entrenamiento** (`features/gamification/index.ts::processCompletedSession()`, línea ~311-312):
   ```ts
   const profile = getProfile();
   const bodyweight = profile.weight || DEFAULT_BODYWEIGHT;
   ```
   Esto se ejecuta cada vez que el usuario termina un entrenamiento de pesas (vía `finishWorkout()` → `confirmRPE()`/`skipRPE()` → `processAndShowGamification()` en `workout.ts`). En ese momento, `calculateAllMuscleRanks(allPRs, exerciseToMuscle, bodyweight)` **recalcula los 8 rangos musculares desde cero**, usando el peso corporal actual del perfil en ese instante.
2. **Durante la migración inicial** (`migration.ts::migrateExistingData()`), que corre una sola vez la primera vez que se inicializa el sistema de gamificación (o al subir de versión de esquema), también lee `profile.weight || DEFAULT_BODYWEIGHT` para el cálculo retroactivo.
3. **`onBodyweightChange(newWeight)`** (`index.ts`) existe como tercer punto — recalcularía todo igual que el punto 1 — pero **no está conectado a ningún disparador real** (confirmado por grep: cero llamadas en todo el código fuente además de su propia definición).

### 2. Impacto real: ¿cuánto distorsiona el rango mostrado?

No hay datos reales de usuario disponibles para medir esto (este es un checkout de repositorio limpio — `localStorage` es del navegador del usuario final, no viaja con el código fuente, así que no hay historial/perfil real que inspeccionar desde aquí). El impacto se ilustra con un ejemplo numérico representativo, usando la fórmula exacta del código:

> `adjustedRatio = (peso × (1 + reps/30)) / pesoCorporal / multiplicadorEjercicio`

**Ejemplo:** un usuario nunca completó su perfil (peso corporal = 0 → cae al default de 70kg) y tiene un PR de Press Banca de 80kg × 5 reps.
- 1RM estimado (Epley): `80 × (1 + 5/30) = 93.33kg`
- Multiplicador Press Banca: `1.0`
- Con el default de 70kg: `93.33 / 70 = 1.333` → rango **Diamante** (umbral 1.3-1.6)
- Si el usuario luego completa su perfil con su peso real de 90kg (20kg más pesado que el default), y **no vuelve a completar un entrenamiento inmediatamente después**: el rango mostrado en el mapa muscular sigue anclado en el cálculo viejo con 70kg → sigue mostrando **Diamante**.
- El valor *correcto* con 90kg sería: `93.33 / 90 = 1.037` → rango **Platino** (umbral 0.9-1.1) — **dos rangos por debajo** de lo que la UI sigue mostrando.

La magnitud del error es directamente proporcional a qué tan lejos esté el peso guardado (o el default de 70kg, si el perfil nunca se completó) del peso real del usuario, y es más severo cerca de los límites entre rangos (un usuario con ratio ajustado de 1.28 con el peso viejo y 1.31 con el peso correcto pasaría de "casi Esmeralda" a "recién Diamante" — un salto de rango completo por una diferencia de peso corporal de pocos kilos). Dado que el peso corporal es el dato de perfil más probable de cambiar con el tiempo (a diferencia de altura o fecha de nacimiento), y que muchos usuarios llenan medidas corporales (`saveMeasurement()`) con más frecuencia que como completan entrenamientos, este no es un edge case raro — es plausible que **el rango mostrado esté desactualizado la mayoría del tiempo** para cualquier usuario que trackee su peso activamente en la sección de Medidas Corporales sin entrenar el mismo día.

### 3. Fix propuesto

**El fix mínimo (llamar `onBodyweightChange()` desde `saveProfile()` y `saveMeasurement()`) es funcionalmente suficiente para el caso general**, con una advertencia importante:

- `onBodyweightChange()` ya hace un recálculo **completo desde cero** de los 8 rangos (`calculateAllMuscleRanks(allPRs, exerciseToMuscle, newWeight)` sobre **todos** los PRs actuales, no un ajuste incremental) — no hay riesgo de que queden rangos "a medio actualizar" ni de mezclar cálculos con distinto peso corporal. Conectar la llamada es literalmente suficiente para el caso de ejercicios ya presentes en la base de datos estática.
- **Pero hay un caso borde real que el fix mínimo no cubre**: `onBodyweightChange()` construye el mapa ejercicio→músculo llamando a `getExerciseToMuscleMap()`, que solo usa la base de datos estática de ~100 ejercicios (`data/exercises.ts::allExercises`). En cambio, `processCompletedSession()` (el punto 1 de arriba) **además** completa ese mapa con los ejercicios de la sesión actual que no estén en la base estática (líneas 336-346 de `index.ts`), lo cual es exactamente cómo se registran los **ejercicios personalizados** creados por el usuario en el Workout Builder. Si un usuario tiene un PR en un ejercicio personalizado que contribuye a que un músculo tenga rango Oro, y luego se dispara `onBodyweightChange()` (con el fix mínimo) sin haber vuelto a entrenar ese ejercicio personalizado recientemente, el recálculo usaría un mapa que **no conoce ese ejercicio personalizado** — su PR quedaría fuera del cálculo de ese músculo, bajando su rango silenciosamente hasta el próximo entrenamiento que lo vuelva a "parchar" en el mapa.
- **Recomendación:** no basta con conectar el cable tal cual existe hoy. El fix correcto es: (a) conectar `onBodyweightChange(profile.weight)` al final de `saveProfile()` (cuando `weight > 0`) y de `saveMeasurement()` (cuando `measurement.weight` está presente), **y** (b) antes de eso, extender la construcción del mapa ejercicio→músculo dentro de `onBodyweightChange()` para que incluya ejercicios personalizados — reutilizando el mismo patrón que ya usa `migrateExistingData()` (recorrer `getHistory()` completo y parchar cualquier ejercicio no encontrado en el mapa estático, en vez de depender solo de la sesión actual como hace `processCompletedSession()`). Esto es un cambio pequeño y acotado, no un recalculo "desde cero" del sistema — pero sin él, el fix mínimo solucionaría el bug para la mayoría de los usuarios y lo dejaría parcialmente presente para cualquiera que use ejercicios personalizados.

---

## FASE 4 — Consolidación de racha triplicada

### Las tres implementaciones, lado a lado

| | `navigation.ts::getQuickHomeStats()` | `history.ts::getQuickStats()` | `gamification/xp.ts::calculateCurrentStreak()` |
|---|---|---|---|
| **Consumidores reales** | Hero de Home (`updateHeroSection`, vía `generateInsight`) | Ninguno encontrado en el código actual (función exportada, sin punto de uso visible) | `processCompletedSession()` y `migration.ts` — es la que determina XP de racha, logros de racha, y el número mostrado en el modal "Progreso" |
| **Filtra cardio** | Sí (`s.type !== 'cardio'`) | Sí (`s.type !== 'cardio'`) | **No** — recibe `getHistory()` sin filtrar |
| **Campo de fecha usado** | `s.savedAt \|\| s.date` | `s.savedAt \|\| s.date` | Solo `session.date` (nunca mira `savedAt`) |
| **Tope máximo representable** | **7** (el `for` corre `i < 7`, imposible devolver más de 7 aunque la racha real sea de 40 días) | **7** (mismo patrón exacto) | Sin tope — cuenta días únicos consecutivos reales, sin límite |
| **Método de conteo** | Bucle día por día desde hoy, `break` en el primer hueco (salvo el día de hoy) | Idéntico al anterior, código duplicado casi carácter por carácter | Recolecta fechas únicas en un `Set`, ordena, verifica que la más reciente sea hoy o ayer, cuenta consecutivos hacia atrás sin límite de iteraciones |

### Divergencias reales (no solo "está duplicado")

1. **Cardio cuenta para la racha "oficial" pero no para la del Home.** Esta es la divergencia con más impacto en lo que el usuario percibe: un usuario que solo hace sesiones de Tabata/EMOM todos los días verá **racha = 0 en el Home** (porque `getQuickHomeStats` excluye cardio) mientras que, por debajo, `calculateCurrentStreak` (con el historial completo, cardio incluido) sí está incrementando su racha real, desbloqueando los logros "Semana Perfecta"/"Mes Imparable"/"Trimestre de Hierro" y otorgando XP de racha — y el modal de "Progreso" mostraría un número de racha mayor a 0 que contradice lo que el Home acaba de mostrar. Es una inconsistencia visible para cualquier usuario que combine ambos tipos de entrenamiento o entrene solo cardio.
2. **El tope de 7 en Home/Historial esconde rachas largas.** Cualquier usuario con una racha real de, por ejemplo, 20 días consecutivos de pesas verá el badge de "Racha" en Home estancado en **7** para siempre (el bucle nunca puede devolver más de 7 porque solo itera 7 veces) mientras el motor de gamificación registra correctamente 20 y ya pagó el XP/logro de "Mes Imparable" en el día 30 real. Este divergencia no depende de mezclar cardio/pesas — ocurre incluso para un usuario que solo entrena pesas.
3. **Diferencia de `date` vs `savedAt`** es la única de las tres divergencias que en la práctica casi nunca se manifiesta con los datos actuales (`date` y `savedAt` casi siempre caen en el mismo día calendario, salvo el caso borde de una sesión iniciada antes de medianoche y guardada después), pero es una divergencia real de comportamiento que un futuro cambio (por ejemplo, sesiones que se completan asíncronamente o se sincronizan desde otro dispositivo con distinto huso horario) podría hacer visible.
4. **`history.ts::getQuickStats()` parece no tener ningún consumidor activo hoy** — es código correcto pero probablemente muerto o reservado para una pantalla que nunca se conectó (no aparece invocado desde `main.ts`, `navigation.ts` ni ningún otro módulo revisado). Vale la pena confirmarlo con una búsqueda final antes de decidir su destino, pero no cambia el diagnóstico: aun si se elimina, seguirían existiendo dos implementaciones divergentes (Home vs gamificación), no una.

### Recomendación de consolidación

**La única fuente de verdad debería ser `calculateCurrentStreak()` de `gamification/xp.ts`**, por tres razones: (a) es la que ya determina consecuencias reales del negocio (XP, logros, milestones) — cualquier otra racha que no coincida con ella es, por definición, la que está "mal" desde la perspectiva del sistema de recompensas; (b) no tiene el tope artificial de 7 días; (c) su método de fechas únicas en un `Set` es más robusto que el bucle de 7 iteraciones.

Cambios necesarios para consolidar:

1. **Decidir explícitamente si cardio debe o no contar para la racha "de verdad".** Este no es un detalle de refactor — es una decisión de producto que hoy está resuelta por accidente de forma distinta en cada lugar. Sea cual sea la decisión, debe aplicarse consistentemente pasando el parámetro de filtrado correcto a `calculateCurrentStreak()` en sus tres puntos de llamada (`processCompletedSession`, `migrateExistingData`, y el nuevo consumidor de Home).
2. **`navigation.ts::getQuickHomeStats()`** debería eliminar su bucle propio y en su lugar leer la racha ya calculada y persistida en `GamificationState.streakData.currentStreak` (vía `getStreakInfo()`, que ya existe y ya expone `current`/`best`/`lastWorkout`) — sin recalcular nada, solo consumir el estado de gamificación como fuente única. Esto también resuelve el tope de 7 automáticamente, porque `streakData.currentStreak` no tiene ese límite.
3. **`history.ts::getQuickStats()`** — si al confirmarse que no tiene consumidores se decide conservar la función (por si se usa en el rediseño), debería aplicar el mismo cambio: delegar a `getStreakInfo()` en vez de reimplementar el bucle. Si no tiene consumidores y no se planea usar, es candidata directa a eliminar en vez de "consolidar".
4. Ambos cambios son de bajo riesgo porque `getStreakInfo()` ya es parte de la API pública exportada por `features/gamification` — no requiere tocar el motor de cálculo, solo redirigir dos puntos de lectura.

---

## Resumen de severidad para decidir alcance del rediseño

| Hallazgo | Severidad | Tipo |
|---|---|---|
| Racha del Home limitada a 7 días (nunca refleja rachas reales más largas) | **Alta** | Bug de UI visible al usuario a diario |
| Cardio cuenta para XP/logros de racha pero no para el número mostrado en Home | **Alta** | Inconsistencia visible + confianza en el sistema de recompensas |
| Ejercicios a peso corporal puro (dominadas, fondos, flexiones) no pueden generar PR ni aportar a rango muscular | **Alta** | Limitación estructural del modelo, no un bug puntual |
| Peso corporal desactualizado no dispara recálculo de rangos hasta el próximo entrenamiento | **Media-Alta** | Bug de datos silencioso, probablemente frecuente |
| `onBodyweightChange()` (si se conecta con el fix mínimo) no incluye ejercicios personalizados en el recálculo | **Media** | Edge case del fix propuesto, no del bug original |
| Sentadilla Hack con multiplicador menor que Sentadilla libre | **Baja-Media** | Calibración cuestionable, sin impacto salvo en el rango específico de piernas de ese usuario |
| Logros de "variedad" cuentan alias no normalizados como ejercicios distintos | **Baja** | Puede inflar el contador, sin consecuencia grave |
| Sin ícono/emoji por logro (solo genérico por estado) | **Informativo** | No es un bug, es una limitación de diseño visual a resolver en el rediseño si se desea |
| `history.ts::getQuickStats()` posiblemente sin consumidores | **Baja** | Candidata a limpieza, no a fix |

Ningún fix se implementó en esta sesión, según lo solicitado — este documento es insumo para decidir alcance antes de la sesión de implementación.
