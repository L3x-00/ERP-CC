'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { esquemaRetirarOportunidad } from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Retira (elimina) una oportunidad sin orden asociada — RFQ-18.
 *
 * Solo procede si la cotización no tiene una orden de producción detrás: una
 * oportunidad 'ganada' ya generó su OP, y además se verifica explícitamente que
 * ninguna orden apunte a esta cotización (`cotizacion_id`). El retiro NO es un
 * sustituto de cancelar una orden en curso. La confirmación la pide la UI.
 *
 * El borrado en cascada de `cotizacion_lineas` lo hace la FK
 * (`ON DELETE CASCADE`); las órdenes que hubieran apuntado aquí quedan con
 * `cotizacion_id` NULL por su FK (`ON DELETE SET NULL`), pero este flujo se
 * rechaza antes si existe alguna. La escritura usa cliente admin tras verificar
 * dueño/admin/`ver_pipeline_equipo` con la carga RLS.
 */
export async function retirarOportunidadAccion(entrada: unknown): Promise<RespuestaAccion> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaRetirarOportunidad.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { id } = analisis.data;

  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, id);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }

  if (
    cargada.oportunidad.vendedorId !== usuario.id &&
    usuario.rol !== 'admin' &&
    !(await can(usuario, 'ver_pipeline_equipo'))
  ) {
    return { exito: false, error: 'No encontrada' };
  }

  if (cargada.oportunidad.etapa === 'ganada') {
    return { exito: false, error: 'La oportunidad tiene una orden asociada; no puede retirarse' };
  }

  const admin = crearClienteSupabaseAdmin();

  // Verificación explícita: ninguna orden debe apuntar a esta cotización.
  const { data: ordenes, error: errorOrden } = await admin
    .from('ordenes_produccion')
    .select('id')
    .eq('cotizacion_id', id)
    .limit(1);
  if (errorOrden) {
    return { exito: false, error: 'No se pudo verificar la orden asociada' };
  }
  if (ordenes && ordenes.length > 0) {
    return { exito: false, error: 'La oportunidad tiene una orden asociada; no puede retirarse' };
  }

  const { error } = await admin.from('pipeline').delete().eq('id', id);
  if (error) {
    return { exito: false, error: 'No se pudo retirar la oportunidad' };
  }

  await registrarLog(usuario, 'retirar_oportunidad', 'pipeline', id, {
    etapa: cargada.oportunidad.etapa,
    folioOp: cargada.oportunidad.folioOp,
  });

  return { exito: true };
}
