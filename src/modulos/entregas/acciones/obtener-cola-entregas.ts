'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerColaEntregas,
  obtenerOrdenesConPendientes,
  type EntregaCola,
  type OrdenPendienteEntrega,
} from '@/modulos/entregas/servicios/obtener-entregas';

export type ColaEntregas = {
  pendientes: OrdenPendienteEntrega[];
  entregas: EntregaCola[];
};

/** SII-B7.3: cola de Logística: órdenes pendientes de entregar y notas registradas. */
export async function obtenerColaEntregasAccion(): Promise<RespuestaAccion<ColaEntregas>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const [puedeGenerar, puedeVerOrden, puedeVerFinanzas, puedeEvidencia] = await Promise.all([
    can(usuario, 'entrega_generar'),
    can(usuario, 'orden_vista'),
    can(usuario, 'ver_finanzas'),
    can(usuario, 'entrega_evidencia'),
  ]);
  if (!puedeGenerar && !puedeVerOrden && !puedeVerFinanzas && !puedeEvidencia) {
    return { exito: false, error: 'Sin permiso para ver entregas' };
  }

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();
    const [pendientes, entregas] = await Promise.all([
      obtenerOrdenesConPendientes(servidor),
      obtenerColaEntregas(servidor),
    ]);
    return { exito: true, datos: { pendientes, entregas } };
  } catch {
    return { exito: false, error: 'No se pudieron cargar las entregas' };
  }
}
