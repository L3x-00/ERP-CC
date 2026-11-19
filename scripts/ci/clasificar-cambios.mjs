#!/usr/bin/env node
/**
 * Clasificador de cambios → plan de pruebas.
 *
 * Entrada: lista de archivos modificados (por git o por parámetro).
 * Salida: nivel de riesgo + qué capas de prueba se ejecutan.
 *
 * Uso local:
 *   node scripts/ci/clasificar-cambios.mjs                     # vs origin/main + árbol de trabajo
 *   node scripts/ci/clasificar-cambios.mjs --base HEAD~1
 *   node scripts/ci/clasificar-cambios.mjs --archivos "src/modulos/gastos/x.ts,tests/e2e/rfq-flujo.spec.ts"
 *   node scripts/ci/clasificar-cambios.mjs --json | node -e "..."   # solo JSON
 *
 * Uso en CI (ver .github/workflows/ci.yml):
 *   node scripts/ci/clasificar-cambios.mjs --base "$BASE_SHA" \
 *     --github-output "$GITHUB_OUTPUT" --resumen "$GITHUB_STEP_SUMMARY"
 *
 * Principio de seguridad: ante CUALQUIER duda se escala a `total` (suite completa).
 * Es mejor tardar de más en un cambio raro que dejar pasar un cambio sin cubrir.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import {
  E2E_TRANSVERSALES,
  PATRONES_DOCS,
  PATRONES_TOTAL,
  ARCHIVOS_TOTAL,
  RAICES_TRANSVERSALES,
  VERSION_CATALOGO,
  descubrirSpecsE2E,
  esModuloConocido,
  moduloDeRuta,
  normalizarRuta,
  specsDeModulo,
  validarCatalogo,
} from './catalogo-pruebas.mjs';

/**
 * Umbral a partir del cual ejecutar "los specs mapeados" equivale a ejecutar
 * todos: por encima de este porcentaje se pide la suite E2E completa (menos
 * fragilidad de argumentos y mejor reparto cuando se añada el sharding).
 */
const PORCENTAJE_SPECS_COMPLETO = 0.6;

const coincide = (ruta, patrones) => patrones.some((patron) => new RegExp(patron).test(ruta));
const esTotal = (ruta) => ARCHIVOS_TOTAL.includes(ruta) || coincide(ruta, PATRONES_TOTAL);
const esDoc = (ruta) => coincide(ruta, PATRONES_DOCS);

const PRUEBA_UNITARIA = /^tests\/unitarias\/.+\.test\.ts$/;
const PRUEBA_INTEGRACION = /^tests\/integracion\/.+\.test\.ts$/;
const PRUEBA_E2E = /^tests\/e2e\/.+\.spec\.ts$/;
const PGTAP = /^supabase\/tests\/.+\.test\.sql$/;

/**
 * Clasifica una lista de archivos.
 * Función pura: sin git, sin filesystem, sin variables de entorno.
 *
 * @param {string[]} archivos
 * @param {{ forzarTotal?: boolean, totalSpecs?: number }} [opciones]
 */
