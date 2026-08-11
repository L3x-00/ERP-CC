'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { esquemaCrearCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';

/**
 * Crea un cliente nuevo.
 *
 * Flujo estándar: auth → Zod → `can('ver_clientes')` → insert con cliente admin
 * → auditoría. La escritura usa service_role (no hay políticas de INSERT para
 * `authenticated`; la autorización se hace aquí). La deduplicación real la
 * garantizan los índices únicos (rfc / lower(razon_social) / lower(correo)): un
 * choque devuelve un error genérico, sin revelar cuál campo duplicó.
 */
export async function crearClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaCrearCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await can(usuario, 'ver_clientes'))) {
    return { exito: false, error: 'Sin permiso para crear clientes' };
  }

  const datos = analisis.data;
  const admin = crearClienteSupabaseAdmin();

  const { data: fila, error } = await admin
    .from('clientes')
    .insert({
      razon_social: datos.razonSocial,
      nombre_comercial: datos.nombreComercial,
      rfc: datos.rfc ? datos.rfc : null,
      contacto: datos.contacto ?? null,
      correo: datos.correo ? datos.correo.toLowerCase() : null,
      telefono: datos.telefono ?? null,
      condiciones_pago: datos.condicionesPago ?? null,
      limite_credito: datos.limiteCredito,
      estado: datos.estado,
      direccion_fiscal: (datos.direccionFiscal ?? null) as Json | null,
      direccion_envio: (datos.direccionEnvio ?? null) as Json | null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { exito: false, error: 'Ya existe un cliente con ese RFC o razón social' };
    }
    return { exito: false, error: 'No se pudo crear el cliente' };
  }
  if (!fila) {
    return { exito: false, error: 'No se pudo crear el cliente' };
  }

  await registrarLog(usuario, 'crear', 'clientes', fila.id, {
    razonSocial: datos.razonSocial,
  });

  return { exito: true, datos: { id: fila.id } };
}
