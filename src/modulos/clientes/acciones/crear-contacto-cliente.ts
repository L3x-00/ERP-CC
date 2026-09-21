'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaCrearContactoCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Alta de un contacto adicional del cliente (OBS-02). Escribe con service_role
 * tras verificar `ver_clientes`; las cadenas vacías se guardan como null. El
 * índice parcial de la base rechaza un segundo contacto principal.
 */
export async function crearContactoClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const analisis = esquemaCrearContactoCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_clientes'))) {
    return { exito: false, error: 'Sin permiso para editar clientes' };
  }

  const datos = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin
    .from('contactos_cliente')
    .insert({
      cliente_id: datos.clienteId,
      nombre: datos.nombre,
      puesto: datos.puesto ? datos.puesto : null,
      correo: datos.correo ? datos.correo : null,
      telefono: datos.telefono ? datos.telefono : null,
      notas: datos.notas ? datos.notas : null,
      es_principal: datos.esPrincipal,
      creado_por: usuario.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (error?.message.includes('ux_contactos_cliente_principal')) {
      return { exito: false, error: 'Ya existe un contacto principal para este cliente' };
    }
    console.error('[CLIENTES] Error al crear contacto:', error);
    return { exito: false, error: 'No se pudo guardar el contacto' };
  }

  await registrarLog(usuario, 'crear_contacto_cliente', 'clientes', datos.clienteId, {
    contactoId: data.id,
    esPrincipal: datos.esPrincipal,
  });

  return { exito: true, datos: { id: data.id } };
}
