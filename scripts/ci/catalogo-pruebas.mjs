/**
 * Catálogo único de pruebas de ORCA MFG ERP.
 *
 * Propósito
 * ---------
 * Es la ÚNICA fuente de verdad que relaciona el código de producción con las
 * capas de prueba que lo cubren. Lo consumen:
 *
 *   1. `scripts/ci/clasificar-cambios.mjs` (CI y local) para decidir qué se ejecuta.
 *   2. `tests/unitarias/ci-catalogo-pruebas.test.ts` para impedir que el catálogo
 *      se quede obsoleto cuando alguien agrega un spec E2E o un módulo nuevo.
 *
 * Regla de oro
 * ------------
 * Añadir una prueba E2E nueva o un módulo nuevo en `src/modulos/` SIN registrarlo
 * aquí rompe la validación del catálogo (CI en rojo con un mensaje accionable).
 * Es intencional: obliga a decidir a qué grupo pertenece la prueba en el mismo
 * commit en que se crea, en lugar de dejar que el CI se vuelva más lento y ciego.
 *
 * Cómo extenderlo
 * ---------------
 * - Nuevo módulo con E2E dedicado: añádelo a `MODULOS_E2E`.
 * - Nuevo módulo sin E2E todavía: añádelo a `MODULOS_SIN_E2E` con el motivo.
 * - Nuevo spec E2E transversal (afecta a todos los flujos): `E2E_TRANSVERSALES`.
 * - Nueva ruta en `src/app/`: `RUTAS_APP_A_MODULO`.
 * - Consulta `scripts/ci/README.md` para el flujo completo.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Sube solo cuando cambia el contrato de este catálogo (lo consume el clasificador). */
export const VERSION_CATALOGO = 1;

/**
 * Módulo de `src/modulos/<m>` → specs E2E que lo ejercitan.
 * Los nombres NO llevan `tests/e2e/` ni `.spec.ts`; se resuelven con `specsDeModulo`.
 */
export const MODULOS_E2E = Object.freeze({
  auditoria: ['permisos-usuarios-admin', 'catalogos-base'],
  autenticacion: ['permisos-usuarios-admin', 'operadores-gestion', 'dashboard-roles'],
  catalogos: ['catalogos-base', 'catalogos-comerciales'],
  cierres: ['finanzas-conciliacion-orden', 'ordenes-estados-sii'],
  clientes: [
    'clientes-ficha',
    'clientes-contactos',
    'clientes-historial',
    'archivos-cliente',
    'comercial-realtime',
  ],
  cobranza: [
    'cobranza-flujo',
    'cobranza-ficha',
    'cobranza-folio-rp',
    'cobranza-cobro-multiple',
    'cobranza-movimientos-consolidacion',
    'cancelacion-financiera',
    'finanzas-conciliacion-orden',
  ],
  comentarios: ['comentarios-notificaciones'],
  compras: ['compras-flujo'],
  configuracion: [
    'configuracion-flujo',
    'continuidad-folios-configuracion',
    'tipo-cambio-diario',
    'catalogos-base',
    'catalogos-comerciales',
    'permisos-usuarios-admin',
  ],
  cotizador: ['propuestas-flujo', 'rfq-flujo', 'aceptacion-comercial'],
  dashboard: ['dashboard-roles', 'kpis-dashboard'],
  entregas: ['entregas-flujo', 'produccion-piso', 'ordenes-flujo-completo'],
  facturacion: ['facturacion-retirada', 'cobranza-flujo'],
  finanzas: ['finanzas-conciliacion-orden', 'gastos-rentabilidad', 'cobranza-flujo'],
  gastos: [
    'gastos-a19',
    'gastos-ocr',
    'gastos-rentabilidad',
    'gastos-rentabilidad-ti',
    'finanzas-conciliacion-orden',
  ],
  inventario: ['materiales-costos-c6-3'],
  kpis: ['kpis-dashboard', 'dashboard-roles'],
  ordenes: [
    'ordenes-flujo-completo',
    'ordenes-estados-sii',
    'ordenes-edicion-borrador',
    'ordenes-heredadas-reactivacion',
    'aceptacion-comercial',
    'produccion-piso',
  ],
  permisos: ['permisos-usuarios-admin', 'operadores-gestion', 'dashboard-roles'],
  pipeline: ['aceptacion-comercial', 'clientes-historial', 'clientes-ficha'],
  planeacion: [
    'planeacion-bolsa-acciones',
    'planeacion-capacidad',
    'planeacion-flujo-colaborativo',
    'produccion-piso',
  ],
  produccion: [
    'produccion-piso',
    'produccion-avance-procesos',
    'produccion-c20-flujo',
    'corridas-calidad',
    'taller-taxonomia',
    'ordenes-flujo-completo',
  ],
  propuestas: ['propuestas-flujo', 'aceptacion-comercial', 'finanzas-conciliacion-orden'],
  rfq: ['rfq-flujo', 'continuidad-folios-rfq', 'aceptacion-comercial'],
  tablero: ['dashboard-roles'],
  tesoreria: ['tesoreria-flujo', 'cobranza-flujo'],
});

