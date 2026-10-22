'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import type { ValidacionRfqListo } from '../tipos/indice';
import { normalizarValidacionRfq } from '../utilidades/estados';
import { esquemaValidarRfqsListoLote } from '../validaciones/esquemas-rfq';

/** RPC simultáneas por consulta: la cola no debe saturar la base. */
const CONCURRENCIA_VALIDACION = 8;

/**
 * Server Action: valida un lote de RFQ (hasta `MAXIMO_RFQ_VALIDACION_LOTE`) con
 * la misma RPC `validar_rfq_listo` que usa la ficha. La RPC corre con el cliente
 * admin, así que antes de ejecutarla se comprueba cada id con el cliente de
 * sesión: solo se validan los RFQ que la RLS de `pipeline` deja ver a la persona
 * (un id no visible se omite sin revelar si existe). Solo devuelve los RFQ cuya
 * validación se obtuvo; si la RPC falla para uno, ese id se omite y la cola no
 * lo declara completo. La cola parte listas largas en lotes y llama una vez por
 * lote.
 */
export async function validarRfqsListoLoteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<Record<string, ValidacionRfqListo>>> {
  const resultado = esquemaValidarRfqsListoLote.safeParse(entrada);
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

  const solicitados = [...new Set(resultado.data.rfqIds)];

  // Visibilidad por RLS con la sesión de la persona; ante error se falla cerrado.
  const sesion = await crearClienteSupabaseServidor();
  const { data: visibles, error: errorVisibilidad } = await sesion
    .from('pipeline')
    .select('id')
    .in('id', solicitados);
  if (errorVisibilidad || !visibles) {
    console.error('[RFQ] Error al verificar visibilidad en lote:', errorVisibilidad?.message);
    return { exito: false, error: 'No se pudo validar el RFQ' };
  }
  const idsVisibles = new Set(visibles.map((fila) => fila.id));
  const ids = solicitados.filter((id) => idsVisibles.has(id));

  const admin = crearClienteSupabaseAdmin();
  const validaciones: Record<string, ValidacionRfqListo> = {};
  let fallidos = 0;

  for (let inicio = 0; inicio < ids.length; inicio += CONCURRENCIA_VALIDACION) {
    const grupo = ids.slice(inicio, inicio + CONCURRENCIA_VALIDACION);
    const respuestas = await Promise.all(
      grupo.map((rfqId) => admin.rpc('validar_rfq_listo', { p_rfq_id: rfqId })),
    );
    respuestas.forEach(({ data, error }, indice) => {
      if (error || data === null) {
        fallidos += 1;
        console.error('[RFQ] Error al validar listo en lote:', error?.message);
        return;
      }
      validaciones[grupo[indice]] = normalizarValidacionRfq(data);
    });
  }

  if (ids.length > 0 && fallidos === ids.length) {
    return { exito: false, error: 'No se pudo validar el RFQ' };
  }

  return { exito: true, datos: validaciones };
}
