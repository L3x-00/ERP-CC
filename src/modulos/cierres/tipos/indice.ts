/** C14: cierre administrativo — comparación estimado (propuesta) vs real (producción). */

export type NivelDesviacion = 'ahorro' | 'neutro' | 'sobrecosto';

export interface CierreOrdenResumen {
  ordenId: string;
  folio: string;
  cliente: string;
  esInterna: boolean;
  fechaCierre: string | null;
  venta: number;
  costoEstimado: number;
  costoReal: number;
  /** (real - estimado) / estimado × 100. Negativo = ahorro. */
  desviacionCosto: number | null;
  horasEstimadas: number;
  horasReales: number;
  desviacionTiempo: number | null;
  /** (venta - costo real) / venta × 100. */
  margen: number | null;
  solicitado: number;
  producido: number;
  entregado: number;
  cumplimientoEntrega: number | null;
  nivel: NivelDesviacion;
}

export interface ItemCierre {
  codigo: string;
  descripcion: string;
  cantidad: number;
  producida: number;
  entregada: number;
  precioUnitario: number;
  venta: number;
  horasEstimadas: number;
  horasReales: number;
  costoEstimado: number;
  costoReal: number;
  desviacionCosto: number | null;
}

export interface ProcesoComparativo {
  nombre: string;
  horasEstimadas: number;
  horasReales: number;
  costoEstimado: number;
  costoReal: number;
  desviacionTiempo: number | null;
}

export interface MaterialComparativo {
  /** Clave estable del material (catálogo, legado o sin catálogo). */
  clave: string;
  nombre: string;
  unidad: string;
  cantidadReal: number;
  costoReal: number;
}

export interface CierreOrdenDetalle extends CierreOrdenResumen {
  items: ItemCierre[];
  procesos: ProcesoComparativo[];
  materiales: MaterialComparativo[];
  horasRetrabajo: number;
  costoRetrabajo: number;
  costoManoObraEstimado: number;
  costoManoObraReal: number;
  costoMaterialEstimado: number;
  costoMaterialReal: number;
  costoOtros: number;
  /** Frases accionables con las mayores desviaciones. */
  puntosCriticos: string[];
}

export interface TendenciaCierre {
  folio: string;
  fechaCierre: string | null;
  desviacionCosto: number | null;
  desviacionTiempo: number | null;
  margen: number | null;
  costoEstimado: number;
  costoReal: number;
}

export interface PanelCierreAdministrativo {
  resumenes: CierreOrdenResumen[];
  tendencia: TendenciaCierre[];
  promedios: {
    desviacionCosto: number | null;
    desviacionTiempo: number | null;
    margen: number | null;
    ordenesConSobrecosto: number;
    totalOrdenes: number;
  };
}
