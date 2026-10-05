'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaCrearContactoCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Alta de un contacto adicional del cliente (OBS-02/SII-B2.3). Escribe con
 * service_role tras verificar `cliente_editar`; las cadenas vacías se guardan
 * como null.
 *
 * Si el contacto se marca principal, primero se inserta como no principal y
 * luego la RPC `marcar_contacto_principal` retira al anterior y lo promueve en
 * una transacción (nunca queda más de un principal activo). Si esa promoción
 * falla, se retira la fila recién creada para no dejar basura.
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
  if (!(await can(usuario, 'cliente_editar'))) {
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
      es_principal: false,
      creado_por: usuario.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[CLIENTES] Error al crear contacto:', error);
    return { exito: false, error: 'No se pudo guardar el contacto' };
  }

  if (datos.esPrincipal) {
    const { error: errorPrincipal } = await admin.rpc('marcar_contacto_principal', {
      p_contacto_id: data.id,
      p_cliente_id: datos.clienteId,
      p_actor: usuario.id,
    });
    if (errorPrincipal) {
      // Compensación: la fila recién creada no se conserva si no pudo quedar
      // como principal (evita contactos "fantasma" tras un error de promoción).
      await admin.from('contactos_cliente').delete().eq('id', data.id);
      console.error('[CLIENTES] Error al marcar principal:', errorPrincipal.message);
      return { exito: false, error: 'No se pudo marcar el contacto como principal' };
    }
  }

  await registrarLog(
    usuario,
    'crear_contacto_cliente',
    'clientes',
    datos.clienteId,
    {
      contactoId: data.id,
      esPrincipal: datos.esPrincipal,
    },
    nuevoCorrelationId(),
  );

  return { exito: true, datos: { id: data.id } };
}
