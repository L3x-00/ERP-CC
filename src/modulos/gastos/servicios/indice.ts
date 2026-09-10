export {
  MONEDA_RENTABILIDAD,
  convertirAMxn,
  calcularIngresoMxn,
  calcularCostoMaterialesMxn,
  calcularCostoManoObraMxn,
  calcularCostoGastosDirectosMxn,
  calcularMargenPorcentaje,
  calcularRentabilidadOrden,
} from '@/modulos/gastos/servicios/rentabilidad-servicio';

export type {
  EntradaIngresoOrden,
  EntradaMaterialConsumido,
  EntradaSesionRentabilidad,
  EntradaRentabilidadOrden,
} from '@/modulos/gastos/servicios/rentabilidad-servicio';

export {
  ErrorOcr,
  extraerDatosComprobante,
  extraerObjetoJson,
  calcularBytesBase64,
} from '@/modulos/gastos/servicios/ocr-servicio';

export type { CodigoErrorOcr, OpcionesOcr } from '@/modulos/gastos/servicios/ocr-servicio';

export {
  ErrorGastos,
  registrarGastoServicio,
  cambiarEstadoGastoServicio,
  consultarGastosServicio,
  obtenerRentabilidadOrdenServicio,
  mensajeErrorGastos,
} from '@/modulos/gastos/servicios/gastos-servicio';

export type { CodigoErrorGastos } from '@/modulos/gastos/servicios/gastos-servicio';
