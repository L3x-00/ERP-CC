'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { esquemaEditarItemPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerBooleano,
  leerNumero,
  leerTexto,
  comoJson,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoEditarItemPropuesta = {
  id: string;
  codigo: string;
  precioUnitario: number;
  cantidad: number;
  activo: boolean;
  esDescuento: boolean;
};

/**
 * SII-B4.5: edita un ítem DRAFT con CAS (`actualizadoEn` del ítem). Los campos
 * ausentes se conservan; el precio exige `propuesta_editar_precio` y el resto
 * `propuesta_editar_articulo` (el SQL lo revalida).
 */
export async function editarItemPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEditarItemPropuesta>> {
  const analisis = esquemaEditarItemPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const carga: Record<string, unknown> = { actualizado_en: datos.actualizadoEn };
  if (datos.descripcion !== undefined) carga.descripcion = datos.descripcion;
  if (datos.cantidad !== undefined) carga.cantidad = datos.cantidad;
  if (datos.materialId !== undefined) carga.material_id = datos.materialId;
  if (datos.espesorId !== undefined) carga.espesor_id = datos.espesorId;
  if (datos.acabado !== undefined) carga.acabado = datos.acabado;
  if (datos.notas !== undefined) carga.notas = datos.notas;
  if (datos.precioUnitario !== undefined) carga.precio_unitario = datos.precioUnitario;
  if (datos.esDescuento !== undefined) carga.es_descuento = datos.esDescuento;
  if (datos.activo !== undefined) carga.activo = datos.activo;

  const permisos = ['propuesta_editar_articulo'];
  if (datos.precioUnitario !== undefined) permisos.push('propuesta_editar_precio');

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: permisos,
      rpc: 'editar_item_propuesta',
      args: { p_item_id: datos.itemId, p_datos: comoJson(carga) },
      accion: 'editar_item_propuesta',
      detalles: { itemId: datos.itemId, campos: Object.keys(carga).filter((clave) => clave !== 'actualizado_en') },
    },
    datos.itemId,
  );
  if (!respuesta.exito) return respuesta;

  const id = leerTexto(respuesta.datos, 'id');
  const codigo = leerTexto(respuesta.datos, 'codigo');
  if (!id || !codigo) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  return {
    exito: true,
    datos: {
      id,
      codigo,
      precioUnitario: leerNumero(respuesta.datos, 'precio_unitario') ?? 0,
      cantidad: leerNumero(respuesta.datos, 'cantidad') ?? 0,
      activo: leerBooleano(respuesta.datos, 'activo') ?? true,
      esDescuento: leerBooleano(respuesta.datos, 'es_descuento') ?? false,
    },
  };
}
