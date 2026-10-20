import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';
import {
  filaACotizacionHistorial,
  filaAEventoRevisionHistorial,
  filaALineaCotizacionHistorial,
  filaAOrdenHistorial,
  filaAPartidaOrdenHistorial,
  filaAPropuestaComercialHistorial,
  filaARevisionComercialHistorial,
  type CotizacionHistorial,
  type EventoRevisionHistorial,
  type FilaPropuestaHistorial,
  type LineaCotizacionHistorial,
  type OrdenHistorial,
  type PaginaHistorial,
  type PartidaOrdenHistorial,
  type PropuestaComercialHistorial,
  type PropuestaHistorial,
  type RevisionComercialHistorial,
} from '@/modulos/clientes/tipos/historial';

/** Cotizaciones por página en el historial de la ficha del cliente. */
export const COTIZACIONES_HISTORIAL_POR_PAGINA = 5;

/** Órdenes por página en el historial de la ficha del cliente. */
export const ORDENES_HISTORIAL_POR_PAGINA = 5;

/** Propuestas por página en el historial de la ficha del cliente. */
export const PROPUESTAS_HISTORIAL_POR_PAGINA = 5;

/** Filas que se piden por lectura al recorrer un detalle completo. */
const FILAS_POR_LECTURA = 200;

/** Rango `[desde, hasta]` de PostgREST para una página 1-based. */
function rango(pagina: number, porPagina: number): { desde: number; hasta: number } {
  const paginaSegura = Math.max(1, Math.trunc(pagina));
  const desde = (paginaSegura - 1) * porPagina;
  return { desde, hasta: desde + porPagina - 1 };
}

type LecturaPagina<T> = {
  data: T[] | null;
  error: unknown;
  count?: number | null;
};

/**
 * Recorre todas las páginas de una consulta de detalle. Devuelve `null` si
 * alguna lectura falla (RLS o error) o si una página vacía llega antes del
 * total conocido: en ambos casos el detalle no está completo y no debe
 * presentarse como si lo estuviera.
 */
async function leerTodasLasFilas<T>(
  leerPagina: (desde: number, hasta: number) => PromiseLike<LecturaPagina<T>>,
): Promise<T[] | null> {
  const acumuladas: T[] = [];
  for (;;) {
    const { data, error, count } = await leerPagina(
      acumuladas.length,
      acumuladas.length + FILAS_POR_LECTURA - 1,
    );
    if (error) return null;
    const filas = data ?? [];
    acumuladas.push(...filas);
    if (count !== null && count !== undefined ? acumuladas.length >= count : filas.length < FILAS_POR_LECTURA) {
      return acumuladas;
    }
    if (filas.length === 0) return null;
  }
}

/**
 * Lee por lotes de ids (`.in(ids)` largo provoca 414 en el gateway) y junta el
 * resultado; `null` si algún lote no fue legible.
 */
