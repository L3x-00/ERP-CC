import { defineConfig } from '@playwright/test';

const puerto = Number(process.env.E2E_PUERTO ?? '3100');
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${puerto}`;
const pruebasRemotasHabilitadas = process.env.E2E_HABILITAR_PRUEBAS_REMOTAS === 'si';

// Los escenarios E2E crean y eliminan usuarios y datos con service_role.
// Exigir el destino explícito antes de cargar specs que podrían leer .env.local.
function exigirLoopback(valor: string | undefined, nombre: string): void {
  if (!valor) throw new Error(`${nombre} debe apuntar explícitamente al stack local para E2E.`);
  let destino: URL;
  try {
    destino = new URL(valor);
  } catch {
    throw new Error(`${nombre} no es una URL válida para E2E local.`);
  }
  if (!['http:', 'https:'].includes(destino.protocol) || !['127.0.0.1', 'localhost'].includes(destino.hostname)) {
    throw new Error(`${nombre} debe apuntar a loopback para E2E.`);
  }
}

exigirLoopback(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
exigirLoopback(baseURL, 'E2E_BASE_URL');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Un flake de transporte no debe costar repetir el job completo (10–19 min).
  retries: process.env.CI ? 1 : 0,
  // Un `test.only` olvidado no puede dejar el resto de la suite sin ejecutar.
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    acceptDownloads: true,
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
        // Cubre el build de producción + arranque: 120 s solo alcanzaba para
        // Next en frío y producía fallos intermitentes en CI.
        timeout: 600_000,
        // El wrapper necesita una señal capturable para apagar Next y el stub
        // (con SIGKILL quedaría un next-server huérfano colgando el job de CI).
        gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      },
});
