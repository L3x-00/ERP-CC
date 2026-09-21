export {
  ZONA_HORARIA_TALLER,
  calcularHorasComida,
  calcularHorasSesion,
} from '@/modulos/produccion/servicios/calculo-tiempos-servicio';

export type { CalculoHorasSesion } from '@/modulos/produccion/servicios/calculo-tiempos-servicio';

export {
  ErrorProduccion,
  iniciarSesionTrabajoServicio,
  cerrarSesionTrabajoServicio,
  mensajeErrorSesion,
} from '@/modulos/produccion/servicios/sesiones-servicio';

export type {
  CodigoErrorProduccion,
  CierreSesionRegistrado,
} from '@/modulos/produccion/servicios/sesiones-servicio';

export {
  generarNotaEntregaServicio,
  mensajeErrorEntrega,
} from '@/modulos/produccion/servicios/entrega-servicio';

export type { NotaEntregaGenerada } from '@/modulos/produccion/servicios/entrega-servicio';

export {
  obtenerDatosTableroProduccionServicio,
  obtenerEstadoKanbanProduccion,
} from '@/modulos/produccion/servicios/tablero-produccion-servicio';

export type {
  DatosTableroProduccion,
  OrdenTableroProduccion,
  PartidaTableroProduccion,
} from '@/modulos/produccion/servicios/tablero-produccion-servicio';

export {
  EXTENSIONES_DOCUMENTO_ORDEN,
  TAMANO_MAXIMO_DOCUMENTO_ORDEN,
  listarDocumentosOrden,
  nombreDocumentoSeguro,
  obtenerOrdenDocumental,
  validarRutaDocumento,
} from '@/modulos/produccion/servicios/documentos-orden-servicio';

export type { OrdenDocumental } from '@/modulos/produccion/servicios/documentos-orden-servicio';

export {
  listarNotasEntregaOrden,
  obtenerDocumentoNotaEntrega,
  resumirLineasNota,
} from '@/modulos/produccion/servicios/nota-entrega-documento-servicio';

export type {
  DocumentoNotaEntrega,
  LineaNotaEntrega,
  NotaEntregaResumen,
  RenglonNotaCrudo,
} from '@/modulos/produccion/servicios/nota-entrega-documento-servicio';
