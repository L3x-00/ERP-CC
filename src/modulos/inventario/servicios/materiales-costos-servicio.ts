import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

import type {
  MaterialCosto,
  MonedaCosto,
  PropuestaCostoMaterial,
  VersionCostoMaterial,
} from '../tipos/materiales-costos';
import type {
  ConfirmarCostoMaterialInput,
  ProponerCostoMaterialInput,
} from '../validaciones/materiales-costos';

export type CodigoErrorCostoMaterial =
  | 'sin_permiso_materiales'
  | 'costo_requiere_confirmacion'
  | 'propuesta_costo_invalida'
  | 'confirmacion_costo_invalida'
  | 'propuesta_costo_requerida'
  | 'propuesta_costo_no_coincide'
  | 'material_inexistente_o_inactivo'
  | 'material_inexistente'
  | 'material_desactualizado'
  | 'historial_costos_append_only'
  | 'desconocido';

/** Error de dominio de materiales y costos con código estable (C6.1). */
export class ErrorCostoMaterial extends Error {
  constructor(public readonly codigo: CodigoErrorCostoMaterial) {
    super(codigo);
    this.name = 'ErrorCostoMaterial';
  }
}

const MENSAJES_ERROR: Record<CodigoErrorCostoMaterial, string> = {
  sin_permiso_materiales: 'Sin permiso para gestionar costos de materiales',
  costo_requiere_confirmacion: 'El costo solo cambia con una confirmación autorizada',
  propuesta_costo_invalida: 'La propuesta no es válida: revisa costo, moneda, fecha y referencia',
  confirmacion_costo_invalida: 'La confirmación no es válida: revisa los datos',
  propuesta_costo_requerida: 'Una compra o gasto exige su propuesta de origen',
  propuesta_costo_no_coincide:
    'La propuesta ya fue confirmada o sus datos cambiaron; recarga la lista',
  material_inexistente_o_inactivo: 'El material no existe o está inactivo',
  material_inexistente: 'El material no existe',
  material_desactualizado: 'El material cambió desde que se abrió; recarga e intenta de nuevo',
  historial_costos_append_only: 'El historial de costos es de solo lectura',
  desconocido: 'No se pudo completar la operación de costo',
};

/** Mensaje saneado para la UI a partir del código de error del dominio. */
export function mensajeErrorCosto(codigo: CodigoErrorCostoMaterial): string {
  return MENSAJES_ERROR[codigo];
}

const CODIGOS_CONOCIDOS = (Object.keys(MENSAJES_ERROR) as CodigoErrorCostoMaterial[])
  .filter((codigo) => codigo !== 'desconocido')
  .sort((a, b) => b.length - a.length);

function mapearCodigo(mensaje: string): CodigoErrorCostoMaterial {
  for (const codigo of CODIGOS_CONOCIDOS) {
    if (mensaje.includes(codigo)) return codigo;
  }
  return 'desconocido';
}

function monedaDe(valor: string): MonedaCosto {
  return valor === 'USD' ? 'USD' : 'MXN';
}

type FilaMaterialListado = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
  unidad_base: string;
  moneda_costo: string;
  costo_vigente: number | null;
  fecha_vigencia_costo: string | null;
  costo_confirmado_en: string | null;
  costo_confirmado_por: string | null;
  actualizado_en: string;
};

const COLUMNAS_MATERIAL =
  'id, codigo, nombre, activo, orden, unidad_base, moneda_costo, costo_vigente, fecha_vigencia_costo, costo_confirmado_en, costo_confirmado_por, actualizado_en';

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
    console.error('[MATERIALES] Error al resolver actores:', error.message);
    return new Map();
  }
  return new Map((data ?? []).map((usuario) => [usuario.id, usuario.nombre_completo]));
}

async function contarPropuestasPendientes(
  cliente: SupabaseClient<Database>,
): Promise<Map<string, number>> {
  const { data, error } = await cliente
    .from('propuestas_costo_material')
    .select('material_id')
    .eq('estado', 'PENDIENTE');
  if (error) {
    console.error('[MATERIALES] Error al contar propuestas:', error.message);
    return new Map();
  }
  const conteo = new Map<string, number>();
  for (const fila of data ?? []) {
    conteo.set(fila.material_id, (conteo.get(fila.material_id) ?? 0) + 1);
  }
  return conteo;
}

