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
 * lote de 100, nunca una por fila). Devuelve los datos solo cuando la validación
 * está confirmada; durante una revalidación con datos previos marca `validando`
 * para no mostrar la etiqueta antigua como vigente ni caer al estado de negocio.
 * Se vuelve a consultar cada vez que la cola se monta (p. ej. al regresar).
 */
export interface ResultadoValidacionColaRfq {
  datos: Record<string, ValidacionRfqListo> | null;
  validando: boolean;
}

function useValidacionColaRfq(
  oportunidades: readonly { id: string; estadoRfq: EstadoRfq }[],
): ResultadoValidacionColaRfq {
  const ids = useMemo(() => idsRfqParaValidarEnCola(oportunidades), [oportunidades]);

  const consulta = useQuery({
    queryKey: [CLAVE_VALIDACION_COLA_RFQ, ids],
    queryFn: () => validarRfqsEnCola(ids, validarRfqsListoLoteAccion),
    enabled: ids.length > 0,
    refetchOnMount: 'always',
  });

  if (consulta.isFetching) {
    return { datos: null, validando: consulta.data !== undefined };
  }
  if (consulta.isError) return { datos: null, validando: false };
  return { datos: consulta.data ?? null, validando: false };
}

export { useValidacionColaRfq as usarValidacionColaRfq };
