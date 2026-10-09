import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaAAccionRevisionPropuesta,
  filaACostoRevisionPropuesta,
  filaAEventoRevisionPropuesta,
  filaAItemPropuesta,
  filaAPdfRevisionPropuesta,
  filaAPropuesta,
  filaARevisionPropuesta,
  filaARuteoPropuesta,
  type AccionRevisionPropuesta,
  type CostoRevisionPropuesta,
  type EventoRevisionPropuesta,
  type MonedaPropuesta,
  type PdfRevisionPropuesta,
  type Propuesta,
  type PropuestaItem,
  type RevisionPropuesta,
  type RuteoItemPropuesta,
  type TotalesPropuesta,
} from '@/modulos/propuestas/tipos/indice';

/** Propuesta con sus revisiones y el detalle de cada revisión. */
export type PropuestaDetallada = {
  propuesta: Propuesta;
  revisiones: RevisionPropuesta[];
  items: PropuestaItem[];
  ruteo: RuteoItemPropuesta[];
  costos: CostoRevisionPropuesta[];
  acciones: AccionRevisionPropuesta[];
  eventos: EventoRevisionPropuesta[];
};

/**
 * Carga una propuesta completa (cabecera, revisiones, ítems, ruteo, costos,
 * acciones y eventos). El alcance lo impone la RLS de lectura
 * (`propuesta_vista` Y dueño del RFQ O `ver_pipeline_equipo`).
 *
 * @throws Error si la consulta de la cabecera falla por otro motivo.
 */
export async function obtenerPropuestaPorId(
  cliente: SupabaseClient<Database>,
  propuestaId: string,
): Promise<PropuestaDetallada | null> {
  const { data: fila, error } = await cliente
    .from('propuestas')
    .select('*')
    .eq('id', propuestaId)
    .maybeSingle();

  if (error) {
    throw new Error('No se pudo cargar la propuesta');
  }
  if (!fila) {
    return null;
  }

  const { data: filasRevisiones } = await cliente
    .from('propuesta_revisiones')
    .select('*')
    .eq('propuesta_id', propuestaId)
    .order('letra', { ascending: true });
  const revisiones = (filasRevisiones ?? []).map(filaARevisionPropuesta);
  const idsRevisiones = revisiones.map((revision) => revision.id);

  if (idsRevisiones.length === 0) {
    return {
      propuesta: filaAPropuesta(fila),
      revisiones: [],
      items: [],
      ruteo: [],
      costos: [],
      acciones: [],
      eventos: [],
    };
  }

  const [{ data: filasItems }, { data: filasCostos }, { data: filasAcciones }, { data: filasEventos }] =
    await Promise.all([
      cliente
        .from('propuesta_items')
        .select('*')
        .in('revision_id', idsRevisiones)
        .order('codigo', { ascending: true }),
      cliente.from('propuesta_revision_costos').select('*').in('revision_id', idsRevisiones),
      cliente
        .from('propuesta_revision_acciones')
        .select('*')
        .in('revision_id', idsRevisiones)
        .order('creado_en', { ascending: false }),
      cliente
        .from('propuesta_revision_eventos')
        .select('*')
        .in('revision_id', idsRevisiones)
        .order('creado_en', { ascending: false }),
    ]);

  const items = (filasItems ?? []).map(filaAItemPropuesta);
  const idsItems = items.map((item) => item.id);
  let ruteo: RuteoItemPropuesta[] = [];
  if (idsItems.length > 0) {
    const { data: filasRuteo } = await cliente
      .from('propuesta_item_ruteo')
      .select('*')
      .in('item_id', idsItems)
      .order('secuencia', { ascending: true });
    ruteo = (filasRuteo ?? []).map(filaARuteoPropuesta);
  }

  return {
    propuesta: filaAPropuesta(fila),
    revisiones,
    items,
    ruteo,
    costos: (filasCostos ?? []).map(filaACostoRevisionPropuesta),
    acciones: (filasAcciones ?? []).map(filaAAccionRevisionPropuesta),
    eventos: (filasEventos ?? []).map(filaAEventoRevisionPropuesta),
  };
}

/**
 * Archivo vinculado a la propuesta (propio, heredado del RFQ o por ítem),
 * vigente o histórico. El linaje de versiones se identifica por
 * `entidad + entidadId + temaCodigo + nombreErp` (DC-04).
 */
export type ArchivoPropuesta = {
  id: string;
  entidad: string;
  entidadId: string;
  temaCodigo: string | null;
  nombreOriginal: string;
  nombreErp: string | null;
  rutaStorage: string;
  bucket: string;
  mime: string;
  tamanoBytes: number;
  version: number;
  vigente: boolean;
  reemplazaA: string | null;
  creadoEn: string;
};

