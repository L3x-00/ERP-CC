'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { obtenerClienteParaRfq } from '@/modulos/pipeline/servicios/obtener-cliente-para-rfq';
import { esquemaAsignarClienteOportunidad } from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import type { CondicionesPago } from '@/modulos/pipeline/tipos/indice';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/** Estado de la oportunidad tras la asignación (lo refleja la UI sin recargar). */
export type ResultadoAsignarCliente = {
  clienteId: string | null;
  condicionesPago: CondicionesPago | null;
};

/**
 * Liga una oportunidad abierta con un cliente del catálogo, o la desliga —
 * RFQ-02. Con `heredarCondiciones` copia además las condiciones de pago del
 * cliente a la oportunidad (RFQ-03); sin la bandera no toca las condiciones, de
 * modo que unas negociadas a mano no se pierden al elegir cliente.
 *
 * A diferencia de `vincularDesdePipelineAccion` (que CREA el cliente a partir de
 * los textos de la oportunidad), aquí el cliente lo elige el usuario: no se crea
 * ni se enriquece nada del catálogo. El alta rápida usa `crearClienteAccion`.
 *
 * Solo con la oportunidad abierta: una ganada ya derivó cliente y orden, y
 * repuntarla reescribiría el histórico. Lectura bajo RLS (oportunidad y
 * cliente); escritura con admin porque `cliente_id` es columna controlada.
 */
export async function asignarClienteOportunidadAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoAsignarCliente>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaAsignarClienteOportunidad.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { id, clienteId, heredarCondiciones } = analisis.data;

  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, id);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }
  const op = cargada.oportunidad;

  if (
    op.vendedorId !== usuario.id &&
    usuario.rol !== 'admin' &&
    !(await can(usuario, 'ver_pipeline_equipo'))
  ) {
    return { exito: false, error: 'No encontrada' };
  }

  if (op.etapa === 'ganada' || op.etapa === 'perdida') {
    return { exito: false, error: 'El cliente solo se cambia con la oportunidad abierta' };
  }

  let condicionesPago = op.condicionesPago;
  if (clienteId !== null) {
    const clienteRfq = await obtenerClienteParaRfq(servidor, clienteId);
    if (!clienteRfq) {
      return { exito: false, error: 'Cliente no válido' };
    }
    if (heredarCondiciones && clienteRfq.condicionesPago !== null) {
      condicionesPago = clienteRfq.condicionesPago;
    }
  }

  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin
    .from('pipeline')
    .update({ cliente_id: clienteId, condiciones_pago: condicionesPago })
    .eq('id', id);
  if (error) {
    return { exito: false, error: 'No se pudo asignar el cliente' };
  }

  await registrarLog(usuario, 'asignar_cliente_oportunidad', 'pipeline', id, {
    clienteId,
    condicionesPago,
  });

  return { exito: true, datos: { clienteId, condicionesPago } };
}
