'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { promoverAClienteSiNoExiste } from '@/modulos/pipeline/servicios/promover-a-cliente';
import {
  aprobarOportunidadYCrearOrdenServicio,
  mensajeErrorOrden,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaMarcarGanada } from '@/modulos/pipeline/validaciones/esquemas-transicion-etapa';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Marca una oportunidad como ganada (solo desde Negociación) y promueve el
 * contacto a cliente si aún no existe y crea la Orden de Producción asociada.
 *
 * La promoción usa el cliente ADMIN (service role) porque la deduplicación por
 * RFC/correo debe ver toda la tabla `clientes`, no solo lo que la RLS del
 * vendedor deja leer.
 */
export async function marcarGanadaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ clienteId: string; ordenId: string; folioOrden: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaMarcarGanada.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { id, fechaCompromiso } = analisis.data;

  const servidor = await crearClienteSupabaseServidor();

  const cargada = await obtenerOportunidadPorId(servidor, id);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }
  const op = cargada.oportunidad;

  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para marcar como ganada' };
  }

  if (op.etapa !== 'negociacion') {
    return { exito: false, error: 'Solo se puede ganar desde Negociación' };
  }

  const clienteAdmin = crearClienteSupabaseAdmin();
  let clienteId: string;
  try {
    clienteId = await promoverAClienteSiNoExiste(clienteAdmin, {
      nombreComercial: op.empresa,
      rfc: null,
      contacto: op.nombreContacto,
      correo: op.correo,
      telefono: op.telefono,
    });
  } catch {
    return { exito: false, error: 'No se pudo registrar el cliente' };
  }

  try {
    // La RPC bloquea la oportunidad y crea cabecera, partidas y cambio de etapa
    // en una sola transacción PostgreSQL. No existe un estado "ganada sin OP".
    const orden = await aprobarOportunidadYCrearOrdenServicio(clienteAdmin, {
      pipelineId: id,
      clienteId,
      fechaCompromiso,
    });
    await registrarLog(usuario, 'marcar_ganada', 'pipeline', op.id, {
      clienteId,
      ordenId: orden.id,
      folioOrden: orden.folio,
      ...(orden.yaExistia ? { ordenPreexistente: true } : {}),
    });

    return {
      exito: true,
      datos: { clienteId, ordenId: orden.id, folioOrden: orden.folio },
    };
  } catch (error) {
    return { exito: false, error: mensajeErrorOrden(error, 'aprobar') };
  }
}
