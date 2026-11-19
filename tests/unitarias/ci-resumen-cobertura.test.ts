import { describe, expect, it } from 'vitest';
import { agruparCobertura, grupoDeArchivo, resumenMarkdown, totalDelInforme } from '../../scripts/ci/resumen-cobertura.mjs';

const metricas = (covered: number, total: number) => ({ covered, total, pct: total ? (covered / total) * 100 : 100 });

function informeDeEjemplo() {
  return {
    'C:/repo/src/modulos/gastos/acciones/a.ts': {
      lines: metricas(8, 10),
      statements: metricas(9, 10),
      functions: metricas(4, 5),
      branches: metricas(3, 4),
    },
    'C:/repo/src/modulos/gastos/componentes/b.tsx': {
      lines: metricas(2, 10),
      statements: metricas(2, 10),
      functions: metricas(1, 5),
      branches: metricas(1, 4),
    },
    'C:/repo/src/compartido/utilidades/c.ts': {
      lines: metricas(9, 10),
      statements: metricas(9, 10),
      functions: metricas(4, 5),
      branches: metricas(3, 4),
    },
    'C:/repo/src/nucleo/supabase/d.ts': {
      lines: metricas(10, 10),
      statements: metricas(10, 10),
      functions: metricas(5, 5),
      branches: metricas(4, 4),
    },
    'C:/repo/tests/unitarias/x.test.ts': {
      lines: metricas(0, 10),
      statements: metricas(0, 10),
      functions: metricas(0, 5),
      branches: metricas(0, 4),
    },
    total: {
      lines: { total: 40, covered: 29, skipped: 0, pct: 72.5 },
      statements: { total: 40, covered: 30, skipped: 0, pct: 75 },
      functions: { total: 20, covered: 14, skipped: 0, pct: 70 },
      branches: { total: 16, covered: 11, skipped: 0, pct: 68.75 },
    },
  };
}

describe('grupoDeArchivo', () => {
  it.each([
    ['C:/repo/src/modulos/gastos/acciones/a.ts', 'modulos/gastos'],
    ['src/modulos/cobranza/x.ts', 'modulos/cobranza'],
    ['/home/runner/work/repo/src/compartido/x.ts', 'compartido'],
    ['C:\\repo\\src\\nucleo\\supabase\\cliente.ts', 'nucleo'],
    ['src/app/(privado)/page.tsx', 'app'],
  ])('agrupa %s como %s', (ruta, esperado) => {
    expect(grupoDeArchivo(ruta)).toBe(esperado);
  });

  it('ignora rutas fuera de src', () => {
    expect(grupoDeArchivo('C:/repo/tests/unitarias/x.test.ts')).toBeNull();
    expect(grupoDeArchivo('scripts/ci/foo.mjs')).toBeNull();
  });
});

describe('agruparCobertura', () => {
  it('suma archivos por área y calcula porcentajes ponderados', () => {
    const grupos = agruparCobertura(informeDeEjemplo());
    const porNombre = Object.fromEntries(grupos.map((g) => [g.grupo, g]));

    expect(porNombre['modulos/gastos'].archivos).toBe(2);
    expect(porNombre['modulos/gastos'].lines).toBeCloseTo(50);
    expect(porNombre['modulos/gastos'].functions).toBeCloseTo(50);
    expect(porNombre['modulos/gastos'].branches).toBeCloseTo(50);

    expect(porNombre.compartido.lines).toBeCloseTo(90);
    expect(porNombre.nucleo.lines).toBeCloseTo(100);
  });

  it('ordena de menor a mayor cobertura de líneas', () => {
    const grupos = agruparCobertura(informeDeEjemplo());
    expect(grupos[0].grupo).toBe('modulos/gastos');
    expect(grupos[grupos.length - 1].grupo).toBe('nucleo');
  });

  it('ignora el bloque total y las rutas no medidas', () => {
    const grupos = agruparCobertura(informeDeEjemplo());
    expect(grupos.map((g) => g.grupo)).not.toContain('total');
    expect(grupos.every((g) => g.grupo !== 'tests')).toBe(true);
  });

  it('devuelve lista vacía si no hay datos', () => {
    expect(agruparCobertura({})).toEqual([]);
  });
});

describe('totalDelInforme', () => {
  it('extrae el total y cuenta los archivos medidos', () => {
    const total = totalDelInforme(informeDeEjemplo());
    expect(total?.archivos).toBe(5);
    expect(total?.lines.pct).toBeCloseTo(72.5);
  });

  it('devuelve null si el informe no trae total', () => {
    expect(totalDelInforme({})).toBeNull();
  });
});

describe('resumenMarkdown', () => {
  it('incluye la fila total y cada área', () => {
    const informe = informeDeEjemplo();
    const markdown = resumenMarkdown(agruparCobertura(informe), totalDelInforme(informe));
    expect(markdown).toContain('### Cobertura de pruebas unitarias');
    expect(markdown).toContain('| **Total** | **5**');
    expect(markdown).toContain('`modulos/gastos`');
    expect(markdown).toContain('`compartido`');
    expect(markdown).toContain('50.0 %');
  });

  it('limita las filas y avisa cuántas quedaron fuera', () => {
    const informe = informeDeEjemplo();
    const markdown = resumenMarkdown(agruparCobertura(informe), totalDelInforme(informe), 2);
    expect(markdown).toContain('de 3');
  });
});
