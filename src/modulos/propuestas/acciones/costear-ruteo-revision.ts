'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { ejecutarRpcPropuesta, leerNumero } from '@/modulos/propuestas/acciones/utilidades-acciones';

const esquema = z.object({ revisionId: z.uuid() }).strict();

/**
 * C3.3/DC-07: congela tarifa, fuente y costos de cada renglón de ruteo de la
 * revisión DRAFT. Sin tarifa o con moneda distinta falla completa con un
 * mensaje que dice qué configurar.
 */
export async function costearRuteoRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ renglones: number; costoRuteo: number }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Revisión inválida' };
  const { revisionId } = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_editar_costo',
      rpc: 'costear_ruteo_revision',
      args: { p_revision_id: revisionId },
      accion: 'costear_ruteo_revision',
      detalles: { revisionId },
    },
    revisionId,
  );
  if (!respuesta.exito) return respuesta;
  return {
    exito: true,
    datos: {
      renglones: leerNumero(respuesta.datos, 'renglones') ?? 0,
      costoRuteo: leerNumero(respuesta.datos, 'costoRuteo') ?? 0,
    },
  };
}
