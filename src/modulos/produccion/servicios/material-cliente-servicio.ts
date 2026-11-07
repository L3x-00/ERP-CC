import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { lanzarErrorProduccion } from '@/modulos/produccion/servicios/sesiones-servicio';
import type {
  ConsumoMaterialClienteRegistrado,
  MaterialClienteItem,
  MaterialClientePartida,
} from '@/modulos/produccion/tipos/material-cliente';

type Admin = SupabaseClient<Database>;

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

/** C13.3: reemplaza el material del cliente declarado para un ítem DRAFT. */
export async function reemplazarMaterialClienteItemServicio(
  admin: Admin,
  entrada: {
    revisionId: string;
    codigoItem: string;
    materiales: { materialId: string; cantidad: number }[];
    actorId: string;
  },
): Promise<{ codigoItem: string; materiales: number }> {
  const { data, error } = await admin.rpc('reemplazar_material_cliente_item', {
    p_revision_id: entrada.revisionId,
    p_codigo_item: entrada.codigoItem,
    p_materiales: entrada.materiales.map((material) => ({
      material_id: material.materialId,
      cantidad: material.cantidad,
    })),
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = (data ?? {}) as Record<string, unknown>;
  return {
    codigoItem: texto(fila.codigo_item) || entrada.codigoItem,
    materiales: numero(fila.materiales),
  };
}

/** C13.3: material del cliente declarado en una revisión. */
export async function obtenerMaterialClienteRevisionServicio(
  admin: Admin,
  entrada: { revisionId: string; actorId: string },
): Promise<MaterialClienteItem[]> {
  const { data, error } = await admin.rpc('obtener_material_cliente_revision', {
    p_revision_id: entrada.revisionId,
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorProduccion(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((fila) => ({
    id: texto(fila.id),
    codigoItem: texto(fila.codigo_item),
    materialId: texto(fila.material_id),
    materialCodigo: texto(fila.material_codigo),
    materialNombre: texto(fila.material_nombre),
    unidadBase: texto(fila.unidad_base),
    cantidad: numero(fila.cantidad),
  }));
}

/** C13.3 + AUD-11: el operador declara el consumo real del material del cliente. */
export async function registrarConsumoMaterialClienteServicio(
  admin: Admin,
  entrada: {
    sesionId: string;
    materialId: string;
    cantidadUsada: number;
    cantidadScrap: number;
    solicitudId?: string;
    actorId: string;
  },
): Promise<ConsumoMaterialClienteRegistrado> {
  const { data, error } = await admin.rpc('registrar_consumo_material_cliente', {
    p_sesion_id: entrada.sesionId,
    p_material_id: entrada.materialId,
    p_cantidad_usada: entrada.cantidadUsada,
    p_cantidad_scrap: entrada.cantidadScrap,
    p_actor_id: entrada.actorId,
    ...(entrada.solicitudId ? { p_solicitud_id: entrada.solicitudId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  if (!texto(fila.id)) throw new Error('Respuesta inválida al registrar el consumo del cliente');
  return {
    id: texto(fila.id),
    ordenId: texto(fila.orden_id),
    partidaId: texto(fila.partida_id),
    materialId: texto(fila.material_id),
    cantidadUsada: numero(fila.cantidad_usada),
    cantidadScrap: numero(fila.cantidad_scrap),
    declarado: numero(fila.declarado),
    consumido: numero(fila.consumido),
    saldo: numero(fila.saldo),
  };
}

/** C13.3: material del cliente con saldo por partida de la orden. */
export async function obtenerMaterialClienteOrdenServicio(
  admin: Admin,
  entrada: { ordenId: string; actorId: string },
): Promise<MaterialClientePartida[]> {
  const { data, error } = await admin.rpc('obtener_material_cliente_orden', {
    p_orden_id: entrada.ordenId,
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorProduccion(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((fila) => ({
    partidaId: texto(fila.partida_id),
    codigoPieza: texto(fila.codigo_pieza),
    materialId: texto(fila.material_id),
    materialCodigo: texto(fila.material_codigo),
    materialNombre: texto(fila.material_nombre),
    unidadBase: texto(fila.unidad_base),
    declarado: numero(fila.declarado),
    consumido: numero(fila.consumido),
    saldo: numero(fila.saldo),
  }));
}