export function clasificarCambios(archivos, opciones = {}) {
  const { forzarTotal = false, totalSpecs = 0 } = opciones;
  const lista = [...new Set(archivos.map(normalizarRuta).filter(Boolean))].sort();

  if (forzarTotal || lista.length === 0) {
    return total({
      archivos: lista,
      motivo: forzarTotal
        ? 'Ejecución forzada a suite completa (main, manual o base desconocida).'
        : 'No se pudo determinar la lista de archivos modificados.',
    });
  }

  const acc = {
    archivos: lista,
    docs: [],
    total: [],
    transversales: [],
    modulos: new Set(),
    unitarias: [],
    integracion: [],
    e2e: [],
    pgtap: [],
    desconocidos: [],
  };

  for (const archivo of lista) {
    if (esTotal(archivo)) {
      acc.total.push(archivo);
      continue;
    }
    if (PRUEBA_UNITARIA.test(archivo)) {
      acc.unitarias.push(archivo);
      continue;
    }
    if (PRUEBA_INTEGRACION.test(archivo)) {
      acc.integracion.push(archivo);
      continue;
    }
    if (PRUEBA_E2E.test(archivo)) {
      acc.e2e.push(archivo);
      continue;
    }
    if (PGTAP.test(archivo)) {
      acc.pgtap.push(archivo);
      continue;
    }
    if (esDoc(archivo)) {
      acc.docs.push(archivo);
      continue;
    }
    if (RAICES_TRANSVERSALES.some((raiz) => archivo.startsWith(raiz))) {
      acc.transversales.push(archivo);
      continue;
    }
    if (archivo.startsWith('src/app/') || archivo.startsWith('src/estado/')) {
      const modulo = moduloDeRuta(archivo);
      if (modulo) {
        acc.modulos.add(modulo);
      } else {
        acc.transversales.push(archivo);
      }
      continue;
    }
    if (archivo.startsWith('src/modulos/')) {
      const modulo = moduloDeRuta(archivo);
      if (modulo) acc.modulos.add(modulo);
      else acc.desconocidos.push(archivo);
      continue;
    }
    // Cualquier ruta no reconocida se trata como transversal: nunca se omite.
    acc.desconocidos.push(archivo);
  }

  // 1. Configuración, SQL, tipos generados o herramientas propias del CI.
  if (acc.total.length > 0) {
    return total({
      archivos: lista,
      motivo: `Cambian archivos que invalidan todas las capas: ${acc.total.slice(0, 3).join(', ')}${
        acc.total.length > 3 ? ` (+${acc.total.length - 3})` : ''
      }`,
      modulos: [...acc.modulos],
    });
  }

  // 2. Módulos sin registro en el catálogo: escala a total + aviso accionable.
  const modulosDesconocidos = [...acc.modulos].filter((modulo) => !esModuloConocido(modulo));
  if (modulosDesconocidos.length > 0 || acc.desconocidos.length > 0) {
    return total({
      archivos: lista,
      motivo: `Rutas no clasificadas (${[...modulosDesconocidos, ...acc.desconocidos].join(', ')}). Registra el módulo/spec en scripts/ci/catalogo-pruebas.mjs.`,
      modulos: [...acc.modulos],
    });
  }

  // 3. Código compartido: cualquier módulo puede romperse.
  if (acc.transversales.length > 0) {
    return {
      version: VERSION_CATALOGO,
      nivel: 'transversal',
      archivos: lista,
      motivo: `${acc.transversales.length} archivo(s) de código compartido (${acc.transversales
        .slice(0, 2)
        .join(', ')})`,
      modulos: [...acc.modulos],
      typecheck: true,
      lint: true,
      unitarias: { modo: 'completas', archivos: [] },
      integracion: { modo: 'completa', archivos: [] },
      concurrencia: true,
      pgtap: true,
      e2e: { modo: 'completo', specs: [] },
    };
  }

  // 4. Cambios de módulos concretos.
  if (acc.modulos.size > 0) {
    const modulos = [...acc.modulos];
    const specs = new Set();
    for (const modulo of modulos) {
      for (const spec of specsDeModulo(modulo)) specs.add(spec);
    }
    for (const spec of E2E_TRANSVERSALES) specs.add(`tests/e2e/${spec}.spec.ts`);
    // Un spec E2E editado en el mismo PR se ejecuta siempre, aunque pertenezca
    // a otro módulo: es el archivo que el autor quiso validar.
    for (const spec of acc.e2e) specs.add(spec);
    const rutas = [...specs].sort();

    const e2e =
      totalSpecs > 0 && rutas.length / totalSpecs >= PORCENTAJE_SPECS_COMPLETO
        ? { modo: 'completo', specs: [] }
        : { modo: rutas.length > 0 ? 'specs' : 'no', specs: rutas };

    return {
      version: VERSION_CATALOGO,
      nivel: 'modulo',
      archivos: lista,
      motivo: `Módulo(s): ${modulos.join(', ')}`,
      modulos,
      typecheck: true,
      lint: true,
      unitarias: { modo: 'cambiadas', archivos: [] },
      integracion: { modo: 'completa', archivos: [] },
      concurrencia: true,
      // Si el PR además toca un pgTAP, se ejecuta la suite pgTAP completa.
      pgtap: acc.pgtap.length > 0,
      e2e,
    };
  }

  // 5. Solo pruebas y/o documentación.
  const hayPruebas = acc.unitarias.length + acc.integracion.length + acc.e2e.length + acc.pgtap.length > 0;
  if (!hayPruebas) {
    return {
      version: VERSION_CATALOGO,
      nivel: 'docs',
      archivos: lista,
      motivo: `Solo documentación o estáticos (${lista.length} archivo(s)).`,
      modulos: [],
      typecheck: false,
      lint: false,
      unitarias: { modo: 'ninguna', archivos: [] },
      integracion: { modo: 'no', archivos: [] },
      concurrencia: false,
      pgtap: false,
      e2e: { modo: 'no', specs: [] },
    };
  }

  return {
    version: VERSION_CATALOGO,
    nivel: 'pruebas',
    archivos: lista,
    motivo: 'Cambian solo archivos de prueba.',
    modulos: [],
    typecheck: acc.e2e.length > 0 || acc.integracion.length > 0 || acc.unitarias.length > 0,
    lint: acc.e2e.length > 0 || acc.integracion.length > 0 || acc.unitarias.length > 0,
    unitarias:
      acc.unitarias.length > 0 ? { modo: 'archivos', archivos: acc.unitarias } : { modo: 'ninguna', archivos: [] },
    integracion:
      acc.integracion.length > 0
        ? { modo: 'archivos', archivos: acc.integracion }
        : { modo: 'no', archivos: [] },
    concurrencia: false,
    pgtap: acc.pgtap.length > 0,
    e2e: acc.e2e.length > 0 ? { modo: 'specs', specs: acc.e2e } : { modo: 'no', specs: [] },
  };
}

