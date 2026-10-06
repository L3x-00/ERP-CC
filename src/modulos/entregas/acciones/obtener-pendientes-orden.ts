'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerPendientesDeOrden } from '@/modulos/entregas/servicios/obtener-entregas';
import type { PendienteEntregaItem } from '@/modulos/entregas/tipos/indice';
import { esquemaOrdenEntrega } from '@/modulos/entregas/validaciones/esquemas-entregas';

/** SII-B7.1: pendientes por ITxx de una orden (agrupados y con disponible real). */
export async function obtenerPendientesOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<PendienteEntregaItem[]>> {
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
    const pendientes = await obtenerPendientesDeOrden(servidor, analisis.data.ordenId);
    return { exito: true, datos: pendientes };
  } catch {
    return { exito: false, error: 'No se pudieron cargar los pendientes' };
  }
}
