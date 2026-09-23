'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { promoverAClienteSiNoExiste } from '@/modulos/pipeline/servicios/promover-a-cliente';
import { evaluarCreditoCliente } from '@/modulos/pipeline/servicios/evaluar-credito';
import {
  aprobarOportunidadYCrearOrdenServicio,
  ErrorOrden,
  mensajeErrorOrden,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { obtenerTipoCambioVigente } from '@/modulos/configuracion/servicios/configuracion-servicio';
import { esquemaMarcarGanada } from '@/modulos/pipeline/validaciones/esquemas-transicion-etapa';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/** Respuesta de la aprobación; el flag de crédito exige confirmación explícita. */
export type ResultadoMarcarGanada = RespuestaAccion<{
  clienteId: string;
  ordenId: string;
  folioOrden: string;
}> & {
  /** El cliente alcanzó su límite y la aprobación espera autorización (RFQ-16). */
  requiereAutorizacionCredito?: boolean;
  /** Excedente sobre el límite, en MXN, para mostrarlo en la confirmación. */
  excedenteMxn?: number;
};

/** Importe neto de la cotización en MXN (descuentos restados, TC si es USD). */
async function calcularMontoCotizadoMxn(
  clienteAdmin: ReturnType<typeof crearClienteSupabaseAdmin>,
  pipelineId: string,
  moneda: 'MXN' | 'USD',
): Promise<number> {
  const { data: lineas, error } = await clienteAdmin
    .from('cotizacion_lineas')
    .select('cantidad, precio_unitario, es_descuento')
    .eq('pipeline_id', pipelineId);
  if (error) {
    console.error('[PIPELINE] No se pudo calcular el importe para el crédito:', error.message);
    throw new Error('No se pudo calcular el importe para el crédito');
  }
  const total = (lineas ?? []).reduce(
    (suma, linea) =>
      suma +
      (linea.es_descuento ? -1 : 1) *
        Number(linea.cantidad) *
        Number(linea.precio_unitario),
    0,
  );
  const tipoCambio = moneda === 'USD' ? await obtenerTipoCambioVigente(clienteAdmin) : 1;
  return Math.round(total * tipoCambio * 100) / 100;
}

/** Crédito ya consumido por el cliente: AR pendiente/parcial convertida a MXN. */
async function calcularCreditoUtilizadoMxn(
  clienteAdmin: ReturnType<typeof crearClienteSupabaseAdmin>,
  clienteId: string,
): Promise<number> {
  const { data, error } = await clienteAdmin
    .from('cuentas_por_cobrar')
    .select('saldo_pendiente, moneda, tipo_cambio_origen')
    .eq('cliente_id', clienteId)
    .in('estado', ['pendiente', 'parcial']);
  if (error) {
    console.error('[PIPELINE] No se pudo calcular el crédito usado:', error.message);
    throw new Error('No se pudo calcular el crédito usado');
  }
  return Math.round(
    (data ?? []).reduce(
      (suma, cuenta) =>
        suma +
        Number(cuenta.saldo_pendiente) *
          (cuenta.moneda === 'USD' ? Number(cuenta.tipo_cambio_origen) : 1),
      0,
    ) * 100,
  ) / 100;
}

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
): Promise<ResultadoMarcarGanada> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaMarcarGanada.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { id, fechaCompromiso, autorizarSobregiro } = analisis.data;

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
  let clienteId = op.clienteId;
  if (!clienteId) {
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
  }

  // Un vínculo explícito es la identidad comercial de la RFQ. No se vuelve a
  // deduplicar por nombre/correo, que pueden diferir de los datos del cliente.
  // También se valida el cliente promovido: una coincidencia histórica inactiva
  // no debe aprobarse por accidente.
  const { data: clienteCredito, error: errorCliente } = await clienteAdmin
    .from('clientes')
    .select('id, estado, limite_credito')
    .eq('id', clienteId)
    .maybeSingle();
  if (errorCliente || !clienteCredito) {
    return { exito: false, error: 'No se pudo verificar el cliente de la oportunidad' };
  }
  if (clienteCredito.estado !== 'activo') {
    return { exito: false, error: 'El cliente de la oportunidad no está activo' };
  }

  // RFQ-16: si la cartera del cliente más esta cotización exceden su límite,
  // la aprobación exige autorización explícita de un administrador. El cálculo
  // se hace en el servidor con el cliente admin (la cartera puede no ser
  // visible para el vendedor). Una lectura fallida bloquea la aprobación;
  // la RPC vuelve a evaluar dentro de la transacción y es el control final.
  const limiteCredito = Number(clienteCredito?.limite_credito ?? 0);
  if (limiteCredito > 0) {
    let creditoUtilizadoMxn: number;
    let montoCotizadoMxn: number;
    try {
      [creditoUtilizadoMxn, montoCotizadoMxn] = await Promise.all([
        calcularCreditoUtilizadoMxn(clienteAdmin, clienteId),
        calcularMontoCotizadoMxn(clienteAdmin, id, op.moneda),
      ]);
    } catch {
      return { exito: false, error: 'No se pudo verificar el crédito del cliente' };
    }
    const evaluacion = evaluarCreditoCliente({
      limiteCredito,
      creditoUtilizadoMxn,
      montoCotizadoMxn,
    });
    if (evaluacion.excedeLimite) {
      if (!autorizarSobregiro) {
        return {
          exito: false,
          error: 'El cliente alcanzó su límite de crédito',
          requiereAutorizacionCredito: true,
          excedenteMxn: evaluacion.excedenteMxn,
        };
      }
      if (usuario.rol !== 'admin') {
        return {
          exito: false,
          error: 'Solo un administrador puede autorizar un sobrepaso de crédito',
        };
      }
    }
  }

  try {
    // La RPC bloquea la oportunidad y crea cabecera, partidas y cambio de etapa
    // en una sola transacción PostgreSQL. No existe un estado "ganada sin OP".
    const orden = await aprobarOportunidadYCrearOrdenServicio(clienteAdmin, {
      pipelineId: id,
      clienteId,
      fechaCompromiso,
      actorId: usuario.id,
      autorizarSobregiro: autorizarSobregiro ?? false,
    });
    await registrarLog(usuario, 'marcar_ganada', 'pipeline', op.id, {
      clienteId,
      ordenId: orden.id,
      folioOrden: orden.folio,
      ...(orden.yaExistia ? { ordenPreexistente: true } : {}),
      ...(autorizarSobregiro ? { autorizacionCredito: true } : {}),
    });

    return {
      exito: true,
      datos: { clienteId, ordenId: orden.id, folioOrden: orden.folio },
    };
  } catch (error) {
    if (error instanceof ErrorOrden && error.codigo === 'credito_limite_excedido') {
      try {
        const [creditoUtilizadoMxn, montoCotizadoMxn] = await Promise.all([
          calcularCreditoUtilizadoMxn(clienteAdmin, clienteId),
          calcularMontoCotizadoMxn(clienteAdmin, id, op.moneda),
        ]);
        const evaluacion = evaluarCreditoCliente({
          limiteCredito,
          creditoUtilizadoMxn,
          montoCotizadoMxn,
        });
        return {
          exito: false,
          error: 'El cliente alcanzó su límite de crédito',
          requiereAutorizacionCredito: true,
          excedenteMxn: evaluacion.excedenteMxn,
        };
      } catch {
        return { exito: false, error: 'El crédito cambió. Recarga e inténtalo de nuevo' };
      }
    }
    return { exito: false, error: mensajeErrorOrden(error, 'aprobar') };
  }
}
