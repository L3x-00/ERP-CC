'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaConfirmarVenta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerTexto,
} from '@/modulos/propuestas/acciones/utilidades-acciones';
import type { ResultadoEstadoPropuesta } from '@/modulos/propuestas/acciones/rechazar-propuesta';

/**
 * SII-B4.10: confirma la venta sobre la revisión aceptada (SALE_CONFIRMED);
 * habilita la creación de la orden en B5.
 */
export async function confirmarVentaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEstadoPropuesta>> {
  const analisis = esquemaConfirmarVenta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_aceptar',
      rpc: 'confirmar_venta',
      args: {
        p_revision_id: datos.revisionId,
        p_actualizado_en: datos.actualizadoEn,
      },
      accion: 'confirmar_venta',
      detalles: { revisionId: datos.revisionId },
    },
    datos.revisionId,
  );
  if (!respuesta.exito) return respuesta;

  const estado = leerTexto(respuesta.datos, 'estado') as EstadoPropuesta | null;
  if (!estado) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  return { exito: true, datos: { revisionId: datos.revisionId, estado } };
}
