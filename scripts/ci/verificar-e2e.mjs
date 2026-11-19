/**
 * Verifica el resultado JSON de un shard E2E.
 *
 * Dos garantías:
 *   1. Un shard donde todo quedó `skipped` es un falso verde: se exige al
 *      menos una prueba ejecutada.
 *   2. Un reintento no debe ocultar una falla intermitente: si Playwright marca
 *      pruebas `flaky` (fallaron y pasaron al reintentar), se publica el conteo
 *      en el log y en el job summary, y se emite un warning. No se falla el job
 *      porque el reintento es deliberado; el objetivo es que el dato sea visible.
 *
 * Uso en CI:
 *   SHARD=1 TOTAL_SHARDS=4 node scripts/ci/verificar-e2e.mjs /tmp/e2e-resultados.json
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

/**
 * Recorre el árbol de suites del JSON de Playwright y cuenta los tests.
 *
 * @param {any} informe
 * @returns {{ ejecutadas: number, saltadas: number, flaky: number }}
 */
export function contarResultados(informe) {
  let ejecutadas = 0;
  let saltadas = 0;

  const recorrer = (suite) => {
    for (const spec of suite?.specs ?? []) {
      for (const prueba of spec?.tests ?? []) {
        if (prueba?.status === 'skipped') saltadas += 1;
        else ejecutadas += 1;
      }
    }
    for (const hija of suite?.suites ?? []) recorrer(hija);
  };

  recorrer(informe);

  const flaky = Number(informe?.stats?.flaky ?? 0);
  return { ejecutadas, saltadas, flaky: Number.isFinite(flaky) ? flaky : 0 };
}

/** Línea de una sola fila para el log del job. */
export function lineaResumen({ shard, total, ejecutadas, saltadas, flaky }) {
  return `E2E shard ${shard}/${total} · ejecutadas: ${ejecutadas} · saltadas: ${saltadas} · flaky: ${flaky}`;
}

/** Línea para el `$GITHUB_STEP_SUMMARY` del shard. */
export function lineaMarkdown({ shard, total, ejecutadas, saltadas, flaky }) {
  const aviso = flaky > 0 ? ` · **${flaky} flaky**` : '';
  return `- E2E shard ${shard}/${total}: ${ejecutadas} ejecutadas, ${saltadas} saltadas${aviso}\n`;
}

function principal(argv) {
  const ruta = argv[0] ?? '/tmp/e2e-resultados.json';

  if (!existsSync(ruta)) {
    console.error(`No se encontró el informe E2E: ${ruta}`);
    return 1;
  }

  let informe;
  try {
    // Tolera el BOM que algunos editores/consolas añaden al escribir JSON.
    informe = JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    console.error(`No se pudo leer el informe E2E: ${error instanceof Error ? error.message : error}`);
    return 1;
  }

  const datos = {
    shard: process.env.SHARD ?? '?',
    total: process.env.TOTAL_SHARDS ?? '?',
    ...contarResultados(informe),
  };

  console.log(lineaResumen(datos));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lineaMarkdown(datos), 'utf8');
  }

  if (datos.flaky > 0) {
    console.log(
      `::warning::E2E shard ${datos.shard}/${datos.total}: ${datos.flaky} prueba(s) flaky (pasaron tras reintento). ` +
        'Revisar: el reintento puede estar ocultando una falla intermitente.',
    );
  }

  if (datos.ejecutadas === 0) {
    console.error('::error::Este shard E2E no ejecutó ninguna prueba (todas saltadas).');
    return 1;
  }

  return 0;
}

if (process.argv[1]?.endsWith('verificar-e2e.mjs')) {
  try {
    process.exitCode = principal(process.argv.slice(2));
  } catch (error) {
    console.error(`No se pudo verificar el E2E: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