function total({ archivos, motivo, modulos = [] }) {
  return {
    version: VERSION_CATALOGO,
    nivel: 'total',
    archivos,
    motivo,
    modulos,
    typecheck: true,
    lint: true,
    unitarias: { modo: 'completas', archivos: [] },
    integracion: { modo: 'completa', archivos: [] },
    concurrencia: true,
    pgtap: true,
    e2e: { modo: 'completo', specs: [] },
  };
}

/* ------------------------------------------------------------------------- */
/* Entrada desde git                                                           */
/* ------------------------------------------------------------------------- */

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean);
}

/** Archivos del diff contra una base + cambios del árbol de trabajo. */
export function archivosDesdeGit(base) {
  const delDiff = base && !/^0+$/.test(base) ? git(['diff', '--name-only', `${base}...HEAD`]) : [];
  const indexados = git(['diff', '--cached', '--name-only']);
  const arbol = git(['ls-files', '--others', '--modified', '--exclude-standard']);
  return [...new Set([...delDiff, ...indexados, ...arbol])].sort();
}

/* ------------------------------------------------------------------------- */
/* Salidas                                                                     */
/* ------------------------------------------------------------------------- */

function plano(clasificacion) {
  return {
    nivel: clasificacion.nivel,
    typecheck: String(clasificacion.typecheck),
    unitarias_modo: clasificacion.unitarias.modo,
    unitarias_archivos: clasificacion.unitarias.archivos.join(' '),
    integracion_modo: clasificacion.integracion.modo,
    integracion_archivos: clasificacion.integracion.archivos.join(' '),
    concurrencia: String(clasificacion.concurrencia),
    pgtap: String(clasificacion.pgtap),
    e2e_modo: clasificacion.e2e.modo,
    e2e_specs: clasificacion.e2e.specs.join(' '),
    modulos: clasificacion.modulos.join(' '),
  };
}

function escribirGithubOutput(ruta, pares) {
  const lineas = Object.entries(pares)
    .map(([clave, valor]) => `${clave}=${valor}`)
    .join('\n');
  appendFileSync(ruta, `${lineas}\n`, 'utf8');
}

