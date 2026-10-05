'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import { obtenerRfqConItems } from '../servicios/obtener-rfq';
import type { Rfq } from '../tipos/indice';
import { esquemaObtenerRfq } from '../validaciones/esquemas-rfq';

/**
 * Server Action: obtiene un RFQ con sus ítems y operaciones.
 * Requiere sesión activa y permiso `rfq_vista` (admin siempre).
 */
export async function obtenerRfqAccion(entrada: unknown): Promise<RespuestaAccion<Rfq>> {
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

  const rfq = await obtenerRfqConItems(crearClienteSupabaseAdmin(), resultado.data.rfqId);
  if (!rfq) {
    return { exito: false, error: 'No se encontró el RFQ' };
  }

  return { exito: true, datos: rfq };
}
