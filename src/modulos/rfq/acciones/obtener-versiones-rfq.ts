'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import { listarVersionesRfq } from '../servicios/obtener-versiones-rfq';
import type { VersionRfq } from '../tipos/indice';
import { esquemaObtenerRfq } from '../validaciones/esquemas-rfq';

/**
 * Server Action: versiones registradas del RFQ (solo lectura).
 * Requiere sesión activa y permiso `rfq_vista` (admin siempre).
 */
export async function obtenerVersionesRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<VersionRfq[]>> {
  const resultado = esquemaObtenerRfq.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_vista'))) {
    return { exito: false, error: 'Sin permiso para ver RFQ' };
  }

  const versiones = await listarVersionesRfq(crearClienteSupabaseAdmin(), resultado.data.rfqId);
  return { exito: true, datos: versiones };
}