/**
 * Carga los archivos visibles de la propuesta: propios, heredados y por ítem,
 * incluidas las versiones no vigentes (CLI-06). La interfaz muestra la vigente
 * por defecto y revela el historial bajo demanda; aquí no se oculta metadata.
 */
export async function obtenerArchivosDePropuesta(
  cliente: SupabaseClient<Database>,
  entrada: {
    revisionIds: readonly string[];
    itemIds: readonly string[];
    rfqId: string;
    rfqItemIds: readonly string[];
  },
): Promise<ArchivoPropuesta[]> {
  const filtros: string[] = [];
  if (entrada.revisionIds.length > 0) {
    filtros.push(`and(entidad.eq.propuesta_revision,entidad_id.in.(${entrada.revisionIds.join(',')}))`);
  }
  if (entrada.itemIds.length > 0) {
    filtros.push(`and(entidad.eq.propuesta_item,entidad_id.in.(${entrada.itemIds.join(',')}))`);
  }
  filtros.push(`and(entidad.eq.rfq,entidad_id.eq.${entrada.rfqId})`);
  if (entrada.rfqItemIds.length > 0) {
    filtros.push(`and(entidad.eq.rfq_item,entidad_id.in.(${entrada.rfqItemIds.join(',')}))`);
  }

  const { data, error } = await cliente
    .from('archivos')
    .select('*')
    .or(filtros.join(','))
    .order('creado_en', { ascending: false });
  if (error) {
    console.error('[PROPUESTAS] No se pudieron cargar los archivos:', error.message);
    return [];
  }

  return (data ?? []).map((fila) => ({
    id: fila.id,
    entidad: fila.entidad,
    entidadId: fila.entidad_id,
    temaCodigo: fila.tema_codigo,
    nombreOriginal: fila.nombre_original,
    nombreErp: fila.nombre_erp,
    rutaStorage: fila.ruta_storage,
    bucket: fila.bucket,
    mime: fila.mime,
    tamanoBytes: Number(fila.tamano_bytes),
    version: fila.version,
    vigente: fila.vigente,
    reemplazaA: fila.reemplaza_a,
    creadoEn: fila.creado_en,
  }));
}

/** IDs de los ítems del RFQ (para resolver archivos heredados por ítem). */
export async function obtenerIdsItemsRfq(
  cliente: SupabaseClient<Database>,
  rfqId: string,
): Promise<string[]> {
  const { data } = await cliente.from('rfq_items').select('id').eq('rfq_id', rfqId);
  return (data ?? []).map((fila) => fila.id);
}

/** PDFs registrados (vigentes e históricos) de las revisiones indicadas. */
export async function obtenerPdfsDeRevisiones(
  cliente: SupabaseClient<Database>,
  revisionIds: readonly string[],
): Promise<PdfRevisionPropuesta[]> {
  if (revisionIds.length === 0) return [];
  const { data, error } = await cliente
    .from('propuesta_pdfs')
    .select('*')
    .in('revision_id', [...revisionIds])
    .order('version', { ascending: false });
  if (error) {
    console.error('[PROPUESTAS] No se pudieron cargar los PDFs:', error.message);
    return [];
  }
  return (data ?? []).map(filaAPdfRevisionPropuesta);
}

/** Lee los totales calculados por SQL (misma semántica que el espejo TS). */
export async function obtenerTotalesRevision(
  cliente: SupabaseClient<Database>,
  revisionId: string,
): Promise<TotalesPropuesta | null> {
  const { data, error } = await cliente.rpc('calcular_totales_revision', {
    p_revision_id: revisionId,
  });
  if (error || data === null || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const bruto = data as Record<string, unknown>;
  const numero = (clave: string): number => {
    const valor = bruto[clave];
    return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
  };
  const margen = bruto.margen;

  return {
    bruto: numero('bruto'),
    descuento: numero('descuento'),
    subtotal: numero('subtotal'),
    ivaPorcentaje: numero('ivaPorcentaje'),
    iva: numero('iva'),
    total: numero('total'),
    costoManual: numero('costoManual'),
    costoRuteo: numero('costoRuteo'),
    costoTotal: numero('costoTotal'),
    margen: typeof margen === 'number' && Number.isFinite(margen) ? margen : null,
    moneda: (bruto.moneda === 'USD' ? 'USD' : 'MXN') as MonedaPropuesta,
  };
}
