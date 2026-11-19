#!/usr/bin/env node
/**
 * Resumen legible de cobertura por área del producto.
 *
 * Lee el `coverage-summary.json` que produce Vitest (reporter `json-summary`) y
 * agrupa los archivos por módulo de dominio. Se publica en el resumen del job
 * de GitHub para que la cobertura sea visible sin abrir el reporte HTML.
 *
 * Uso:
 *   node scripts/ci/resumen-cobertura.mjs                 # cobertura/coverage-summary.json
 *   node scripts/ci/resumen-cobertura.mjs ruta.json
 *   node scripts/ci/resumen-cobertura.mjs ruta.json --salida resumen.md
 *   node scripts/ci/resumen-cobertura.mjs --exigir        # falla si no hay informe
 */
import { existsSync, readFileSync } from 'node:fs';
import { appendFileSync } from 'node:fs';

const RUTA_POR_DEFECTO = 'cobertura/coverage-summary.json';

/** Métricas que publica Istanbul, en el orden en que se muestran. */
const METRICAS = ['lines', 'statements', 'functions', 'branches'];

/** Agrupa una ruta de `src/` en su área de producto. */
export function grupoDeArchivo(ruta) {
  const normalizada = String(ruta).replace(/\\/g, '/');
  // Se conserva el prefijo `src/`: el último segmento `/src/` de una ruta
  // absoluta o el inicio de una ruta relativa.
  const indice = normalizada.lastIndexOf('/src/');
  let desdeSrc;
  if (indice >= 0) desdeSrc = normalizada.slice(indice + 1);
  else if (normalizada.startsWith('src/')) desdeSrc = normalizada;
  else if (normalizada.startsWith('./src/')) desdeSrc = normalizada.slice(2);
  else return null;

  const partes = desdeSrc.slice(4).split('/');
  const primero = partes[0];
  if (primero === 'modulos' && partes[1]) return `modulos/${partes[1]}`;
  if (primero) return primero;
  return null;
}

function porcentaje(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  return 0;
}

/**
 * Agrupa el informe por área y calcula los porcentajes ponderados por líneas.
 *
 * @param {Record<string, any>} informe
 * @returns {Array<{ grupo: string, lines: number, statements: number, functions: number, branches: number, archivos: number }>}
 */
export function agruparCobertura(informe) {
  const acumulado = new Map();

  for (const [ruta, datos] of Object.entries(informe)) {
    if (ruta === 'total' || !datos) continue;
    const grupo = grupoDeArchivo(ruta);
    if (!grupo) continue;

    if (!acumulado.has(grupo)) {
      acumulado.set(grupo, {
        grupo,
        archivos: 0,
        lines: { cubiertas: 0, total: 0 },
        statements: { cubiertas: 0, total: 0 },
        functions: { cubiertas: 0, total: 0 },
        branches: { cubiertas: 0, total: 0 },
      });
    }

    const fila = acumulado.get(grupo);
    fila.archivos += 1;
    for (const metrica of METRICAS) {
      const valor = datos[metrica];
      if (!valor) continue;
      fila[metrica].cubiertas += Number(valor.covered ?? 0);
      fila[metrica].total += Number(valor.total ?? 0);
    }
  }

  return [...acumulado.values()]
    .map((fila) => {
      const resultado = { grupo: fila.grupo, archivos: fila.archivos };
      for (const metrica of METRICAS) {
        const { cubiertas, total } = fila[metrica];
        resultado[metrica] = total > 0 ? (cubiertas / total) * 100 : 0;
      }
      return resultado;
    })
    .sort((a, b) => a.lines - b.lines);
}

function formatear(valor) {
  return `${valor.toFixed(1)} %`;
}

/** @param {Array<ReturnType<typeof agruparCobertura>[number]>} grupos */
export function resumenMarkdown(grupos, totalInforme, limite = 30) {
  const lineas = [
    '### Cobertura de pruebas unitarias',
    '',
    '| Área | Archivos | Líneas | Sentencias | Funciones | Ramas |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];

  if (totalInforme) {
    lineas.push(
      `| **Total** | **${totalInforme.archivos}** | **${formatear(porcentaje(totalInforme.lines?.pct))}** | ` +
        `**${formatear(porcentaje(totalInforme.statements?.pct))}** | ` +
        `**${formatear(porcentaje(totalInforme.functions?.pct))}** | ` +
        `**${formatear(porcentaje(totalInforme.branches?.pct))}** |`,
    );
  }

  for (const grupo of grupos.slice(0, limite)) {
    lineas.push(
      `| \`${grupo.grupo}\` | ${grupo.archivos} | ${formatear(grupo.lines)} | ${formatear(grupo.statements)} | ` +
        `${formatear(grupo.functions)} | ${formatear(grupo.branches)} |`,
    );
  }

  if (grupos.length > limite) {
    lineas.push('', `_Se muestran las ${limite} áreas con menor cobertura de ${grupos.length}._`);
  }

  lineas.push(
    '',
    'Las áreas se ordenan de menor a mayor cobertura de líneas. El umbral global solo se exige en la suite completa.',
    '',
  );
  return `${lineas.join('\n')}\n`;
}

/** Extrae el bloque `total` del informe. */
export function totalDelInforme(informe) {
  const total = informe.total;
  if (!total) return null;
  return { archivos: Object.keys(informe).length - 1, ...total };
}

function leerArgumentos(argv) {
  const args = { ruta: RUTA_POR_DEFECTO, salida: null, exigir: false };
  for (let i = 0; i < argv.length; i += 1) {
    const actual = argv[i];
    if (actual === '--salida') args.salida = argv[++i];
    else if (actual === '--exigir') args.exigir = true;
    else if (actual === '--ayuda' || actual === '-h') args.ayuda = true;
    else if (!actual.startsWith('--')) args.ruta = actual;
    else throw new Error(`Argumento no reconocido: ${actual}`);
  }
  return args;
}

function principal(argv) {
  const args = leerArgumentos(argv);

  if (args.ayuda) {
    console.log(
      [
        'Resumen de cobertura por área',
        '',
        'Opciones:',
        `  <ruta>            Informe json-summary (default: ${RUTA_POR_DEFECTO})`,
        '  --salida <f>      Anexa el Markdown al archivo indicado',
        '  --exigir          Falla si el informe no existe',
      ].join('\n'),
    );
    return 0;
  }

  if (!existsSync(args.ruta)) {
    const mensaje = `No se encontró el informe de cobertura: ${args.ruta}`;
    if (args.exigir) {
      console.error(mensaje);
      return 1;
    }
    console.log(`${mensaje} (se omite el resumen).`);
    return 0;
  }

  const informe = JSON.parse(readFileSync(args.ruta, 'utf8'));
  const grupos = agruparCobertura(informe);
  const total = totalDelInforme(informe);
  const markdown = resumenMarkdown(grupos, total);

  if (args.salida) appendFileSync(args.salida, markdown, 'utf8');
  else console.log(markdown);

  return 0;
}

if (process.argv[1]?.endsWith('resumen-cobertura.mjs')) {
  try {
    process.exitCode = principal(process.argv.slice(2));
  } catch (error) {
    console.error(`No se pudo resumir la cobertura: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
