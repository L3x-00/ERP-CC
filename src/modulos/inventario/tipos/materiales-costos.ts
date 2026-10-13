/** Moneda de costo del material (DC-14): solo MXN o USD. */
export type MonedaCosto = 'MXN' | 'USD';

/** Fuente de una propuesta de costo (DC-13): una compra o un gasto propone. */
export type FuentePropuestaCosto = 'COMPRA' | 'GASTO';

/** Fuente de un cambio confirmado: manual o proveniente de una propuesta. */
export type FuenteCosto = 'MANUAL' | FuentePropuestaCosto;

/** Espesor ligado a un material (obs. 8: se edita desde el módulo). */
export type EspesorMaterialCosto = {
  id: string;
  etiqueta: string;
  espesorMm: number;
  activo: boolean;
  orden: number;
};

/** Material canónico con su costo vigente y propuestas pendientes (C6.1). */
export type MaterialCosto = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  /** Obs. 8: orden de presentación y grupo (material padre) del catálogo. */
  orden: number;
  padreId: string | null;
  unidadBase: string;
  monedaCosto: MonedaCosto;
  costoVigente: number | null;
  fechaVigenciaCosto: string | null;
  costoConfirmadoEn: string | null;
  costoConfirmadoPorNombre: string | null;
  /** Token CAS de `catalogo_materiales` para confirmar sin pisar ediciones. */
  actualizadoEn: string;
  propuestasPendientes: number;
  /** Obs. 8: espesores administrados desde el módulo. */
  espesores: EspesorMaterialCosto[];
};

/** Saldo manual de existencia por material (+ espesor opcional). */
export type SaldoMaterial = {
  id: string;
  materialId: string;
  materialCodigo: string;
  materialNombre: string;
  unidadBase: string;
  espesorId: string | null;
  espesorEtiqueta: string | null;
  saldo: number;
  costoVigente: number | null;
  monedaCosto: MonedaCosto;
  actualizadoPorNombre: string;
  actualizadoEn: string;
};

/** Movimiento append-only de un ajuste de saldo. */
export type MovimientoSaldoMaterial = {
  id: string;
  materialId: string;
  materialCodigo: string;
  materialNombre: string;
  espesorEtiqueta: string | null;
  saldoAnterior: number;
  saldoNuevo: number;
  motivo: string;
  actorNombre: string;
  creadoEn: string;
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

/** Vista de existencias: saldos manuales y permiso de ajuste del actor. */
export type SaldosMaterialVista = {
  saldos: SaldoMaterial[];
  puedeGestionar: boolean;
};
