'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import {
  obtenerDocumentoOrdenServicio,
  type DocumentoOrden,
} from '@/modulos/ordenes/servicios/documento-orden-servicio';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Documento de la orden (ORD-03) y Orden de Servicio imprimible (DOC-01/03).
 * Cualquier sesión con visibilidad de la orden puede consultarlo: la lectura va
 * bajo RLS y no expone datos de otros clientes.
 */
export async function obtenerDocumentoOrdenAccion(
  ordenId: unknown,
): Promise<RespuestaAccion<DocumentoOrden>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (typeof ordenId !== 'string' || ordenId.length === 0) {
    return { exito: false, error: 'Orden inválida' };
  }

  try {
    const cliente = await crearClienteSupabaseServidor();
    const documento = await obtenerDocumentoOrdenServicio(cliente, ordenId);
    if (!documento) return { exito: false, error: 'La orden no existe o no está disponible' };
    return { exito: true, datos: documento };
  } catch (error) {
    console.error('[ORDENES] Error al componer el documento de la orden:', error);
    return { exito: false, error: 'No se pudo generar el documento de la orden' };
  }
}
