'use client';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import type { EstadoRfq, ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';
import {
  ETIQUETAS_ESTADO_RFQ,
  ETIQUETA_CAPTURA_LISTA,
  capturaRfqListaParaValidar,
} from '@/modulos/rfq/utilidades/estados';

/**
 * Indicador del encabezado de la ficha. Con la captura en curso y la validación
 * del servidor sin faltantes muestra «Listo para validar» en verde; en cualquier
 * otro caso conserva la etiqueta del estado de negocio (p. ej. «Incompleto»).
 * Es solo una indicación: no cambia el estado ni las acciones disponibles, y
 * `data-estado-rfq` deja explícito que el estado de negocio no se movió.
 */
export function IndicadorEstadoRfq({
  estadoRfq,
  validacion,
}: {
  estadoRfq: EstadoRfq;
  /** Validación ya confirmada por el servidor; null si está pendiente o falló. */
  validacion: ValidacionRfqListo | null;
}) {
  const lista = capturaRfqListaParaValidar(estadoRfq, validacion);
  const captura = lista ? 'lista' : estadoRfq === 'INCOMPLETE' ? 'incompleta' : 'no-aplica';

  return (
    <span
      data-testid="indicador-estado-rfq"
      data-captura={captura}
      data-estado-rfq={estadoRfq}
      title={
        lista
          ? 'La captura está completa. El RFQ sigue Incompleto hasta que se marque listo.'
          : undefined
      }
    >
      {lista ? (
        <>
          <BadgeEstado estado="captura_lista" etiqueta={ETIQUETA_CAPTURA_LISTA} />
          <span className="sr-only">
            {' '}
            Estado del RFQ: {ETIQUETAS_ESTADO_RFQ[estadoRfq]}.
          </span>
        </>
      ) : (
        <BadgeEstado estado={estadoRfq} etiqueta={ETIQUETAS_ESTADO_RFQ[estadoRfq]} />
      )}
    </span>
  );
}
