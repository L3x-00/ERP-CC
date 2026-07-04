'use server';

import type { RespuestaAccion, ResultadoPaginado } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

import { filaALog, type FilaLog, type Log } from '../tipos/indice';
import { esquemaFiltrosLog } from '../validaciones/esquemas-logs';

/**
 * Server Action: consulta paginada de logs de auditoría con filtros opcionales.
 * Usa el cliente de servidor con la sesión del usuario: RLS decide qué
 * registros ve cada quién (admin ve todo; el resto solo sus propios logs).
 * Además, como defensa en profundidad (no depender solo de RLS), exige
 * sesión y fuerza `usuarioId` al propio usuario si no es admin.
 *
 * @param filtros - Filtros sin validar (usuarioId, modulo, accion, desde, hasta, pagina, porPagina).
 * @returns Resultado paginado de logs ordenados del más reciente al más antiguo.
 */
export async function obtenerLogsAccion(
  filtros: unknown,
): Promise<RespuestaAccion<ResultadoPaginado<Log>>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const resultado = esquemaFiltrosLog.safeParse(filtros ?? {});
  if (!resultado.success) {
    return { exito: false, error: 'Filtros inválidos' };
  }

  const { modulo, accion, desde, hasta, pagina, porPagina } = resultado.data;
  const usuarioId = usuario.rol === 'admin' ? resultado.data.usuarioId : usuario.id;

  const cliente = await crearClienteSupabaseServidor();
  let consulta = cliente.from('logs').select('*', { count: 'exact' });

  if (usuarioId) {
    consulta = consulta.eq('usuario_id', usuarioId);
  }
  if (modulo) {
    consulta = consulta.eq('modulo', modulo);
  }
  if (accion) {
    consulta = consulta.eq('accion', accion);
  }
  if (desde) {
    consulta = consulta.gte('creado_en', desde);
  }
  if (hasta) {
    consulta = consulta.lte('creado_en', hasta);
  }

  const indiceInicial = (pagina - 1) * porPagina;
  const { data, error, count } = await consulta
    .order('creado_en', { ascending: false })
    .range(indiceInicial, indiceInicial + porPagina - 1);

  if (error) {
    console.error('[AUDITORIA] Error al consultar logs:', error.message);
    return { exito: false, error: 'No se pudieron obtener los logs' };
  }

  const registros = ((data ?? []) as FilaLog[]).map(filaALog);

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
