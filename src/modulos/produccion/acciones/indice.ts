export { iniciarSesionOperadorAccion } from '@/modulos/produccion/acciones/iniciar-sesion-operador';
export { reanudarSesionOperadorAccion } from '@/modulos/produccion/acciones/reanudar-sesion-operador';
export { cerrarSesionOperadorAccion } from '@/modulos/produccion/acciones/cerrar-sesion-operador';
export { generarNotaEntregaAccion } from '@/modulos/produccion/acciones/generar-nota-entrega';
export { obtenerTableroProduccionAccion } from '@/modulos/produccion/acciones/obtener-tablero-produccion';
export { obtenerDocumentosOrdenAccion } from '@/modulos/produccion/acciones/obtener-documentos-orden';
export type { EntregablesOrden } from '@/modulos/produccion/acciones/obtener-documentos-orden';
export { obtenerUrlDocumentoOrdenAccion } from '@/modulos/produccion/acciones/obtener-url-documento-orden';
export { subirDocumentoOrdenAccion } from '@/modulos/produccion/acciones/subir-documento-orden';
export { obtenerDocumentoNotaEntregaAccion } from '@/modulos/produccion/acciones/obtener-documento-nota-entrega';
export { crearCorridaAccion } from '@/modulos/produccion/acciones/crear-corrida';
export {
  iniciarCorridaAccion,
  completarCorridaAccion,
  cancelarCorridaAccion,
} from '@/modulos/produccion/acciones/estado-corrida';
export { reclamarRecursoAccion } from '@/modulos/produccion/acciones/reclamar-recurso';
export { cerrarJornadaAccion } from '@/modulos/produccion/acciones/cerrar-jornada';
export { autorizarHorasExtraAccion } from '@/modulos/produccion/acciones/autorizar-horas-extra';
export { registrarInspeccionAccion } from '@/modulos/produccion/acciones/registrar-inspeccion';
export {
  firmarFotoInspeccionAccion,
  obtenerAutorizacionesHoraExtraAccion,
  obtenerCatalogosPisoAccion,
  obtenerCorridasOrdenAccion,
  obtenerInspeccionesOrdenAccion,
  obtenerRecursosLiberablesAccion,
  subirFotoInspeccionAccion,
} from '@/modulos/produccion/acciones/consultas-b6';
export type { CatalogosPiso } from '@/modulos/produccion/acciones/consultas-b6';
