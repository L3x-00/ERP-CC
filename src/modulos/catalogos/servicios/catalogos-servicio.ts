import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import {
  filaACanal,
  filaAEspesor,
  filaAGrupoEquipo,
  filaAGrupoPlaneado,
  filaAMaterial,
  filaAProceso,
  filaAProximaAccion,
  filaAVersion,
  type AreaTrabajoOpcion,
  type CanalCatalogo,
  type EspesorCatalogo,
  type GrupoEquipoCatalogo,
  type GrupoPlaneadoCatalogo,
  type MaterialCatalogo,
  type ProcesoCatalogo,
  type ProximaAccionCatalogo,
  type VersionCatalogo,
} from '@/modulos/catalogos/tipos/indice';
import type {
  AlternarActivoInput,
  GuardarCanalInput,
  GuardarEspesorInput,
  GuardarGrupoEquipoInput,
  GuardarGrupoPlaneadoInput,
  GuardarMaterialInput,
  GuardarProcesoInput,
  GuardarProximaAccionInput,
  ListarVersionesInput,
} from '@/modulos/catalogos/validaciones/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export type ClienteCatalogos = SupabaseClient<Database>;

export interface DatosCatalogosBaseServicio {
  materiales: MaterialCatalogo[];
  espesores: EspesorCatalogo[];
  procesos: ProcesoCatalogo[];
  gruposEquipo: GrupoEquipoCatalogo[];
  gruposPlaneados: GrupoPlaneadoCatalogo[];
  proximasAcciones: ProximaAccionCatalogo[];
  canales: CanalCatalogo[];
  areasTrabajo: AreaTrabajoOpcion[];
}

export async function listarMateriales(
  cliente: ClienteCatalogos = crearClienteSupabaseAdmin(),
  soloActivos = false,
): Promise<MaterialCatalogo[]> {
  let consulta = cliente.from('catalogo_materiales').select('*');
  if (soloActivos) consulta = consulta.eq('activo', true);
  const { data, error } = await consulta
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((fila) => filaAMaterial(fila));
}

