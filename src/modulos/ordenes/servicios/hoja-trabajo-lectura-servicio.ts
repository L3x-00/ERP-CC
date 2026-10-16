import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { listarArchivosFichaOrden } from '@/modulos/ordenes/servicios/archivos-ficha-servicio';
import { proyectarHojaTrabajo } from '@/modulos/ordenes/servicios/hoja-trabajo-orden-servicio';
import type { HojaTrabajoOrden } from '@/modulos/ordenes/tipos/ficha-orden';
import { esSnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';

// El snapshot trae precios y costos; se lee en servidor solo para proyectar la hoja por lista blanca.
// Nunca se piden montos ni condición de pago de la orden.
const COLUMNAS_ORDEN_HOJA = 'id, folio, folio_sii, notas, cliente_id, snapshot_json, propuesta_revision_id';

/**
 * Hoja de trabajo de una orden para el piso: la misma proyección sin economía que ve la ficha.
 * `null` si la orden no existe o no tiene snapshot válido (orden anterior al flujo SII): el piso no
 * cae a la carpeta viva del RFQ, que incorporaría cambios posteriores a la venta.
 */
export async function leerHojaTrabajoOrden(
  cliente: SupabaseClient<Database>,
  ordenId: string,
): Promise<HojaTrabajoOrden | null> {
  const { data: orden, error } = await cliente
    .from('ordenes_produccion')
    .select(COLUMNAS_ORDEN_HOJA)
    .eq('id', ordenId)
    .maybeSingle();
  if (error) throw error;
  if (!orden) return null;

  const snapshot = esSnapshotOrdenSii(orden.snapshot_json) ? orden.snapshot_json : null;
  if (!snapshot) return null;

  const [archivos, clienteResp] = await Promise.all([
    listarArchivosFichaOrden(cliente, { snapshot, propuestaRevisionId: orden.propuesta_revision_id }),
    orden.cliente_id
      ? cliente.from('clientes').select('nombre_comercial, razon_social').eq('id', orden.cliente_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (clienteResp.error) throw clienteResp.error;

  const clienteFila = clienteResp.data;
  return proyectarHojaTrabajo({
    snapshot,
    folio: orden.folio_sii ?? orden.folio,
    clienteNombre: clienteFila ? clienteFila.nombre_comercial || clienteFila.razon_social : null,
    observacionesOrden: orden.notas,
    archivos,
  });
}

/**
 * ¿La orden está en el piso de este operador? Mismo criterio que la lista del control de piso: orden
 * en proceso con al menos una partida asignada al operador (`operadorId` null = vista de
 * administrador, que ve cualquier orden en proceso con partidas).
 */
export async function ordenEstaEnPiso(
  cliente: SupabaseClient<Database>,
  ordenId: string,
  operadorId: string | null,
): Promise<boolean> {
  const consultaPartidas = cliente
    .from('partidas_orden_produccion')
    .select('id')
    .eq('orden_id', ordenId)
    .limit(1);
  const [partidasResp, ordenResp] = await Promise.all([
    operadorId === null ? consultaPartidas : consultaPartidas.eq('operador_asignado_id', operadorId),
    cliente.from('ordenes_produccion').select('id').eq('id', ordenId).eq('estado', 'en_proceso').maybeSingle(),
  ]);
  if (partidasResp.error) throw partidasResp.error;
  if (ordenResp.error) throw ordenResp.error;
  return (partidasResp.data ?? []).length > 0 && ordenResp.data !== null;
}
