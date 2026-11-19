import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  E2E_TRANSVERSALES,
  MODULOS_E2E,
  MODULOS_SIN_E2E,
  RUTAS_APP_A_MODULO,
  descubrirIntegracion,
  descubrirModulos,
  descubrirPgtap,
  descubrirSpecsE2E,
  descubrirUnitarias,
  esModuloConocido,
  moduloDeRuta,
  nombreSpec,
  normalizarRuta,
  specsDeModulo,
  specsDeTodosLosModulos,
  validarCatalogo,
} from '../../scripts/ci/catalogo-pruebas.mjs';

describe('catálogo de pruebas', () => {
  it('está sincronizado con el repositorio real', () => {
    expect(validarCatalogo(process.cwd())).toEqual([]);
  });

  it('cubre todos los módulos de src/modulos', () => {
    for (const modulo of descubrirModulos(process.cwd())) {
      expect(esModuloConocido(modulo), `módulo sin registrar: ${modulo}`).toBe(true);
    }
  });

  it('asigna todos los specs E2E a un grupo', () => {
    const asignados = new Set([...specsDeTodosLosModulos().map(nombreSpec), ...E2E_TRANSVERSALES]);
    for (const ruta of descubrirSpecsE2E(process.cwd())) {
      expect(asignados.has(nombreSpec(ruta)), `spec huérfano: ${ruta}`).toBe(true);
    }
  });

  it('no referencia specs ni módulos inexistentes', () => {
    const specs = new Set(descubrirSpecsE2E(process.cwd()).map(nombreSpec));
    for (const [modulo, lista] of Object.entries(MODULOS_E2E)) {
      for (const spec of lista) {
        expect(specs.has(spec), `${modulo} → ${spec}`).toBe(true);
      }
    }
    for (const spec of E2E_TRANSVERSALES) {
      expect(specs.has(spec), `transversal → ${spec}`).toBe(true);
    }
  });

  it('un módulo sin E2E se declara con motivo, no se deja vacío', () => {
    for (const [modulo, motivo] of Object.entries(MODULOS_SIN_E2E)) {
      expect(motivo.trim().length).toBeGreaterThan(10);
      expect((MODULOS_E2E as Record<string, string[] | undefined>)[modulo], `${modulo} no puede estar en dos grupos`).toBeUndefined();
    }
  });

  it('descubre archivos reales, ordenados y sin duplicados', () => {
    const capas = {
      unitarias: descubrirUnitarias(process.cwd()),
      integracion: descubrirIntegracion(process.cwd()),
      pgtap: descubrirPgtap(process.cwd()),
      e2e: descubrirSpecsE2E(process.cwd()),
    };

    for (const [capa, archivos] of Object.entries(capas)) {
      expect(archivos.length, `${capa} no puede estar vacía`).toBeGreaterThan(0);
      expect(new Set(archivos).size, `${capa} tiene duplicados`).toBe(archivos.length);
      expect(archivos, `${capa} debe venir ordenada`).toEqual([...archivos].sort());
      for (const archivo of archivos) {
        expect(existsSync(archivo), `${capa} reporta un archivo inexistente: ${archivo}`).toBe(true);
      }
    }
  });
});

describe('moduloDeRuta', () => {
  it.each([
    ['src/modulos/gastos/acciones/registrar.ts', 'gastos'],
    ['src/modulos/rfq/componentes/tabla-items-rfq.tsx', 'rfq'],
    ['src/estado/uso-tienda-planeacion.ts', 'planeacion'],
    ['src/estado/inventario-tienda.ts', 'inventario'],
    ['src/app/(privado)/gastos/page.tsx', 'gastos'],
    ['src/app/(privado)/cobros/page.tsx', 'cobranza'],
    ['src/app/(panel)/ordenes/[id]/page.tsx', 'ordenes'],
    ['src/app/(piso)/produccion-piso/hoja/[ordenId]/page.tsx', 'produccion'],
    ['src/app/(piso)/operador/mi-panel/page.tsx', 'produccion'],
    ['src/app/(privado)/cierre-administrativo/page.tsx', 'cierres'],
    ['src/app/(auth)/operador/page.tsx', 'autenticacion'],
    ['src/app/(portal-cliente)/seguimiento/page.tsx', 'portal-cliente'],
  ])('%s → %s', (ruta, modulo) => {
    expect(moduloDeRuta(ruta)).toBe(modulo);
  });

  it.each([
    'src/compartido/utilidades/indice.ts',
    'src/nucleo/supabase/cliente.ts',
    'src/app/layout.tsx',
    'docs/estado-actual.md',
    'src/app/api/webhooks/brevo/route.ts',
  ])('no inventa dueño para %s', (ruta) => {
    expect(moduloDeRuta(ruta)).toBeNull();
  });

  it('normaliza rutas de Windows', () => {
    expect(normalizarRuta('src\\modulos\\gastos\\x.ts')).toBe('src/modulos/gastos/x.ts');
    expect(moduloDeRuta('src\\modulos\\gastos\\x.ts')).toBe('gastos');
  });
});

describe('specsDeModulo', () => {
  it('devuelve rutas completas y estables', () => {
    expect(specsDeModulo('rfq')).toEqual([
      'tests/e2e/rfq-flujo.spec.ts',
      'tests/e2e/continuidad-folios-rfq.spec.ts',
      'tests/e2e/aceptacion-comercial.spec.ts',
    ]);
  });

  it('devuelve vacío para un módulo sin E2E', () => {
    expect(specsDeModulo('portal-cliente')).toEqual([]);
  });

  it('devuelve vacío para un módulo desconocido', () => {
    expect(specsDeModulo('no-existe')).toEqual([]);
  });
});

describe('RUTAS_APP_A_MODULO', () => {
  it('solo apunta a módulos registrados', () => {
    for (const [segmento, modulo] of Object.entries(RUTAS_APP_A_MODULO)) {
      expect(esModuloConocido(modulo), `${segmento} → ${modulo}`).toBe(true);
    }
  });
});
