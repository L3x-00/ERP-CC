'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerCierreOrdenServicio,
  obtenerPanelCierresServicio,
} from '@/modulos/cierres/servicios/cierre-administrativo-servicio';
import type {
  CierreOrdenDetalle,
  PanelCierreAdministrativo,
} from '@/modulos/cierres/tipos/indice';

const esquemaOrden = z.object({ ordenId: z.uuid() }).strict();

async function autorizado(): Promise<boolean> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return false;
  return (await can(usuario, 'ver_finanzas')) || (await can(usuario, 'gestionar_produccion'));
}

/** C14: panel de cierres comparativos de órdenes terminadas. */
export async function obtenerPanelCierresAccion(): Promise<RespuestaAccion<PanelCierreAdministrativo>> {
  if (!(await autorizado())) return { exito: false, error: 'Sin permiso para ver el cierre administrativo' };
  try {
    const datos = await obtenerPanelCierresServicio(crearClienteSupabaseAdmin());
    return { exito: true, datos };
  } catch (error) {
    console.error('[CIERRES] Error al cargar el panel:', error);
    return { exito: false, error: 'No se pudo cargar el cierre administrativo' };
  }
}

/** C14: comparativo detallado de una orden terminada. */
export async function obtenerCierreOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<CierreOrdenDetalle>> {
  const analisis = esquemaOrden.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };
  if (!(await autorizado())) return { exito: false, error: 'Sin permiso para ver el cierre administrativo' };

  try {
    const detalle = await obtenerCierreOrdenServicio(
      crearClienteSupabaseAdmin(),
      analisis.data.ordenId,
    );
    if (!detalle) return { exito: false, error: 'La orden no está terminada o no existe' };
    return { exito: true, datos: detalle };
  } catch (error) {
    console.error('[CIERRES] Error al cargar el cierre de la orden:', error);
    return { exito: false, error: 'No se pudo cargar el cierre de la orden' };
  }
}
