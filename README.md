# GymMate v4.0 - Tu Compañero Personal de Entrenamiento

**Progressive Web App profesional para gestionar entrenamientos con seguimiento completo de volumen, PRs, historial, cardio, medidas corporales y análisis inteligente.**

## Novedades en v4.0

- **ML Insights** - Análisis inteligente en hero section (rachas, tendencias, PRs cercanos, músculos descuidados)
- **Medidas Corporales** - Tracking de peso, cuello, pecho, cintura, cadera, brazos, muslos con cálculo de grasa corporal (método Navy)
- **RPE Post-Sesión** - Selector estilo Apple Watch para calificar intensidad (1-10)
- **AI Coach Dinámico** - Mensajes contextuales durante el entrenamiento
- **Ejercicios Personalizados** - Crea tus propios ejercicios en el workout builder
- **Historial Expandido** - Hasta 200 sesiones guardadas (antes 30)

---

## Características Principales

### Entrenamiento de Pesas

- 5 Grupos de entrenamiento completos (Piernas, Upper Push/Pull, etc.)
- Cálculo automático de volumen (`sets × reps × peso`)
- Regla de mancuernas: peso × 2 automático
- Resumen dinámico por grupo muscular
- Ejercicios opcionales diferenciados
- Timer de descanso integrado (1-5 minutos)
- Tracking automático de Personal Records
- Guardado automático de borradores (draft)

### Cardio & HIIT

- **Tabata**: 20s trabajo / 10s descanso × 8 rondas
- **EMOM**: Every Minute On the Minute
- **AMRAP**: As Many Reps As Possible
- **Circuit**: Ejercicios en secuencia con descansos
- **Pyramid**: Intervalos ascendentes y descendentes (20s → 30s → 40s → 30s → 20s)
- **Custom**: Configura tu propio intervalo
- **ForTime**: Completa el workout lo más rápido posible

### Historial y Estadísticas

- Hasta 200 entrenamientos guardados
- Historial unificado de pesas y cardio
- Backup CSV completo: historial, cardio, perfil, medidas, récords y rutinas propias
- RPE por ejercicio (chips al completar) y por sesión (slider al terminar)
- Gráficos SVG dibujados a mano, sin librería:
  - Tendencia de volumen
  - Distribución muscular
  - Progreso de peso
  - Comparativa semanal

### Perfil y Medidas Corporales

- Datos personales (nombre, edad, género, peso, altura)
- Medidas corporales detalladas (cuello, pecho, cintura, cadera, brazos, muslos)
- Cálculo automático de grasa corporal (método Navy)
- Historial de mediciones (hasta 100)
- Sincronización automática del peso con perfil

### Calculadoras Fitness

- **1RM Calculator**: Epley, Brzycki, Lombardi (promedio)
- **Calorías**: TDEE con Mifflin-St Jeor
- **Peso Progresivo**: Sugerencias ACSM/NSCA

---

## Tecnologías

| Categoría | Tecnología |
|-----------|------------|
| Build Tool | Vite 5.x |
| Lenguaje | TypeScript 5.x |
| Estilos | CSS propio: `src/styles/tokens.css` + `src/styles/fierro.css` |
| Iconos | Ninguno. Los pocos glifos (←, ›, ✓, ✕, +, ↑) son texto |
| Gráficos | SVG a mano (sin librería) |
| CSV | Generado y parseado en `src/features/history.ts` (sin librería) |
| PWA | vite-plugin-pwa + Workbox |
| Tests | Vitest + cuatro puertas propias (`npm run verificar`) |
| Fonts | Archivo + Instrument Sans, self-hosted en `public/fonts/` |

> El rediseño FIERRO retiró Tailwind, Lucide y Chart.js. `package.json` no
> tiene bloque `dependencies`: nada del árbol llega al runtime sin bundlear.
> El color y la tipografía salen **solo** de `src/styles/tokens.css`; cualquier
> hex suelto fuera de ahí es un defecto y `npm run verificar` lo rechaza.

---

## Instalación

