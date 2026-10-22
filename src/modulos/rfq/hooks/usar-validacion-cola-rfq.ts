'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { validarRfqsListoLoteAccion } from '@/modulos/rfq/acciones/validar-rfqs-listo-lote';
import type { EstadoRfq, ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';
import {
  idsRfqParaValidarEnCola,
  validarRfqsEnCola,
} from '@/modulos/rfq/utilidades/validacion-cola';

export const CLAVE_VALIDACION_COLA_RFQ = 'rfq-validacion-cola';

// Nombre interno con prefijo `use` para que `react-hooks/rules-of-hooks` lo
// reconozca; se exporta en español mediante alias (ver CLAUDE.md).
/**
 * Validación de «listo» de los RFQ Incompletos de la cola, con la misma regla
 * que la ficha, de TODOS los Incompletos y en lotes acotados (una llamada por
 * lote de 100, nunca una por fila). Devuelve `null`
 * mientras se consulta, si falló o si no hay Incompletos: nunca se declara una
 * captura completa sin validación confirmada. Se vuelve a consultar cada vez que
 * la cola se monta (p. ej. al regresar de la ficha).
 */
function useValidacionColaRfq(
  oportunidades: readonly { id: string; estadoRfq: EstadoRfq }[],
): Record<string, ValidacionRfqListo> | null {
  const ids = useMemo(() => idsRfqParaValidarEnCola(oportunidades), [oportunidades]);

  const consulta = useQuery({
    queryKey: [CLAVE_VALIDACION_COLA_RFQ, ids],
    queryFn: () => validarRfqsEnCola(ids, validarRfqsListoLoteAccion),
    enabled: ids.length > 0,
    refetchOnMount: 'always',
  });

  if (consulta.isFetching || consulta.isError) return null;
  return consulta.data ?? null;
}

export { useValidacionColaRfq as usarValidacionColaRfq };
