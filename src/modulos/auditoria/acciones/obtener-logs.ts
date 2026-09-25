'use server';

import type { RespuestaAccion, ResultadoPaginado } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

import { filaALog, type FilaLog, type Log } from '../tipos/indice';
import { esquemaFiltrosLog } from '../validaciones/esquemas-logs';

/**
 * Server Action: consulta paginada de logs de auditoría con filtros opcionales.
 * El historial administrativo requiere rol admin activo; RLS agrega una
 * barrera independiente. Solo selecciona columnas de presentación: los
 * detalles JSONB pueden contener información sensible y no salen al cliente.
 *
 * @param filtros - Filtros sin validar; incluye corte estable para páginas históricas.
 * @returns Resultado paginado de logs ordenados del más reciente al más antiguo.
 */
export async function obtenerLogsAccion(
  filtros: unknown,
): Promise<RespuestaAccion<ResultadoPaginado<Log>>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (usuario.rol !== 'admin' || !usuario.activo) {
    return { exito: false, error: 'Solo administradores pueden consultar la bitácora' };
  }

  const resultado = esquemaFiltrosLog.safeParse(filtros ?? {});
  if (!resultado.success) {
    return { exito: false, error: 'Filtros inválidos' };
  }

  const { modulo, accion, actor, recursoId, desde, hasta, corte, pagina, porPagina, usuarioId } = resultado.data;

  const cliente = await crearClienteSupabaseServidor();
  let consulta = cliente.from('logs')
    .select('id, usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, creado_en', { count: 'exact' });

  if (usuarioId) {
    consulta = consulta.eq('usuario_id', usuarioId);
  }
  if (modulo) {
    consulta = consulta.eq('modulo', modulo);
  }
  if (accion) {
    consulta = consulta.eq('accion', accion);
  }
  if (actor) consulta = consulta.ilike('nombre_usuario', `%${actor.replace(/[\\%_]/g, '\\$&')}%`);
  if (recursoId) consulta = consulta.eq('recurso_id', recursoId);
  if (desde) {
    consulta = consulta.gte('creado_en', desde);
  }
  if (hasta) {
    consulta = consulta.lte('creado_en', hasta);
  }
  if (corte) consulta = consulta.lte('creado_en', corte);

  const indiceInicial = (pagina - 1) * porPagina;
  const { data, error, count } = await consulta
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .range(indiceInicial, indiceInicial + porPagina - 1);

  if (error) {
    console.error('[AUDITORIA] Error al consultar logs:', error.message);
    return { exito: false, error: 'No se pudieron obtener los logs' };
  }

  const registros = (data ?? []).map((fila) => filaALog({ ...fila, detalles: null } as FilaLog));

  return {
    exito: true,
    datos: {
      registros,
      total: count ?? registros.length,
      pagina,
      porPagina,
    },
  };
}
