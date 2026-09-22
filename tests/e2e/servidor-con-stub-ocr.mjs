// Arranca el stub local de OpenRouter y luego `next start` apuntando a él.
// Uso EXCLUSIVO de la suite E2E local/CI: el override solo funciona hacia
// loopback y requiere `OPENROUTER_PERMITIR_ENDPOINT_LOCAL=si`, que este script
// establece únicamente para el proceso de Next que levanta.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const PUERTO_STUB = Number(process.env.E2E_OCR_STUB_PUERTO ?? '4599');
const PUERTO_NEXT = process.env.E2E_PUERTO ?? '3100';

const DATOS_COMPROBANTE = {
  proveedorSugerido: 'Ferretería E2E',
  rfc: 'XAXX010101000',
  folioFactura: 'E2E-1234',
  montoSubtotal: 1000,
  montoIva: 160,
  montoTotal: 1160,
  moneda: 'MXN',
  fechaEmision: '2026-09-15',
  confianza: 0.92,
  advertencias: [],
};

const stub = createServer((peticion, respuesta) => {
  if (peticion.method !== 'POST' || !peticion.url?.startsWith('/api/v1/chat/completions')) {
    respuesta.writeHead(404).end();
    return;
  }
  peticion.resume();
  peticion.on('end', () => {
    respuesta.writeHead(200, { 'content-type': 'application/json' });
    respuesta.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(DATOS_COMPROBANTE) } }],
      }),
    );
  });
});

await new Promise((resolver) => stub.listen(PUERTO_STUB, '127.0.0.1', resolver));

const hijo = spawn('pnpm', ['exec', 'next', 'start', '--port', String(PUERTO_NEXT)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY?.trim() || 'stub-sandbox',
    OPENROUTER_PERMITIR_ENDPOINT_LOCAL: 'si',
    OPENROUTER_BASE_URL: `http://127.0.0.1:${PUERTO_STUB}/api/v1/chat/completions`,
  },
});

function cerrar(codigo) {
  stub.close();
  hijo.kill();
  process.exit(codigo);
}

hijo.on('exit', (codigo) => {
  stub.close();
  process.exit(codigo ?? 0);
});
process.on('SIGTERM', () => cerrar(0));
process.on('SIGINT', () => cerrar(0));