async function mapaMateriales(
  cliente: SupabaseClient<Database>,
  ids: readonly string[],
): Promise<Map<string, { codigo: string; nombre: string }>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const { data, error } = await cliente
    .from('catalogo_materiales')
    .select('id, codigo, nombre')
    .in('id', unicos);
  if (error) {
    console.error('[MATERIALES] Error al resolver materiales:', error.message);
    return new Map();
  }
  return new Map((data ?? []).map((fila) => [fila.id, { codigo: fila.codigo, nombre: fila.nombre }]));
}

function aMaterialCosto(
  fila: FilaMaterialListado,
  nombres: Map<string, string>,
  pendientes: Map<string, number>,
): MaterialCosto {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    activo: fila.activo,
    unidadBase: fila.unidad_base,
    monedaCosto: monedaDe(fila.moneda_costo),
    costoVigente: fila.costo_vigente === null ? null : Number(fila.costo_vigente),
    fechaVigenciaCosto: fila.fecha_vigencia_costo,
    costoConfirmadoEn: fila.costo_confirmado_en,
    costoConfirmadoPorNombre: fila.costo_confirmado_por
      ? nombres.get(fila.costo_confirmado_por) ?? null
      : null,
    actualizadoEn: fila.actualizado_en,
    propuestasPendientes: pendientes.get(fila.id) ?? 0,
  };
}

/**
 * Materiales del catálogo canónico con su costo vigente, quién lo confirmó y
 * cuántas propuestas pendientes tiene cada uno (C6.1).
 */
export async function listarMaterialesCostos(
  cliente: SupabaseClient<Database>,
): Promise<MaterialCosto[]> {
  const { data, error } = await cliente
    .from('catalogo_materiales')
    .select(COLUMNAS_MATERIAL)
    .order('orden');
  if (error) {
    console.error('[MATERIALES] Error al listar el catálogo:', error.message);
    throw new ErrorCostoMaterial('desconocido');
  }
  const filas = data ?? [];
  const [nombres, pendientes] = await Promise.all([
    nombresDeUsuarios(cliente, filas.map((fila) => fila.costo_confirmado_por)),
    contarPropuestasPendientes(cliente),
  ]);
  return filas.map((fila) => aMaterialCosto(fila, nombres, pendientes));
}

/** Propuestas de costo pendientes de confirmación, de la más nueva a la más vieja. */
export async function listarPropuestasCostoPendientes(
  cliente: SupabaseClient<Database>,
): Promise<PropuestaCostoMaterial[]> {
  const { data, error } = await cliente
    .from('propuestas_costo_material')
    .select(
      'id, material_id, costo_propuesto, moneda, fecha_efectiva, fuente, referencia, propuesto_por, propuesto_en',
    )
    .eq('estado', 'PENDIENTE')
    .order('propuesto_en', { ascending: false })
    .limit(100);
  if (error) {
    console.error('[MATERIALES] Error al listar propuestas:', error.message);
    throw new ErrorCostoMaterial('desconocido');
  }
  const filas = data ?? [];
  const [materiales, nombres] = await Promise.all([
    mapaMateriales(cliente, filas.map((fila) => fila.material_id)),
    nombresDeUsuarios(cliente, filas.map((fila) => fila.propuesto_por)),
  ]);
  return filas.map((fila) => {
    const material = materiales.get(fila.material_id);
    return {
      id: fila.id,
      materialId: fila.material_id,
      materialCodigo: material?.codigo ?? '—',
      materialNombre: material?.nombre ?? 'Material',
      costoPropuesto: Number(fila.costo_propuesto),
      moneda: monedaDe(fila.moneda),
      fechaEfectiva: fila.fecha_efectiva,
      fuente: fila.fuente === 'COMPRA' ? 'COMPRA' : 'GASTO',
      referencia: fila.referencia,
      propuestoPorNombre: nombres.get(fila.propuesto_por) ?? 'Usuario',
      propuestoEn: fila.propuesto_en,
    };
  });
}