async function leerPorLotes<T>(
  ids: readonly string[],
  leerLote: (lote: string[]) => Promise<T[] | null>,
): Promise<T[] | null> {
  const todas: T[] = [];
  for (const lote of dividirEnLotes(ids)) {
    const filas = await leerLote(lote);
    if (filas === null) return null;
    todas.push(...filas);
  }
  return todas;
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
 * El importe (`importe`) prioriza la revisión aceptada de la Propuesta del RFQ
 * (solo precios de venta, bajo la RLS de Propuestas) sobre las líneas del
 * cotizador anterior, que se conservan si no hay revisión aceptada. Un RFQ que
 * ya pasó a Propuesta no tiene líneas en el cotizador anterior, así que su
 * importe sale de la revisión vigente. Si la lectura de Propuestas falla no se
 * adivina con el cotizador; ver `resolverImporteCotizacion`.
 *
 * @param cliente Cliente Supabase (servidor o navegador), nunca service role.
 * @param clienteId Cliente dueño del historial.
 * @param pagina Página 1-based.
 * @param opciones.incluirPropuestas `false` cuando el rol no ve Propuestas: no
 *   se consultan y el importe faltante se rotula como no visible. La RLS sigue
 *   siendo la autoridad; este indicador solo evita consultas inútiles y da un
 *   mensaje preciso.
 * @returns Página de cotizaciones con total real.
 * @throws Error si la consulta de cotizaciones falla.
 */
export async function obtenerCotizacionesCliente(
  cliente: SupabaseClient<Database>,
  clienteId: string,
  pagina = 1,
  opciones: { incluirPropuestas?: boolean } = {},
): Promise<PaginaHistorial<CotizacionHistorial>> {
  const { desde, hasta } = rango(pagina, COTIZACIONES_HISTORIAL_POR_PAGINA);

  const { data, error, count } = await cliente
    .from('pipeline')
    .select('id,folio_op,folio_cnc,folio_rfq,estado_rfq,moneda,iva_porcentaje,fecha_envio_cotizacion,creado_en,actualizado_en', { count: 'exact' })
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, hasta);

  if (error) {
    throw new Error('No se pudo cargar el historial de cotizaciones');
  }

  const filas = data ?? [];
  const ids = filas.map((fila) => fila.id);
  const [lineasPorCotizacion, propuestasPorRfq] = await Promise.all([
    obtenerLineasPorCotizacion(cliente, ids),
    opciones.incluirPropuestas === false
      ? Promise.resolve(undefined)
      : obtenerPropuestasPorRfq(cliente, ids),
  ]);

  return {
    registros: filas.map((fila) =>
      filaACotizacionHistorial(
        fila,
        lineasPorCotizacion?.get(fila.id) ?? null,
        propuestasPorRfq === undefined || propuestasPorRfq === null
          ? propuestasPorRfq
          : (propuestasPorRfq.get(fila.id) ?? []),
      ),
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

  const filas = await leerTodasLasFilas((desde, hasta) =>
    cliente
      .from('cotizacion_lineas')
      .select('id,pipeline_id,descripcion,cantidad,material,espesor,area,procesos,precio_unitario,es_descuento,orden', { count: 'exact' })
      .in('pipeline_id', cotizacionIds)
      .order('orden', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, hasta),
  );
  if (filas === null) return null;

  const agrupadas = new Map<string, LineaCotizacionHistorial[]>();
  for (const id of cotizacionIds) agrupadas.set(id, []);
  for (const fila of filas) agrupadas.get(fila.pipeline_id)?.push(filaALineaCotizacionHistorial(fila));
  return agrupadas;
}

/**
 * Propuestas de los RFQ indicados (con revisiones e importe, sin eventos),
 * agrupadas por `rfq_id`. `null` si la lectura de propuestas falla; una
 * revisión o ítems no legibles quedan marcados en la propia propuesta.
 */
async function obtenerPropuestasPorRfq(
  cliente: SupabaseClient<Database>,
  rfqIds: string[],
): Promise<Map<string, PropuestaComercialHistorial[]> | null> {
  if (rfqIds.length === 0) {
    return new Map();
  }

  const filas = await leerTodasLasFilas((desde, hasta) =>
    cliente
      .from('propuestas')
      .select('id,rfq_id,folio_cnc,estado,revision_vigente_id,accepted_revision_id,creado_en,actualizado_en', { count: 'exact' })
      .in('rfq_id', rfqIds)
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, hasta),
  );
  if (filas === null) return null;

  const propuestas = await adjuntarRevisiones(cliente, filas);
  const agrupadas = new Map<string, PropuestaComercialHistorial[]>();
  for (const id of rfqIds) agrupadas.set(id, []);
  for (const propuesta of propuestas) agrupadas.get(propuesta.rfqId)?.push(propuesta);
  return agrupadas;
}

/** Cabecera de propuestas → propuestas con revisiones e importes por revisión. */
async function adjuntarRevisiones(
  cliente: SupabaseClient<Database>,
  filas: FilaPropuestaHistorial[],
): Promise<PropuestaComercialHistorial[]> {
  const revisionesPorPropuesta = await obtenerRevisionesPorPropuesta(
    cliente,
    filas.map((fila) => fila.id),
  );
  return filas.map((fila) =>
    filaAPropuestaComercialHistorial(
      fila,
      revisionesPorPropuesta === null ? null : (revisionesPorPropuesta.get(fila.id) ?? []),
    ),
  );
}

/**
 * Revisiones de las propuestas indicadas, con el importe de cada una calculado
 * a partir de sus ítems. Solo se piden precios de venta y, de la cabecera
 * JSONB, moneda e IVA: nunca costos, ruteo ni la copia de datos del cliente.
 * `null` si las revisiones no son legibles; si lo son pero sus ítems no, cada
 * revisión conserva su identidad y queda sin importe.
 */
async function obtenerRevisionesPorPropuesta(
  cliente: SupabaseClient<Database>,
  propuestaIds: string[],
): Promise<Map<string, RevisionComercialHistorial[]> | null> {
  const agrupadas = new Map<string, RevisionComercialHistorial[]>();
  for (const id of propuestaIds) agrupadas.set(id, []);
  if (propuestaIds.length === 0) return agrupadas;

  const filasRevisiones = await leerPorLotes(propuestaIds, (lote) =>
    leerTodasLasFilas((desde, hasta) =>
      cliente
        .from('propuesta_revisiones')
        .select('id,propuesta_id,letra,folio_revision,estado,motivo_creacion,enviado_en,validada_en,creado_en,actualizado_en,moneda:snapshot_cabecera->>moneda,iva_porcentaje:snapshot_cabecera->>iva_porcentaje', { count: 'exact' })
        .in('propuesta_id', lote)
        .order('letra', { ascending: true })
        .order('id', { ascending: true })
        .range(desde, hasta),
    ),
  );
  if (filasRevisiones === null) return null;

  const filasItems = await leerPorLotes(
    filasRevisiones.map((fila) => fila.id),
    (lote) =>
      leerTodasLasFilas((desde, hasta) =>
        cliente
          .from('propuesta_items')
          .select('id,revision_id,cantidad,precio_unitario,es_descuento,activo', { count: 'exact' })
          .in('revision_id', lote)
          .order('revision_id', { ascending: true })
          .order('id', { ascending: true })
          .range(desde, hasta),
      ),
  );
  const itemsPorRevision = new Map<string, NonNullable<typeof filasItems>>();
  for (const item of filasItems ?? []) {
    const lista = itemsPorRevision.get(item.revision_id);
    if (lista) lista.push(item);
    else itemsPorRevision.set(item.revision_id, [item]);
  }

  for (const fila of filasRevisiones) {
    agrupadas
      .get(fila.propuesta_id)
      ?.push(
        filaARevisionComercialHistorial(
          fila,
          filasItems === null ? null : (itemsPorRevision.get(fila.id) ?? []),
        ),
      );
  }
  return agrupadas;
}

/**
 * Eventos (bitácora de transiciones) de las revisiones indicadas, más recientes
 * primero. `null` si no son legibles, para distinguirlo de una revisión sin eventos.
 */
async function obtenerEventosPorRevision(
  cliente: SupabaseClient<Database>,
  revisionIds: string[],
): Promise<Map<string, EventoRevisionHistorial[]> | null> {
  const agrupados = new Map<string, EventoRevisionHistorial[]>();
  for (const id of revisionIds) agrupados.set(id, []);
  if (revisionIds.length === 0) return agrupados;

  const filas = await leerPorLotes(revisionIds, (lote) =>
    leerTodasLasFilas((desde, hasta) =>
      cliente
        .from('propuesta_revision_eventos')
        .select('id,revision_id,accion,estado_anterior,estado_nuevo,motivo,canal,destino,creado_en', { count: 'exact' })
        .in('revision_id', lote)
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false })
        .range(desde, hasta),
    ),
  );
  if (filas === null) return null;

  for (const fila of filas) agrupados.get(fila.revision_id)?.push(filaAEventoRevisionHistorial(fila));
  return agrupados;
}

