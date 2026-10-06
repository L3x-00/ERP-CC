export {
  ESTADOS_SESION_TRABAJO,
  ESTADOS_KANBAN_PRODUCCION,
  MOTIVOS_PAUSA_SESION,
  MOTIVOS_PAUSA_CATALOGO,
  CLAVES_VERIFICACION_INICIO,
  filaASesionTrabajo,
  filaANotaEntrega,
  filaAPartidaNotaEntrega,
  filaAMetaProcesoPartida,
  verificacionInicioDesdeJson,
} from '@/modulos/produccion/tipos/produccion';

export type {
  EstadoSesionTrabajo,
  EstadoKanbanProduccion,
  MotivoPausaSesion,
  MotivoPausaCatalogo,
  ClaveVerificacionInicio,
  VerificacionInicio,
  SesionTrabajo,
  NotaEntrega,
  PartidaNotaEntrega,
  FilaSesionTrabajo,
  FilaNotaEntrega,
  FilaPartidaNotaEntrega,
  FilaMetaProcesoPartida,
  MetaProcesoPartida,
} from '@/modulos/produccion/tipos/produccion';

export {
  ESTADOS_CORRIDA,
  TIPOS_INSPECCION,
  RESULTADOS_INSPECCION,
  ESTADOS_AUTORIZACION_HORA_EXTRA,
  corridaDesdeJson,
  inspeccionDesdeJson,
} from '@/modulos/produccion/tipos/corridas';

export type {
  EstadoCorrida,
  TipoInspeccion,
  ResultadoInspeccion,
  EstadoAutorizacionHoraExtra,
  CorridaItem,
  Corrida,
  InspeccionCalidad,
  AutorizacionHoraExtra,
} from '@/modulos/produccion/tipos/corridas';
