export {
  esquemaRegistrarGasto,
  esquemaGuardarGastoA19,
  esquemaCambiarEstadoGasto,
  esquemaConsultarGastos,
  esquemaConsultarRentabilidadOrden,
  esquemaBuscarOrdenesGasto,
  esquemaComprobanteOCR,
  esquemaDatosComprobanteOCR,
} from '@/modulos/gastos/validaciones/gastos';

export type {
  RegistrarGastoInput,
  CambiarEstadoGastoInput,
  ConsultarGastosInput,
  ConsultarRentabilidadOrdenInput,
  BuscarOrdenesGastoInput,
  ComprobanteOCRInput,
  DatosComprobanteOCRValidados,
  TipoMimeComprobante,
} from '@/modulos/gastos/validaciones/gastos';
