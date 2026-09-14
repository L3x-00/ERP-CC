import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaACotizacionHistorial,
  filaALineaCotizacionHistorial,
  filaAOrdenHistorial,
  filaAPartidaOrdenHistorial,
  type CotizacionHistorial,
  type LineaCotizacionHistorial,
  type OrdenHistorial,
  type PaginaHistorial,
  type PartidaOrdenHistorial,
} from '@/modulos/clientes/tipos/historial';

/** Cotizaciones por página en el historial de la ficha del cliente. */
export const COTIZACIONES_HISTORIAL_POR_PAGINA = 5;

/** Órdenes por página en el historial de la ficha del cliente. */
export const ORDENES_HISTORIAL_POR_PAGINA = 5;

/** Rango `[desde, hasta]` de PostgREST para una página 1-based. */
function rango(pagina: number, porPagina: number): { desde: number; hasta: number } {
  const paginaSegura = Math.max(1, Math.trunc(pagina));
  const desde = (paginaSegura - 1) * porPagina;
  return { desde, hasta: desde + porPagina - 1 };
}

/**
 * Cotizaciones (oportunidades) del cliente, más recientes primero.
 *
 * El filtro por cliente se aplica en el servidor (`cliente_id`), nunca en la UI.
 * Se usa el cliente Supabase del usuario: si RLS de `pipeline` no autoriza al
 * lector (solo el vendedor dueño, admin o `ver_pipeline_equipo`), la consulta
 * devuelve cero filas sin error, y la vista lo muestra como historial vacío.
 * Las líneas se leen en una segunda consulta acotada a los IDs de la página;
 * si esa lectura falla o RLS la bloquea, `lineas` queda en `null` (desconocido)
 * en lugar de fingir una cotización sin partidas.
 *
 * @param cliente Cliente Supabase (servidor o navegador), nunca service role.
 * @param clienteId Cliente dueño del historial.
 * @param pagina Página 1-based.
 * @returns Página de cotizaciones con total real.
 * @throws Error si la consulta de cotizaciones falla.
 */
export async function obtenerCotizacionesCliente(
  cliente: SupabaseClient<Database>,
  clienteId: string,
  pagina = 1,
): Promise<PaginaHistorial<CotizacionHistorial>> {
  const { desde, hasta } = rango(pagina, COTIZACIONES_HISTORIAL_POR_PAGINA);

  const { data, error, count } = await cliente
    .from('pipeline')
    .select('id,folio_op,folio_cnc,etapa,moneda,iva_porcentaje,fecha_envio_cotizacion,creado_en,actualizado_en', { count: 'exact' })
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, hasta);

  if (error) {
    throw new Error('No se pudo cargar el historial de cotizaciones');
  }

  const filas = data ?? [];
  const lineasPorCotizacion = await obtenerLineasPorCotizacion(
    cliente,
    filas.map((fila) => fila.id),
  );

  return {
    registros: filas.map((fila) =>
      filaACotizacionHistorial(fila, lineasPorCotizacion?.get(fila.id) ?? null),
    ),
    total: count ?? 0,
    pagina: Math.max(1, Math.trunc(pagina)),
    porPagina: COTIZACIONES_HISTORIAL_POR_PAGINA,
  };
}

/**
 * Líneas de las cotizaciones indicadas, agrupadas por `pipeline_id`.
 * Devuelve `null` si la lectura falla (RLS o error) para distinguir
 * "sin líneas" de "no legibles".
 */
