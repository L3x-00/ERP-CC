import { describe, expect, it } from 'vitest';
import { contarResultados, lineaMarkdown, lineaResumen } from '../../scripts/ci/verificar-e2e.mjs';

const prueba = (status: string) => ({ status });

describe('contarResultados', () => {
  it('cuenta ejecutadas y saltadas, incluidas las suites anidadas', () => {
    const datos = contarResultados({
      stats: { flaky: 0 },
      specs: [{ tests: [prueba('expected'), prueba('skipped')] }],
      suites: [
        {
          specs: [{ tests: [prueba('expected')] }],
          suites: [{ specs: [{ tests: [prueba('skipped'), prueba('expected')] }] }],
        },
      ],
    });

    expect(datos).toEqual({ ejecutadas: 3, saltadas: 2, flaky: 0 });
  });

  it('expone las pruebas flaky que el reintento dejó en verde', () => {
    const datos = contarResultados({
      stats: { flaky: 2 },
      specs: [{ tests: [prueba('expected')] }],
      suites: [],
    });

    expect(datos.flaky).toBe(2);
  });

  it('tolera un informe incompleto sin romper', () => {
    expect(contarResultados({})).toEqual({ ejecutadas: 0, saltadas: 0, flaky: 0 });
    expect(contarResultados(null)).toEqual({ ejecutadas: 0, saltadas: 0, flaky: 0 });
  });

  it('ignora un stats.flaky no numérico', () => {
    const datos = contarResultados({ stats: { flaky: 'muchos' }, specs: [], suites: [] });
    expect(datos.flaky).toBe(0);
  });
});

describe('líneas de resumen', () => {
  const datos = { shard: '2', total: '4', ejecutadas: 18, saltadas: 0, flaky: 0 };

  it('genera la línea del log con shard, conteos y flaky', () => {
    expect(lineaResumen(datos)).toBe('E2E shard 2/4 · ejecutadas: 18 · saltadas: 0 · flaky: 0');
  });

  it('marca el flaky en el job summary solo cuando existe', () => {
    expect(lineaMarkdown(datos)).toBe('- E2E shard 2/4: 18 ejecutadas, 0 saltadas\n');
    expect(lineaMarkdown({ ...datos, flaky: 1 })).toContain('**1 flaky**');
  });
});
