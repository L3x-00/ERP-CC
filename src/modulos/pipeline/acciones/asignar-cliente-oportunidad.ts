'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { obtenerClienteParaRfq } from '@/modulos/pipeline/servicios/obtener-cliente-para-rfq';
import { esquemaAsignarClienteOportunidad } from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import { esDefinicionRfqEditable } from '@/modulos/rfq/utilidades/estados';
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
 * Si la oportunidad tenía un contacto de otro cliente, lo desliga (ver más abajo).
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

  if (op.estadoRfq === 'CLOSED' || op.estadoRfq === 'CANCELLED') {
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

  // Un contacto de OTRO cliente deja de ser válido al cambiar de cliente: se
  // desliga para que la ficha pueda vincular el vigente del nuevo (acción
  // explícita `vincularContactoVigenteRfqAccion`, que exige sus propios permisos).
  // Un contacto del mismo cliente se conserva siempre. Al desligar el cliente, o
  // con el RFQ congelado, el contacto no se toca. Aquí nunca se crean contactos.
  let limpiaContacto = false;
  if (clienteId !== null && op.contactoId !== null && esDefinicionRfqEditable(op.estadoRfq)) {
    const { data: actual, error: errorContacto } = await admin
      .from('contactos_cliente')
      .select('id, cliente_id, activo')
      .eq('id', op.contactoId)
      .maybeSingle();
    if (errorContacto) {
      return { exito: false, error: 'No se pudo revisar el contacto del cliente' };
    }
    limpiaContacto = actual?.cliente_id !== clienteId;
  }

  const { error } = await admin
    .from('pipeline')
    .update({
      cliente_id: clienteId,
      condiciones_pago: condicionesPago,
      ...(limpiaContacto ? { contacto_id: null } : {}),
    })
    .eq('id', id);
  if (error) {
    return { exito: false, error: 'No se pudo asignar el cliente' };
  }

  await registrarLog(usuario, 'asignar_cliente_oportunidad', 'pipeline', id, {
    clienteId,
    condicionesPago,
    ...(limpiaContacto ? { contactoDesligado: op.contactoId } : {}),
  });

  return { exito: true, datos: { clienteId, condicionesPago } };
}
