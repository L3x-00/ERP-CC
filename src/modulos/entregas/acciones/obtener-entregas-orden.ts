'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerEntregasDeOrden,
  type EntregaConRenglones,
} from '@/modulos/entregas/servicios/obtener-entregas';
import { esquemaOrdenEntrega } from '@/modulos/entregas/validaciones/esquemas-entregas';

/** SII-B7.1: lista las entregas de una orden (con renglones y folio SII). */
export async function obtenerEntregasOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<EntregaConRenglones[]>> {
  const analisis = esquemaOrdenEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  const [puedeGenerar, puedeVerOrden, puedeVerFinanzas] = await Promise.all([
    can(usuario, 'entrega_generar'),
    can(usuario, 'orden_vista'),
    can(usuario, 'ver_finanzas'),
  ]);
  if (!puedeGenerar && !puedeVerOrden && !puedeVerFinanzas) {
    return { exito: false, error: 'Sin permiso para ver entregas' };
  }

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();
    const entregas = await obtenerEntregasDeOrden(servidor, analisis.data.ordenId);
    return { exito: true, datos: entregas };
  } catch {
    return { exito: false, error: 'No se pudieron cargar las entregas' };
  }
}