export async function listarEspesores(
  cliente: ClienteCatalogos = crearClienteSupabaseAdmin(),
  soloActivos = false,
): Promise<EspesorCatalogo[]> {
  let consulta = cliente.from('catalogo_espesores').select('*');
  if (soloActivos) consulta = consulta.eq('activo', true);
  const { data, error } = await consulta
    .order('orden', { ascending: true })
    .order('espesor_mm', { ascending: true })
    .order('etiqueta', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((fila) => filaAEspesor(fila));
}

export async function listarProcesos(
  cliente: ClienteCatalogos = crearClienteSupabaseAdmin(),
  soloActivos = false,
): Promise<ProcesoCatalogo[]> {
  let consulta = cliente.from('catalogo_procesos').select('*');
  if (soloActivos) consulta = consulta.eq('activo', true);
  const { data, error } = await consulta
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((fila) => filaAProceso(fila));
}

export async function listarGruposEquipo(
  cliente: ClienteCatalogos = crearClienteSupabaseAdmin(),
  soloActivos = false,
): Promise<GrupoEquipoCatalogo[]> {
  let consulta = cliente.from('grupos_equipo').select('*');
  if (soloActivos) consulta = consulta.eq('activo', true);
  const { data, error } = await consulta
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((fila) => filaAGrupoEquipo(fila));
}

export async function listarGruposPlaneados(
  cliente: ClienteCatalogos = crearClienteSupabaseAdmin(),
  soloActivos = false,
): Promise<GrupoPlaneadoCatalogo[]> {
  let consulta = cliente.from('grupos_planeados').select('*');
  if (soloActivos) consulta = consulta.eq('activo', true);
  const { data, error } = await consulta
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((fila) => filaAGrupoPlaneado(fila));
}

export async function listarProximasAcciones(
  cliente: ClienteCatalogos = crearClienteSupabaseAdmin(),
  soloActivos = false,
): Promise<ProximaAccionCatalogo[]> {
  let consulta = cliente.from('catalogo_proximas_acciones').select('*');
  if (soloActivos) consulta = consulta.eq('activo', true);
  const { data, error } = await consulta
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((fila) => filaAProximaAccion(fila));
}

export async function listarCanales(
  cliente: ClienteCatalogos = crearClienteSupabaseAdmin(),
  soloActivos = false,
): Promise<CanalCatalogo[]> {
  let consulta = cliente.from('catalogo_canales').select('*');
  if (soloActivos) consulta = consulta.eq('activo', true);
  const { data, error } = await consulta
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((fila) => filaACanal(fila));
}

/** Catálogo de taller de solo lectura para enlazar procesos (B1.5). */
export async function listarAreasTrabajoOpciones(
  cliente: ClienteCatalogos = crearClienteSupabaseAdmin(),
): Promise<AreaTrabajoOpcion[]> {
  const { data, error } = await cliente
    .from('areas_trabajo_config')
    .select('codigo, nombre, activo')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((fila) => ({ codigo: fila.codigo, nombre: fila.nombre, activo: fila.activo }));
}

export async function obtenerCatalogosBaseServicio(
  cliente: ClienteCatalogos = crearClienteSupabaseAdmin(),
  soloActivos = false,
): Promise<DatosCatalogosBaseServicio> {
  const [
    materiales,
    espesores,
    procesos,
    gruposEquipo,
    gruposPlaneados,
    proximasAcciones,
    canales,
    areasTrabajo,
  ] = await Promise.all([
    listarMateriales(cliente, soloActivos),
    listarEspesores(cliente, soloActivos),
    listarProcesos(cliente, soloActivos),
    listarGruposEquipo(cliente, soloActivos),
    listarGruposPlaneados(cliente, soloActivos),
    listarProximasAcciones(cliente, soloActivos),
    listarCanales(cliente, soloActivos),
    listarAreasTrabajoOpciones(cliente),
  ]);
  return {
    materiales,
    espesores,
    procesos,
    gruposEquipo,
    gruposPlaneados,
    proximasAcciones,
    canales,
    areasTrabajo,
  };
}

export async function guardarMaterialServicio(
  cliente: ClienteCatalogos,
  entrada: GuardarMaterialInput,
): Promise<MaterialCatalogo> {
  const payload: Database['public']['Tables']['catalogo_materiales']['Insert'] = {
    codigo: entrada.codigo,
    nombre: entrada.nombre,
    activo: entrada.activo,
    orden: entrada.orden,
  };
  const consulta = entrada.id
    ? cliente.from('catalogo_materiales').update(payload).eq('id', entrada.id).select('*').single()
    : cliente.from('catalogo_materiales').insert(payload).select('*').single();
  const { data, error } = await consulta;
  if (error) throw error;
  return filaAMaterial(data);
}

export async function guardarEspesorServicio(
  cliente: ClienteCatalogos,
  entrada: GuardarEspesorInput,
): Promise<EspesorCatalogo> {
  const payload: Database['public']['Tables']['catalogo_espesores']['Insert'] = {
    material_id: entrada.materialId,
    etiqueta: entrada.etiqueta,
    espesor_mm: entrada.espesorMm,
    activo: entrada.activo,
    orden: entrada.orden,
  };
  const consulta = entrada.id
    ? cliente.from('catalogo_espesores').update(payload).eq('id', entrada.id).select('*').single()
    : cliente.from('catalogo_espesores').insert(payload).select('*').single();
  const { data, error } = await consulta;
  if (error) throw error;
  return filaAEspesor(data);
}

export async function guardarProcesoServicio(
  cliente: ClienteCatalogos,
  entrada: GuardarProcesoInput,
): Promise<ProcesoCatalogo> {
  const payload: Database['public']['Tables']['catalogo_procesos']['Insert'] = {
    codigo: entrada.codigo,
    nombre: entrada.nombre,
    prefijo_corrida: entrada.prefijoCorrida,
    grupo_planeado_id: entrada.grupoPlaneadoId ?? null,
    area_trabajo_codigo: entrada.areaTrabajoCodigo ?? null,
    requiere_archivo_tecnico: entrada.requiereArchivoTecnico,
    requiere_primera_pieza: entrada.requierePrimeraPieza,
    intervalo_inspeccion_lote: entrada.intervaloInspeccionLote,
    activo: entrada.activo,
    orden: entrada.orden,
  };
  const consulta = entrada.id
    ? cliente.from('catalogo_procesos').update(payload).eq('id', entrada.id).select('*').single()
    : cliente.from('catalogo_procesos').insert(payload).select('*').single();
  const { data, error } = await consulta;
  if (error) throw error;
  return filaAProceso(data);
}

export async function guardarGrupoEquipoServicio(
  cliente: ClienteCatalogos,
  entrada: GuardarGrupoEquipoInput,
): Promise<GrupoEquipoCatalogo> {
  const payload: Database['public']['Tables']['grupos_equipo']['Insert'] = {
    codigo: entrada.codigo,
    nombre: entrada.nombre,
    activo: entrada.activo,
    orden: entrada.orden,
    ...(entrada.tarifaHora !== undefined ? { tarifa_hora: entrada.tarifaHora } : {}),
    ...(entrada.tarifaMoneda !== undefined ? { tarifa_moneda: entrada.tarifaMoneda } : {}),
  };
  const consulta = entrada.id
    ? cliente.from('grupos_equipo').update(payload).eq('id', entrada.id).select('*').single()
    : cliente.from('grupos_equipo').insert(payload).select('*').single();
  const { data, error } = await consulta;
  if (error) throw error;
  return filaAGrupoEquipo(data);
}

export async function guardarGrupoPlaneadoServicio(
  cliente: ClienteCatalogos,
  entrada: GuardarGrupoPlaneadoInput,
): Promise<GrupoPlaneadoCatalogo> {
  const payload: Database['public']['Tables']['grupos_planeados']['Insert'] = {
    codigo: entrada.codigo,
    nombre: entrada.nombre,
    activo: entrada.activo,
    orden: entrada.orden,
  };
  const consulta = entrada.id
    ? cliente.from('grupos_planeados').update(payload).eq('id', entrada.id).select('*').single()
    : cliente.from('grupos_planeados').insert(payload).select('*').single();
  const { data, error } = await consulta;
  if (error) throw error;
  return filaAGrupoPlaneado(data);
}

export async function guardarProximaAccionServicio(
  cliente: ClienteCatalogos,
  entrada: GuardarProximaAccionInput,
): Promise<ProximaAccionCatalogo> {
  const payload: Database['public']['Tables']['catalogo_proximas_acciones']['Insert'] = {
    codigo: entrada.codigo,
    nombre: entrada.nombre,
    es_otro: entrada.esOtro,
    activo: entrada.activo,
    orden: entrada.orden,
  };
  const consulta = entrada.id
    ? cliente.from('catalogo_proximas_acciones').update(payload).eq('id', entrada.id).select('*').single()
    : cliente.from('catalogo_proximas_acciones').insert(payload).select('*').single();
  const { data, error } = await consulta;
  if (error) throw error;
  return filaAProximaAccion(data);
}

/**
 * Alta/edición de un canal RFQ. La unicidad de "Otro" la impone un índice
 * parcial de la base; aquí no se replica para no divergir de ella.
 */
export async function guardarCanalServicio(
  cliente: ClienteCatalogos,
  entrada: GuardarCanalInput,
): Promise<CanalCatalogo> {
  const payload: Database['public']['Tables']['catalogo_canales']['Insert'] = {
    codigo: entrada.codigo,
    nombre: entrada.nombre,
    es_otro: entrada.esOtro,
    activo: entrada.activo,
    orden: entrada.orden,
  };
  const consulta = entrada.id
    ? cliente.from('catalogo_canales').update(payload).eq('id', entrada.id).select('*').single()
    : cliente.from('catalogo_canales').insert(payload).select('*').single();
  const { data, error } = await consulta;
  if (error) throw error;
  return filaACanal(data);
}

/**
 * Alterna activo/inactivo. No existe DELETE en la aplicación ni en la base:
 * los códigos retirados se desactivan y permanecen visibles en históricos.
 */
export async function alternarActivoServicio(
  cliente: ClienteCatalogos,
  entrada: AlternarActivoInput,
): Promise<{ id: string; activo: boolean }> {
  const actualizar = async (
    entidad: AlternarActivoInput['entidad'],
    id: string,
    activo: boolean,
  ): Promise<{ id: string; activo: boolean }> => {
    switch (entidad) {
      case 'catalogo_materiales': {
        const { data, error } = await cliente
          .from('catalogo_materiales')
          .update({ activo })
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('catalogo_no_encontrado');
        return { id: data.id, activo };
      }
      case 'catalogo_espesores': {
        const { data, error } = await cliente
          .from('catalogo_espesores')
          .update({ activo })
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('catalogo_no_encontrado');
        return { id: data.id, activo };
      }
      case 'catalogo_procesos': {
        const { data, error } = await cliente
          .from('catalogo_procesos')
          .update({ activo })
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('catalogo_no_encontrado');
        return { id: data.id, activo };
      }
      case 'grupos_equipo': {
        const { data, error } = await cliente
          .from('grupos_equipo')
          .update({ activo })
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('catalogo_no_encontrado');
        return { id: data.id, activo };
      }
      case 'grupos_planeados': {
        const { data, error } = await cliente
          .from('grupos_planeados')
          .update({ activo })
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('catalogo_no_encontrado');
        return { id: data.id, activo };
      }
      case 'catalogo_proximas_acciones': {
        const { data, error } = await cliente
          .from('catalogo_proximas_acciones')
          .update({ activo })
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('catalogo_no_encontrado');
        return { id: data.id, activo };
      }
      case 'catalogo_canales': {
        const { data, error } = await cliente
          .from('catalogo_canales')
          .update({ activo })
          .eq('id', id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('catalogo_no_encontrado');
        return { id: data.id, activo };
      }
      default:
        throw new Error('entidad_catalogo_desconocida');
    }
  };

  return actualizar(entrada.entidad, entrada.id, entrada.activo);
}

/** Historial descendente de un registro; la UI muestra snapshots y actor. */
export async function listarVersionesServicio(
  cliente: ClienteCatalogos,
  entrada: ListarVersionesInput,
): Promise<VersionCatalogo[]> {
  const { data, error } = await cliente
    .from('versiones_catalogo')
    .select('*')
    .eq('entidad', entrada.entidad)
    .eq('entidad_id', entrada.entidadId)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((fila) => filaAVersion(fila));
}
