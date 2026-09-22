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
        // El wrapper levanta un stub local de OpenRouter (GAS-08) y arranca Next
        // con el override solo-loopback para que el E2E de OCR sea determinista.
        command: `pnpm build && node tests/e2e/servidor-con-stub-ocr.mjs`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // El wrapper necesita una señal capturable para apagar Next y el stub
        // (con SIGKILL quedaría un next-server huérfano colgando el job de CI).
        gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      },
});
