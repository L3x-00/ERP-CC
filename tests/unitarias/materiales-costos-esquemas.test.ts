import { describe, expect, it } from 'vitest';

import {
  esquemaConfirmarCostoMaterial,
  esquemaProponerCostoMaterial,
} from '@/modulos/inventario/validaciones/materiales-costos';

const MATERIAL_ID = '11111111-1111-4111-8111-111111111111';
const PROPUESTA_ID = '22222222-2222-4222-8222-222222222222';

describe('esquemaProponerCostoMaterial (C6.1/DC-13)', () => {
  const BASE = {
    materialId: MATERIAL_ID,
    costo: 12.5,
    moneda: 'USD',
    fechaEfectiva: '2026-10-15',
    fuente: 'GASTO',
    referencia: 'GAS-2026-01',
  };

  it('acepta una propuesta de compra/gasto válida', () => {
    expect(esquemaProponerCostoMaterial.safeParse(BASE).success).toBe(true);
    expect(
      esquemaProponerCostoMaterial.safeParse({ ...BASE, fuente: 'COMPRA' }).success,
    ).toBe(true);
  });

  it('rechaza costo negativo, moneda inválida, fuente MANUAL y referencia corta', () => {
    expect(esquemaProponerCostoMaterial.safeParse({ ...BASE, costo: -1 }).success).toBe(false);
    expect(esquemaProponerCostoMaterial.safeParse({ ...BASE, moneda: 'EUR' }).success).toBe(false);
    expect(esquemaProponerCostoMaterial.safeParse({ ...BASE, fuente: 'MANUAL' }).success).toBe(false);
    expect(esquemaProponerCostoMaterial.safeParse({ ...BASE, referencia: 'x' }).success).toBe(false);
  });

  it('exige máximo 4 decimales en el costo', () => {
    expect(esquemaProponerCostoMaterial.safeParse({ ...BASE, costo: 12.1234 }).success).toBe(true);
    expect(esquemaProponerCostoMaterial.safeParse({ ...BASE, costo: 12.12345 }).success).toBe(false);
  });
});

describe('esquemaConfirmarCostoMaterial (C6.1/DC-13)', () => {
  const BASE = {
    materialId: MATERIAL_ID,
    costo: 20,
    moneda: 'MXN',
    fechaEfectiva: '2026-10-15',
    actualizadoEn: '2026-10-10T12:00:00+00:00',
  };

  it('acepta un costo manual sin propuesta', () => {
    const analisis = esquemaConfirmarCostoMaterial.safeParse({
      ...BASE,
      fuente: 'MANUAL',
      referencia: null,
      propuestaId: null,
    });
    expect(analisis.success).toBe(true);
  });

  it('exige propuesta y referencia cuando la fuente es compra o gasto', () => {
    expect(
      esquemaConfirmarCostoMaterial.safeParse({ ...BASE, fuente: 'COMPRA', referencia: null })
        .success,
    ).toBe(false);
    expect(
      esquemaConfirmarCostoMaterial.safeParse({
        ...BASE,
        fuente: 'COMPRA',
        referencia: 'OC-100',
        propuestaId: PROPUESTA_ID,
      }).success,
    ).toBe(true);
  });

  it('rechaza una propuesta en la confirmación manual', () => {
    expect(
      esquemaConfirmarCostoMaterial.safeParse({
        ...BASE,
        fuente: 'MANUAL',
        referencia: null,
        propuestaId: PROPUESTA_ID,
      }).success,
    ).toBe(false);
  });

  it('exige token CAS con zona horaria', () => {
    expect(
      esquemaConfirmarCostoMaterial.safeParse({
        ...BASE,
        actualizadoEn: '2026-10-10',
        fuente: 'MANUAL',
        referencia: null,
        propuestaId: null,
      }).success,
    ).toBe(false);
  });
});
