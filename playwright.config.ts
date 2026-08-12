import { defineConfig } from '@playwright/test';

const puerto = Number(process.env.E2E_PUERTO ?? '3100');
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${puerto}`;
const pruebasRemotasHabilitadas = process.env.E2E_HABILITAR_PRUEBAS_REMOTAS === 'si';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL || !pruebasRemotasHabilitadas
    ? undefined
    : {
        command: `pnpm build && pnpm exec next start --port ${puerto}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
