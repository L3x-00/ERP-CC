'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquemaAsignarProcesos = z
  .object({
    grupoId: z.uuid('Grupo inválido'),
    procesoIds: z.array(z.uuid('Proceso inválido')).max(100, 'Demasiados procesos'),
  })
  .strict();

/**
 * Aclaración cliente 2026-11-06 (punto 11): desde el alta guiada del grupo se
 * vinculan los procesos compatibles. No toca `grupo_planeado_id`: esa capa
 * sigue siendo opcional y solo de Planeación.
 */
export async function asignarProcesosAGrupoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ procesos: number }>> {
  const analisis = esquemaAsignarProcesos.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const { data, error } = await crearClienteSupabaseAdmin().rpc('asignar_procesos_a_grupo_equipo', {
    p_grupo_id: analisis.data.grupoId,
    p_proceso_ids: analisis.data.procesoIds,
    p_actor_id: usuario.id,
  });
  if (error) {
    console.error('[CATALOGOS] Error al vincular procesos al grupo:', error.message);
    return { exito: false, error: 'No se pudieron vincular los procesos al grupo' };
  }
  return { exito: true, datos: { procesos: Number(data ?? 0) } };
}
