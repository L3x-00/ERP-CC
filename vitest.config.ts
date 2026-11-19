import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Los umbrales solo se exigen cuando se ejecuta la suite completa (main,
 * nightly o cambio transversal). En PR se mide la cobertura del diff, que por
 * definición es parcial: aplicarle el umbral global daría falsos rojos.
 */
const umbralesEstrictos = process.env.COBERTURA_UMBRAL === 'estricto';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Tipos generados y declaraciones no son código propio medible.
      exclude: ['src/**/*.d.ts', 'src/compartido/tipos/supabase.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: 'cobertura',
      // Línea base medida el 2026-11-19 con la suite completa:
      // líneas 46,02 %, sentencias 44,59 %, funciones 46,14 %, ramas 42,12 %.
      // Se congela un punto por debajo para absorber ruido entre runners. Al
      // subir cobertura de forma sostenida, subir estos valores (nunca
      // autoUpdate: el umbral debe ser una decisión, no un reflejo).
      thresholds: umbralesEstrictos
        ? {
            lines: 45,
            statements: 43,
            functions: 45,
            branches: 41,
          }
        : undefined,
    },
  },
});
