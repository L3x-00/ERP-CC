import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';
import type {
  CuentaComparativa, EntregaComparativa, SesionComparativa,
} from '@/modulos/ordenes/utilidades/comparativa-ordenes';

type RespuestaPagina<T> = { data: T[] | null; error: { message: string } | null };

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
}> {
  if (ids.length === 0) return { sesiones: [], entregas: [], cuentas: incluirVentas ? [] : null };
  const lotes = dividirEnLotes(ids);
  const [sesiones, entregas, cuentas] = await Promise.all([
    cargarEnLotes<SesionComparativa>(lotes, async (lote, desde, hasta) => await admin.from('sesiones_trabajo')
      .select('orden_id,estado_sesion,motivo_pausa').in('orden_id', lote).order('id').range(desde, hasta)),
    cargarEnLotes<EntregaComparativa>(lotes, async (lote, desde, hasta) => await admin.from('notas_entrega')
      .select('orden_id,creado_en').in('orden_id', lote).eq('es_parcial', false)
      .order('id').range(desde, hasta)),
    incluirVentas ? cargarEnLotes<CuentaComparativa>(lotes, async (lote, desde, hasta) => await admin.from('cuentas_por_cobrar')
      .select('orden_id,estado,monto_total,tipo_cambio_origen').in('orden_id', lote)
      .order('id').range(desde, hasta)) : Promise.resolve(null),
  ]);
  return { sesiones, entregas, cuentas };
}
