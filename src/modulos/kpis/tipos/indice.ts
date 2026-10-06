/** Áreas del diccionario de KPIs §9.3. */
export const AREAS_KPIS = ['ventas', 'produccion', 'calidad', 'rentabilidad', 'cobranza'] as const;

export type AreaKpis = (typeof AREAS_KPIS)[number];

export type KpisSii = {
  ventas: {
    vendidoMxn: number;
    tasaCierrePorcentaje: number;
    propuestasEnSeguimiento: number;
  };
  produccion: {
    horasReales: number;
    horasEstimadas: number;
    utilizacionPorcentaje: number;
    wipOrdenes: number;
    wipCostoEstimadoMxn: number;
    wipPartidasSinTarifa: number;
    piezasProducidas: number;
  };
  calidad: {
    retrabajos: number;
    scrap: number;
    noConformidades: number;
  };
  rentabilidad: {
    margenEstimadoPorcentaje: number | null;
    margenRealPorcentaje: number | null;
    ventaNetaMxn: number;
    utilidadNetaMxn: number;
  };
  cobranza: {
    cobrosPeriodoMxn: number;
    aging: { dias0a30: number; dias31a60: number; dias61a90: number; dias90mas: number };
    promesas: { vigentes: number; cumplidas: number; vencidas: number };
  };
};

export const ETIQUETA_AREA_KPIS: Record<AreaKpis, string> = {
  ventas: 'Ventas',
  produccion: 'Producción',
  calidad: 'Calidad',
  rentabilidad: 'Rentabilidad',
  cobranza: 'Cobranza',
};

/** Permisos del usuario por área (resueltos con `can()` en el servidor). */
export type PermisosKpis = {
  verVentas: boolean;
  verProduccion: boolean;
  verCalidad: boolean;
  verFinanzas: boolean;
};

/** Áreas visibles del diccionario según los permisos resueltos (§9.3 + decisión PO). */
export function areasKpisVisibles(permisos: PermisosKpis): AreaKpis[] {
  const visibles: AreaKpis[] = [];
  if (permisos.verVentas) visibles.push('ventas');
  if (permisos.verProduccion) visibles.push('produccion');
  if (permisos.verCalidad) visibles.push('calidad');
  if (permisos.verFinanzas) {
    visibles.push('rentabilidad', 'cobranza');
  }
  return visibles;
}
