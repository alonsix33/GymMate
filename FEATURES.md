# GymMate v3.1 - Caracteristicas Implementadas

## Caracteristicas Implementadas

### 1. Arquitectura Moderna

- Vite 5.x como build tool
- TypeScript 5.x para tipado estatico
- 16+ modulos TypeScript organizados
- CSS propio: `src/styles/tokens.css` (única fuente de color y tipografía) + `src/styles/fierro.css`
- Sin librería de iconos: los glifos (←, ›, ✓, ✕, +, ↑, ▾) son texto
- Vitest para unit testing (21+ tests)

### 2. Mobile-First y PWA

- Diseno completamente responsive
- Navegacion inferior con FAB central
- Touch targets optimizados (min 44px)
- PWA con vite-plugin-pwa
- Workbox para cache inteligente
- Auto-update de versiones
- Instalable como app nativa
- Funciona offline

### 3. Entrenamiento de Pesas

- 5 Grupos de entrenamiento predefinidos:
  - Grupo 1: Piernas + Gluteos
  - Grupo 2: Upper Push
  - Grupo 3: Piernas Quad Dominante
  - Grupo 4: Espalda + Biceps
  - Grupo 5: Hombro + Triceps
- Calculo automatico de volumen
- Regla de mancuernas (peso x2)
- Ejercicios opcionales diferenciados
- Resumen dinamico por grupo muscular
- Sistema de drafts con auto-guardado

### 4. Cardio y HIIT (7 modos)

- **Tabata**: 20s trabajo / 10s descanso x 8 rondas
- **EMOM**: Every Minute On the Minute
- **AMRAP**: As Many Reps As Possible
- **Circuit**: Ejercicios en secuencia
- **Pyramid**: Intervalos ascendentes/descendentes
- **Custom**: Configura tu propio intervalo
- **ForTime**: Completa lo mas rapido posible

Caracteristicas del timer:
- Visualizacion de fase (trabajo/descanso)
- Sonido y vibracion al cambiar fase
- Contador de rondas/niveles
- Tiempo total acumulado
- Pausar/Reanudar/Detener
- Resumen de sesion al finalizar

### 5. Temporizador de Descanso

- 6 opciones predefinidas (1-5 min)
- Tiempos rapidos (30s, 45s, 90s)
- Tiempo maximo (5 min)
- Pausar/Reanudar
- Banner visible durante cuenta
- Sonido Web Audio API al finalizar
- Boton rapido en cada ejercicio

### 6. Personal Records (PRs)

- Deteccion automatica de nuevos records
- Notificacion visual al batir PR
- Vista dedicada de PRs
- Persistencia en localStorage
- Historico de mejor peso por ejercicio

### 7. Historial de Entrenamientos

- Ultimos 30 entrenamientos guardados
- Historial unificado de pesas y cardio
- Vista con resumen de volumen
- Contador de ejercicios completados
- Fecha formateada en espanol
- Funcion de eliminar entrenos
- Exportacion a Excel

### 8. Graficos (Chart.js)

4 graficos interactivos:

1. **Tendencia de Volumen**: Linea temporal
2. **Distribucion Muscular**: Dona/Pie
3. **Progreso de Peso**: Por ejercicio seleccionado
4. **Comparativa Semanal**: Barras semana actual vs anterior

### 9. Calculadoras Fitness

- **1RM Calculator**: 3 formulas (Epley, Brzycki, Lombardi)
- **Calorias**: TDEE con Mifflin-St Jeor
- **Peso Progresivo**: Sugerencias ACSM/NSCA

### 10. Sistema de Diseno

- Dark Mode profesional
- CERO gradientes (colores solidos)
- CERO emojis: los glifos son texto, y `npm run verificar` rechaza cualquier emoji con presentación de emoji
- Alto contraste para legibilidad
- Feedback tactil (active:scale-95)
- Tipografia Inter + Oswald

### 11. Persistencia de Datos

- localStorage para sesiones
- localStorage para historial (30 max)
- localStorage para PRs
- localStorage para perfil
- Sistema de drafts con expiracion 24h
- Sin necesidad de backend

---

## Ideas Futuras (Roadmap)

### Fase 1 - Corto Plazo

- [ ] Entrada por voz (Web Speech API)
- [ ] Gamificacion (achievements, XP, niveles)
- [ ] Notas por ejercicio
- [ ] Plate calculator

### Fase 2 - Medio Plazo

- [ ] Backend con Firebase/Supabase
- [ ] Sincronizacion multi-dispositivo
- [ ] Planificacion periodizada
- [ ] Modo entrenador
- [ ] Integracion con wearables

### Fase 3 - Largo Plazo

- [ ] IA para sugerencias
- [ ] Analisis de video/postura
- [ ] Social features
- [ ] Programas integrados (5/3/1, nSuns, etc.)

---

## Filosofia de Desarrollo

### Mobile-First

- Disenado para uso en gimnasio
- Una mano, pulgar-friendly
- Minimos clicks
- Feedback visual inmediato

### Sin Fricciones

- Auto-save con drafts
- Offline-first
- Carga instantanea
- Cero loading screens

### Motivador

- Celebrar PRs
- Visualizar progreso
- Estadisticas claras

### Basado en Ciencia

- Calculos validados (1RM, TDEE)
- MEV/MRV guidelines
- Recomendaciones con evidencia

---

**Version:** 3.1.0
**Ultima actualizacion:** Diciembre 2025
