/**
 * Reglas de transición del pipeline. La fuente única de acciones por estado
 * vive en el módulo RFQ (ola 2); aquí se re-exporta para los consumidores del
 * pipeline que ya la importaban.
 */
export {
  ACCIONES_POR_ESTADO,
  esAccionValida,
  esEstadoTerminal,
} from '@/modulos/rfq/utilidades/estados';
