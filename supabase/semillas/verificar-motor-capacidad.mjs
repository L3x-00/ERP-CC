import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function ejecutar() {
  asegurar(process.env.NODE_ENV !== 'production', 'La prueba de motor no puede ejecutarse en producción.');
  asegurar(
    process.env.CONFIRMAR_PRUEBAS_FICTICIAS === 'si',
    'Define CONFIRMAR_PRUEBAS_FICTICIAS=si para ejecutar la prueba remota de motor.',
  );

  const rutaPnpm = process.platform === 'win32'
    ? join(
        process.env.APPDATA ?? '',
        'npm',
        'node_modules',
        'pnpm',
        'bin',
        'pnpm.mjs',
      )
    : process.env.npm_execpath;
  asegurar(rutaPnpm && existsSync(rutaPnpm), 'No se encontró el ejecutable de pnpm para la prueba.');

  const resultado = spawnSync(
    process.execPath,
    [
      rutaPnpm,
      'supabase',
      'db',
      'query',
      '--linked',
      '--file',
      'supabase/semillas/verificar-motor-capacidad.sql',
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    },
  );

  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) {
    process.exitCode = resultado.status ?? 1;
  }
}

try {
  ejecutar();
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Fallo desconocido' }));
  process.exitCode = 1;
}
