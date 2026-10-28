import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';

/** Consumo real de material de una orden concluida, listo para la ficha de lectura. */
export interface ConsumoMaterialOrden {
  id: string;
  partidaId: string;
  codigoPieza: string;
  materialNombre: string;
  cantidadUsada: number;
  cantidadScrap: number;
  unidadBase: string | null;
  creadoEn: string;
}

interface FilaConsumoOperativa {
  id: string;
  partida_id: string;
  material_id: string | null;
  catalogo_material_id: string | null;
  cantidad_usada: number;
  cantidad_scrap: number;
  unidad_base: string | null;
  creado_en: string;
}

/**
 * Material consumido por las partidas de una orden. La lectura usa las columnas
 * operativas que RLS expone a `authenticated`; el costo unitario queda fuera de
 * este contrato para no filtrar el snapshot financiero al piso.
 */
export async function obtenerConsumosMaterialOrdenServicio(
  cliente: SupabaseClient<Database>,
  admin: SupabaseClient<Database> | undefined,
  ordenId: string,
): Promise<ConsumoMaterialOrden[]> {
  const { data: partidas, error: errorPartidas } = await cliente
    .from('partidas_orden_produccion')
    .select('id, codigo_pieza')
    .eq('orden_id', ordenId)
    .order('creado_en');
  if (errorPartidas) {
    throw new Error(`No se pudieron cargar las partidas: ${errorPartidas.message}`);
  }
  const partidasPorId = new Map(
    (partidas ?? []).map((partida) => [partida.id, partida.codigo_pieza]),
  );
  const partidaIds = [...partidasPorId.keys()];
  if (partidaIds.length === 0) return [];

  const { data: consumos, error: errorConsumos } = await cliente
    .from('registros_consumo_material')
    .select(
      'id, partida_id, material_id, catalogo_material_id, cantidad_usada, cantidad_scrap, unidad_base, creado_en',
    )
    .in('partida_id', partidaIds)
    .order('creado_en', { ascending: false });
  if (errorConsumos) {
    throw new Error(`No se pudo cargar el material utilizado: ${errorConsumos.message}`);
  }
  const filas = (consumos ?? []) as FilaConsumoOperativa[];
  if (filas.length === 0) return [];

  const catalogoIds = [
    ...new Set(
      filas
        .map((fila) => fila.catalogo_material_id)
        .filter((valor): valor is string => valor !== null),
    ),
  ];
  const legadoIds = [
    ...new Set(
      filas
        .map((fila) => fila.material_id)
        .filter((valor): valor is string => valor !== null),
    ),
  ];
  const etiquetas = admin ?? cliente;
  const [respuestasCatalogo, respuestasLegado] = await Promise.all([
    Promise.all(
      dividirEnLotes(catalogoIds).map((lote) =>
        etiquetas.from('catalogo_materiales').select('id, codigo, nombre').in('id', lote),
      ),
    ),
    Promise.all(
      dividirEnLotes(legadoIds).map((lote) =>
        etiquetas.from('materiales').select('id, codigo, nombre').in('id', lote),
      ),
    ),
  ]);
  const errorEtiquetas = [...respuestasCatalogo, ...respuestasLegado].find(
    (respuesta) => respuesta.error,
  )?.error;
  if (errorEtiquetas) {
    throw new Error(`No se pudieron cargar los materiales: ${errorEtiquetas.message}`);
  }
  const nombres = new Map<string, string>();
  for (const respuesta of respuestasCatalogo) {
    for (const material of respuesta.data ?? []) {
      nombres.set(material.id, material.nombre || material.codigo);
    }
  }
  for (const respuesta of respuestasLegado) {
    for (const material of respuesta.data ?? []) {
      nombres.set(material.id, material.nombre || material.codigo);
    }
  }

  return filas.map((fila) => {
    const materialId = fila.catalogo_material_id ?? fila.material_id;
    return {
      id: fila.id,
      partidaId: fila.partida_id,
      codigoPieza: partidasPorId.get(fila.partida_id) ?? 'Partida',
      materialNombre: (materialId ? nombres.get(materialId) : null) ?? 'Material',
      cantidadUsada: Number(fila.cantidad_usada),
      cantidadScrap: Number(fila.cantidad_scrap),
      unidadBase: fila.unidad_base,
      creadoEn: fila.creado_en,
    };
  });
}
