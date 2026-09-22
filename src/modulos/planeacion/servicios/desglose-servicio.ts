import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/compartido/tipos/supabase';
import type { DesglosePartidaPlaneacion } from '@/modulos/planeacion/tipos/indice';

/**
 * Lectura del desglose de partidas para Planeación (OBS-08). Usa el cliente RLS
 * del servidor y resuelve catálogos en lote: sin consultas N+1 ni datos de otros
 * módulos fuera de la proyección permitida.
 */

type FilaPartida = Tables<'partidas_orden_produccion'>;

async function consultarPartidas(
  cliente: SupabaseClient<Database>,
  ids: readonly string[],
): Promise<FilaPartida[]> {
  const { data, error } = await cliente
    .from('partidas_orden_produccion')
    .select(
      'id, orden_id, codigo_pieza, descripcion, area_trabajo_codigo, procesos, es_externo, proveedor_externo, maquina_asignada, material_id, cantidad_solicitada, cantidad_producida, cantidad_scrap, unidad_medida, tiempo_estimado_minutos, tiempo_real_minutos, operador_asignado_id, creado_en, actualizado_en',
    )
    .in('id', ids);
  if (error) throw new Error('No se pudieron cargar las partidas para Planeación');
  return data ?? [];
}

async function consultarMateriales(
  cliente: SupabaseClient<Database>,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await cliente.from('materiales').select('id, nombre').in('id', ids);
  return new Map((data ?? []).map((material) => [material.id, material.nombre]));
}

async function consultarAreas(
  cliente: SupabaseClient<Database>,
  codigos: readonly string[],
): Promise<Map<string, string>> {
  if (codigos.length === 0) return new Map();
  const { data } = await cliente
    .from('areas_trabajo_config')
    .select('codigo, nombre')
    .in('codigo', codigos);
  return new Map((data ?? []).map((area) => [area.codigo, area.nombre]));
}

async function consultarFolios(
  cliente: SupabaseClient<Database>,
  ordenIds: readonly string[],
): Promise<Map<string, string>> {
  if (ordenIds.length === 0) return new Map();
  const { data } = await cliente
    .from('ordenes_produccion')
    .select('id, folio')
    .in('id', ordenIds);
  return new Map((data ?? []).map((orden) => [orden.id, orden.folio]));
}

function numero(valor: number | null | undefined): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function mapearPartida(
  fila: FilaPartida,
  materiales: ReadonlyMap<string, string>,
  areas: ReadonlyMap<string, string>,
  folios: ReadonlyMap<string, string>,
): DesglosePartidaPlaneacion {
  const areaCodigo = fila.area_trabajo_codigo;
  return {
    partidaId: fila.id,
    ordenId: fila.orden_id,
    folio: folios.get(fila.orden_id) ?? 'OP',
    codigoPieza: fila.codigo_pieza,
    descripcion: fila.descripcion,
    areaCodigo,
    areaNombre: areaCodigo ? (areas.get(areaCodigo) ?? null) : null,
    procesos: fila.procesos ?? [],
    esExterno: fila.es_externo,
    proveedorExterno: fila.proveedor_externo,
    maquinaAsignada: fila.maquina_asignada,
    materialNombre: fila.material_id ? (materiales.get(fila.material_id) ?? null) : null,
    cantidadSolicitada: numero(fila.cantidad_solicitada),
    cantidadProducida: numero(fila.cantidad_producida),
    cantidadScrap: numero(fila.cantidad_scrap),
    unidadMedida: fila.unidad_medida,
    tiempoEstimadoMinutos: numero(fila.tiempo_estimado_minutos),
    operadorAsignadoId: fila.operador_asignado_id,
  };
}

/**
 * Devuelve el desglose de las partidas solicitadas respetando el orden de los
 * IDs recibidos. Las partidas inexistentes o no visibles por RLS se omiten.
 */
export async function obtenerDesglosePartidasServicio(
  cliente: SupabaseClient<Database>,
  partidaIds: readonly string[],
): Promise<DesglosePartidaPlaneacion[]> {
  const ids = [...new Set(partidaIds)];
  if (ids.length === 0) return [];

  const filas = await consultarPartidas(cliente, ids);
  if (filas.length === 0) return [];

  const materialIds = [
    ...new Set(
      filas
        .map((fila) => fila.material_id)
        .filter((valor): valor is string => valor !== null),
    ),
  ];
  const areaCodigos = [
    ...new Set(
      filas
        .map((fila) => fila.area_trabajo_codigo)
        .filter((valor): valor is string => valor !== null),
    ),
  ];
  const ordenIds = [...new Set(filas.map((fila) => fila.orden_id))];

  const [materiales, areas, folios] = await Promise.all([
    consultarMateriales(cliente, materialIds),
    consultarAreas(cliente, areaCodigos),
    consultarFolios(cliente, ordenIds),
  ]);

  const porId = new Map(
    filas.map((fila) => [fila.id, mapearPartida(fila, materiales, areas, folios)]),
  );

  return ids
    .map((id) => porId.get(id))
    .filter((desglose): desglose is DesglosePartidaPlaneacion => desglose !== undefined);
}
