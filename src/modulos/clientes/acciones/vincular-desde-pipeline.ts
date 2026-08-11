'use server';

import { z } from 'zod';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { promoverAClienteSiNoExiste } from '@/modulos/pipeline/servicios/promover-a-cliente';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

const esquema = z.object({ oportunidadId: z.uuid('Identificador inválido') });

/**
 * Vincula una oportunidad del pipeline con un cliente del módulo de Clientes:
 * promueve (o localiza y enriquece) el cliente y liga `pipeline.cliente_id` si
 * aún no lo estaba.
 *
 * Reutiliza `promoverAClienteSiNoExiste` (Fase 2), que deduplica por RFC / razón
 * social / correo y rellena solo campos vacíos: no duplica ni pierde datos. Es el
 * punto de integración explícito Pipeline→Clientes para flujos distintos a
 * `marcar-ganada` (p. ej. re-vincular manualmente). Escritura con service_role.
 */
export async function vincularDesdePipelineAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ clienteId: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await can(usuario, 'ver_clientes'))) {
    return { exito: false, error: 'Sin permiso para vincular clientes' };
  }

  const admin = crearClienteSupabaseAdmin();

  const cargada = await obtenerOportunidadPorId(admin, analisis.data.oportunidadId);
  if (!cargada) {
    return { exito: false, error: 'Oportunidad no encontrada' };
  }
  const op = cargada.oportunidad;

  let clienteId: string;
  try {
    clienteId = await promoverAClienteSiNoExiste(admin, {
      nombreComercial: op.empresa,
      razonSocial: op.empresa,
      contacto: op.nombreContacto,
      correo: op.correo,
      telefono: op.telefono,
    });
  } catch {
    return { exito: false, error: 'No se pudo registrar el cliente' };
  }

  // Ligar la oportunidad al cliente solo si no estaba ligada (no piso un vínculo
  // previo). Escritura de columna controlada vía admin (trigger la protege).
  if (op.clienteId === null) {
    const { error } = await admin
      .from('pipeline')
      .update({ cliente_id: clienteId })
      .eq('id', op.id);
    if (error) {
      return { exito: false, error: 'No se pudo vincular la oportunidad' };
    }
  }

  await registrarLog(usuario, 'vincular_pipeline', 'clientes', clienteId, {
    oportunidadId: op.id,
  });

  return { exito: true, datos: { clienteId } };
}
