import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { filaAOportunidad } from '@/modulos/pipeline/tipos/indice';
import type { EtapaPipeline, FilaPipeline, Oportunidad } from '@/modulos/pipeline/tipos/indice';

/** Redondea a 2 decimales evitando el error de flotante. */
function redondear2(cantidad: number): number {
  return Math.round((cantidad + Number.EPSILON) * 100) / 100;
}

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
  // RFQ-14: se embeben las líneas (solo cantidad y precio) para calcular el
  // subtotal por oportunidad sin una consulta extra por fila. RLS de
  // `cotizacion_lineas` hereda el alcance de la oportunidad padre, así que el
  // conjunto embebido coincide con lo que el usuario puede ver.
  let consulta = cliente
    .from('pipeline')
    .select('*, cotizacion_lineas(cantidad, precio_unitario)');

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
  return (data ?? []).map((fila) => {
    const { cotizacion_lineas: lineas, ...base } = fila;
    const importeSubtotal = redondear2(
      (lineas ?? []).reduce(
        (suma, linea) => suma + Number(linea.cantidad) * Number(linea.precio_unitario),
        0,
      ),
    );
    return { ...filaAOportunidad(base as FilaPipeline), importeSubtotal };
  });
}
