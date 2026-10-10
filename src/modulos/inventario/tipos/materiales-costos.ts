/** Moneda de costo del material (DC-14): solo MXN o USD. */
export type MonedaCosto = 'MXN' | 'USD';

/** Fuente de una propuesta de costo (DC-13): una compra o un gasto propone. */
export type FuentePropuestaCosto = 'COMPRA' | 'GASTO';

/** Fuente de un cambio confirmado: manual o proveniente de una propuesta. */
export type FuenteCosto = 'MANUAL' | FuentePropuestaCosto;

/** Material canónico con su costo vigente y propuestas pendientes (C6.1). */
export type MaterialCosto = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  unidadBase: string;
  monedaCosto: MonedaCosto;
  costoVigente: number | null;
  fechaVigenciaCosto: string | null;
  costoConfirmadoEn: string | null;
  costoConfirmadoPorNombre: string | null;
  /** Token CAS de `catalogo_materiales` para confirmar sin pisar ediciones. */
  actualizadoEn: string;
  propuestasPendientes: number;
};

/** Propuesta de costo pendiente de confirmación (C6.1/DC-13). */
export type PropuestaCostoMaterial = {
  id: string;
  materialId: string;
  materialCodigo: string;
  materialNombre: string;
  costoPropuesto: number;
  moneda: MonedaCosto;
  fechaEfectiva: string;
  fuente: FuentePropuestaCosto;
  referencia: string;
  propuestoPorNombre: string;
  propuestoEn: string;
};

/** Versión confirmada del costo (historial append-only C6.1). */
export type VersionCostoMaterial = {
  id: string;
  materialId: string;
  materialCodigo: string;
  materialNombre: string;
  costoAnterior: number | null;
  monedaAnterior: MonedaCosto | null;
  costoNuevo: number;
  monedaNueva: MonedaCosto;
  fechaEfectiva: string;
  fuente: FuenteCosto;
  referencia: string | null;
  actorNombre: string;
  confirmadoEn: string;
};

/** Resultado de la consulta de materiales: incluye si el actor puede gestionar. */
export type MaterialesCostosVista = {
  materiales: MaterialCosto[];
  puedeGestionar: boolean;
};
