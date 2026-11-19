import { describe, expect, it } from 'vitest';
import { clasificarCambios, podarInexistentes } from '../../scripts/ci/clasificar-cambios.mjs';
import { argumentosVitest, sinPruebas } from '../../scripts/ci/ejecutar-unitarias.mjs';
import { E2E_TRANSVERSALES, descubrirSpecsE2E, specsDeModulo } from '../../scripts/ci/catalogo-pruebas.mjs';

const TOTAL_SPECS = descubrirSpecsE2E(process.cwd()).length;

const clasificar = (archivos: string[], opciones: Record<string, unknown> = {}) =>
  clasificarCambios(archivos, { totalSpecs: TOTAL_SPECS, ...opciones });

const rutasSpec = (modulo: string) => specsDeModulo(modulo);
const n = (base: string) => `${base}.spec.ts`;

describe('clasificarCambios · documentación', () => {
  it.each([
    [['docs/estado-actual.md']],
    [['docs/CUELLOS-DE-BOTELLA.md', '.ai-shared/memory/PROJECT_STATE.md']],
    [['content/docs/arquitectura.mdx', 'public/logo.png']],
    [['public/fuentes/inter.woff2']],
    [['README.md', '.gitignore']],
  ])('no ejecuta pruebas para %j', (archivos) => {
    const r = clasificar(archivos);
    expect(r.nivel).toBe('docs');
    expect(r.unitarias.modo).toBe('ninguna');
    expect(r.integracion.modo).toBe('no');
    expect(r.pgtap).toBe(false);
    expect(r.e2e.modo).toBe('no');
    expect(r.e2e.shards).toBe(0);
    expect(r.typecheck).toBe(false);
  });
});

describe('clasificarCambios · solo pruebas', () => {
  it('ejecuta exactamente las unitarias editadas', () => {
    const r = clasificar(['tests/unitarias/gastos-ocr.test.ts', 'tests/unitarias/clientes-tier.test.ts']);
    expect(r.nivel).toBe('pruebas');
    expect(r.unitarias).toEqual({
      modo: 'archivos',
      archivos: ['tests/unitarias/clientes-tier.test.ts', 'tests/unitarias/gastos-ocr.test.ts'],
    });
    expect(r.e2e.modo).toBe('no');
    expect(r.pgtap).toBe(false);
    expect(r.integracion.modo).toBe('no');
  });

  it('ejecuta solo el spec E2E editado', () => {
    const r = clasificar(['tests/e2e/rfq-flujo.spec.ts']);
    expect(r.e2e).toEqual({ modo: 'specs', specs: ['tests/e2e/rfq-flujo.spec.ts'], shards: 1 });
    expect(r.unitarias.modo).toBe('ninguna');
    expect(r.typecheck).toBe(true);
  });

  it('no arrastra specs de otros módulos al editar un spec', () => {
    const r = clasificar(['tests/e2e/compras-flujo.spec.ts']);
    expect(r.e2e.specs).toEqual(['tests/e2e/compras-flujo.spec.ts']);
  });

  it('ejecuta las de integración editadas', () => {
    const r = clasificar(['tests/integracion/gastos-acciones.test.ts']);
    expect(r.integracion).toEqual({
      modo: 'archivos',
      archivos: ['tests/integracion/gastos-acciones.test.ts'],
    });
    expect(r.e2e.modo).toBe('no');
  });

  it('ejecuta pgTAP completo si se edita un pgTAP', () => {
    const r = clasificar(['supabase/tests/c6_3_rbac_legado_inventario.test.sql']);
    expect(r.pgtap).toBe(true);
    expect(r.e2e.modo).toBe('no');
    expect(r.unitarias.modo).toBe('ninguna');
  });
});

