'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import {
  comoJson,
  ejecutarRpcPropuesta,
} from '@/modulos/propuestas/acciones/utilidades-acciones';
import { jsonAItemPropuesta, type PropuestaItem } from '@/modulos/propuestas/tipos/indice';
import { esquemaAgregarItemPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';

/**
 * C3.1: agrega un ítem propio a una revisión B..Z en DRAFT sin tocar el RFQ.
 * El `ITxx` consecutivo de toda la propuesta y `revision_origen_id` los asigna
 * la RPC bajo lock de propuesta; esta acción nunca los envía ni los deduce.
 * El precio exige `propuesta_editar_precio` y solo si viene en la entrada.
 */
export async function agregarItemPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<PropuestaItem>> {
  const analisis = esquemaAgregarItemPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const carga: Record<string, unknown> = {
    descripcion: datos.descripcion,
    cantidad: datos.cantidad,
  };
  if (datos.materialId !== undefined) carga.material_id = datos.materialId;
  if (datos.espesorId !== undefined) carga.espesor_id = datos.espesorId;
  if (datos.acabado !== undefined) carga.acabado = datos.acabado;
  if (datos.notas !== undefined) carga.notas = datos.notas;
  if (datos.precioUnitario !== undefined) carga.precio_unitario = datos.precioUnitario;
  if (datos.esDescuento !== undefined) carga.es_descuento = datos.esDescuento;

  const permisos = ['propuesta_editar_articulo'];
  if (datos.precioUnitario !== undefined) permisos.push('propuesta_editar_precio');

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: permisos,
      rpc: 'agregar_item_propuesta',
      args: { p_revision_id: datos.revisionId, p_datos: comoJson(carga) },
      accion: 'agregar_item_propuesta',
      detalles: { revisionId: datos.revisionId, campos: Object.keys(carga) },
    },
    datos.revisionId,
  );
  if (!respuesta.exito) return respuesta;

  const item = jsonAItemPropuesta(respuesta.datos);
  if (item === null) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  return { exito: true, datos: item };
}
