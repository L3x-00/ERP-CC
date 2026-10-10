'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  obtenerDocumentoOrdenServicio,
  type DocumentoOrden,
} from '@/modulos/ordenes/servicios/documento-orden-servicio';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Documento de la orden (ORD-03) y Orden de Servicio imprimible (DOC-01/03).
 * Incluye precios, totales y moneda; solo se compone después de autorizar
 * `ver_finanzas`. El cliente operativo nunca consulta el snapshot comercial.
 */
export async function obtenerDocumentoOrdenAccion(
  ordenId: unknown,
): Promise<RespuestaAccion<DocumentoOrden>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'orden_vista')) || !(await can(usuario, 'ver_finanzas'))) {
    return { exito: false, error: 'Sin permiso para ver información financiera de la orden' };
  }
  if (typeof ordenId !== 'string' || ordenId.length === 0) {
    return { exito: false, error: 'Orden inválida' };
  }

  try {
    const documento = await obtenerDocumentoOrdenServicio(crearClienteSupabaseAdmin(), ordenId);
    if (!documento) return { exito: false, error: 'La orden no existe o no está disponible' };
    return { exito: true, datos: documento };
  } catch (error) {
    console.error('[ORDENES] Error al componer el documento de la orden:', error);
    return { exito: false, error: 'No se pudo generar el documento de la orden' };
  }
}
