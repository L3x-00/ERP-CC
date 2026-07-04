import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { filaAOportunidad } from '@/modulos/pipeline/tipos/indice';
import type { EtapaPipeline, Oportunidad } from '@/modulos/pipeline/tipos/indice';

/** Filtros opcionales para listar oportunidades del pipeline. */
export type FiltrosPipeline = {
  etapa?: EtapaPipeline;
  vendedorId?: string;
  busqueda?: string;
};

/**
 * Lista las oportunidades del pipeline visibles para el usuario actual.
 *
 * El alcance real lo decide RLS (vendedor propietario, permiso de equipo o
 * admin); por eso no se fuerza `vendedor_id` salvo que llegue como filtro
 * explícito. La búsqueda cubre empresa y nombre del contacto.
 *
 * @param cliente Cliente Supabase (servidor o navegador).
 * @param filtros Filtros opcionales por etapa, vendedor o texto.
 * @returns Oportunidades ordenadas por última actualización (descendente).
 * @throws Error si la consulta falla.
 */
export async function obtenerOportunidades(
  cliente: SupabaseClient<Database>,
  filtros?: FiltrosPipeline,
): Promise<Oportunidad[]> {
  let consulta = cliente.from('pipeline').select('*');

  if (filtros?.etapa) {
    consulta = consulta.eq('etapa', filtros.etapa);
  }
  if (filtros?.vendedorId) {
    consulta = consulta.eq('vendedor_id', filtros.vendedorId);
  }
  if (filtros?.busqueda) {
    // El string de `.or()` de PostgREST usa `, ( ) " %` como sintaxis; sin
    // neutralizarlos, un término del usuario podría inyectar condiciones de
    // filtro. Se eliminan (RLS acota el alcance, pero esto evita la inyección).
    const termino = filtros.busqueda.replace(/[%,()"*\\]/g, ' ').trim();
    if (termino) {
      consulta = consulta.or(
        `empresa.ilike.%${termino}%,nombre_contacto.ilike.%${termino}%`,
      );
    }
  }

  const { data, error } = await consulta.order('actualizado_en', {
    ascending: false,
  });
  if (error) {
    throw new Error('No se pudieron cargar las oportunidades');
  }
  return (data ?? []).map(filaAOportunidad);
}
