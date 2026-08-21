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

// Solo las declaraciones REALES: fuera comentarios (un token comentado no
// existe para el navegador) y fuera todo lo que no cuelgue de :root.
function rootDecls(): Map<string, string> {
  const raw = readFileSync(TOKENS_CSS, 'utf-8');
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = css.indexOf(':root');
  if (start === -1) throw new Error('tokens.css no tiene bloque :root');
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('tokens.css: bloque :root sin cerrar');
  const body = css.slice(open + 1, end);
  return new Map([...body.matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const FORMA = {
  color: /^#[0-9a-fA-F]{3,8}$/,
  medida: /^-?\d+(\.\d+)?(px|rem|em|%)$/,
} as const;

function resolveToken(name: string, forma: keyof typeof FORMA): string {
  const decls = rootDecls();
  const seen = new Set<string>([name]);
  let value = decls.get(name);
  // Sigue las cadenas de alias: --on-fragua: var(--carbon-950).
  // Corta el ref en la primera coma: var(--x, #000) referencia a --x.
  while (value && value.startsWith('var(')) {
    const dentro = value.slice(4, value.lastIndexOf(')'));
    const ref = dentro.split(',')[0].trim();
    if (seen.has(ref)) throw new Error(`tokens.css: alias circular en ${name}`);
    seen.add(ref);
    value = decls.get(ref);
  }
  if (!value) {
    // [...seen] termina en el eslabon que fallo: nombrarlo evita perseguir el
    // token de entrada cuando el roto es un alias tres niveles mas abajo.
    const roto = [...seen].pop();
    throw new Error(
      `tokens.css no define ${roto} dentro de :root (o esta comentado)` +
        (roto === name ? '' : `, al resolver ${name}`) +
        `. index.html y el manifest dependen de el; no se puede construir sin ese token.`
    );
  }
  if (!FORMA[forma].test(value)) {
    throw new Error(
      `tokens.css: ${name} resuelve a "${value}", que no es un valor de tipo ${forma}. ` +
        `index.html lo inyecta literal y quedaria invalido.`
    );
  }
  return value;
}

const PLACEHOLDERS = {
  '%PAGE_BG%': ['--page-bg', 'color'],
  '%TEXT_PRIMARY%': ['--text-primary', 'color'],
  '%ACCENT%': ['--accent', 'color'],
  '%ON_ACCENT%': ['--on-fragua', 'color'],
  '%RADIUS_BTN%': ['--r-btn', 'medida'],
} as const;

// Se resuelve en CADA transformIndexHtml, no una vez al cargar el config: en
// dev, congelarlo dejaba el CSS critico y el theme-color derivando del bundle
// durante toda la sesion mientras HMR si actualizaba tokens.css.
function tokenVars(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PLACEHOLDERS).map(([ph, [token, forma]]) => [ph, resolveToken(token, forma)])
  );
}

const TOKEN_VARS = tokenVars();

function fierroTokensToHtml() {
  return {
    name: 'fierro-tokens-to-html',
    buildStart(this: { addWatchFile?: (id: string) => void }) {
      // Que tocar tokens.css invalide el HTML en dev.
      this.addWatchFile?.(TOKENS_CSS);
    },
    transformIndexHtml(html: string) {
      const vars = tokenVars();
      let out = html;
      for (const [ph, value] of Object.entries(vars)) out = out.split(ph).join(value);
      // Solo se buscan placeholders de NUESTRA forma (%MAYUS_CON_DIGITOS%, >=3
      // caracteres). Un patron mas amplio confundiria el percent-encoding de un
      // data-URI (`%AB%CD`) con un placeholder roto.
      const sobrante = out.match(/%[A-Z][A-Z0-9_]{2,}%/g);
      if (sobrante) {
        throw new Error(`index.html usa placeholders sin token: ${[...new Set(sobrante)].join(', ')}`);
      }
      const permitidos = new Set(Object.values(vars).map((v) => v.toLowerCase()));
      const intrusos = [...new Set(out.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])].filter(
        (h) => !permitidos.has(h.toLowerCase())
      );
      if (intrusos.length) {
        throw new Error(
          `index.html tiene hex tecleados a mano: ${intrusos.join(', ')}. ` +
            `El color solo puede salir de src/styles/tokens.css.`
        );
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
      // globPatterns ya cubre png/svg/ico: repetirlos aqui duplicaba 6 entradas
      // del manifiesto de precache e inflaba el total reportado.
      includeAssets: [],
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
        // Los subsets latin-ext (95,1 KiB) no los dispara el espanol: sus
        // glifos caen en U+0000-00FF. Se sirven bajo demanda en vez de
        // pagarlos en la primera carga; el nombre de rutina que un usuario
        // escriba con un glifo latin-ext los trae y quedan cacheados.
        globIgnores: ['**/fonts/*-latin-ext.woff2'],
        runtimeCaching: [
          {
            // Subsets latin-ext, fuera del precache (ver globIgnores).
            urlPattern: /\/fonts\/.*-latin-ext\.woff2$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fierro-fonts-ext',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // VENTANA DE TRANSICION, temporal. Un usuario con la version
            // anterior instalada tiene el HTML/CSS viejo en su precache: ese
            // CSS trae un @import a Google Fonts que es render-blocking. Si el
            // SW nuevo reclama el cliente antes de que salga ese @import, la
            // peticion cae a red y con mala senal bloquea el primer pintado.
            // Se mantiene una version mas y se retira en la fase 9.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'legacy-google-fonts',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
