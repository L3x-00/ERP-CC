'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerResumenOrdenServicio } from '@/modulos/ordenes/servicios/resumen-orden-servicio';
import type { ResumenOrden } from '@/modulos/ordenes/tipos/resumen-orden';

const esquema = z.object({ ordenId: z.uuid() }).strict();

/**
 * C10.5: resumen de una orden para el modal de la cola. Exige `orden_vista` y
 * decide en servidor qué enlaces y totales viajan (RFQ, propuesta, finanzas).
 */
export async function obtenerResumenOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResumenOrden>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Orden inválida' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'orden_vista'))) {
    return { exito: false, error: 'Sin permiso para ver órdenes' };
  }

  const [verRfq, verPropuesta, verTotales] = await Promise.all([
    can(usuario, 'rfq_vista'),
    can(usuario, 'propuesta_vista'),
    can(usuario, 'orden_ver_totales'),
  ]);

  try {
    const resumen = await obtenerResumenOrdenServicio(
      crearClienteSupabaseAdmin(),
      analisis.data.ordenId,
      { incluirTotales: verTotales },
    );
    if (!resumen) return { exito: false, error: 'La orden no existe o no está disponible' };
    return {
      exito: true,
      datos: {
        ...resumen,
        permisos: { verRfq, verPropuesta, verTotales },
      },
    };
  } catch (error) {
    console.error('[ORDENES] Error al componer el resumen de la orden:', error);
    return { exito: false, error: 'No se pudo cargar el resumen de la orden' };
  }
}