function resumenMarkdown(clasificacion) {
  const filas = [
    ['Nivel', `\`${clasificacion.nivel}\``],
    ['Motivo', clasificacion.motivo],
    ['Módulos', clasificacion.modulos.length ? clasificacion.modulos.map((m) => `\`${m}\``).join(', ') : '—'],
    ['Tipos/lint', clasificacion.typecheck ? 'sí' : 'no'],
    ['Unitarias', `${clasificacion.unitarias.modo}${clasificacion.unitarias.archivos.length ? ` (${clasificacion.unitarias.archivos.length})` : ''}`],
    ['Integración', clasificacion.integracion.modo],
    ['Concurrencia', clasificacion.concurrencia ? 'sí' : 'no'],
    ['pgTAP', clasificacion.pgtap ? 'completo' : 'no'],
    ['E2E', clasificacion.e2e.modo === 'specs' ? `${clasificacion.e2e.specs.length} specs` : clasificacion.e2e.modo],
  ];

  const omitidas = [];
  if (clasificacion.unitarias.modo === 'ninguna') omitidas.push('unitarias');
  if (clasificacion.integracion.modo === 'no') omitidas.push('integración');
  if (!clasificacion.concurrencia) omitidas.push('concurrencia');
  if (!clasificacion.pgtap) omitidas.push('pgTAP');
  if (clasificacion.e2e.modo === 'no') omitidas.push('E2E');

  const lineas = [
    '### Plan de pruebas de este cambio',
    '',
    '| Campo | Valor |',
    '| --- | --- |',
    ...filas.map(([campo, valor]) => `| ${campo} | ${valor} |`),
    '',
    `**Se omiten:** ${omitidas.length ? omitidas.join(', ') : 'nada (suite completa)'}`,
  ];

  if (clasificacion.e2e.modo === 'specs') {
    lineas.push('', '<details><summary>Specs E2E a ejecutar</summary>', '');
    for (const spec of clasificacion.e2e.specs) lineas.push(`- \`${spec}\``);
    lineas.push('', '</details>');
  }

  if (clasificacion.archivos.length > 0 && clasificacion.archivos.length <= 100) {
    lineas.push('', `<details><summary>Archivos detectados (${clasificacion.archivos.length})</summary>`, '');
    for (const archivo of clasificacion.archivos) lineas.push(`- \`${archivo}\``);
    lineas.push('', '</details>');
  }

  return `${lineas.join('\n')}\n`;
}

/* ------------------------------------------------------------------------- */
/* CLI                                                                         */
/* ------------------------------------------------------------------------- */

function leerArgumentos(argv) {
  const args = { base: 'origin/main', forzarTotal: false, archivos: null, githubOutput: null, resumen: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const actual = argv[i];
    if (actual === '--base') args.base = argv[++i];
    else if (actual === '--forzar-total') args.forzarTotal = true;
    else if (actual === '--archivos') args.archivos = argv[++i] ?? '';
    else if (actual === '--github-output') args.githubOutput = argv[++i];
    else if (actual === '--resumen') args.resumen = argv[++i];
    else if (actual === '--json') args.json = true;
    else if (actual === '--ayuda' || actual === '-h') args.ayuda = true;
    else throw new Error(`Argumento no reconocido: ${actual}`);
  }
  return args;
}

/**
 * Lista de archivos a clasificar.
 *
 * `--forzar-total` no consulta git: así el workflow funciona en un clon sin
 * `origin/main` (tag, rama renombrada, dispatch manual). Si git falla se
 * devuelve `[]`, lo que el clasificador interpreta como suite completa.
 */
function leerArchivos(args) {
  if (args.forzarTotal) return [];
  if (args.archivos !== null) {
    return args.archivos
      .split(',')
      .map((archivo) => archivo.trim())
      .filter(Boolean);
  }
  try {
    return archivosDesdeGit(args.base);
  } catch (error) {
    console.warn(
      `[clasificar] no se pudo leer el diff de git (${error instanceof Error ? error.message : error}). Se ejecuta la suite completa.`,
    );
    return [];
  }
}

