import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // La zona horaria se fija en el script de npm (TZ=America/Lima), no aqui:
    // V8 la cachea al arrancar el proceso y ponerla en la config llega tarde.
    // Corriendo en UTC, un defecto de fecha local vs UTC es invisible porque
    // los dos lados coinciden. Lima es ademas la zona real del usuario.
    globals: true,
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      // El servidor tambien se prueba: el punto de cache del coach es
      // invisible en ejecucion —si esta mal, todo responde igual y solo se
      // paga diez veces mas— asi que se comprueba la forma de la peticion.
      'server/**/*.test.mjs',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/types/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