/**
 * Módulos que hoy NO tienen spec E2E dedicado. Deben declararse con motivo:
 * un módulo sin cobertura es una decisión explícita, no un olvido.
 */
export const MODULOS_SIN_E2E = Object.freeze({
  'portal-cliente': 'El portal del cliente está preparado en dominio pero sin flujo habilitado en producción.',
});

/** Specs que se ejecutan SIEMPRE que hay cambio de UI o de cualquier módulo. */
export const E2E_TRANSVERSALES = Object.freeze(['tema-global', 'dashboard-roles']);

/** Segmento de ruta de `src/app/**` → módulo dueño del flujo. */
export const RUTAS_APP_A_MODULO = Object.freeze({
  'iniciar-sesion': 'autenticacion',
  operador: 'autenticacion',
  clientes: 'clientes',
  cobranza: 'cobranza',
  cobros: 'cobranza',
  configuracion: 'configuracion',
  gastos: 'gastos',
  egresos: 'gastos',
  inventario: 'inventario',
  ordenes: 'ordenes',
  pipeline: 'pipeline',
  planeacion: 'planeacion',
  produccion: 'produccion',
  'produccion-piso': 'produccion',
  'mi-panel': 'produccion',
  propuestas: 'propuestas',
  rfq: 'rfq',
  tablero: 'tablero',
  'cierre-administrativo': 'cierres',
  compras: 'compras',
  entregas: 'entregas',
  dashboard: 'dashboard',
  facturacion: 'facturacion',
  tesoreria: 'tesoreria',
  seguimiento: 'portal-cliente',
});

/** Archivos de `src/estado` con nombre propio → módulo (los `uso-tienda-*` se deducen). */
export const ARCHIVOS_ESTADO_A_MODULO = Object.freeze({
  'src/estado/inventario-tienda.ts': 'inventario',
});

/**
 * Raíces de código compartido: un cambio aquí puede afectar a cualquier módulo.
 * Se resuelven como nivel `transversal` (suite unitaria completa + E2E completo).
 */
export const RAICES_TRANSVERSALES = Object.freeze([
  'src/compartido/',
  'src/nucleo/',
  'src/lib/',
  'src/estilos/',
  'src/components/',
]);

/** Archivos cuyo cambio invalida TODAS las capas (nivel `total`). */
export const ARCHIVOS_TOTAL = Object.freeze([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'next.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'eslint.config.mjs',
  'postcss.config.mjs',
  'components.json',
]);

/** Patrones (regex) cuyo cambio invalida TODAS las capas (nivel `total`). */
export const PATRONES_TOTAL = Object.freeze([
  '^\\.github/',
  '^scripts/ci/',
  '^supabase/config\\.toml$',
  '^supabase/(migrations|semillas|seed)/',
  '^supabase/tests/(?!.+\\.test\\.sql$)',
  '^src/compartido/tipos/supabase\\.ts$',
  '^tests/(utilidades|mocks)/',
  '^tests/e2e/(?!.*\\.spec\\.ts$).+\\.(mjs|js|ts)$',
  '^tests/integracion/(?!.*\\.test\\.ts$).+\\.(mjs|js|ts)$',
]);

/** Patrones (regex) que se consideran documentación: no disparan pruebas. */
export const PATRONES_DOCS = Object.freeze([
  '^\\.ai-shared/',
  '^docs/',
  '^content/',
  // Imágenes y tipografías de `public/` son inertes. Cualquier otro asset
  // público (manifest, robots, HTML) cae en "desconocido" y escala a total.
  '^public/.+\\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf)$',
  '\\.(md|mdx)$',
  '^(README|LICENSE|CHANGELOG)',
  '^skills-lock\\.json$',
  '^\\.env\\.example$',
  '^\\.gitignore$',
  '^\\.gitattributes$',
]);

