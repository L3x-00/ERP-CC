/** C4: agregados de una corrida. Ningún importe se distribuye entre ítems. */
export interface TotalesCorrida {
  corridaId: string;
  codigo: string;
  estado: string;
  horasTotales: number;
  piezasProducidas: number;
  cantidadMaterial: number;
  /** null cuando el usuario no tiene permiso para ver costos. */
  costoMaterialMxn: number | null;
  costoTiempoMxn: number | null;
  costoTotalMxn: number | null;
}

export interface TotalesCorridasOrden {
  corridas: TotalesCorrida[];
  /** Costo total de la orden con el que ya cuenta Finanzas (MXN). */
  costoTotalOrdenMxn: number | null;
  /** true cuando la orden no tiene desglose y Finanzas no calcula el costo. */
  ordenSinDesglose: boolean;
}
