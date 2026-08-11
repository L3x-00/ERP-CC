'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { esquemaActualizarCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';
import type { Database } from '@/compartido/tipos/supabase';

type ActualizacionCliente = Database['public']['Tables']['clientes']['Update'];

/**
 * Actualiza campos de un cliente existente (edición parcial).
 *
 * Solo se escriben las columnas presentes en la entrada. El tier y su caducidad
 * NO se tocan aquí: se gestionan en `asignar-tier-manual`. Escritura con
 * service_role tras verificar `can('ver_clientes')`.
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

  if (!(await can(usuario, 'ver_clientes'))) {
    return { exito: false, error: 'Sin permiso para editar clientes' };
  }

  const { id, ...cambios } = analisis.data;

  // Solo se incluyen columnas realmente presentes en la entrada (edición parcial).
  const parche: ActualizacionCliente = {};
  if (cambios.razonSocial !== undefined) parche.razon_social = cambios.razonSocial;
  if (cambios.nombreComercial !== undefined) parche.nombre_comercial = cambios.nombreComercial;
  if (cambios.rfc !== undefined) parche.rfc = cambios.rfc ? cambios.rfc : null;
  if (cambios.contacto !== undefined) parche.contacto = cambios.contacto ?? null;
  if (cambios.correo !== undefined) parche.correo = cambios.correo ? cambios.correo.toLowerCase() : null;
  if (cambios.telefono !== undefined) parche.telefono = cambios.telefono ?? null;
  if (cambios.condicionesPago !== undefined) parche.condiciones_pago = cambios.condicionesPago ?? null;
  if (cambios.limiteCredito !== undefined) parche.limite_credito = cambios.limiteCredito;
  if (cambios.estado !== undefined) parche.estado = cambios.estado;
  if (cambios.direccionFiscal !== undefined) {
    parche.direccion_fiscal = (cambios.direccionFiscal ?? null) as Json | null;
  }
  if (cambios.direccionEnvio !== undefined) {
    parche.direccion_envio = (cambios.direccionEnvio ?? null) as Json | null;
  }

  if (Object.keys(parche).length === 0) {
    return { exito: false, error: 'Sin cambios' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin.from('clientes').update(parche).eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { exito: false, error: 'Ya existe un cliente con ese RFC o razón social' };
    }
    return { exito: false, error: 'No se pudo actualizar el cliente' };
  }

  await registrarLog(usuario, 'actualizar', 'clientes', id, {
    campos: Object.keys(parche),
  });

  return { exito: true, datos: { id } };
}
