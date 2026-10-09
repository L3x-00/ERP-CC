'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { mensajeCausaOrden } from '@/modulos/ordenes/utilidades/mensajes-orden';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Estado de la solicitud de Orden de una revisión aceptada (C4.1/DC-09). */
export type SolicitudOrden = {
  estado: 'PENDING' | 'BLOCKED' | 'CREATED';
  causa: string | null;
  intentos: number;
  ordenId: string | null;
  folio: string | null;
  fechaCompromisoComercial: string;
  puedeReintentar: boolean;
};

const esquema = z.object({ revisionId: z.uuid() }).strict();

export async function obtenerSolicitudOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SolicitudOrden | null>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Revisión inválida' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  const [ver, liberar] = await Promise.all([can(usuario, 'propuesta_vista'), can(usuario, 'orden_liberar')]);
  if (!ver && !liberar) return { exito: false, error: 'Sin permiso para ver la orden de la propuesta' };

  const { data, error } = await crearClienteSupabaseAdmin()
    .from('solicitudes_orden')
    .select('estado, causa_codigo, intentos, orden_id, fecha_compromiso_comercial, ordenes_produccion(folio)')
    .eq('revision_id', analisis.data.revisionId)
    .maybeSingle();
  if (error) {
    console.error('[ORDENES] Error al leer la solicitud de orden:', error.message);
    return { exito: false, error: 'No se pudo consultar la orden de la propuesta' };
  }
  if (!data) return { exito: true, datos: null };

  const estado = data.estado === 'CREATED' || data.estado === 'BLOCKED' ? data.estado : 'PENDING';
  const orden = data.ordenes_produccion as { folio: string } | null;
  return {
    exito: true,
    datos: {
      estado,
      causa: estado === 'BLOCKED' ? mensajeCausaOrden(data.causa_codigo) : null,
      intentos: data.intentos,
      ordenId: data.orden_id,
      folio: orden?.folio ?? null,
      fechaCompromisoComercial: data.fecha_compromiso_comercial,
      puedeReintentar: liberar,
    },
  };
}