describe('clasificarCambios · módulo concreto', () => {
  it('un cambio de gastos ejecuta sus specs, no los de compras', () => {
    const r = clasificar(['src/modulos/gastos/acciones/registrar-gasto.ts']);
    expect(r.nivel).toBe('modulo');
    expect(r.modulos).toEqual(['gastos']);
    expect(r.unitarias.modo).toBe('cambiadas');
    expect(r.integracion.modo).toBe('completa');
    expect(r.pgtap).toBe(false);
    expect(r.e2e.modo).toBe('specs');

    const esperados = [...rutasSpec('gastos'), ...E2E_TRANSVERSALES.map((s) => `tests/e2e/${n(s)}`)];
    for (const spec of esperados) expect(r.e2e.specs).toContain(spec);
    expect(r.e2e.specs).not.toContain('tests/e2e/compras-flujo.spec.ts');
  });

  it('mapea una ruta de src/app a su módulo', () => {
    const r = clasificar(['src/app/(privado)/planeacion/page.tsx']);
    expect(r.nivel).toBe('modulo');
    expect(r.modulos).toEqual(['planeacion']);
    expect(r.e2e.specs).toContain('tests/e2e/planeacion-capacidad.spec.ts');
  });

  it('mapea el store de un módulo', () => {
    const r = clasificar(['src/estado/uso-tienda-cobranza.ts']);
    expect(r.modulos).toEqual(['cobranza']);
  });

  it('acumula varios módulos sin duplicar specs', () => {
    const r = clasificar(['src/modulos/gastos/x.ts', 'src/modulos/produccion/y.ts']);
    expect(r.modulos).toEqual(['gastos', 'produccion']);
    expect(new Set(r.e2e.specs).size).toBe(r.e2e.specs.length);
  });

  it('degrada a E2E completo cuando los specs mapeados son la mayoría', () => {
    const archivos = ['rfq', 'propuestas', 'ordenes', 'produccion', 'planeacion', 'pipeline', 'clientes', 'cobranza'].map(
      (modulo) => `src/modulos/${modulo}/x.ts`,
    );
    const r = clasificar(archivos, { totalSpecs: 1 });
    expect(r.e2e.modo).toBe('completo');
    expect(r.e2e.specs).toEqual([]);
    expect(r.e2e.shards).toBe(4);
  });

  it('el modo focal usa un solo shard', () => {
    const r = clasificar(['src/modulos/gastos/x.ts']);
    expect(r.e2e.modo).toBe('specs');
    expect(r.e2e.shards).toBe(1);
  });

  it('mantiene modo focal cuando el catálogo E2E es mucho mayor', () => {
    const archivos = ['rfq', 'propuestas', 'ordenes', 'produccion', 'planeacion', 'pipeline', 'clientes', 'cobranza'].map(
      (modulo) => `src/modulos/${modulo}/x.ts`,
    );
    const r = clasificar(archivos, { totalSpecs: 10_000 });
    expect(r.e2e.modo).toBe('specs');
    expect(r.e2e.specs.length).toBeGreaterThan(0);
  });

  it('si el PR toca un pgTAP además del módulo, ejecuta pgTAP', () => {
    const r = clasificar(['src/modulos/gastos/x.ts', 'supabase/tests/c6_3_rbac_legado_inventario.test.sql']);
    expect(r.nivel).toBe('modulo');
    expect(r.pgtap).toBe(true);
  });

  it('si el PR toca un spec E2E además del módulo, ejecuta ese spec', () => {
    const r = clasificar(['src/modulos/gastos/x.ts', 'tests/e2e/compras-flujo.spec.ts']);
    expect(r.nivel).toBe('modulo');
    expect(r.e2e.modo).toBe('specs');
    expect(r.e2e.specs).toContain('tests/e2e/compras-flujo.spec.ts');
  });

  it('no ejecuta pgTAP ni E2E completo por tocar un componente de UI', () => {
    const r = clasificar(['src/modulos/rfq/componentes/tabla-items-rfq.tsx']);
    expect(r.pgtap).toBe(false);
    expect(r.e2e.modo).toBe('specs');
    expect(r.e2e.specs.length).toBeLessThan(TOTAL_SPECS / 2);
  });
});

