'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerDetalleEntrega,
  obtenerEvidenciasDeNota,
  type DetalleEntrega,
  type EvidenciaEntrega,
} from '@/modulos/entregas/servicios/obtener-entregas';
import { esquemaEntregaPorId } from '@/modulos/entregas/validaciones/esquemas-entregas';

export type DetalleEntregaCompleto = {
  detalle: DetalleEntrega;
  evidencias: EvidenciaEntrega[];
};

/** SII-B7.3: detalle de una nota con renglones, orden y evidencias. */
export async function obtenerEntregaDetalleAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DetalleEntregaCompleto>> {
  const analisis = esquemaEntregaPorId.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

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
    const detalle = await obtenerDetalleEntrega(servidor, analisis.data.entregaId);
    if (!detalle) {
      return { exito: false, error: 'La entrega no existe o no es visible' };
    }
    const evidencias = await obtenerEvidenciasDeNota(servidor, analisis.data.entregaId);
    return { exito: true, datos: { detalle, evidencias } };
  } catch {
    return { exito: false, error: 'No se pudo cargar la entrega' };
  }
}
