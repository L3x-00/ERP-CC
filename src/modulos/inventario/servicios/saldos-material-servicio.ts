import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

import type {
  AjustarSaldoMaterialInput,
  ConsultaMovimientosSaldoInput,
} from '../validaciones/materiales-catalogo';
import type {
  MonedaCosto,
  MovimientoSaldoMaterial,
  SaldoMaterial,
} from '../tipos/materiales-costos';

export type CodigoErrorSaldo =
  | 'sin_permiso_materiales'
  | 'material_inexistente'
  | 'espesor_no_pertenece_al_material'
  | 'ajuste_saldo_invalido'
  | 'historial_saldos_append_only'
  | 'desconocido';

/** Error de dominio de existencias con código estable (obs. 8). */
export class ErrorSaldoMaterial extends Error {
  constructor(public readonly codigo: CodigoErrorSaldo) {
    super(codigo);
    this.name = 'ErrorSaldoMaterial';
  }
}

const MENSAJES_ERROR: Record<CodigoErrorSaldo, string> = {
  sin_permiso_materiales: 'Sin permiso para gestionar existencias',
  material_inexistente: 'El material no existe',
  espesor_no_pertenece_al_material: 'El espesor no pertenece al material',
  ajuste_saldo_invalido: 'El ajuste no es válido: revisa el saldo y el motivo',
  historial_saldos_append_only: 'El historial de existencias es de solo lectura',
  desconocido: 'No se pudo completar la operación de existencias',
};

const CODIGOS_CONOCIDOS = (Object.keys(MENSAJES_ERROR) as CodigoErrorSaldo[])
  .filter((codigo) => codigo !== 'desconocido')
  .sort((a, b) => b.length - a.length);

function mapearCodigo(mensaje: string): CodigoErrorSaldo {
  for (const codigo of CODIGOS_CONOCIDOS) {
    if (mensaje.includes(codigo)) return codigo;
  }
  return 'desconocido';
}

/** Mensaje saneado para la UI a partir del código de error del dominio. */
export function mensajeErrorSaldo(codigo: CodigoErrorSaldo): string {
  return MENSAJES_ERROR[codigo];
}

function monedaDe(valor: string): MonedaCosto {
  return valor === 'USD' ? 'USD' : 'MXN';
}

type MaterialResumen = {
  codigo: string;
  nombre: string;
  unidad_base: string;
  moneda_costo: string;
  costo_vigente: number | null;
};

async function mapaMaterialesResumen(
  cliente: SupabaseClient<Database>,
  ids: readonly string[],
): Promise<Map<string, MaterialResumen>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const { data, error } = await cliente
    .from('catalogo_materiales')
    .select('id, codigo, nombre, unidad_base, moneda_costo, costo_vigente')
    .in('id', unicos);
  if (error) {
    console.error('[SALDOS] Error al resolver materiales:', error.message);
    return new Map();
  }
  return new Map(
    (data ?? []).map((fila) => [
      fila.id,
      {
        codigo: fila.codigo,
        nombre: fila.nombre,
        unidad_base: fila.unidad_base,
        moneda_costo: fila.moneda_costo,
        costo_vigente: fila.costo_vigente === null ? null : Number(fila.costo_vigente),
      },
    ]),
  );
}

async function mapaEspesores(
  cliente: SupabaseClient<Database>,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await cliente
    .from('catalogo_espesores')
    .select('id, etiqueta')
    .in('id', unicos);
  if (error) {
    console.error('[SALDOS] Error al resolver espesores:', error.message);
    return new Map();
  }
  return new Map((data ?? []).map((fila) => [fila.id, fila.etiqueta]));
}

async function nombresDeUsuarios(
  cliente: SupabaseClient<Database>,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await cliente
    .from('usuarios')
    .select('id, nombre_completo')
    .in('id', unicos);
  if (error) {
    console.error('[SALDOS] Error al resolver actores:', error.message);
    return new Map();
  }
  return new Map((data ?? []).map((fila) => [fila.id, fila.nombre_completo]));
}