/**
 * Segmentos de ruta que ganan sobre el primero (rutas anidadas como
 * `/operador/mi-panel`, que pertenece a producción y no a autenticación).
 */
export const SEGMENTOS_PRIORITARIOS = Object.freeze(['mi-panel', 'produccion-piso', 'cierre-administrativo']);

/** Normaliza separadores de Windows y prefijos `./`. */
export function normalizarRuta(ruta) {
  return String(ruta).replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

/** Ruta de un spec a partir de su nombre lógico. */
export function rutaSpec(nombre) {
  return `tests/e2e/${nombre}.spec.ts`;
}

/** Nombre lógico de un spec a partir de su ruta. */
export function nombreSpec(ruta) {
  const archivo = normalizarRuta(ruta).split('/').pop() ?? '';
  return archivo.replace(/\.spec\.ts$/, '');
}

/**
 * Módulo de producción dueño de una ruta.
 * @returns {string | null} nombre del módulo o `null` si la ruta no pertenece a ninguno.
 */
export function moduloDeRuta(ruta) {
  const r = normalizarRuta(ruta);

  const propio = r.match(/^src\/modulos\/([^/]+)\//);
  if (propio) return propio[1];

  // Los mapeos explícitos ganan a la deducción por nombre de archivo.
  if (ARCHIVOS_ESTADO_A_MODULO[r]) return ARCHIVOS_ESTADO_A_MODULO[r];

  const tienda = r.match(/^src\/estado\/uso-tienda-([a-z-]+)\.ts$/);
  if (tienda) return tienda[1];


  // Rutas anidadas con dueño propio ganan al primer segmento.
  for (const segmento of SEGMENTOS_PRIORITARIOS) {
    if (r.includes(`/${segmento}/`) || r.endsWith(`/${segmento}`)) {
      return RUTAS_APP_A_MODULO[segmento] ?? null;
    }
  }

  const app = r.match(/^src\/app\/\([^)]+\)\/([^/]+)/);
  if (app) return RUTAS_APP_A_MODULO[app[1]] ?? null;

  const appPlano = r.match(/^src\/app\/([^/]+)\//);
  if (appPlano) return RUTAS_APP_A_MODULO[appPlano[1]] ?? null;

  return null;
}

/** ¿El módulo existe en el dominio de producción? */
export function esModuloConocido(modulo) {
  return Object.hasOwn(MODULOS_E2E, modulo) || Object.hasOwn(MODULOS_SIN_E2E, modulo);
}

/** Rutas de los specs E2E de un módulo (puede ser vacío). */
export function specsDeModulo(modulo) {
  return (MODULOS_E2E[modulo] ?? []).map(rutaSpec);
}

/** Todos los specs mapeados a algún módulo, en orden estable. */
export function specsDeTodosLosModulos() {
  return [...new Set(Object.keys(MODULOS_E2E).flatMap((modulo) => MODULOS_E2E[modulo]))]
    .sort()
    .map(rutaSpec);
}

/* ------------------------------------------------------------------------- */
/* Descubrimiento del sistema de archivos                                      */
/* ------------------------------------------------------------------------- */

function listar(raiz, subdirectorio) {
  try {
    return readdirSync(join(raiz, subdirectorio), { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Specs E2E realmente presentes en disco. */
export function descubrirSpecsE2E(raiz = process.cwd()) {
  return listar(raiz, 'tests/e2e')
    .filter((entrada) => entrada.isFile() && entrada.name.endsWith('.spec.ts'))
    .map((entrada) => `tests/e2e/${entrada.name}`)
    .sort();
}

/** Módulos de dominio realmente presentes en disco. */
export function descubrirModulos(raiz = process.cwd()) {
  return listar(raiz, 'src/modulos')
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort();
}

/** Archivos de prueba unitaria en disco. */
export function descubrirUnitarias(raiz = process.cwd()) {
  return listar(raiz, 'tests/unitarias')
    .filter((entrada) => entrada.isFile() && entrada.name.endsWith('.test.ts'))
    .map((entrada) => `tests/unitarias/${entrada.name}`)
    .sort();
}

/** Archivos de prueba de integración en disco. */
export function descubrirIntegracion(raiz = process.cwd()) {
  return listar(raiz, 'tests/integracion')
    .filter((entrada) => entrada.isFile() && entrada.name.endsWith('.test.ts'))
    .map((entrada) => `tests/integracion/${entrada.name}`)
    .sort();
}

/** Archivos pgTAP en disco. */
export function descubrirPgtap(raiz = process.cwd()) {
  return listar(raiz, 'supabase/tests')
    .filter((entrada) => entrada.isFile() && entrada.name.endsWith('.test.sql'))
    .map((entrada) => `supabase/tests/${entrada.name}`)
    .sort();
}

/* ------------------------------------------------------------------------- */
/* Validación                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Verifica que el catálogo cubra el repositorio real.
 * Se usa en `tests/unitarias/ci-catalogo-pruebas.test.ts` y en el clasificador.
 * @returns {string[]} lista de errores (vacía = catálogo sano).
 */
export function validarCatalogo(raiz = process.cwd()) {
  const errores = [];
  const specsEnDisco = new Set(descubrirSpecsE2E(raiz));
  const modulosEnDisco = descubrirModulos(raiz);

  const specsMapeados = new Set();
  for (const [modulo, specs] of Object.entries(MODULOS_E2E)) {
    if (!Array.isArray(specs)) {
      errores.push(`MODULOS_E2E['${modulo}'] debe ser un arreglo.`);
      continue;
    }
    if (specs.length === 0) {
      errores.push(`MODULOS_E2E['${modulo}'] está vacío: usa MODULOS_SIN_E2E con un motivo.`);
    }
    for (const spec of specs) {
      const ruta = rutaSpec(spec);
      if (!specsEnDisco.has(ruta)) {
        errores.push(`MODULOS_E2E['${modulo}'] apunta a un spec inexistente: ${ruta}`);
      }
      // Un spec puede cubrir varios módulos (p. ej. aceptacion-comercial toca
      // rfq, propuestas y órdenes): se permite repetir, se exige cubrir.
      specsMapeados.add(spec);
    }
  }

  for (const spec of E2E_TRANSVERSALES) {
    const ruta = rutaSpec(spec);
    if (!specsEnDisco.has(ruta)) {
      errores.push(`E2E_TRANSVERSALES apunta a un spec inexistente: ${ruta}`);
    }
    specsMapeados.add(spec);
  }

  for (const ruta of specsEnDisco) {
    if (!specsMapeados.has(nombreSpec(ruta))) {
      errores.push(
        `El spec ${ruta} no pertenece a ningún grupo. Regístralo en MODULOS_E2E o en E2E_TRANSVERSALES.`,
      );
    }
  }

  for (const modulo of modulosEnDisco) {
    if (!esModuloConocido(modulo)) {
      errores.push(
        `El módulo 'src/modulos/${modulo}' no está en el catálogo. Añádelo a MODULOS_E2E o a MODULOS_SIN_E2E.`,
      );
    }
  }

  for (const modulo of Object.keys(MODULOS_SIN_E2E)) {
    if (Object.hasOwn(MODULOS_E2E, modulo)) {
      errores.push(`'${modulo}' está a la vez en MODULOS_E2E y en MODULOS_SIN_E2E.`);
    }
    if (!modulosEnDisco.includes(modulo)) {
      errores.push(`MODULOS_SIN_E2E menciona un módulo inexistente: '${modulo}'.`);
    }
  }

  for (const [segmento, modulo] of Object.entries(RUTAS_APP_A_MODULO)) {
    if (!esModuloConocido(modulo)) {
      errores.push(`RUTAS_APP_A_MODULO['${segmento}'] apunta al módulo desconocido '${modulo}'.`);
    }
  }

  for (const [ruta, modulo] of Object.entries(ARCHIVOS_ESTADO_A_MODULO)) {
    if (!existsSync(join(raiz, ruta))) {
      errores.push(`ARCHIVOS_ESTADO_A_MODULO apunta a un archivo inexistente: ${ruta}`);
    }
    if (!esModuloConocido(modulo)) {
      errores.push(`ARCHIVOS_ESTADO_A_MODULO['${ruta}'] apunta al módulo desconocido '${modulo}'.`);
    }
  }

  return errores;
}
