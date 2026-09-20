import { describe, expect, it } from 'vitest';
import { CATALOGO_TIERS_DEFECTO } from '@/modulos/clientes/tipos/indice';
import { filaAConfiguracionSistema } from '@/modulos/configuracion/tipos/indice';
import { CATEGORIAS_GASTO } from '@/modulos/gastos/tipos/gastos';

const FILA_BASE = {
  id: 'main',
  empresa_json: {},
  tarifas_json: {},
  plantillas_doc_json: {},
  tiers_json: {},
  categorias_gasto_json: {},
  tipo_cambio_usd: 20,
  iva_porcentaje_default: 16,
  actualizado_por: null,
  actualizado_en: '2026-09-19T00:00:00.000Z',
};

describe('catálogos comerciales en la configuración (CFG-08/09)', () => {
  it('sin catálogo guardado usa los valores de fábrica', () => {
    const configuracion = filaAConfiguracionSistema(FILA_BASE);
    expect(configuracion.tiers).toEqual(CATALOGO_TIERS_DEFECTO);
    expect(configuracion.categoriasGasto).toEqual([...CATEGORIAS_GASTO]);
  });

  it('parsea tiers y categorías guardados en JSONB', () => {
    const configuracion = filaAConfiguracionSistema({
      ...FILA_BASE,
      tiers_json: {
        diasManual: 45,
        tiers: [
          { clave: 'bronce', umbralMxn: 0, descuentoPorcentaje: 1 },
          { clave: 'plata', umbralMxn: 10_000, descuentoPorcentaje: 2 },
          { clave: 'oro', umbralMxn: 20_000, descuentoPorcentaje: 4 },
          { clave: 'platino', umbralMxn: 30_000, descuentoPorcentaje: 6 },
        ],
      },
      categorias_gasto_json: { categorias: ['materia_prima', 'acero_inoxidable'] },
    });

    expect(configuracion.tiers.diasManual).toBe(45);
    expect(configuracion.tiers.tiers.plata).toEqual({ umbralMxn: 10_000, descuentoPorcentaje: 2 });
    expect(configuracion.categoriasGasto).toEqual(['materia_prima', 'acero_inoxidable']);
  });

  it('un JSONB corrupto cae a los valores de fábrica', () => {
    const configuracion = filaAConfiguracionSistema({
      ...FILA_BASE,
      tiers_json: { tiers: 'no-es-lista' },
      categorias_gasto_json: { categorias: ['MAYÚSCULAS'] },
    });
    expect(configuracion.tiers).toEqual(CATALOGO_TIERS_DEFECTO);
    expect(configuracion.categoriasGasto).toEqual([...CATEGORIAS_GASTO]);
  });
});
