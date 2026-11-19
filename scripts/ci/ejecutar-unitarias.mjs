/**
 * Ejecutor de pruebas unitarias proporcional al cambio.
 *
 * Modos:
 *   --modo completas                  Toda la suite (main, nightly, cambio transversal).
 *   --modo cambiadas --base <ref>     Solo los tests afectados por el diff (grafo de imports
 *                                     de Vitest), con respaldo automático a suite completa
 *                                     si Vitest no encuentra ningún test afectado.
 *   --modo archivos --archivos "a b"  Solo los archivos indicados.
 *   --modo ninguna                    No ejecuta nada (cambio de docs).
 *
 * `--cobertura` activa la medición. Solo tiene sentido en los modos que miden
 * código propio: `completas` (suite completa) y `cambiadas` (cobertura del
 * diff: Vitest hereda `test.changed` en `coverage.changed`). En `archivos`
 * (edición de specs) y `ninguna` se ignora a propósito: mediría una porción
 * arbitraria y ensuciaría el histórico.
 *
 * El respaldo es deliberado: `--changed` depende del grafo de imports. Si un alias,
 * una re-exportación o un archivo generado rompe ese grafo, Vitest devolvería
 * "No test files found" y el CI se vería verde sin haber probado nada.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const VITEST = join(RAIZ, 'node_modules', 'vitest', 'vitest.mjs');
const MARCA_SIN_PRUEBAS = 'No test files found';

function leerArgumentos(argv) {
  const args = { modo: 'cambiadas', base: 'origin/main', archivos: '', respaldo: true, cobertura: false };
  for (let i = 0; i < argv.length; i += 1) {
    const actual = argv[i];
    if (actual === '--modo') args.modo = argv[++i];
    else if (actual === '--base') args.base = argv[++i];
    else if (actual === '--archivos') args.archivos = argv[++i] ?? '';
    else if (actual === '--cobertura') args.cobertura = true;
    else if (actual === '--sin-respaldo') args.respaldo = false;
    else throw new Error(`Argumento no reconocido: ${actual}`);
  }
  return args;
}

/** La cobertura solo se mide cuando el modo cubre código propio de forma completa. */
export function mideCobertura(modo) {
  return modo === 'completas' || modo === 'cambiadas';
}

/** @returns {string[]} argumentos de Vitest para el modo indicado. */
export function argumentosVitest({ modo, base, archivos, cobertura = false }) {
  const comunes = ['run', 'tests/unitarias'];
  const conCobertura = cobertura && mideCobertura(modo) ? ['--coverage'] : [];
  if (modo === 'completas') return [...comunes, ...conCobertura];
  if (modo === 'cambiadas') return [...comunes, `--changed=${base}`, ...conCobertura];
  if (modo === 'archivos') {
    const lista = archivos.split(/\s+/).filter(Boolean);
    return [...comunes, ...lista];
  }
  if (modo === 'ninguna') return [];
  throw new Error(`Modo desconocido: ${modo}`);
}

/** ¿La salida de Vitest indica que no encontró pruebas? */
export function sinPruebas(salida) {
  return salida.includes(MARCA_SIN_PRUEBAS);
}

function ejecutar(argumentos) {
  return new Promise((resolve) => {
    const hijo = spawn(process.execPath, [VITEST, ...argumentos], {
      cwd: RAIZ,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });

    let acumulado = '';
    const reenviar = (flujo) => (trozo) => {
      const texto = trozo.toString();
      acumulado += texto;
      flujo.write(texto);
    };
    hijo.stdout.on('data', reenviar(process.stdout));
    hijo.stderr.on('data', reenviar(process.stderr));
    hijo.on('error', (error) => resolve({ codigo: 1, salida: `${acumulado}\n${error.message}` }));
    hijo.on('close', (codigo) => resolve({ codigo: codigo ?? 1, salida: acumulado }));
  });
}

async function principal(argv) {
  const args = leerArgumentos(argv);

  if (!existsSync(VITEST)) {
    console.error(`No se encontró Vitest en ${VITEST}. Ejecuta pnpm install.`);
    return 1;
  }

  const argumentos = argumentosVitest(args);
  if (argumentos.length === 0) {
    console.log(`[unitarias] modo '${args.modo}': no hay nada que ejecutar.`);
    return 0;
  }

  console.log(`[unitarias] modo '${args.modo}': vitest ${argumentos.join(' ')}`);
  const primera = await ejecutar(argumentos);

  // El respaldo se decide por la marca de Vitest, no por el código de salida:
  // si falló alegando "no test files found", el CI quedaría rojo sin haber
  // probado nada, que es justo lo que queremos evitar.
  const respaldoNecesario = args.respaldo && args.modo === 'cambiadas' && sinPruebas(primera.salida);

  if (!respaldoNecesario) return primera.codigo;

  console.warn(
    '[unitarias] Vitest no encontró pruebas afectadas para este diff. Se ejecuta la suite completa por seguridad.',
  );
  const respaldo = await ejecutar(argumentosVitest({ modo: 'completas', cobertura: args.cobertura }));
  return respaldo.codigo;
}

if (process.argv[1]?.endsWith('ejecutar-unitarias.mjs')) {
  principal(process.argv.slice(2))
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((error) => {
      console.error(`[unitarias] ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
