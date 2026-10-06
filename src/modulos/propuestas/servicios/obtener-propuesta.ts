import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaAAccionRevisionPropuesta,
  filaACostoRevisionPropuesta,
  filaAEventoRevisionPropuesta,
  filaAItemPropuesta,
  filaAPropuesta,
  filaARevisionPropuesta,
  filaARuteoPropuesta,
  type AccionRevisionPropuesta,
  type CostoRevisionPropuesta,
  type EventoRevisionPropuesta,
  type MonedaPropuesta,
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
    costoTotal: numero('costoTotal'),
    margen: typeof margen === 'number' && Number.isFinite(margen) ? margen : null,
    moneda: (bruto.moneda === 'USD' ? 'USD' : 'MXN') as MonedaPropuesta,
  };
}
