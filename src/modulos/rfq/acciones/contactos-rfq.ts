'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import {
  esquemaAsegurarContactoRfq,
  esquemaObtenerContactoPrincipalRfq,
} from '../validaciones/esquemas-rfq';

/** Datos de contacto que el cliente ya trae en su ficha (para sugerirlos en el RFQ). */
export type ContactoPrincipalClienteRfq = {
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
};

/**
 * Server Action: lee nombre/correo/teléfono del cliente para sugerir el contacto
 * de la Solicitud del RFQ. Devuelve null cuando el cliente no tiene ningún dato.
 */
export async function obtenerContactoPrincipalRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ContactoPrincipalClienteRfq | null>> {
  const resultado = esquemaObtenerContactoPrincipalRfq.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_vista'))) {
    return { exito: false, error: 'Sin permiso para ver RFQ' };
  }

  const { data, error } = await crearClienteSupabaseAdmin()
    .from('clientes')
    .select('contacto, correo, telefono')
    .eq('id', resultado.data.clienteId)
    .maybeSingle();
  if (error || !data) {
    return { exito: true, datos: null };
  }

  const nombre = data.contacto?.trim() || null;
  const correo = data.correo?.trim() || null;
  const telefono = data.telefono?.trim() || null;
  if (nombre === null && correo === null && telefono === null) {
    return { exito: true, datos: null };
  }
  return { exito: true, datos: { nombre, correo, telefono } };
}

/**
 * Server Action: garantiza una fila vigente en `contactos_cliente` para el
 * contacto elegido en la Solicitud (el gate LISTO exige contacto vigente). Si ya
 * existe uno activo con los mismos datos lo reutiliza; si no, lo crea.
 */
export async function asegurarContactoRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const resultado = esquemaAsegurarContactoRfq.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_editar'))) {
    return { exito: false, error: 'Sin permiso para editar el RFQ' };
  }

  const { clienteId, nombre } = resultado.data;
  const correo = resultado.data.correo?.trim() || null;
  const telefono = resultado.data.telefono?.trim() || null;
  const admin = crearClienteSupabaseAdmin();

  const { data: cliente } = await admin
    .from('clientes')
    .select('id')
    .eq('id', clienteId)
    .maybeSingle();
  if (!cliente) {
    return { exito: false, error: 'El cliente no existe' };
  }

  const { data: existentes, error: errorContactos } = await admin
    .from('contactos_cliente')
    .select('id, nombre, correo, telefono')
    .eq('cliente_id', clienteId)
    .eq('activo', true);
  if (errorContactos) {
    return { exito: false, error: 'No se pudieron revisar los contactos del cliente' };
  }

  const nombreComparable = nombre.trim().toLowerCase();
  const existente = (existentes ?? []).find(
    (contacto) =>
      contacto.nombre.trim().toLowerCase() === nombreComparable &&
      (contacto.correo ?? '').trim().toLowerCase() === (correo ?? '').toLowerCase() &&
      (contacto.telefono ?? '').trim() === (telefono ?? ''),
  );
  if (existente) {
    return { exito: true, datos: { id: existente.id } };
  }

  const { data: creado, error: errorAlta } = await admin
    .from('contactos_cliente')
    .insert({
      cliente_id: clienteId,
      nombre: nombre.trim(),
      correo,
      telefono,
      es_principal: false,
      creado_por: usuario.id,
    })
    .select('id')
    .single();
  if (errorAlta || !creado) {
    return { exito: false, error: 'No se pudo crear el contacto del cliente' };
  }

  await registrarLog(usuario, 'crear', 'clientes', clienteId, {
    contactoId: creado.id,
    origen: 'rfq_solicitud',
  });
  return { exito: true, datos: { id: creado.id } };
}
