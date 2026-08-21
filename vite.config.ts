import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Version for cache busting
const APP_VERSION = '3.2.0';

// --------------------------------------------------------------------------
// Tokens FIERRO -> HTML y manifest.
// index.html necesita pintar el fondo ANTES de que llegue el bundle, y el
// manifest de la PWA no admite var(): son los unicos dos lugares que exigen un
// hex literal. En vez de teclearlo (y que se desincronice), se lee de
// src/styles/tokens.css, que sigue siendo la unica fuente de verdad.
// --------------------------------------------------------------------------
const TOKENS_CSS = resolve(__dirname, 'src/styles/tokens.css');

function resolveToken(name: string): string {
  const css = readFileSync(TOKENS_CSS, 'utf-8');
  const decls = new Map<string, string>(
    [...css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
  );
  const seen = new Set<string>();
  let value = decls.get(name);
  // Sigue las cadenas de alias: --on-fragua: var(--carbon-950).
  while (value && value.startsWith('var(')) {
    const ref = value.slice(4, value.indexOf(')')).trim();
    if (seen.has(ref)) throw new Error(`tokens.css: alias circular en ${name}`);
    seen.add(ref);
    value = decls.get(ref);
  }
  if (!value) {
    throw new Error(
      `tokens.css no define ${name}. index.html y el manifest dependen de el; ` +
        `no se puede construir sin ese token.`
    );
  }
  return value;
}

const TOKEN_VARS = {
  '%PAGE_BG%': resolveToken('--page-bg'),
  '%TEXT_PRIMARY%': resolveToken('--text-primary'),
  '%ACCENT%': resolveToken('--accent'),
  '%ON_ACCENT%': resolveToken('--on-fragua'),
  '%RADIUS_BTN%': resolveToken('--r-btn'),
} as const;

function fierroTokensToHtml() {
  return {
    name: 'fierro-tokens-to-html',
    transformIndexHtml(html: string) {
      let out = html;
      for (const [ph, value] of Object.entries(TOKEN_VARS)) out = out.split(ph).join(value);
      const sobrante = out.match(/%[A-Z_]+%/g);
      if (sobrante) {
        throw new Error(`index.html usa placeholders sin token: ${[...new Set(sobrante)].join(', ')}`);
      }
      return out;
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    fierroTokensToHtml(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'GymMate - Tu Compañero de Entrenamiento',
        short_name: 'GymMate',
        description: 'App de seguimiento de entrenamientos con tracking de volumen, PRs, y progreso',
        theme_color: TOKEN_VARS['%PAGE_BG%'],
        background_color: TOKEN_VARS['%PAGE_BG%'],
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
        ],
        categories: ['health', 'fitness', 'lifestyle'],
        shortcuts: [
          {
            name: 'Nuevo Entrenamiento',
            short_name: 'Entrenar',
            description: 'Comenzar un nuevo entrenamiento',
            url: '/?action=workout',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Ver Historial',
            short_name: 'Historial',
            description: 'Ver entrenamientos anteriores',
            url: '/?action=history',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Personal Records',
            short_name: 'PRs',
            description: 'Ver tus récords personales',
            url: '/?action=prs',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
