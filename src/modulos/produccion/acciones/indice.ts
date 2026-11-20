export { iniciarSesionOperadorAccion } from '@/modulos/produccion/acciones/iniciar-sesion-operador';
export { reanudarSesionOperadorAccion } from '@/modulos/produccion/acciones/reanudar-sesion-operador';
export { cerrarSesionOperadorAccion } from '@/modulos/produccion/acciones/cerrar-sesion-operador';
export { cerrarSesionSupervisorAccion } from '@/modulos/produccion/acciones/cerrar-sesion-supervisor';
export { actualizarAvanceSesionAccion } from '@/modulos/produccion/acciones/actualizar-avance-sesion';
export { generarNotaEntregaAccion } from '@/modulos/produccion/acciones/generar-nota-entrega';
export { obtenerTableroProduccionAccion } from '@/modulos/produccion/acciones/obtener-tablero-produccion';
export { obtenerDocumentosOrdenAccion } from '@/modulos/produccion/acciones/obtener-documentos-orden';
export type { EntregablesOrden } from '@/modulos/produccion/acciones/obtener-documentos-orden';
export { obtenerAccesosOrdenAccion } from '@/modulos/produccion/acciones/obtener-accesos-orden';
export type { AccesosOrden, FacturaAccesoOrden } from '@/modulos/produccion/acciones/obtener-accesos-orden';
export { obtenerUrlDocumentoOrdenAccion } from '@/modulos/produccion/acciones/obtener-url-documento-orden';
export {
  confirmarDocumentoOrdenAccion,
  descartarDocumentoOrdenAccion,
  prepararDocumentoOrdenAccion,
} from '@/modulos/produccion/acciones/subir-documento-orden';
export { obtenerDocumentoNotaEntregaAccion } from '@/modulos/produccion/acciones/obtener-documento-nota-entrega';
export {
  obtenerConsumosMaterialOrdenAccion,
  obtenerDetalleOrdenConcluidaAccion,
} from '@/modulos/produccion/acciones/obtener-detalle-orden-concluida';
export type { DetalleOrdenConcluida } from '@/modulos/produccion/acciones/obtener-detalle-orden-concluida';
export {
  cerrarPausaHuerfanaAccion,
  obtenerDiagnosticoOrdenAccion,
} from '@/modulos/produccion/acciones/diagnostico-orden';
export { crearCorridaAccion } from '@/modulos/produccion/acciones/crear-corrida';
export {
  iniciarCorridaAccion,
  completarCorridaAccion,
  cancelarCorridaAccion,
} from '@/modulos/produccion/acciones/estado-corrida';
export { reclamarRecursoAccion } from '@/modulos/produccion/acciones/reclamar-recurso';
export { reabrirOperacionBloqueadaAccion } from '@/modulos/produccion/acciones/reabrir-operacion-bloqueada';
export { reasignarPartidaAccion } from '@/modulos/produccion/acciones/reasignar-partida-operador';
export {
  iniciarProcesoReclamadoAccion,
  liberarReclamoAccion,
  moverReclamoAccion,
  reclamarProcesoAccion,
} from '@/modulos/produccion/acciones/espacio-operador';
export { cerrarJornadaAccion } from '@/modulos/produccion/acciones/cerrar-jornada';
export { autorizarHorasExtraAccion } from '@/modulos/produccion/acciones/autorizar-horas-extra';
export { registrarRetrabajoAccion } from '@/modulos/produccion/acciones/registrar-retrabajo';
export { obtenerRetrabajosOrdenAccion } from '@/modulos/produccion/acciones/obtener-retrabajos-orden';
export {
  obtenerMaterialClienteOrdenAccion,
  obtenerMaterialClienteRevisionAccion,
  registrarConsumoMaterialClienteAccion,
  reemplazarMaterialClienteAccion,
} from '@/modulos/produccion/acciones/material-cliente';
export {
  obtenerItemsCorridaAccion,
  obtenerTiemposIntegradosAccion,
} from '@/modulos/produccion/acciones/corrida-integrada';
export { solicitarHorasExtraAccion } from '@/modulos/produccion/acciones/solicitar-horas-extra';
export { resolverSolicitudHorasExtraAccion } from '@/modulos/produccion/acciones/resolver-horas-extra';
export { justificarHorasExtraAccion } from '@/modulos/produccion/acciones/justificar-horas-extra';
export { pausarSesionJornadaAccion } from '@/modulos/produccion/acciones/pausar-sesion-jornada';
export { registrarInspeccionAccion } from '@/modulos/produccion/acciones/registrar-inspeccion';
export { registrarConsumoPiezasAccion } from '@/modulos/produccion/acciones/registrar-consumo-piezas';
export {
  firmarFotoInspeccionAccion,
  obtenerAutorizacionesHoraExtraAccion,
  obtenerCatalogosPisoAccion,
  obtenerCorridasOrdenAccion,
  obtenerInspeccionesOrdenAccion,
  obtenerRecursosLiberablesAccion,
} from '@/modulos/produccion/acciones/consultas-b6';
export {
  confirmarFotoInspeccionAccion,
  descartarFotoInspeccionAccion,
  prepararFotoInspeccionAccion,
} from '@/modulos/produccion/acciones/subir-foto-inspeccion';
export type { CatalogosPiso } from '@/modulos/produccion/acciones/consultas-b6';
