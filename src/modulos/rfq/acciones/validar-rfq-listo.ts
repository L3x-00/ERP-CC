'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import type { ValidacionRfqListo } from '../tipos/indice';
import { normalizarValidacionRfq } from '../utilidades/estados';
import { esquemaValidarRfqListo } from '../validaciones/esquemas-rfq';

/**
 * Server Action: valida si un RFQ cumple los requisitos para LISTO y devuelve
 * los faltantes por sección. La misma validación se reejecuta en la RPC al
 * marcar listo (la UI nunca es la única barrera).
 */
export async function validarRfqListoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ValidacionRfqListo>> {
  const resultado = esquemaValidarRfqListo.safeParse(entrada);
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

  const { data, error } = await crearClienteSupabaseAdmin().rpc('validar_rfq_listo', {
    p_rfq_id: resultado.data.rfqId,
  });

  if (error || data === null) {
    console.error('[RFQ] Error al validar listo:', error?.message);
    return { exito: false, error: 'No se pudo validar el RFQ' };
  }

  return { exito: true, datos: normalizarValidacionRfq(data) };
}