```bash
# Clonar repositorio
git clone https://github.com/alonsix6/GymMate.git
cd GymMate

# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Build producción
npm run build

# Preview build
npm run preview

# Tests
npm test
```

---

## Estructura del Proyecto

```
GymMate/
├── src/
│   ├── main.ts                 # Entry point
│   ├── styles/
│   │   ├── tokens.css          # ÚNICA fuente de color y tipografía
│   │   └── fierro.css          # Componentes del sistema FIERRO
│   ├── types/index.ts          # TypeScript types
│   ├── constants/index.ts      # App constants
│   ├── state/session.ts        # Session state management
│   ├── data/
│   │   ├── training-groups.ts  # Rutinas predefinidas
│   │   ├── exercises.ts        # Catálogo de ejercicios
│   │   └── cardio-exercises.ts # Ejercicios cardio
│   ├── features/
│   │   ├── workout.ts          # Lógica de entrenamiento
│   │   ├── cardio.ts           # Cardio: 6 modos
│   │   ├── timer.ts            # Timer de descanso
│   │   ├── history.ts          # Historial, records y CSV
│   │   ├── charts.ts           # Series para los gráficos SVG
│   │   ├── calculators.ts      # Calculadoras fitness
│   │   ├── profile.ts          # Perfil y medidas corporales
│   │   ├── coach.ts            # Mensajes deterministas de sesión
│   │   ├── coach-ia.ts         # Coach IA: aritmética local + adaptador
│   │   └── gamification/       # XP, niveles, rangos, logros, racha
│   ├── ui/
│   │   ├── navigation.ts       # Navegación y tabs
│   │   ├── feedback.ts         # Toasts y confirmaciones (F-01)
│   │   ├── home.ts             # H-01
│   │   ├── workout-view.ts     # W-01…W-04
│   │   ├── hueso.ts            # HI-01, HI-02, PR-01, G-01
│   │   ├── perfil.ts           # CA-01, CA-02, P-01…P-03
│   │   ├── progreso.ts         # GM-01…GM-03
│   │   ├── builder.ts          # B-01
│   │   ├── coach-chat.ts       # CO-01…CO-03
│   │   └── gamification/       # Mapa muscular
│   ├── utils/
│   │   ├── storage.ts          # localStorage helpers
│   │   ├── formato.ts          # Cifras y `escapar()`
│   │   ├── fecha.ts            # Único sitio que decide qué día es
│   │   ├── calculations.ts     # 1RM, calorías, volumen
│   │   ├── rangos.ts           # Rangos y subniveles I–III
│   │   ├── zonas.ts            # Barra de zonas roja/ámbar/verde
│   │   └── insights.ts         # Insights de la home
│   └── tests/                  # 9 archivos, 235 pruebas
├── scripts/
│   ├── verificar-tokens.mjs         # Estático: hex, var(), alert(), día UTC
│   ├── verificar-runtime.mjs        # Navegador: fuentes, consola, red, offline
│   ├── verificar-fidelidad.mjs      # Estilos computados vs. el mockup
│   └── verificar-comportamiento.mjs # ~310 chequeos conduciendo la app real
├── redesign/design_handoff_fierro/  # El contrato de diseño y sus 32 mockups
├── public/fonts/                    # Archivo e Instrument Sans (offline-first)
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Estructura de Datos (localStorage)

### Sesión de Pesas
```json
{
  "date": "2025-12-26",
  "type": "weights",
  "grupo": "GRUPO 1 - Piernas + Glúteos",
  "ejercicios": [
    {
      "nombre": "Hip Thrust",
      "sets": 3,
      "reps": 10,
      "peso": 80,
      "esMancuerna": false,
      "grupoMuscular": "Glúteos",
      "volumen": 2400,
      "completado": true
    }
  ],
  "volumenTotal": 5400,
  "volumenPorGrupo": { "Glúteos": 2400, "Piernas": 3000 }
}
```

### Sesión de Cardio
```json
{
  "date": "2025-12-26",
  "type": "cardio",
  "mode": "pyramid",
  "stats": {
    "totalTime": 185,
    "roundsCompleted": 5,
    "workTime": 150,
    "restTime": 35
  }
}
```

---

## Sistema de Diseño

### Paleta de Colores (Sin Gradientes)

```css
/* Background */
--dark-bg: #0f172a;
--dark-surface: #1e293b;
--dark-border: rgba(255, 255, 255, 0.05);

