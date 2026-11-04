import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { lanzarErrorProduccion } from '@/modulos/produccion/servicios/sesiones-servicio';
import type {
  CausaRetrabajo,
  RetrabajoDetalle,
  RetrabajoRegistrado,
} from '@/modulos/produccion/tipos/retrabajos';

type Admin = SupabaseClient<Database>;

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function causa(valor: unknown): CausaRetrabajo {
  return valor === 'operador' || valor === 'cliente' || valor === 'material' || valor === 'otro'
    ? valor
    : 'otro';
}

/** C13.2: registra el retrabajo de una sesión (descuenta inventario propio). */
export async function registrarRetrabajoServicio(
  admin: Admin,
  entrada: {
    sesionId: string;
    materialId: string;
    cantidadUsada: number;
    cantidadScrap: number;
    minutos: number;
    causa: CausaRetrabajo;
    motivo: string;
    notas?: string;
    actorId: string;
  },
): Promise<RetrabajoRegistrado> {
  const { data, error } = await admin.rpc('registrar_retrabajo_sesion', {
    p_sesion_id: entrada.sesionId,
    p_material_id: entrada.materialId,
    p_cantidad_usada: entrada.cantidadUsada,
    p_cantidad_scrap: entrada.cantidadScrap,
    p_minutos: entrada.minutos,
    p_causa: entrada.causa,
    p_motivo: entrada.motivo,
    p_notas: entrada.notas ?? '',
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  if (!texto(fila.id)) throw new Error('Respuesta inválida al registrar el retrabajo');
  return {
    id: texto(fila.id),
    ordenId: texto(fila.orden_id),
    partidaId: texto(fila.partida_id),
    materialId: texto(fila.material_id),
    cantidadUsada: numero(fila.cantidad_usada),
    cantidadScrap: numero(fila.cantidad_scrap),
    minutos: numero(fila.minutos),
    causa: causa(fila.causa),
    motivo: texto(fila.motivo),
    creadoEn: texto(fila.creado_en),
  };
}

/** C13.2: retrabajos visibles para administración, recientes primero. */
export async function obtenerRetrabajosOrdenServicio(
  admin: Admin,
  entrada: { ordenId: string; actorId: string },
): Promise<RetrabajoDetalle[]> {
  const { data, error } = await admin.rpc('obtener_retrabajos_orden', {
    p_orden_id: entrada.ordenId,
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorProduccion(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((fila) => ({
    id: texto(fila.id),
    ordenId: texto(fila.orden_id),
    partidaId: texto(fila.partida_id),
    materialId: texto(fila.material_id),
    materialCodigo: texto(fila.material_codigo),
    materialNombre: texto(fila.material_nombre),
    unidadBase: texto(fila.unidad_control),
    codigoPieza: texto(fila.codigo_pieza),
    cantidadUsada: numero(fila.cantidad_usada),
    cantidadScrap: numero(fila.cantidad_scrap),
    minutos: numero(fila.minutos),
    causa: causa(fila.causa),
    motivo: texto(fila.motivo),
    notas: typeof fila.notas === 'string' ? fila.notas : null,
    registradoPorNombre: texto(fila.registrado_por_nombre) || 'Administración',
    creadoEn: texto(fila.creado_en),
  }));
}
