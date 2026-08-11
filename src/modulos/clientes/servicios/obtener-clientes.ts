import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { ResultadoPaginado } from '@/compartido/tipos/indice';
import {
  filaACliente,
  type Cliente,
  type EstadoCliente,
  type TierCliente,
} from '@/modulos/clientes/tipos/indice';

/** Clientes por página en la lista principal (regla de negocio Fase 3). */
export const CLIENTES_POR_PAGINA = 25;

/** Filtros de la lista de clientes. */
export type FiltrosClientes = {
  estado?: EstadoCliente;
  tier?: TierCliente;
  /** Texto libre: razón social, nombre comercial o RFC. */
  busqueda?: string;
  pagina?: number;
};

/**
 * Lista clientes paginados y ordenados alfabéticamente (A-Z por razón social).
 *
 * El alcance de lectura lo impone RLS (`ver_clientes` o admin). La búsqueda
 * cubre razón social, nombre comercial y RFC. Página de `CLIENTES_POR_PAGINA`.
 *
 * @param cliente Cliente Supabase (servidor o navegador).
 * @param filtros Estado, tier, búsqueda y página (1-based).
 * @returns Registros de la página, total global y metadatos de paginación.
 * @throws Error si la consulta falla.
 */
export async function obtenerClientes(
  cliente: SupabaseClient<Database>,
  filtros?: FiltrosClientes,
): Promise<ResultadoPaginado<Cliente>> {
  const pagina = Math.max(1, filtros?.pagina ?? 1);
  const desde = (pagina - 1) * CLIENTES_POR_PAGINA;
  const hasta = desde + CLIENTES_POR_PAGINA - 1;

  let consulta = cliente.from('clientes').select('*', { count: 'exact' });

  if (filtros?.estado) {
    consulta = consulta.eq('estado', filtros.estado);
  }
  if (filtros?.tier) {
    consulta = consulta.eq('tier', filtros.tier);
  }
  if (filtros?.busqueda) {
    // Neutraliza la sintaxis de `.or()` de PostgREST (`, ( ) " % *`) para que un
    // término del usuario no inyecte condiciones de filtro (RLS acota, pero
    // esto cierra la inyección de todos modos).
    const termino = filtros.busqueda.replace(/[%,()"*\\]/g, ' ').trim();
    if (termino) {
      consulta = consulta.or(
        `razon_social.ilike.%${termino}%,nombre_comercial.ilike.%${termino}%,rfc.ilike.%${termino}%`,
      );
    }
  }

  const { data, error, count } = await consulta
    .order('razon_social', { ascending: true })
    .range(desde, hasta);

  if (error) {
    throw new Error('No se pudieron cargar los clientes');
  }

  return {
    registros: (data ?? []).map(filaACliente),
    total: count ?? 0,
    pagina,
    porPagina: CLIENTES_POR_PAGINA,
  };
}