/**
 * Propuestas del cliente con sus revisiones y los eventos históricos de cada
 * revisión, más recientes primero.
 *
 * El filtro por cliente es del servidor (`cliente_id`). Se usa el cliente
 * Supabase del usuario: la RLS de Propuestas (`propuesta_vista` Y dueño del RFQ
 * o `ver_pipeline_equipo`) decide qué filas llegan; sin acceso el resultado es
 * vacío, igual que en el resto del historial. No se leen costos, ruteo,
 * márgenes, PDFs ni la cabecera completa de la revisión. Las revisiones o
 * eventos que no se puedan leer quedan en `null`, distintos de «sin eventos».
 *
 * @param cliente Cliente Supabase (servidor o navegador), nunca service role.
 * @param clienteId Cliente dueño del historial.
 * @param pagina Página 1-based.
 * @throws Error si la consulta de propuestas falla.
 */
export async function obtenerPropuestasCliente(
  cliente: SupabaseClient<Database>,
  clienteId: string,
  pagina = 1,
): Promise<PaginaHistorial<PropuestaHistorial>> {
  const { desde, hasta } = rango(pagina, PROPUESTAS_HISTORIAL_POR_PAGINA);

  const { data, error, count } = await cliente
    .from('propuestas')
    .select('id,rfq_id,folio_cnc,estado,revision_vigente_id,accepted_revision_id,creado_en,actualizado_en', { count: 'exact' })
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, hasta);

  if (error) {
    throw new Error('No se pudo cargar el historial de propuestas');
  }

  const comerciales = await adjuntarRevisiones(cliente, data ?? []);
  const eventosPorRevision = await obtenerEventosPorRevision(
    cliente,
    comerciales.flatMap((propuesta) => (propuesta.revisiones ?? []).map((revision) => revision.id)),
  );

  return {
    registros: comerciales.map((propuesta) => ({
      ...propuesta,
      revisiones:
        propuesta.revisiones?.map((revision) => ({
          ...revision,
          eventos: eventosPorRevision === null ? null : (eventosPorRevision.get(revision.id) ?? []),
        })) ?? null,
    })),
    total: count ?? 0,
    pagina: Math.max(1, Math.trunc(pagina)),
    porPagina: PROPUESTAS_HISTORIAL_POR_PAGINA,
  };
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

  const filas = await leerTodasLasFilas((desde, hasta) =>
    cliente
      .from('partidas_orden_produccion')
      .select('id,orden_id,codigo_pieza,descripcion,cantidad_solicitada,cantidad_producida,cantidad_scrap,unidad_medida,maquina_asignada,tiempo_estimado_minutos,tiempo_real_minutos', { count: 'exact' })
      .in('orden_id', ordenIds)
      .order('codigo_pieza', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, hasta),
  );
  if (filas === null) return null;

  const agrupadas = new Map<string, PartidaOrdenHistorial[]>();
  for (const id of ordenIds) agrupadas.set(id, []);
  for (const fila of filas) agrupadas.get(fila.orden_id)?.push(filaAPartidaOrdenHistorial(fila));
  return agrupadas;
}
