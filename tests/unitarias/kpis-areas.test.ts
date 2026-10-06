import { describe, expect, it } from 'vitest';

import { areasKpisVisibles } from '@/modulos/kpis/tipos/indice';

describe('visibilidad de áreas de KPIs (SII-B9 §9.3)', () => {
  it('admin/management con todos los permisos ve las cinco áreas', () => {
    expect(areasKpisVisibles({
      verVentas: true, verProduccion: true, verCalidad: true, verFinanzas: true,
    })).toEqual(['ventas', 'produccion', 'calidad', 'rentabilidad', 'cobranza']);
  });

  it('un vendedor solo ve ventas', () => {
    expect(areasKpisVisibles({
      verVentas: true, verProduccion: false, verCalidad: false, verFinanzas: false,
    })).toEqual(['ventas']);
  });

  it('finanzas ve rentabilidad y cobranza sin taller', () => {
    expect(areasKpisVisibles({
      verVentas: false, verProduccion: false, verCalidad: false, verFinanzas: true,
    })).toEqual(['rentabilidad', 'cobranza']);
  });

  it('sin permisos no hay áreas', () => {
    expect(areasKpisVisibles({
      verVentas: false, verProduccion: false, verCalidad: false, verFinanzas: false,
    })).toEqual([]);
  });
});
