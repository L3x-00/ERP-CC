'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { esquemaActualizarCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import { resolverCredito } from '@/modulos/clientes/servicios/condiciones-comerciales';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';
import type { Database } from '@/compartido/tipos/supabase';

type ActualizacionCliente = Database['public']['Tables']['clientes']['Update'];

/**
 * Actualiza campos de un cliente existente (edición parcial).
 *
 * Solo se escriben las columnas presentes en la entrada. El tier y su caducidad
 * NO se tocan aquí (los gestiona `asignar-tier-manual`) y el estado tampoco:
 * cambia solo por `cambiar-estado-cliente`. Las condiciones comerciales
 * (moneda/crédito/días) se sincronizan con `condiciones_pago`; los días exigen
 * `cliente_comercial` y el límite `ver_finanzas`. Escritura con service_role.
 */
export async function actualizarClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaActualizarCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await can(usuario, 'cliente_editar'))) {
    return { exito: false, error: 'Sin permiso para editar clientes' };
  }

  const { id, contactoPrincipal, ...cambios } = analisis.data;

  // Días de crédito: solo Management/Admin (SII-B2.4).
  const tocaCredito =
    cambios.creditoHabilitado !== undefined || cambios.diasCredito !== undefined;
  if (tocaCredito && !(await can(usuario, 'cliente_comercial'))) {
    return { exito: false, error: 'Sin permiso para modificar condiciones de crédito' };
  }

  // El límite de crédito es una decisión financiera.
  if (cambios.limiteCredito !== undefined && !(await can(usuario, 'ver_finanzas'))) {
    return { exito: false, error: 'Sin permiso para asignar límite de crédito' };
  }

  let comercial: ReturnType<typeof resolverCredito> = null;
  try {
    comercial = resolverCredito({
      creditoHabilitado: cambios.creditoHabilitado,
      diasCredito: cambios.diasCredito,
      condicionesPago: cambios.condicionesPago,
    });
  } catch (error) {
    const requeridos =
      error instanceof RangeError && error.message === 'dias_credito_requeridos';
    return {
      exito: false,
      error: requeridos ? 'Indica los días de crédito del cliente' : 'Días de crédito inválidos',
    };
  }

  // Solo se incluyen columnas realmente presentes en la entrada (edición parcial).
  const parche: ActualizacionCliente = {};
  if (cambios.razonSocial !== undefined) parche.razon_social = cambios.razonSocial;
  if (cambios.nombreComercial !== undefined) parche.nombre_comercial = cambios.nombreComercial;
  if (cambios.rfc !== undefined) parche.rfc = cambios.rfc ? cambios.rfc : null;
  if (cambios.contacto !== undefined) parche.contacto = cambios.contacto ?? null;
  if (cambios.correo !== undefined) parche.correo = cambios.correo ? cambios.correo.toLowerCase() : null;
  if (cambios.telefono !== undefined) parche.telefono = cambios.telefono ?? null;
  if (cambios.limiteCredito !== undefined) parche.limite_credito = cambios.limiteCredito;
  if (cambios.moneda !== undefined) parche.moneda = cambios.moneda;
  if (comercial) {
    parche.credito_habilitado = comercial.creditoHabilitado;
    parche.dias_credito = comercial.diasCredito;
    parche.condiciones_pago = comercial.condicionesPago;
  }
  if (cambios.direccionFiscal !== undefined) {
    parche.direccion_fiscal = (cambios.direccionFiscal ?? null) as Json | null;
  }
  if (cambios.direccionEnvio !== undefined) {
    parche.direccion_envio = (cambios.direccionEnvio ?? null) as Json | null;
  }

  const sincronizaContacto = contactoPrincipal !== undefined;
  if (Object.keys(parche).length === 0 && !sincronizaContacto) {
    return { exito: false, error: 'Sin cambios' };
  }

  const admin = crearClienteSupabaseAdmin();

  // Obs. cliente 2026-10-12: el contacto principal se edita desde el formulario
  // maestro. Si existe principal activo se actualiza; si no, se crea; el nombre
  // se sincroniza en la columna legada `clientes.contacto` (ficha, cobranza, RFQ).
  let resultadoContacto: 'actualizado' | 'creado' | null = null;
  if (sincronizaContacto && contactoPrincipal) {
    const nombreContacto = contactoPrincipal.nombre.trim();
    const datosContacto = {
      nombre: nombreContacto,
      puesto: contactoPrincipal.puesto?.trim() || null,
      correo: contactoPrincipal.correo ? contactoPrincipal.correo.toLowerCase() : null,
      telefono: contactoPrincipal.telefono?.trim() || null,
    };

    const { data: principal, error: errorPrincipal } = await admin
      .from('contactos_cliente')
      .select('id')
      .eq('cliente_id', id)
      .eq('es_principal', true)
      .eq('activo', true)
      .maybeSingle();
    if (errorPrincipal) {
      console.error('[CLIENTES] No se pudo leer el contacto principal:', errorPrincipal.message);
      return { exito: false, error: 'No se pudo actualizar el contacto principal' };
    }

    if (principal) {
      const { error: errorContacto } = await admin
        .from('contactos_cliente')
        .update(datosContacto)
        .eq('id', principal.id);
      if (errorContacto) {
        console.error('[CLIENTES] No se pudo actualizar el contacto principal:', errorContacto.message);
        return { exito: false, error: 'No se pudo actualizar el contacto principal' };
      }
      resultadoContacto = 'actualizado';
    } else {
      const { error: errorContacto } = await admin.from('contactos_cliente').insert({
        cliente_id: id,
        ...datosContacto,
        es_principal: true,
        activo: true,
        creado_por: usuario.id,
      });
      if (errorContacto) {
        console.error('[CLIENTES] No se pudo crear el contacto principal:', errorContacto.message);
        return { exito: false, error: 'No se pudo crear el contacto principal' };
      }
      resultadoContacto = 'creado';
    }

    parche.contacto = nombreContacto;
  }

  if (Object.keys(parche).length === 0) {
    return { exito: false, error: 'Sin cambios' };
  }

  const { error } = await admin.from('clientes').update(parche).eq('id', id);

  if (error) {
    if (error.code === '23505') {
      console.error('[CLIENTES] Actualización rechazada por duplicado:', error.message);
    }
    return { exito: false, error: 'No se pudo actualizar el cliente' };
  }

  await registrarLog(
    usuario,
    'actualizar',
    'clientes',
    id,
    {
      campos: Object.keys(parche),
      ...(resultadoContacto ? { contactoPrincipal: resultadoContacto } : {}),
    },
    nuevoCorrelationId(),
  );

  return { exito: true, datos: { id } };
}