/**
 * Quita de las listas explícitas las rutas que ya no existen (borradas o
 * renombradas en este mismo cambio). Pasarle a Vitest o Playwright un archivo
 * inexistente hace fallar el job con "no tests found"; borrar un test es un
 * cambio legítimo y no debe romper el CI.
 */
export function podarInexistentes(clasificacion) {
  const vivos = (lista) => lista.filter((ruta) => existsSync(ruta));
  const unitariasArchivos = vivos(clasificacion.unitarias.archivos);
  const integracionArchivos = vivos(clasificacion.integracion.archivos);
  const e2eSpecs = vivos(clasificacion.e2e.specs);

  const unitarias =
    clasificacion.unitarias.modo === 'archivos' && unitariasArchivos.length === 0
      ? { modo: 'ninguna', archivos: [] }
      : { ...clasificacion.unitarias, archivos: unitariasArchivos };

  const integracion =
    clasificacion.integracion.modo === 'archivos' && integracionArchivos.length === 0
      ? { modo: 'no', archivos: [] }
      : { ...clasificacion.integracion, archivos: integracionArchivos };

  const e2e =
    clasificacion.e2e.modo === 'specs' && e2eSpecs.length === 0
      ? { modo: 'no', specs: [] }
      : { ...clasificacion.e2e, specs: e2eSpecs };

  return { ...clasificacion, unitarias, integracion, e2e };
}

function principal(argv) {
  const args = leerArgumentos(argv);

  if (args.ayuda) {
    console.log(
      [
        'Clasificador de cambios → plan de pruebas',
        '',
        'Opciones:',
        '  --base <ref>          Referencia base (default: origin/main)',
        '  --forzar-total        Ejecuta la suite completa sin analizar',
        '  --archivos <lista>    Lista separada por comas (omite git)',
        '  --github-output <f>   Anexa salidas clave=valor para GitHub Actions',
        '  --resumen <f>         Anexa el resumen Markdown (GITHUB_STEP_SUMMARY)',
        '  --json                Imprime solo el JSON',
      ].join('\n'),
    );
    return 0;
  }

  const erroresCatalogo = validarCatalogo();
  if (erroresCatalogo.length > 0) {
    console.error('El catálogo de pruebas está desactualizado:');
    for (const error of erroresCatalogo) console.error(`  - ${error}`);
    console.error('\nCorrige scripts/ci/catalogo-pruebas.mjs. Ver scripts/ci/README.md.');
    return 2;
  }

  const archivos = leerArchivos(args);
  const totalSpecs = descubrirSpecsE2E().length;

  const clasificacion = podarInexistentes(
    clasificarCambios(archivos, { forzarTotal: args.forzarTotal, totalSpecs }),
  );

  if (args.json) {
    console.log(JSON.stringify(clasificacion, null, 2));
  } else {
    console.log(`Nivel: ${clasificacion.nivel}`);
    console.log(`Motivo: ${clasificacion.motivo}`);
    console.log(`Archivos: ${clasificacion.archivos.length}`);
    console.log(`Unitarias: ${clasificacion.unitarias.modo}`);
    console.log(`Integración: ${clasificacion.integracion.modo}`);
    console.log(`pgTAP: ${clasificacion.pgtap ? 'completo' : 'no'}`);
    console.log(`E2E: ${clasificacion.e2e.modo}${clasificacion.e2e.specs.length ? ` (${clasificacion.e2e.specs.length})` : ''}`);
  }

  if (args.githubOutput) escribirGithubOutput(args.githubOutput, plano(clasificacion));
  if (args.resumen) appendFileSync(args.resumen, resumenMarkdown(clasificacion), 'utf8');

  return 0;
}

if (process.argv[1]?.endsWith('clasificar-cambios.mjs')) {
  try {
    process.exitCode = principal(process.argv.slice(2));
  } catch (error) {
    console.error(`No se pudo clasificar el cambio: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
