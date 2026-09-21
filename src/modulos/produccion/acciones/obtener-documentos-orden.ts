'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  listarDocumentosOrden,
  obtenerOrdenDocumental,
  type OrdenDocumental,
} from '@/modulos/produccion/servicios/documentos-orden-servicio';
import {
  listarNotasEntregaOrden,
  type NotaEntregaResumen,
} from '@/modulos/produccion/servicios/nota-entrega-documento-servicio';
import type { ArchivoAdjunto } from '@/modulos/pipeline/servicios/listar-adjuntos';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z.object({ ordenId: z.uuid() }).strict();

export interface EntregablesOrden {
  orden: OrdenDocumental;
  documentos: ArchivoAdjunto[];
  notas: NotaEntregaResumen[];
}

/**
 * Entregables de producción de una orden (OBS-06/ORD-09/OBS-13): documentos de
 * la oportunidad de origen y notas de entrega con su confirmación. La lectura
 * usa service_role después de exigir permiso de Producción, para que el taller
 * vea los planos sin depender de la RLS de Pipeline.
 */
export async function obtenerDocumentosOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<EntregablesOrden>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para consultar entregables de producción' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const orden = await obtenerOrdenDocumental(admin, analisis.data.ordenId);
    if (!orden) return { exito: false, error: 'La orden no existe' };

    const [documentos, notas] = await Promise.all([
      listarDocumentosOrden(admin, orden),
      listarNotasEntregaOrden(admin, orden.id),
    ]);
    return { exito: true, datos: { orden, documentos, notas } };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar entregables de la orden:', error);
    return { exito: false, error: 'No se pudieron consultar los entregables de la orden' };
  }
}