describe('clasificarCambios · código compartido', () => {
  it.each([
    ['src/compartido/utilidades/indice.ts'],
    ['src/nucleo/supabase/cliente.ts'],
    ['src/lib/shared.ts'],
    ['src/compartido/componentes/boton.tsx'],
    ['src/app/api/webhooks/brevo/route.ts'],
    ['src/estilos/globals.css'],
  ])('escala a transversal: %s', (archivo) => {
    const r = clasificar([archivo]);
    expect(r.nivel).toBe('transversal');
    expect(r.unitarias.modo).toBe('completas');
    expect(r.integracion.modo).toBe('completa');
    expect(r.e2e.modo).toBe('completo');
    expect(r.e2e.shards).toBe(4);
    expect(r.pgtap).toBe(true);
    expect(r.concurrencia).toBe(true);
  });
});

describe('clasificarCambios · invalidación total', () => {
  it.each([
    ['package.json'],
    ['pnpm-lock.yaml'],
    ['vitest.config.ts'],
    ['playwright.config.ts'],
    ['next.config.ts'],
    ['tsconfig.json'],
    ['.github/workflows/ci.yml'],
    ['.github/actions/preparar-supabase/action.yml'],
    ['scripts/ci/clasificar-cambios.mjs'],
    ['supabase/migrations/20261119000000_x.sql'],
    ['supabase/tests/helpers-comunes.sql'],
    ['supabase/semillas/produccion-ficticia.mjs'],
    ['src/compartido/tipos/supabase.ts'],
    ['tests/utilidades/entorno-supabase.ts'],
    ['tests/mocks/server-only.ts'],
    ['tests/e2e/servidor-con-stub-ocr.mjs'],
  ])('escala a total: %s', (archivo) => {
    const r = clasificar([archivo]);
    expect(r.nivel).toBe('total');
    expect(r.unitarias.modo).toBe('completas');
    expect(r.integracion.modo).toBe('completa');
    expect(r.e2e.modo).toBe('completo');
    expect(r.pgtap).toBe(true);
  });
});

describe('clasificarCambios · seguridad ante lo desconocido', () => {
  it('sin archivos ejecuta todo', () => {
    const r = clasificar([]);
    expect(r.nivel).toBe('total');
    expect(r.e2e.modo).toBe('completo');
  });

  it('con --forzar-total ejecuta todo aunque el cambio sea de docs', () => {
    const r = clasificar(['docs/estado-actual.md'], { forzarTotal: true });
    expect(r.nivel).toBe('total');
    expect(r.unitarias.modo).toBe('completas');
    expect(r.e2e.modo).toBe('completo');
  });

  it('una ruta desconocida escala a total y lo explica', () => {
    const r = clasificar(['herramientas/nueva-herramienta.sh']);
    expect(r.nivel).toBe('total');
    expect(r.motivo).toContain('no clasificadas');
  });

  it('un módulo sin registrar escala a total con mensaje accionable', () => {
    const r = clasificar(['src/modulos/modulo-futuro/acciones.ts']);
    expect(r.nivel).toBe('total');
    expect(r.motivo).toContain('catalogo-pruebas.mjs');
  });

  it('un asset público no inerte escala a total', () => {
    const r = clasificar(['public/manifest.webmanifest']);
    expect(r.nivel).toBe('total');
  });

  it('mezclar docs con lógica aplica la lógica', () => {
    const r = clasificar(['docs/x.md', 'src/modulos/clientes/acciones.ts']);
    expect(r.nivel).toBe('modulo');
    expect(r.modulos).toEqual(['clientes']);
  });

  it('nunca devuelve modo specs con lista vacía', () => {
    // portal-cliente no tiene specs propios: solo deben quedar los transversales.
    const r = clasificar(['src/modulos/portal-cliente/x.ts']);
    expect(r.e2e.modo).toMatch(/^(no|specs)$/);
    if (r.e2e.modo === 'specs') {
      expect(r.e2e.specs.length).toBeGreaterThan(0);
      for (const spec of r.e2e.specs) expect(spec).toMatch(/^tests\/e2e\/.+\.spec\.ts$/);
    }
  });
});

