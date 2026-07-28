# GymMate — Inventario UX/UI Completo (pre-rediseño)

**Fecha:** 2026-07-28
**Propósito:** Inventario exhaustivo de todo lo que la app hace de cara al usuario hoy, para no perder funcionalidad real al rediseñar desde cero. No contiene propuestas de diseño ni cambios de código — solo inventario y hallazgos.
**Metodología:** Lectura completa de `src/main.ts`, `src/ui/*`, `src/features/*` (workout, cardio, history, calculators, profile, timer, charts, coach, gamification/*) y `src/data/*`, cruzado contra `AUDIT.md` (auditoría técnica previa de este mismo repo).

---

## FASE 1 — Inventario de pantallas

La app es una SPA de una sola página (`index.html`) donde "pantallas" son contenedores DOM que se muestran/ocultan (`classList.add/remove('hidden')`), no rutas reales. No hay React Router ni History API — la URL nunca cambia. Este inventario trata cada vista distinguible como una "pantalla".

### 1. Home / Dashboard (`homeView`)

- **Propósito:** landing principal, punto de entrada a todo lo demás.
- **Elementos interactivos:**
  - Tarjeta "Continuar entrenamiento" (solo si hay draft activo no expirado) — botones Continuar / Descartar (✕).
  - 5 tarjetas de rutinas predefinidas (Grupo 1-5), clicables.
  - Sección "Mis Rutinas" (rutinas personalizadas del usuario) — clicables, cada una con botón eliminar (🗑).
  - Hero card de gamificación (mapa muscular mini + nivel + racha) — clicable, abre modal de Progreso.
  - FAB (botón flotante) para crear rutina personalizada → abre Workout Builder.
  - Navegación inferior (bottom nav): Home, Entrenar, Historial, Perfil + acceso a Cardio/Calculadoras/PRs/Gráficos vía `data-action`.
- **Datos mostrados y origen:**
  - Saludo por hora del día (calculado en cliente, sin storage).
  - Insight ML del hero (`generateInsight()` en `utils/insights.ts`) — prioriza: draft pendiente > racha en riesgo > racha en llamas > volumen semanal ↑/↓ > músculo descuidado > cerca de PR > mejor semana > logro de consistencia (múltiplos de 10 entrenos) > comeback tras inactividad > usuario nuevo > racha 3-4 días > "recién entrenaste" > mensaje genérico.
  - Stats rápidos: total entrenos, racha (calculada in-line en `navigation.ts`, duplicando lógica de `history.ts`/`insights.ts`), volumen semanal.
  - PR reciente (últimos 30 días) leído directo de `localStorage['gymmate_prs']`.
  - Hero de gamificación: nivel, XP, racha, mapa muscular coloreado por rango (todo desde `features/gamification`).
- **Estados:**
  - Vacío (0 entrenos): mensaje "✨ Comienza tu primer entrenamiento" en vez de stats numéricos.
  - Con datos: stats + insight dinámico.
  - No hay estado de carga (todo síncrono sobre localStorage) ni estado de error visible al usuario (los `catch` de este archivo solo hacen `console.error`, la UI no muestra nada si algo falla).
- **Navegación:** entra por defecto al abrir la app o al pulsar "Home" en cualquier momento (con confirmación nativa `confirm()` si hay cambios sin guardar en un entrenamiento activo). Lleva a: Workout (rutina), Cardio selector, Historial, PRs, Gráficos, Calculadoras, Perfil, modal de Progreso, Workout Builder.

### 2. Entrenamiento activo (`workoutTab`)

- **Propósito:** registrar sets/reps/kg de una sesión de pesas en curso.
- **Elementos interactivos:**
  - Por cada ejercicio: botón check (marcar completado), inputs numéricos Sets/Reps/Kg (con +/− y teclado numérico), botón de guía (imagen o texto de técnica).
  - Separación visual entre ejercicios obligatorios y opcionales.
  - Botón de timer de descanso (abre modal de tiempos predefinidos).
  - Botón Guardar (deshabilitado si no hay datos).
  - Botón Terminar Entrenamiento (dispara flujo de RPE + gamificación).
  - Indicador "cambios sin guardar" / "cambios guardados".
- **Datos mostrados y origen:**
  - Ejercicios de la rutina (`trainingGroups` o rutina personalizada vía `getTrainingGroup()`).
  - Volumen por ejercicio (`sets × reps × peso`, ×2 si es mancuerna) — recalculado en vivo en cada `onchange` de input, sin round-trip a servidor (no hay servidor).
  - Barra de volumen por grupo muscular + volumen total de la sesión.
  - Quick stats: volumen total, ejercicios con datos, completados X/Y, sets totales.
  - Coach contextual (banner superior): último volumen de este grupo, distancia al PR, tips aleatorios, mensajes de progreso — todo generado en `features/coach.ts` (ver Fase 2).
  - Última vez que se hizo cada ejercicio (peso/reps) si existe en historial.
- **Estados:**
  - Vacío/inicial: sin rutina cargada, secciones ocultas.
  - Con datos: inputs poblados, volumen y coach activos.
  - Restaurado desde draft: `renderFromDraft()` reconstruye la UI completa desde el autoguardado (sin distinguir visualmente "esto es un draft restaurado" más allá de la tarjeta previa en Home).
  - No hay estado de error ni de carga (no hay red).
- **Navegación:** se llega desde Home (rutina o Continuar draft) o desde "Mis Rutinas". Botón atrás implícito es "Home" (con confirmación si hay datos sin guardar). Terminar Entrenamiento dispara: modal RPE → (opcional) popup de resumen de XP → `window.location.reload()` completo de la página.

### 3. Cardio & HIIT (4 sub-pantallas)

**3a. Selector de modo (`cardioSelectorView`)**
- 6 tarjetas clicables: Tabata, EMOM, AMRAP, Circuito, Pirámide, Personalizado.
- Botón atrás → Home.

**3b. Configuración (`cardioConfigView`)**
- UI distinta por modo:
  - Tabata: rondas, trabajo (s), descanso (s) — steppers +/−.
  - EMOM: minutos totales, selector de ejercicio (dropdown de `cardioExercises`), reps por minuto.
  - AMRAP: duración en minutos.
  - Pirámide: visualización de barras de niveles, 6 presets (Corta/Media/Larga/Intensa/Extendida/Reset), botones Escalar ↑/↓ (proporcional), descanso entre niveles.
  - Circuito/Personalizado: rondas, trabajo (s), descanso (s) — **misma UI genérica que "Personalizado"**, sin lista de ejercicios propia pese a que el modelo de datos (`CardioConfig.exercises`, `roundRest`) lo contempla (ver Fase 3).
- Botón "Comenzar" inicia countdown de preparación (3-2-1-¡GO!) con beep/vibración.

**3c. Timer activo (`cardioTimerView`)**
- Anillo de progreso SVG animado + cronómetro grande.
- Botones: Pausar/Reanudar, Detener (con `confirm()`).
- Contenido específico por modo: contador de rondas tocable en AMRAP, nombre+reps del ejercicio en EMOM, barras de nivel en Pirámide.
- Overlay "PAUSADO" a pantalla completa cuando está en pausa.
- Beep sonoro (Web Audio API) en 3-2-1 y al cambiar de fase; vibración como fallback si el audio falla.

**3d. Resumen (`cardioSummaryView`)**
- Tiempo total, rondas completadas, tiempo de trabajo, calorías estimadas (fórmula fija: ~10 kcal/min de trabajo).
- Botón "Volver al Inicio".
- **Datos:** guarda automáticamente la sesión en el historial unificado (`type: 'cardio'`) al finalizar, sin paso de confirmación ni RPE (a diferencia de pesas).
- **Estados:** no hay estado vacío/error; el flujo siempre termina en resumen salvo que el usuario cierre la pestaña/app a mitad del timer (en cuyo caso la sesión de cardio **se pierde por completo** — no existe draft/autoguardado para cardio, a diferencia de pesas).

### 4. Historial (`historyTab`)

- **Propósito:** ver y gestionar entrenamientos pasados (pesas y cardio unificados).
- **Elementos interactivos:** botón eliminar por entrada (`confirm()` nativo), botón exportar CSV, botón importar CSV (abre selector de archivo del sistema).
- **Datos mostrados:** por sesión de pesas — grupo, fecha, volumen total, completados/total. Por sesión de cardio — modo, fecha, tiempo total, rondas.
- **Estados:**
  - Vacío: "No hay entrenamientos guardados aún".
  - Con datos: lista completa (hasta 200 sesiones).
  - Importación CSV: éxito/duplicados se comunican vía `alert()` nativo (no hay toast ni modal propio pese a que existe un componente `showToast()` sin usar); error de formato también vía `alert()`.
- **Navegación:** accesible desde bottom nav o accesos rápidos de Home.

### 5. Personal Records / PRs (`prsTab`)

- **Propósito:** ver el mejor registro histórico por ejercicio.
- **Elementos interactivos:** ninguno más que scroll (no hay edición manual de PRs desde esta pantalla).
- **Datos:** nombre del ejercicio, peso, sets×reps, fecha — ordenado por fecha descendente.
- **Estados:** vacío ("Registra tus primeros entrenamientos...") / con datos.

### 6. Gráficos (`chartsTab`)

- **Propósito:** visualización de progreso vía Chart.js.
- **Elementos interactivos:** dropdown para elegir ejercicio (gráfico de progreso de peso).
- **4 gráficos:**
  1. Tendencia de volumen (línea, últimas 30 sesiones + media móvil de 5 sesiones + tooltip con promedio/máximo/tendencia %).
  2. Distribución muscular (dona, volumen acumulado por grupo muscular histórico).
  3. Progreso de peso por ejercicio elegido (línea).
  4. Comparativa semanal (barras, últimas 8 semanas).
- **Estados:** mensaje "No hay datos suficientes..." si el historial está vacío; mensaje específico "No hay datos para este ejercicio" si el ejercicio elegido no tiene registros con peso > 0.

### 7. Calculadoras (`calculatorsTab`)

- **Propósito:** 3 calculadoras independientes en la misma pantalla.
- **1RM:** dropdown de ejercicios ya usados → mejor registro histórico + 3 fórmulas (Epley, Brzycki, Lombardi) + promedio.
- **Calorías:** inputs manuales (edad, sexo, peso, altura, nivel de actividad) + botón "prellenar desde perfil" + botón calcular → BMR (Mifflin-St Jeor) + TDEE + déficit/mantenimiento/superávit (±20%).
- **Peso Progresivo:** dropdown de ejercicios con PR → 3 sugerencias de próximo peso (conservador/moderado/agresivo) según si es tren superior o inferior (detectado por keyword matching sobre el nombre), redondeado a múltiplos de 2.5kg.
- **Estados:** mensaje "No hay datos suficientes" (1RM) / "No hay PRs registrados" (progresivo) cuando no aplica; validación con `alert()` si faltan campos obligatorios en calorías.

### 8. Perfil (`profileTab`)

- **Propósito:** datos personales + medidas corporales.
- **Elementos interactivos:** formulario (nombre, fecha nacimiento, sexo, peso, altura, nivel actividad) con guardado explícito; botón "Registrar Medición" (abre modal); botón "Ver Historial" de mediciones.
- **Datos:** edad calculada automáticamente desde fecha de nacimiento; preview de última medición (peso, pecho, cintura, brazo, % grasa si aplica).
- **Estados:** mensaje de éxito temporal tras guardar; no hay estado de error visible (los campos numéricos simplemente aceptan 0 si están vacíos).

### Modales (transversales, no "pantallas" pero funcionalmente equivalentes)

| Modal | Disparado desde | Contenido | Cierra con |
|---|---|---|---|
| **Workout Builder** | FAB en Home | Selección de ejercicios (predefinidos + personalizados) para crear rutina custom, formulario para añadir ejercicio nuevo, nombre auto-sugerido | Guardar / Cancelar |
| **RPE** | Terminar Entrenamiento | Selector 1-10 con etiqueta (Muy fácil → Máximo absoluto), color por rango | Confirmar / Omitir |
| **Rest Timer** (selección + banner activo) | Botón timer en ejercicio | 6 tiempos predefinidos (1-5 min) + rápidos (30/45/90s), banner con cuenta regresiva, pausar/detener | Manual o automático al llegar a 0 |
| **Guía de ejercicio** (`animationModal`) | Botón de guía en cada ejercicio | Imagen (con fallback a texto si falla la carga) o texto de técnica | Botón cerrar / clic fuera / Esc |
| **Medidas corporales** | Perfil | Formulario de 8 medidas + cálculo en vivo de % grasa (Navy method) | Guardar / cerrar |
| **Historial de medidas** | Perfil | Lista cronológica de todas las mediciones, cada una eliminable | Cerrar |
| **Progreso (gamificación)** | Hero card de Home | Nivel+XP, mapa muscular dual (frente+espalda), logros (acordeón), guía de rangos (acordeón), guía de niveles (acordeón), herramienta "Recalcular XP" | Botón cerrar (✕) |
| **Resumen de sesión (XP)** | Al terminar entrenamiento con datos | Desglose de XP ganado (base, volumen, PRs, racha, logros, subida de rango), badge de nivel, rank-ups | Botón "Continuar" |

---

## FASE 2 — Inventario de funcionalidades por módulo

### Home / Dashboard

- **Widget de racha:** calculado de forma **redundante en 3 lugares distintos** con lógica casi idéntica pero no compartida: `navigation.ts::getQuickHomeStats()`, `history.ts::getQuickStats()`, y `gamification/xp.ts::calculateCurrentStreak()` (esta última es la que realmente alimenta el rango/nivel; las otras dos alimentan solo texto de UI). Las tres cuentan "días consecutivos con al menos una sesión de pesas" pero con pequeñas diferencias de implementación (una excluye cardio explícitamente, otra no revisa unicidad de fecha con `Set`).
- **XP/Nivel:** alimentado por `features/gamification`, calculado sobre tabla de 100 niveles con requisitos crecientes por tramos (ver tabla completa abajo).
- **Mapa muscular:** SVG de polígonos (frente + espalda), coloreado según el rango de fuerza de cada uno de 8 grupos musculares de gamificación (no los 8 `MuscleGroup` del sistema de entrenamiento — hay un mapeo intermedio, ver Fase 2 Gamificación).
- **Sugerencias tipo "cerca del PR":** disparadas por `analyzePRProximity()` en `insights.ts` (home) y por `updateCoachOnExerciseUpdate()` en `coach.ts` (durante el entrenamiento) — dos implementaciones distintas del mismo concepto (90%+ del PR), una para el hero de Home y otra para el banner del coach en vivo.
- **Accesos rápidos:** botones `data-action` en bottom nav / home → cambian de tab directamente (Historial, Calculadoras, Perfil) o abren Cardio selector.

### Entrenamientos / Rutinas

- **Rutinas predefinidas:** 5 grupos fijos (`trainingGroups` en `data/training-groups.ts`), cada uno con ejercicios obligatorios + opcionales, hard-codeados (no editables, solo "clonables" indirectamente creando una rutina personalizada con los mismos ejercicios).
- **Rutinas personalizadas:** creadas vía Workout Builder, guardadas en `localStorage['gymmate_custom_workouts']`, aparecen en Home bajo "Mis Rutinas", eliminables.
- **Flujo de creación de rutina personalizada:**
  1. Selección de ejercicios de listas agrupadas por rutina predefinida + sección "Más ejercicios disponibles" agrupada por músculo (100 ejercicios adicionales en `data/exercises.ts`, filtrados para no duplicar los ya presentes en rutinas predefinidas).
  2. Formulario colapsable para crear un ejercicio 100% nuevo (nombre, grupo muscular, es-mancuerna) — se guarda en `localStorage['gymmate_custom_exercises']` y se auto-selecciona.
  3. Nombre de la rutina auto-sugerido según los grupos musculares elegidos (editable).
  4. Guardar crea un objeto `CustomWorkout` con `esMancuerna` resuelto por prioridad: ejercicio personalizado → base de datos → rutinas predefinidas → `false` por defecto.
- **Sesión activa:** ver Fase 1 punto 2. El cálculo de volumen es 100% frontend y en vivo (`calculateVolume()` en `utils/calculations.ts`), sin backend que lo verifique.
- **Ejercicios opcionales vs. obligatorios:** puramente visual/organizativo — no afecta el cálculo de volumen ni el guardado; un ejercicio "opcional" con datos cuenta igual que uno obligatorio.
- **Guardar entrenamiento:** persiste a `localStorage['gymmate_session']` + agrega/actualiza entrada en `localStorage['gymmate_history']`, limpia el draft. No cierra la sesión (se puede seguir editando y volver a guardar).
- **Terminar Entrenamiento:** si hay cambios sin guardar, pregunta si guardar antes (`confirm()`); si se cancela esa pregunta, **descarta todo sin guardar** y recarga la página. Si se acepta o ya estaba guardado, muestra modal de RPE → guarda RPE (si no se omite) → procesa gamificación (XP, PRs de la sesión, rangos, logros, racha) → muestra popup de resumen de XP → limpia sesión → `window.location.reload()` (recarga completa del documento, no solo un cambio de vista).

### Historial

- **Por sesión:** fecha, grupo/modo, volumen o tiempo, completados/rondas.
- **Exportar CSV:** dos secciones en un mismo archivo — "ENTRENAMIENTOS DE PESAS" (Fecha, Grupo, Ejercicio, Sets, Reps, Peso, Es Mancuerna, Grupo Muscular, Volumen, Completado, Volumen Total Sesión) y "SESIONES DE CARDIO" (Fecha, Modo, Tiempo Total, Tiempo Trabajo, Tiempo Descanso, Rondas Completadas, Calorías Estimadas). Incluye BOM UTF-8 para que Excel abra tildes correctamente. Nombre de archivo con fecha del día.
- **Importar CSV:** valida headers esperados, reconstruye sesiones agrupando filas por Fecha+Grupo, detecta duplicados comparando contra el historial existente (por fecha formateada + nombre de grupo — **no por contenido**, así que dos sesiones distintas del mismo grupo el mismo día se tratarían como duplicado), actualiza PRs si el peso importado supera el PR actual.
- **Eliminar:** por índice, con `confirm()` nativo, sin deshacer.

### Calculadoras

- **1RM:** fórmulas Epley (`peso×(1+reps/30)`), Brzycki (`peso×36/(37-reps)`), Lombardi (`peso×reps^0.1`), promedio de las tres. Usa el mejor registro histórico (mayor peso, desempate por más reps) del ejercicio elegido, comparando por nombre normalizado (ver `exercise-normalizer.ts`).
- **Calorías:** Mifflin-St Jeor — hombre: `10×peso + 6.25×altura − 5×edad + 5`; mujer: `10×peso + 6.25×altura − 5×edad − 161`. TDEE = BMR × factor de actividad (seleccionable). Déficit = TDEE×0.8, superávit = TDEE×1.2.
- **Peso Progresivo:** basado en el PR actual del ejercicio × incremento porcentual fijo según tipo de ejercicio (tren inferior: +2.5/+7.5/+10%; tren superior: +2.5/+5/+7.5%), redondeado hacia arriba a múltiplos de 2.5kg. La detección de "tren inferior" es un `includes()` de keywords (squat, prensa, pierna, rdl, hip thrust, etc.) sobre el nombre del ejercicio — no usa el campo `grupoMuscular` real, lo que puede dar falsos negativos en ejercicios con nombres atípicos.

### Perfil

- **Datos:** nombre, fecha de nacimiento (con límites min/max en el input), sexo, peso, altura, nivel de actividad (factor numérico de 1.2 a ~1.9 típico de fórmulas TDEE).
- **Edad:** calculada en cliente cada vez que cambia la fecha de nacimiento; se recalcula también al cargar el perfil guardado.
- **Medidas corporales:** peso, cuello, pecho, cintura, cadera, brazo izq/der, muslo izq/der — hasta 100 mediciones guardadas, una por día (si ya existe una medición el mismo día, se sobrescribe en vez de duplicar).
- **% Grasa corporal (método Navy):** hombre: `86.010×log10(cintura−cuello) − 70.041×log10(altura) + 36.76`; mujer: `163.205×log10(cintura+cadera−cuello) − 97.684×log10(altura) − 78.387`. Se calcula en vivo mientras se completa el formulario y también al guardar; se descarta si el resultado es <0% o >60% (out of range).
- **Sync peso↔perfil:** si el peso registrado en una medición difiere del peso del perfil, se actualiza el perfil automáticamente.
- **Backup/exportación:** **no existe backup/exportación específico de Perfil.** El único mecanismo de exportación de datos de toda la app es el CSV de Historial (Fase 1/2 arriba), que no incluye perfil ni medidas corporales — si el usuario borra datos del sitio, el perfil y las mediciones corporales se pierden sin ninguna vía de recuperación o exportación.

### Gamificación

Sistema completo de dos componentes independientes (nivel de cuenta 1-100 + rango por grupo muscular), documentado en detalle en `docs/GAMIFICATION_IMPLEMENTATION_PLAN.md` (1,663 líneas) e implementado en `features/gamification/` (~2,400 líneas) + `ui/gamification/` (~1,600 líneas).

**Tabla de progresión de niveles (1-100):**

| Tramo | Niveles | XP requerido por nivel | Título |
|---|---|---|---|
| 1 | 1-16 | 400 → 967 (lineal, +33/nivel) | Principiante I-V |
| 2 | 17-33 | 1,000 → 2,280 (+40/nivel) | Novato I-V |
| 3 | 34-50 | 1,000 → 2,280 (+40/nivel, continúa la misma pendiente) | Intermedio I-V |
| 4 | 51-66 | 2,200 → 3,360 (+40/nivel) | Avanzado I-V |
| 5 | 67-83 | 2,200 → 3,600 (+40/nivel) | Élite I-V |
| 6 | 84-99 | 3,400 → 4,032 (+42/nivel) | Legendario I-V |
| 7 | 100 | — (tope) | Simétrico (único, sin numeral) |

Cada título (salvo Simétrico) se subdivide en 5 sub-niveles con numeral romano I-V según la posición dentro del tramo.

**Fuentes de XP por sesión:**

| Fuente | XP | Detalle |
|---|---|---|
| Completar entrenamiento (pesas) | 50 fijo | Siempre se otorga si la sesión tiene volumen > 0 |
| Completar sesión de cardio | 40 fijo | + bonus por modo (Tabata 15, Pirámide 12, AMRAP 10, EMOM 5, resto 5) + tiempo de trabajo escalonado (máx. 55) + rondas completadas (1 XP/ronda, máx. 20) |
| Volumen (pesas) | Escalonado, máx. 55 total | 1 XP/200kg (0-5,000kg, máx 25) → 1 XP/400kg (5,000-10,000, máx 12) → 1 XP/800kg (10,000-20,000, máx 12) → 1 XP/1,600kg (20,000+, máx 6) |
| PR — micro (+1-2kg) | 30 | |
| PR — menor (+3-5kg) | 60 | |
| PR — sólido (+6-10kg) | 100 | |
| PR — mayor (+11-15kg) | 150 | |
| PR — excepcional (+16kg+) | 250 | |
| Racha 3/7/14/30/60/90 días | 25/75/150/350/750/1200 | Se reclama una sola vez por milestone alcanzado |
| Subida de rango muscular | 25 (Bronce) → 1,000 (Simétrico) | Ver tabla de rangos abajo |
| Logro desbloqueado | 75-25,000 según logro | 25 logros en 6 categorías |

**Rachas:** se calculan sobre fechas únicas de sesiones de pesas (cardio no cuenta para streak), contando días consecutivos hacia atrás desde hoy o ayer (si la última sesión fue anteayer o antes, la racha se considera rota y vuelve a 0). El "mejor racha" histórico se conserva aunque la actual se rompa.

**Rangos musculares (8 grupos: pecho, espalda, hombros, bíceps, tríceps, piernas, glúteos, core):**

| Rango | Ratio (1RM estimado ÷ peso corporal, ajustado) | XP al subir |
|---|---|---|
| Hierro | 0 - 0.3 | 0 (inicial) |
| Bronce | 0.3 - 0.5 | 25 |
| Plata | 0.5 - 0.7 | 50 |
| Oro | 0.7 - 0.9 | 100 |
| Platino | 0.9 - 1.1 | 150 |
| Esmeralda | 1.1 - 1.3 | 250 |
| Diamante | 1.3 - 1.6 | 400 |
| Campeón | 1.6 - 2.0 | 600 |
| Simétrico | 2.0+ | 1,000 |

El ratio se ajusta por un "multiplicador de ejercicio" (tabla de ~100 ejercicios con multiplicadores de 0.15 a 2.0 — press banca = 1.0 como referencia, prensa de piernas = 2.0, elevación lateral = 0.2, etc.) para que ejercicios con más o menos apalancamiento mecánico no distorsionen el rango. El rango de cada músculo se toma del **mejor ejercicio** de ese grupo, no del promedio. Si no hay peso corporal registrado en el perfil, se usa 70kg por defecto — **y este valor por defecto nunca se recalcula automáticamente si el usuario luego actualiza su peso real en Perfil** (ver Fase 3, `onBodyweightChange` es código muerto).

**Logros (25 total en 6 categorías):** sesiones (6: 1/10/25/100/500/1,000), volumen (5: 100K/500K/1M/5M/10M kg), PRs (4: 1/10/50/100), rachas (3: 7/30/90 días), rangos (5: primer Oro, todos Plata, primer Diamante, primer Simétrico, todos Simétrico), especiales (2: usar 10/30 ejercicios distintos).

**Mapa muscular:** SVG de polígonos vectoriales (basado en el algoritmo de `react-body-highlighter`, reescrito a mano), vista frontal en el hero de Home, vista dual frente+espalda en el modal de Progreso. Color y "glow" por rango (Hierro = gris sin brillo, Simétrico = azul con brillo fuerte + texto "shiny" animado).

**PRs:** se detectan comparando el peso ingresado contra el PR guardado por nombre normalizado (`exercise-normalizer.ts`, ~540 líneas de alias tipo "prensa"/"leg press"/"press de piernas" → nombre canónico) cada vez que se actualiza un input de peso durante el entrenamiento (`checkAndUpdatePR()` en `state/session.ts`) — el PR se guarda **inmediatamente**, no al terminar el entrenamiento. La comparación "PRs conseguidos en esta sesión" para el popup de XP usa una captura de los PRs al *inicio* de la sesión (`captureSessionStartPRs()`) contra los PRs al *final*.

### Timer de descanso

- 6 tiempos predefinidos (1-5 min visibles como botones + variantes rápidas 30/45/90s según UI del modal, no leída en detalle aquí pero referenciada por `data-seconds`).
- Sonido vía Web Audio API (beep 800Hz) + vibración (`navigator.vibrate`) al terminar.
- **Notificación local del sistema:** si el usuario concedió permiso, se dispara `new Notification('GymMate', {...})` al terminar el descanso. El permiso se solicita proactivamente al cargar la app (`Notification.requestPermission()` en `initializeTimerListeners()`) si está en estado `default` — **no está gateado detrás de una acción explícita del usuario**, lo cual en iOS/Safari puede no funcionar como se espera (Safari es más estricto sobre exigir un gesto directo del usuario para el prompt de permiso; ver `AUDIT.md` Fase 3 para el detalle de limitaciones de iOS). Esta notificación es **local** (mientras la app está abierta), no Web Push — no persiste ni se entrega si la app está cerrada.

---

## FASE 3 — Brechas y funciones fantasma

### 1. UI sin lógica conectada (botones/secciones que no hacen nada)

No se encontraron botones "muertos" en las pantallas principales — todo lo que es clicable en las 8 pantallas y sus modales dispara alguna función real. La brecha va en la dirección contraria (ver punto 2).

### 2. Lógica sin UI expuesta (funciones/datos "muertos" o a medio construir)

Esta es la categoría con más hallazgos — el módulo de gamificación en particular tiene una cantidad significativa de superficie construida y nunca conectada:

| Elemento | Ubicación | Estado |
|---|---|---|
| **Modo de cardio "For Time"** | `types/index.ts` (`CardioMode`), `cardio.ts` (`DEFAULT_CONFIGS.fortime`, nombre en 3 diccionarios de `modeNames`), `constants.ts` (`CARDIO_MODE_BONUS.fortime`) | Existe en el modelo de datos y en el sistema de XP, pero `showCardioSelector()` **nunca renderiza una tarjeta para él** — es completamente inalcanzable desde la UI. |
| **Bonus de XP "hiit"** | `gamification/constants.ts::CARDIO_MODE_BONUS.hiit` | El propio comentario en el código dice *"no existe actualmente pero por si se agrega"* — bonus definido para un modo de cardio que nunca ha existido. |
| **Configuración de ejercicios en modo Circuito** | `types/index.ts` (`CardioConfig.exercises`, `roundRest`) | El modo "Circuito" es seleccionable y funcional, pero cae en la misma UI genérica que "Personalizado" (rondas/trabajo/descanso) — nunca se construyó la pantalla para elegir la lista de ejercicios del circuito ni para usar `roundRest` (descanso entre rondas, distinto del descanso entre ejercicios). |
| **`onBodyweightChange()`** | `features/gamification/index.ts` | Función exportada que recalcularía todos los rangos musculares si cambia el peso corporal. **Nunca se llama** — ni `profile.ts::saveProfile()` ni `saveMeasurement()` la invocan. Efecto práctico: si un usuario actualiza su peso en Perfil, sus rangos musculares (que dependen de peso corporal) no se recalculan hasta el próximo entrenamiento guardado. |
| **`renderGamificationHeader()`** | `ui/gamification/gamification-ui.ts` | Variante compacta del widget de nivel pensada para un header, exportada por el barrel `ui/gamification/index.ts`, nunca importada por `main.ts` ni `navigation.ts`. Solo se usa la variante "hero card" en Home. |
| **`renderMuscleMapMini()`, `renderMuscleMapWithLegend()`, `renderMuscleProgress()`** | `ui/gamification/muscle-map.ts` | Tres variantes de renderizado del mapa muscular (mini standalone, con leyenda lateral, progreso individual de un músculo) — ninguna tiene un punto de uso real en el código. |
| **`renderLevelBadgeCompact()`** | `ui/gamification/level-badge.ts` | Variante de badge de nivel para header compacto — mismo patrón, nunca usada. |
| **`renderRankEmblemMini()`, `renderRankWithLabel()`** | `ui/gamification/rank-emblem.ts` | Variantes del emblema de rango (estrella con N puntas según rango) — nunca usadas; el emblema completo sí se usa en el popup de resumen de sesión. |
| **`renderLevelUpMessage()`, `renderRankUpMessage()`** | `ui/gamification/session-summary.ts` | Pensadas explícitamente para el banner del coach (comentario: *"para el coach"*), pero `coach.ts` nunca las importa — el coach solo muestra sus propios mensajes hardcodeados de PR/racha, no reutiliza estos componentes de gamificación. |
| **`showConfirmModal()`, `showToast()`** | `ui/modals.ts` | Sistema de confirmación y notificaciones "toast" propios del design system, completamente construidos (incluye estilos por tipo success/error/warning/info) pero **nunca invocados** — todas las confirmaciones reales de la app usan `confirm()`/`alert()` nativos del navegador en su lugar. |
| **Shortcuts del manifest PWA** | `vite.config.ts` (VitePWA manifest `shortcuts`) | El manifest declara 3 accesos directos (Nuevo Entrenamiento, Historial, PRs) apuntando a `/?action=workout`, `/?action=history`, `/?action=prs`. El código de la app **nunca lee `window.location.search`** ni parsea el parámetro `action` — en Android/desktop, usar estos shortcuts (long-press al ícono) abre la app normalmente en Home, ignorando la intención del shortcut. |
| **`react-body-highlighter`** | `package.json` (devDependency) | El algoritmo de polígonos del mapa muscular se copió y reescribió a mano en `muscle-map.ts` (comentario explícito de atribución MIT). La dependencia npm quedó en el `package.json` sin ningún import real — huérfana. |
| **Coach y insights, lógica duplicada** | `insights.ts` vs `coach.ts`, y racha calculada en 3 archivos distintos | No son "fantasma" (ambos se usan), pero representan la misma lógica de negocio (detección de PR cercano, cálculo de racha) implementada de forma independiente 2-3 veces con pequeñas divergencias — riesgo real de que un futuro cambio de regla de negocio (ej. "qué cuenta como racha") se aplique en un lugar y se olvide en los otros dos. |

### 3. Contraste contra `AUDIT.md`

El inventario técnico de `AUDIT.md` (Fase 1: modelo de datos) coincide con lo que el usuario puede ver y tocar, con estas precisiones que vale la pena registrar:

- `AUDIT.md` afirma que no hay ningún uso de la Notification API. **Esto era impreciso**: `features/timer.ts` sí usa `Notification.requestPermission()` y `new Notification()` para notificar localmente el fin del descanso — no es Web Push (no hay VAPID, no hay `PushManager`, no sobrevive con la app cerrada), pero es un punto de contacto real con el permiso de notificaciones del navegador que cualquier futura implementación de push debe tener en cuenta (el usuario puede ya haber concedido o denegado el permiso antes de que exista push real).
- El modelo de datos de `AUDIT.md` (Fase 1) documenta correctamente `SessionData`/`HistorySession`/`PRData`/`ProfileData`/`BodyMeasurement`/`CustomWorkout`/`CustomExercise`, pero no mencionaba explícitamente el estado de gamificación (`GamificationState` en `localStorage['gymmate_gamification']`) como una entidad de datos aparte — es la estructura de datos más grande de toda la app (nivel, XP, rangos musculares, logros con progreso, historial de hasta 100 transacciones de XP, datos de racha) y vale la pena tratarla como su propia entidad en cualquier modelo de datos de v2.
- Todo lo demás (localStorage-only, sin backend, sin sync, cálculo de volumen en frontend) se confirma exactamente igual desde la perspectiva de UI: no hay ninguna pantalla que dependa de red, ni estados de "cargando" reales en ningún punto de la app.

---

## FASE 4 — Entregable

### 1. Tabla maestra: Pantalla → Funciones → Datos → Estados

| Pantalla | Funciones clave | Datos que consume | Estados soportados |
|---|---|---|---|
| Home | Rutinas rápidas, rutinas custom, hero gamificación, insight ML, resumen draft | history, prs, gamification state, custom workouts | Vacío (0 entrenos) / con datos — sin loading/error |
| Entrenamiento activo | Registro sets/reps/kg, volumen en vivo, coach contextual, guía de ejercicio, timer de descanso, RPE | training group o custom workout, session state, prs, coach rules | Inicial / con datos / restaurado de draft — sin loading/error |
| Cardio (4 sub-vistas) | 6 modos configurables, timer con anillo de progreso, beep/vibración, resumen | cardio config estático, cardio exercises DB | Selector / config / activo (pausado o no) / resumen — sin draft ni recuperación si se cierra a mitad |
| Historial | Listado unificado, exportar/importar CSV, eliminar | history (hasta 200) | Vacío / con datos — errores de import vía `alert()` nativo |
| PRs | Listado ordenado por fecha | prs | Vacío / con datos |
| Gráficos | 4 charts Chart.js | history | Sin datos (por chart, mensaje específico) / con datos |
| Calculadoras | 1RM, Calorías, Peso Progresivo | history (PRs por ejercicio), profile (prellenado) | Sin datos suficientes (1RM, progresivo) / con resultado |
| Perfil | Datos personales, medidas corporales, % grasa Navy | profile, body measurements (hasta 100) | Vacío inicial / con datos guardados |
| Modal Workout Builder | Selección ejercicios, ejercicio custom, guardado de rutina | training groups, exercises DB (100), custom exercises | Vacío (sin selección) / con selección |
| Modal RPE | Escala 1-10 con etiqueta | — (efímero) | Sin selección (confirmar deshabilitado) / seleccionado |
| Modal Rest Timer | Selección de tiempo + banner activo | — (efímero) | Selección / activo / pausado / terminado |
| Modal Guía ejercicio | Imagen o texto de técnica | exercises DB / training groups guidance | Cargando imagen / cargada / error con fallback a texto / sin guía disponible |
| Modal Medidas | Form + cálculo % grasa en vivo | profile, latest measurement | Vacío / prellenado desde última medición |
| Modal Historial medidas | Listado eliminable | body measurements | Vacío / con datos |
| Modal Progreso (gamificación) | Nivel, mapa dual, logros, guías, recalcular XP | gamification state completo | Siempre con datos (el "vacío" es el propio nivel 1 / rango Hierro inicial) |
| Modal Resumen XP | Desglose de XP ganado, rank-ups | resultado de `processCompletedSession()` | Un solo estado (siempre tiene al menos el XP base) |

### 2. No negociables

Funciones que, si no están presentes en el rediseño, representan pérdida real de capacidad para el usuario actual:

1. **Registro de sets/reps/kg con cálculo de volumen en vivo** (incluyendo la regla de mancuerna ×2) — es el corazón funcional de la app.
2. **Historial completo con exportar/importar CSV** — es el único mecanismo de backup/portabilidad de datos que existe hoy; perderlo sin reemplazo (ver "no negociable" de v2: backend con sync) deja al usuario sin forma de resguardar su historial.
3. **Detección y registro automático de PRs** — motor central de motivación y del sistema de rangos musculares.
4. **Calculadora de 1RM, Calorías y Peso Progresivo** — únicas herramientas "de ciencia del entrenamiento" de la app, mencionadas explícitamente como pilar de la filosofía del producto (`FEATURES.md` original / `MEV_MRV_GUIDE.md`).
5. **Sistema de gamificación completo (XP, niveles, rangos musculares, logros, rachas)** — el usuario pidió explícitamente conservar el mapa muscular; pero el mapa muscular *depende* de todo el resto del sistema de rangos/XP para tener sentido (sin XP no hay nivel, sin PRs no hay rango). Conservar solo el mapa muscular sin el motor detrás lo vaciaría de contenido.
6. **Body Measurements + % grasa corporal (Navy method)** — único tracking de composición corporal de la app; no tiene overlap con ninguna otra función.
7. **Timer de descanso con sonido/vibración** — funcionalidad de uso constante en gimnasio, mencionada como filosofía "mobile-first, uso en gimnasio" del proyecto.
8. **Cardio & HIIT con sus 6 modos reales** (Tabata/EMOM/AMRAP/Circuito/Pirámide/Personalizado) — módulo completo y usado, aunque "For Time" nunca estuvo realmente disponible (ver Fase 3).
9. **Auto-guardado de borrador (draft)** durante el entrenamiento de pesas — sin esto, cualquier cierre accidental de la pestaña/app pierde el entrenamiento en curso.

### 3. Candidatas a simplificar o eliminar

Con mi razonamiento de por qué:

1. **Modo de cardio "For Time"** — nunca fue alcanzable desde la UI en la versión actual; no hay usuarios que dependan de una función que jamás pudieron usar. Si se quiere conservar la idea, hay que construirla de cero, no "migrarla".
2. **Bonus de XP para modo "hiit"** — dato muerto sin modo asociado; eliminar sin reemplazo.
3. **Las variantes de UI de gamificación nunca usadas** (`renderGamificationHeader`, `renderMuscleMapMini/WithLegend/Progress`, `renderLevelBadgeCompact`, `renderRankEmblemMini/WithLabel`, `renderLevelUpMessage/RankUpMessage`) — construir un rediseño no necesita heredar seis variantes de renderizado que el producto actual nunca llegó a usar en ninguna pantalla real. Si el nuevo diseño necesita un badge de nivel compacto para un header, se puede diseñar desde cero con el criterio del nuevo sistema visual, no reciclando componentes huérfanos.
4. **`showConfirmModal`/`showToast` sin usar** — mismo razonamiento: el propio proyecto ya decidió (con o sin intención) resolver confirmaciones/notificaciones con diálogos nativos del navegador. El rediseño debería decidir explícitamente una sola vía (probablemente un sistema de toast propio, dado que `confirm()`/`alert()` nativos son visualmente inconsistentes con cualquier diseño custom) en vez de tener dos sistemas paralelos donde uno está siempre inactivo.
5. **Cálculo de racha triplicado** (`navigation.ts`, `history.ts`, `gamification/xp.ts`) — no es una función de cara al usuario que deba "eliminarse", pero si se reescribe el core, esta es la oportunidad de consolidarlo en un solo lugar (probablemente dentro de gamificación, que es la fuente de verdad real para XP/rachas) y que Home/Historial solo lo consuman.
6. **Shortcuts del manifest con `?action=`** — o se implementa el manejo real de esos query params en el nuevo router/entry point, o se quitan del manifest; dejarlos como están (definidos pero ignorados) es peor que no tenerlos, porque el usuario que los usa desde su launcher de Android no obtiene el comportamiento que el propio ícono le promete.
7. **`react-body-highlighter` en `package.json`** — limpieza trivial, sin impacto funcional; quitarla no afecta nada visible.
8. **Detección de "tren inferior" por keyword-matching en Peso Progresivo** — funciona, pero es frágil (un ejercicio nuevo con nombre atípico puede clasificarse mal). Si se reescribe esta calculadora, usar el campo `grupoMuscular` real del ejercicio (ya disponible en el modelo de datos) en vez de buscar substrings en el nombre sería más robusto y no pierde ninguna capacidad para el usuario.

### 4. Funciones fantasma / incompletas (resumen consolidado de Fase 3)

Ver tabla completa en Fase 3 punto 2. Resumen por severidad de impacto en el usuario:

- **Impacto cero para el usuario actual** (nunca fueron accesibles, por lo que no hay expectativa que romper): modo cardio "For Time", bonus XP "hiit", configuración de ejercicios en modo Circuito, shortcuts del manifest PWA.
- **Impacto silencioso pero real** (afecta la corrección de datos que el usuario sí ve): `onBodyweightChange()` nunca invocado — significa que los rangos musculares del mapa corporal pueden estar calculados con un peso corporal desactualizado hasta el próximo entrenamiento guardado, sin que nada se lo indique al usuario.
- **Deuda de diseño interno, sin impacto directo visible hoy** (pero relevante para no "heredar" complejidad muerta en el rediseño): las 8 variantes de componentes de gamificación nunca usadas, `showConfirmModal`/`showToast` sin uso, y la dependencia npm huérfana.
