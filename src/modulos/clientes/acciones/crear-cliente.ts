'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { esquemaCrearCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import { resolverCredito } from '@/modulos/clientes/servicios/condiciones-comerciales';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';

/**
 * Crea un cliente y su contacto principal de forma atómica (SII-B2.2).
 *
 * Toda la transacción vive en la RPC `crear_cliente_con_contacto`: si el
 * contacto falla, el cliente no se persiste. La Server Action valida actor,
 * permisos (`cliente_editar`; `ver_finanzas` si asigna límite) y traduce el
 * error `cliente_duplicado` con el folio existente. El folio lo asigna la
 * base; el cliente nunca lo envía.
 *
 * Compatibilidad: las llamadas legadas que mandan `contacto` como texto crean
 * el contacto principal con ese nombre; si no mandan nada, el alta sigue
 * siendo válida y registra solo el cliente.
 */
export async function crearClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string; folio: string | null }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaCrearCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await can(usuario, 'cliente_editar'))) {
    return { exito: false, error: 'Sin permiso para crear clientes' };
  }

  const datos = analisis.data;

  // Otorgar crédito inicial es una decisión financiera, no de captura comercial.
  if (datos.limiteCredito > 0 && !(await can(usuario, 'ver_finanzas'))) {
    return { exito: false, error: 'Sin permiso para asignar límite de crédito' };
  }
  const tocaCredito =
    datos.creditoHabilitado === true ||
    (datos.diasCredito !== undefined && datos.diasCredito !== null && datos.diasCredito > 0);
  if (tocaCredito && !(await can(usuario, 'cliente_comercial'))) {
    return { exito: false, error: 'Sin permiso para habilitar condiciones de crédito' };
  }

  // Compatibilidad: `contacto` (texto) era la cabecera legada; si no llega el
  // objeto de contacto principal, se crea uno con ese nombre.
  const contactoTexto = datos.contacto?.trim() ?? '';
  const contactoPrincipal = datos.contactoPrincipal
    ? {
        nombre: datos.contactoPrincipal.nombre,
        puesto: datos.contactoPrincipal.puesto,
        correo: datos.contactoPrincipal.correo,
        telefono: datos.contactoPrincipal.telefono,
      }
    : contactoTexto.length >= 2
      ? { nombre: contactoTexto }
      : null;

  let comercial: ReturnType<typeof resolverCredito>;
  try {
    comercial = resolverCredito({
      creditoHabilitado: datos.creditoHabilitado,
      diasCredito: datos.diasCredito,
      condicionesPago: datos.condicionesPago,
    });
  } catch (error) {
    const requeridos =
      error instanceof RangeError && error.message === 'dias_credito_requeridos';
    return {
      exito: false,
      error: requeridos ? 'Indica los días de crédito del cliente' : 'Días de crédito inválidos',
    };
  }

  const pDatos: Record<string, unknown> = {
    nombre_comercial: datos.nombreComercial,
    razon_social: datos.razonSocial,
    rfc: datos.rfc ?? '',
    correo: datos.correo ?? '',
    telefono: datos.telefono ?? '',
    estado: datos.estado,
    moneda: datos.moneda ?? 'MXN',
    limite_credito: datos.limiteCredito,
    condiciones_pago: datos.condicionesPago ?? null,
    direccion_fiscal: datos.direccionFiscal ?? null,
    direccion_envio: datos.direccionEnvio ?? null,
    contacto_cabecera: contactoTexto ? contactoTexto : null,
    contacto: contactoPrincipal,
  };
  if (comercial) {
    pDatos.credito_habilitado = comercial.creditoHabilitado;
    pDatos.dias_credito = comercial.diasCredito;
  }

  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('crear_cliente_con_contacto', {
    p_datos: pDatos as Json,
    p_actor: usuario.id,
  });

  if (error) {
    if (error.message.includes('cliente_duplicado')) {
      const folio = typeof error.details === 'string' ? error.details.trim() : '';
      return {
        exito: false,
        error: folio
          ? `Ya existe un cliente con los mismos datos (${folio})`
          : 'Ya existe un cliente con el mismo RFC, correo o razón social',
      };
    }
    if (error.message.includes('sin_permiso')) {
      return { exito: false, error: 'Sin permiso para crear clientes' };
    }
    console.error('[CLIENTES] Alta rechazada:', error.message);
    return { exito: false, error: 'No se pudo crear el cliente' };
  }

  const resultado =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  const clienteId = typeof resultado?.clienteId === 'string' ? resultado.clienteId : null;
  const folio = typeof resultado?.folio === 'string' ? resultado.folio : null;
  const contactoId = typeof resultado?.contactoId === 'string' ? resultado.contactoId : null;
  if (!clienteId) {
    return { exito: false, error: 'No se pudo crear el cliente' };
  }

  const correlationId = nuevoCorrelationId();
  await registrarLog(
    usuario,
    'crear',
    'clientes',
    clienteId,
    {
      razonSocial: datos.razonSocial,
      folio,
      contactoId,
    },
    correlationId,
  );

  return { exito: true, datos: { id: clienteId, folio } };
}