describe('podarInexistentes', () => {
  const base = {
    version: 1,
    nivel: 'pruebas' as const,
    archivos: [],
    motivo: '',
    modulos: [],
    typecheck: true,
    lint: true,
    unitarias: {
      modo: 'archivos' as const,
      archivos: ['tests/unitarias/no-existe.test.ts', 'tests/unitarias/ci-clasificar-cambios.test.ts'],
    },
    integracion: { modo: 'no' as const, archivos: [] },
    concurrencia: false,
    pgtap: false,
    e2e: {
      modo: 'specs' as const,
      specs: ['tests/e2e/no-existe.spec.ts', 'tests/e2e/tema-global.spec.ts'],
      shards: 1,
    },
  };

  it('quita archivos borrados sin perder los vivos', () => {
    const r = podarInexistentes(base);
    expect(r.unitarias.archivos).toEqual(['tests/unitarias/ci-clasificar-cambios.test.ts']);
    expect(r.e2e.specs).toEqual(['tests/e2e/tema-global.spec.ts']);
  });

  it('degrada a "ninguna"/"no" si todo lo listado fue borrado', () => {
    const r = podarInexistentes({
      ...base,
      unitarias: { modo: 'archivos', archivos: ['tests/unitarias/no-existe.test.ts'] },
      e2e: { modo: 'specs', specs: ['tests/e2e/no-existe.spec.ts'] },
    });
    expect(r.unitarias).toEqual({ modo: 'ninguna', archivos: [] });
    expect(r.e2e).toEqual({ modo: 'no', specs: [], shards: 0 });
  });

  it('no toca los modos completos', () => {
    const r = podarInexistentes({
      ...base,
      unitarias: { modo: 'completas', archivos: [] },
      e2e: { modo: 'completo', specs: [], shards: 4 },
    });
    expect(r.unitarias.modo).toBe('completas');
    expect(r.e2e.modo).toBe('completo');
    expect(r.e2e.shards).toBe(4);
  });
});

describe('argumentosVitest', () => {
  it('modo completas ejecuta toda la carpeta', () => {
    expect(argumentosVitest({ modo: 'completas', base: 'x', archivos: '' })).toEqual(['run', 'tests/unitarias']);
  });

  it('modo cambiadas usa el diff contra la base', () => {
    expect(argumentosVitest({ modo: 'cambiadas', base: 'origin/main', archivos: '' })).toEqual([
      'run',
      'tests/unitarias',
      '--changed=origin/main',
    ]);
  });

  it('modo archivos ejecuta exactamente la lista', () => {
    expect(
      argumentosVitest({ modo: 'archivos', base: 'x', archivos: 'tests/unitarias/a.test.ts  tests/unitarias/b.test.ts' }),
    ).toEqual(['run', 'tests/unitarias', 'tests/unitarias/a.test.ts', 'tests/unitarias/b.test.ts']);
  });

  it('modo ninguna no ejecuta nada', () => {
    expect(argumentosVitest({ modo: 'ninguna', base: 'x', archivos: '' })).toEqual([]);
  });

  it('añade --coverage a la suite completa cuando se pide', () => {
    expect(argumentosVitest({ modo: 'completas', base: 'x', archivos: '', cobertura: true })).toEqual([
      'run',
      'tests/unitarias',
      '--coverage',
    ]);
  });

  it('mide la cobertura del diff en modo cambiadas', () => {
    expect(argumentosVitest({ modo: 'cambiadas', base: 'origin/main', archivos: '', cobertura: true })).toEqual([
      'run',
      'tests/unitarias',
      '--changed=origin/main',
      '--coverage',
    ]);
  });

  it('ignora la cobertura cuando solo se editan specs', () => {
    expect(
      argumentosVitest({ modo: 'archivos', base: 'x', archivos: 'tests/unitarias/a.test.ts', cobertura: true }),
    ).toEqual(['run', 'tests/unitarias', 'tests/unitarias/a.test.ts']);
  });

  it('rechaza modos desconocidos', () => {
    expect(() => argumentosVitest({ modo: 'otro', base: 'x', archivos: '' })).toThrow(/Modo desconocido/);
  });
});

describe('sinPruebas', () => {
  it('detecta la marca de Vitest', () => {
    expect(sinPruebas('No test files found, exiting with code 0')).toBe(true);
    expect(sinPruebas('Test Files  330 passed')).toBe(false);
  });
});