/** Saldos manuales con su material, espesor, costo vigente y actor del último ajuste. */
export async function listarSaldosMaterial(
  cliente: SupabaseClient<Database>,
): Promise<SaldoMaterial[]> {
  const { data, error } = await cliente
    .from('saldos_material')
    .select('id, material_id, espesor_id, saldo, actualizado_por, actualizado_en')
    .order('actualizado_en', { ascending: false });
  if (error) {
    console.error('[SALDOS] Error al listar saldos:', error.message);
    throw new ErrorSaldoMaterial('desconocido');
  }
  const filas = data ?? [];
  const [materiales, espesores, nombres] = await Promise.all([
    mapaMaterialesResumen(cliente, filas.map((fila) => fila.material_id)),
    mapaEspesores(cliente, filas.map((fila) => fila.espesor_id)),
    nombresDeUsuarios(cliente, filas.map((fila) => fila.actualizado_por)),
  ]);
  return filas.map((fila) => {
    const material = materiales.get(fila.material_id);
    return {
      id: fila.id,
      materialId: fila.material_id,
      materialCodigo: material?.codigo ?? '—',
      materialNombre: material?.nombre ?? 'Material',
      unidadBase: material?.unidad_base ?? '',
      espesorId: fila.espesor_id,
      espesorEtiqueta: fila.espesor_id ? espesores.get(fila.espesor_id) ?? null : null,
      saldo: Number(fila.saldo),
      costoVigente: material?.costo_vigente ?? null,
      monedaCosto: monedaDe(material?.moneda_costo ?? 'MXN'),
      actualizadoPorNombre: nombres.get(fila.actualizado_por) ?? 'Usuario',
      actualizadoEn: fila.actualizado_en,
    };
  });
}

/** Bitácora append-only de ajustes, de la más reciente a la más antigua. */
export async function listarMovimientosSaldo(
  cliente: SupabaseClient<Database>,
  opciones: ConsultaMovimientosSaldoInput = {},
): Promise<MovimientoSaldoMaterial[]> {
  let consulta = cliente
    .from('movimientos_saldo_material')
    .select('id, material_id, espesor_id, saldo_anterior, saldo_nuevo, motivo, actor_id, creado_en')
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .limit(opciones.limite ?? 100);
  if (opciones.materialId) {
    consulta = consulta.eq('material_id', opciones.materialId);
  }
  const { data, error } = await consulta;
  if (error) {
    console.error('[SALDOS] Error al listar movimientos:', error.message);
    throw new ErrorSaldoMaterial('desconocido');
  }
  const filas = data ?? [];
  const [materiales, espesores, nombres] = await Promise.all([
    mapaMaterialesResumen(cliente, filas.map((fila) => fila.material_id)),
    mapaEspesores(cliente, filas.map((fila) => fila.espesor_id)),
    nombresDeUsuarios(cliente, filas.map((fila) => fila.actor_id)),
  ]);
  return filas.map((fila) => {
    const material = materiales.get(fila.material_id);
    return {
      id: fila.id,
      materialId: fila.material_id,
      materialCodigo: material?.codigo ?? '—',
      materialNombre: material?.nombre ?? 'Material',
      espesorEtiqueta: fila.espesor_id ? espesores.get(fila.espesor_id) ?? null : null,
      saldoAnterior: Number(fila.saldo_anterior),
      saldoNuevo: Number(fila.saldo_nuevo),
      motivo: fila.motivo,
      actorNombre: nombres.get(fila.actor_id) ?? 'Usuario',
      creadoEn: fila.creado_en,
    };
  });
}

/** Ajuste atómico por RPC: fija el saldo y registra el movimiento (obs. 8). */
export async function ajustarSaldoMaterialServicio(
  cliente: SupabaseClient<Database>,
  entrada: AjustarSaldoMaterialInput,
  actorId: string,
): Promise<{ saldoAnterior: number; saldoNuevo: number; actualizadoEn: string }> {
  const { data, error } = await cliente.rpc('ajustar_saldo_material', {
    p_actor_id: actorId,
    p_material_id: entrada.materialId,
    p_espesor_id: entrada.espesorId ?? null,
    p_nuevo_saldo: entrada.saldo,
    p_motivo: entrada.motivo,
  });
  if (error) throw new ErrorSaldoMaterial(mapearCodigo(error.message));
  const fila = data?.[0];
  if (!fila) throw new ErrorSaldoMaterial('desconocido');
  return {
    saldoAnterior: Number(fila.saldo_anterior),
    saldoNuevo: Number(fila.saldo_nuevo),
    actualizadoEn: fila.actualizado_en,
  };
}
