export {
  ZONA_HORARIA_TALLER,
  calcularHorasComida,
  calcularHorasSesion,
} from '@/modulos/produccion/servicios/calculo-tiempos-servicio';

export type { CalculoHorasSesion } from '@/modulos/produccion/servicios/calculo-tiempos-servicio';

export {
  ErrorProduccion,
  iniciarSesionTrabajoServicio,
  reanudarSesionTrabajoServicio,
  cerrarSesionTrabajoServicio,
  lanzarErrorProduccion,
  mensajeErrorSesion,
} from '@/modulos/produccion/servicios/sesiones-servicio';

export type {
  CodigoErrorProduccion,
  CierreSesionRegistrado,
  SesionIniciada,
} from '@/modulos/produccion/servicios/sesiones-servicio';

export {
  autorizarHorasExtraServicio,
  cambiarEstadoCorridaServicio,
  cerrarJornadaServicio,
  crearCorridaServicio,
  reclamarRecursoLiberadoServicio,
} from '@/modulos/produccion/servicios/corridas-servicio';

export type {
  AutorizacionHorasExtraRegistrada,
  ReclamacionRecurso,
  ResultadoCerrarJornada,
  ResultadoEstadoCorrida,
} from '@/modulos/produccion/servicios/corridas-servicio';

export { registrarInspeccionServicio } from '@/modulos/produccion/servicios/calidad-servicio';

export {
  obtenerAutorizacionesHoraExtraServicio,
  obtenerCorridasOrdenServicio,
  obtenerInspeccionesOrdenServicio,
  obtenerMotivosPausaServicio,
  obtenerProcesosPisoServicio,
  obtenerRecursosLiberablesServicio,
} from '@/modulos/produccion/servicios/consultas-b6-servicio';

export type {
  AutorizacionHoraExtraDetalle,
  CorridaDetalle,
  InspeccionDetalle,
  RecursoLiberable,
} from '@/modulos/produccion/servicios/consultas-b6-servicio';

export {
  generarNotaEntregaServicio,
  mensajeErrorEntrega,
} from '@/modulos/produccion/servicios/entrega-servicio';

export type { NotaEntregaGenerada } from '@/modulos/produccion/servicios/entrega-servicio';

export {
  codigosAreaFiltrada,
  obtenerDatosTableroProduccionServicio,
  obtenerEstadoKanbanProduccion,
  partidaProduccionCompleta,
} from '@/modulos/produccion/servicios/tablero-produccion-servicio';

export {
  obtenerEspacioOperadorServicio,
  estimarHorasProceso,
  etiquetaUrgencia,
  diasParaCompromiso,
} from '@/modulos/produccion/servicios/espacio-operador-servicio';

export type { DatosEspacioOperador } from '@/modulos/produccion/servicios/espacio-operador-servicio';

export {
  iniciarProcesoReclamadoServicio,
  liberarReclamoOperadorServicio,
  moverReclamoOperadorServicio,
  reclamarProcesoOperadorServicio,
} from '@/modulos/produccion/servicios/reclamos-operador-servicio';

export type {
  AreaCatalogoProduccion,
  DatosTableroProduccion,
  MetaProcesoAvance,
  OrdenTableroProduccion,
  PartidaTableroProduccion,
} from '@/modulos/produccion/servicios/tablero-produccion-servicio';

export { obtenerConsumosMaterialOrdenServicio } from '@/modulos/produccion/servicios/consumos-orden-servicio';
export type { ConsumoMaterialOrden } from '@/modulos/produccion/servicios/consumos-orden-servicio';

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