async function obtenerLineasPorCotizacion(
  cliente: SupabaseClient<Database>,
  cotizacionIds: string[],
): Promise<Map<string, LineaCotizacionHistorial[]> | null> {
  if (cotizacionIds.length === 0) {
    return new Map();
  }

  const agrupadas = new Map<string, LineaCotizacionHistorial[]>();
  for (const id of cotizacionIds) agrupadas.set(id, []);
  const porPagina = 200;
  let desde = 0;
  for (;;) {
    const { data, error, count } = await cliente
      .from('cotizacion_lineas')
      .select('id,pipeline_id,descripcion,cantidad,material,espesor,area,procesos,precio_unitario,orden', { count: 'exact' })
      .in('pipeline_id', cotizacionIds)
      .order('orden', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + porPagina - 1);
    if (error) return null;
    const filas = data ?? [];
    for (const fila of filas) agrupadas.get(fila.pipeline_id)?.push(filaALineaCotizacionHistorial(fila));
    desde += filas.length;
    if (count !== null && count !== undefined ? desde >= count : filas.length < porPagina) break;
    // Una página vacía antes del total conocido no equivale a un detalle completo.
    if (filas.length === 0) return null;
  }
  return agrupadas;
}

/**
 * Órdenes de producción del cliente, más recientes primero.
 *
 * Solo campos de seguimiento (folio, estado, fechas) y partidas técnicas; no se
 * leen importes ni cuentas por cobrar, que `ver_clientes` no autoriza.
 *
 * @param cliente Cliente Supabase (servidor o navegador), nunca service role.
 * @param clienteId Cliente dueño del historial.
 * @param pagina Página 1-based.
 * @returns Página de órdenes con total real.
 * @throws Error si la consulta de órdenes falla.
 */
export async function obtenerOrdenesCliente(
  cliente: SupabaseClient<Database>,
  clienteId: string,
  pagina = 1,
): Promise<PaginaHistorial<OrdenHistorial>> {
  const { desde, hasta } = rango(pagina, ORDENES_HISTORIAL_POR_PAGINA);

  const { data, error, count } = await cliente
    .from('ordenes_produccion')
    .select('id,folio,estado,prioridad,cotizacion_id,fecha_compromiso,fecha_inicio,fecha_fin,creado_en', { count: 'exact' })
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, hasta);

  if (error) {
    throw new Error('No se pudo cargar el historial de órdenes');
  }

  const filas = data ?? [];
  const partidasPorOrden = await obtenerPartidasPorOrden(
    cliente,
    filas.map((fila) => fila.id),
  );

  return {
    registros: filas.map((fila) =>
      filaAOrdenHistorial(fila, partidasPorOrden?.get(fila.id) ?? null),
    ),
    total: count ?? 0,
    pagina: Math.max(1, Math.trunc(pagina)),
    porPagina: ORDENES_HISTORIAL_POR_PAGINA,
  };
}

/**
 * Partidas de las órdenes indicadas, agrupadas por `orden_id`.
 * Devuelve `null` si la lectura falla, igual que las líneas de cotización.
 */
async function obtenerPartidasPorOrden(
  cliente: SupabaseClient<Database>,
  ordenIds: string[],
): Promise<Map<string, PartidaOrdenHistorial[]> | null> {
  if (ordenIds.length === 0) {
    return new Map();
  }

  const agrupadas = new Map<string, PartidaOrdenHistorial[]>();
  for (const id of ordenIds) agrupadas.set(id, []);
  const porPagina = 200;
  let desde = 0;
  for (;;) {
    const { data, error, count } = await cliente
      .from('partidas_orden_produccion')
      .select('id,orden_id,codigo_pieza,descripcion,cantidad_solicitada,cantidad_producida,cantidad_scrap,unidad_medida,maquina_asignada,tiempo_estimado_minutos,tiempo_real_minutos', { count: 'exact' })
      .in('orden_id', ordenIds)
      .order('codigo_pieza', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + porPagina - 1);
    if (error) return null;
    const filas = data ?? [];
    for (const fila of filas) agrupadas.get(fila.orden_id)?.push(filaAPartidaOrdenHistorial(fila));
    desde += filas.length;
    if (count !== null && count !== undefined ? desde >= count : filas.length < porPagina) break;
    // Una página vacía antes del total conocido no equivale a un detalle completo.
    if (filas.length === 0) return null;
  }
  return agrupadas;
}
