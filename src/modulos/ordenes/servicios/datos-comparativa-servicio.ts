import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';
import type {
  CuentaComparativa, EntregaComparativa, SesionComparativa,
} from '@/modulos/ordenes/utilidades/comparativa-ordenes';

type RespuestaPagina<T> = { data: T[] | null; error: { message: string } | null };

type PartidaOrdenComparativa = { id: string; orden_id: string };
type RenglonEntregaComparativa = { partida_id: string; cantidad_entregada: number };

async function cargarTodas<T>(
  consulta: (desde: number, hasta: number) => Promise<RespuestaPagina<T>>,
): Promise<T[]> {
  const acumulado: T[] = [];
  const tamano = 500;
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await consulta(desde, desde + tamano - 1);
    if (error || !data) throw new Error(error?.message ?? 'Consulta incompleta');
    acumulado.push(...data);
    if (data.length < tamano) return acumulado;
  }
}

/**
 * Lotes acotados de ids evitan URLs de miles de caracteres (límite 414 del
 * gateway); dentro de cada lote se conserva la paginación por filas.
 */
async function cargarEnLotes<T>(
  lotes: string[][],
  consulta: (lote: string[], desde: number, hasta: number) => Promise<RespuestaPagina<T>>,
): Promise<T[]> {
  const acumulado: T[] = [];
  for (const lote of lotes) {
    acumulado.push(...await cargarTodas((desde, hasta) => consulta(lote, desde, hasta)));
  }
  return acumulado;
}

/** Lee solo columnas agregables de las órdenes visibles; pagina para evitar falsos totales. */
export async function obtenerDatosComparativaServicio(
  admin: SupabaseClient<Database>, ids: string[], incluirVentas: boolean,
): Promise<{
  sesiones: SesionComparativa[];
  entregas: EntregaComparativa[];
  cuentas: CuentaComparativa[] | null;
  /** C8.4/R13: entregado acumulado por partida (suma simple, igual que el cierre SQL). */
  entregadaPorPartida: Record<string, number>;
  entregadaPorOrden: Record<string, number>;
}> {
  if (ids.length === 0) {
    return { sesiones: [], entregas: [], cuentas: incluirVentas ? [] : null, entregadaPorPartida: {}, entregadaPorOrden: {} };
  }
  const lotes = dividirEnLotes(ids);
  const [sesiones, entregas, cuentas, partidasDeOrden, renglonesEntrega] = await Promise.all([
    cargarEnLotes<SesionComparativa>(lotes, async (lote, desde, hasta) => await admin.from('sesiones_trabajo')
      .select('orden_id,estado_sesion,motivo_pausa').in('orden_id', lote).order('id').range(desde, hasta)),
    cargarEnLotes<EntregaComparativa>(lotes, async (lote, desde, hasta) => await admin.from('notas_entrega')
      .select('orden_id,creado_en').in('orden_id', lote).eq('es_parcial', false)
      .order('id').range(desde, hasta)),
    incluirVentas ? cargarEnLotes<CuentaComparativa>(lotes, async (lote, desde, hasta) => await admin.from('cuentas_por_cobrar')
      .select('orden_id,estado,monto_total,tipo_cambio_origen').in('orden_id', lote)
      .order('id').range(desde, hasta)) : Promise.resolve(null),
    cargarEnLotes<PartidaOrdenComparativa>(lotes, async (lote, desde, hasta) => await admin.from('partidas_orden_produccion')
      .select('id,orden_id').in('orden_id', lote).order('id').range(desde, hasta)),
    cargarTodas<RenglonEntregaComparativa>(async (desde, hasta) => await admin.from('partidas_nota_entrega')
      .select('partida_id,cantidad_entregada').order('nota_entrega_id').range(desde, hasta)),
  ]);
  const ordenDePartida = new Map<string, string>();
  for (const partida of partidasDeOrden) ordenDePartida.set(partida.id, partida.orden_id);
  const entregadaPorPartida: Record<string, number> = {};
  const entregadaPorOrden: Record<string, number> = {};
  for (const renglon of renglonesEntrega) {
    const ordenId = ordenDePartida.get(renglon.partida_id);
    if (ordenId === undefined) continue;
    entregadaPorPartida[renglon.partida_id] =
      (entregadaPorPartida[renglon.partida_id] ?? 0) + Number(renglon.cantidad_entregada ?? 0);
    entregadaPorOrden[ordenId] = (entregadaPorOrden[ordenId] ?? 0) + Number(renglon.cantidad_entregada ?? 0);
  }
  return {
    sesiones,
    entregas,
    cuentas,
    entregadaPorPartida,
    entregadaPorOrden,
  };
}
