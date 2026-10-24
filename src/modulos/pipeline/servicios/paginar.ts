/**
 * Paginación de la cola RFQ. La lógica genérica vive en `compartido/utilidades`
 * para poder reutilizarla en otras colas del ERP.
 */
export {
  numerosPagina,
  paginar,
  type Pagina,
} from '@/compartido/utilidades/paginar';

/** La cola RFQ muestra 15 solicitudes por página. */
export const TAMANO_PAGINA_RFQ = 15;