/* Acento Principal */
--accent: #3b82f6;
--accent-hover: #2563eb;

/* Texto */
--text-primary: #f1f5f9;
--text-secondary: #94a3b8;
--text-muted: #64748b;

/* Estados */
--success: #22c55e;
--warning: #f59e0b;
--error: #ef4444;
--info: #06b6d4;
```

### Iconos

No hay librería de iconos. El handoff FIERRO los prohíbe: los pocos glifos que
usa la app (←, ›, ✓, ✕, +, ↑, ■, ▾) son **texto**, y las flechas de tendencia
(↗ ↘) también. `npm run verificar` falla si aparece un emoji con presentación
de emoji en el código.

---

## Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |
| `npm test` | Ejecutar tests |
| `npm run test:ui` | Tests con UI |
| `npm run test:coverage` | Coverage report |

---

## PWA Features

- Instalable como app nativa
- Funciona offline con Service Worker
- Cache inteligente con Workbox
- Auto-update de versiones
- Shortcuts para acciones rápidas

---

## Compatibilidad

- Chrome/Edge (recomendado)
- Firefox
- Safari (iOS/macOS)
- Navegadores móviles modernos

---

## Documentación Adicional

- [Sistema de Diseño](DESIGN_SYSTEM.md) — apunta al handoff FIERRO, que es el contrato vigente
- [Handoff FIERRO](redesign/design_handoff_fierro/README.md) — tokens, pantallas y prohibiciones
- [Guía de Calculadoras](CALCULATORS_GUIDE.md)
- [MEV/MRV Guide](MEV_MRV_GUIDE.md)
- [Features Roadmap](FEATURES.md)

---

## Changelog

### v5.0.0 — rediseño FIERRO
- Sistema de diseño propio: `tokens.css` como única fuente de color y tipografía
- Fuera Tailwind, Lucide, Chart.js y `main.css`; `package.json` sin `dependencies`
- Las 32 pantallas del handoff, incluidos Coach IA (CO-01…03), gamificación
  (GM-01…03) y el builder de rutinas (B-01)
- Fuentes Archivo e Instrument Sans self-hosted: la app arranca sin red
- Cuatro puertas de verificación en `npm run verificar` (tokens, runtime,
  fidelidad, comportamiento) además de las pruebas de vitest
- Cardio: "For Time" retirado, quedan 6 modos
- Toasts y confirmaciones propias en vez de `alert()`

### v4.0.0 (Diciembre 2025)
- ML Insights en hero section
- Medidas corporales con cálculo de grasa corporal
- RPE post-sesión estilo Apple Watch
- AI Coach dinámico contextual
- Ejercicios personalizados en workout builder
- Historial expandido a 200 sesiones

### v3.1.0 (Diciembre 2025)
- Fix: CSS no cargaba por cache de PWA
- PWA: cleanupOutdatedCaches, skipWaiting, clientsClaim
- CSS crítico inline para fallback

### v3.0.0 (Diciembre 2025)
- Migración completa a Vite + TypeScript
- Tailwind CSS local (sin CDN)
- Lucide icons reemplazando emojis
- Eliminación total de gradientes
- Módulo de Cardio & HIIT completo (7 modos)
- 21 tests unitarios con Vitest
- Arquitectura modular (16+ módulos)

### v2.1.0 (Diciembre 2025)
- Dark Mode Premium
- Chart.js integration
- Excel export

### v2.0.0 (Diciembre 2025)
- PWA inicial
- Timer de descanso
- Tracking de PRs

---

**Versión:** 4.0.0
**Desarrollado para:** Alonso
**Fecha:** Diciembre 2025