/** Historial append-only de costos confirmados (opcionalmente por material). */
export async function listarHistorialCostos(
  cliente: SupabaseClient<Database>,
  opciones: { materialId?: string; limite?: number } = {},
): Promise<VersionCostoMaterial[]> {
  let consulta = cliente
    .from('historial_costos_material')
    .select(
      'id, material_id, costo_anterior, moneda_anterior, costo_nuevo, moneda_nueva, fecha_efectiva, fuente, referencia, actor_id, confirmado_en',
    )
    .order('confirmado_en', { ascending: false })
    .order('id', { ascending: false })
    .limit(opciones.limite ?? 100);
  if (opciones.materialId) {
    consulta = consulta.eq('material_id', opciones.materialId);
  }
  const { data, error } = await consulta;
  if (error) {
    console.error('[MATERIALES] Error al listar el historial:', error.message);
    throw new ErrorCostoMaterial('desconocido');
  }
  const filas = data ?? [];
  const [materiales, nombres] = await Promise.all([
    mapaMateriales(cliente, filas.map((fila) => fila.material_id)),
    nombresDeUsuarios(cliente, filas.map((fila) => fila.actor_id)),
  ]);
  return filas.map((fila) => {
    const material = materiales.get(fila.material_id);
    return {
      id: fila.id,
      materialId: fila.material_id,
      materialCodigo: material?.codigo ?? '—',
      materialNombre: material?.nombre ?? 'Material',
      costoAnterior: fila.costo_anterior === null ? null : Number(fila.costo_anterior),
      monedaAnterior: fila.moneda_anterior === null ? null : monedaDe(fila.moneda_anterior),
      costoNuevo: Number(fila.costo_nuevo),
      monedaNueva: monedaDe(fila.moneda_nueva),
      fechaEfectiva: fila.fecha_efectiva,
      fuente: fila.fuente === 'MANUAL' ? 'MANUAL' : fila.fuente === 'COMPRA' ? 'COMPRA' : 'GASTO',
      referencia: fila.referencia,
      actorNombre: nombres.get(fila.actor_id) ?? 'Usuario',
      confirmadoEn: fila.confirmado_en,
    };
  });
}

/** Registra una propuesta de costo (compra/gasto propone, C6.1/DC-13). */
export async function proponerCostoMaterialServicio(
  cliente: SupabaseClient<Database>,
  entrada: ProponerCostoMaterialInput,
  actorId: string,
): Promise<string> {
  const { data, error } = await cliente.rpc('proponer_costo_material', {
    p_material_id: entrada.materialId,
    p_costo: entrada.costo,
    p_moneda: entrada.moneda,
    p_fecha_efectiva: entrada.fechaEfectiva,
    p_fuente: entrada.fuente,
    p_referencia: entrada.referencia,
    p_actor_id: actorId,
  });
  if (error) throw new ErrorCostoMaterial(mapearCodigo(error.message));
  if (!data) throw new ErrorCostoMaterial('desconocido');
  return data;
}

/** Confirma un costo (manual o de una propuesta) con token CAS del material. */
export async function confirmarCostoMaterialServicio(
  cliente: SupabaseClient<Database>,
  entrada: ConfirmarCostoMaterialInput,
  actorId: string,
): Promise<{ materialId: string; costoVigente: number; monedaCosto: MonedaCosto; actualizadoEn: string }> {
  const { data, error } = await cliente.rpc('confirmar_costo_material', {
    p_material_id: entrada.materialId,
    p_costo: entrada.costo,
    p_moneda: entrada.moneda,
    p_fecha_efectiva: entrada.fechaEfectiva,
    p_fuente: entrada.fuente,
    p_referencia: entrada.referencia ?? '',
    p_actor_id: actorId,
    p_actualizado_en: entrada.actualizadoEn,
    ...(entrada.propuestaId ? { p_propuesta_id: entrada.propuestaId } : {}),
  });
  if (error) throw new ErrorCostoMaterial(mapearCodigo(error.message));
  const fila = data?.[0];
  if (!fila) throw new ErrorCostoMaterial('desconocido');
  return {
    materialId: fila.material_id,
    costoVigente: Number(fila.costo_vigente),
    monedaCosto: monedaDe(fila.moneda_costo),
    actualizadoEn: fila.actualizado_en,
  };
}
