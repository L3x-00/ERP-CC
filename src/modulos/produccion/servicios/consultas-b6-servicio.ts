import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import type {
  CorridaItem,
  EstadoAutorizacionHoraExtra,
  EstadoCorrida,
  InspeccionCalidad,
} from '@/modulos/produccion/tipos/corridas';

type Admin = SupabaseClient<Database>;

/** Corrida con su proceso y el avance físico de cada ítem (lectura para UI). */
export type CorridaDetalle = {
  id: string;
  ordenId: string;
  codigo: string;
  procesoId: string;
  procesoNombre: string;
  requierePrimeraPieza: boolean;
  intervaloInspeccionLote: number | null;
  estado: EstadoCorrida;
  cantidadPlanificada: number;
  creadoEn: string;
  items: (CorridaItem & {
    partidaCodigo: string;
    cantidadSolicitada: number;
    cantidadProducida: number;
  })[];
};

/** Motivo de pausa activo del catálogo. */
export type MotivoPausaCatalogo = {
  codigo: string;
  nombre: string;
  requiereNota: boolean;
  liberaMaquina: boolean;
};

/** Proceso activo para el alta de corridas e inspecciones. */
export type ProcesoPiso = {
  id: string;
  codigo: string;
  nombre: string;
  prefijoCorrida: string;
  requierePrimeraPieza: boolean;
  intervaloInspeccionLote: number | null;
};

/** Sesión pausada con motivo liberable ≥60 min, lista para reclamar. */
export type RecursoLiberable = {
  sesionId: string;
  ordenId: string;
  ordenFolio: string;
  partidaId: string;
  partidaCodigo: string;
  recursoId: string;
  recursoCodigo: string;
  recursoNombre: string;
  motivoCodigo: string;
  motivoNombre: string;
  pausadaDesde: string | null;
};

/** Autorización de horas extra con folio de orden y autorizador. */
export type AutorizacionHoraExtraDetalle = {
  id: string;
  ordenId: string;
  ordenFolio: string;
  sesionId: string | null;
  horasAutorizadas: number;
  motivo: string;
  estado: EstadoAutorizacionHoraExtra;
  autorizadoPorNombre: string | null;
  creadoEn: string;
};

/** Inspección con contexto de partida/corrida y sus fotos del modelo `archivos`. */
export type InspeccionDetalle = InspeccionCalidad & {
  partidaCodigo: string | null;
  corridaCodigo: string | null;
  fotos: { id: string; nombreOriginal: string }[];
};

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

const ESTADOS_CORRIDA: readonly EstadoCorrida[] = [
  'PLANIFICADA', 'EN_PROCESO', 'PAUSADA', 'COMPLETADA', 'CANCELADA',
];

/** Corridas de una orden con proceso e ítems (más recientes primero). */
export async function obtenerCorridasOrdenServicio(
  admin: Admin,
  ordenId: string,
): Promise<CorridaDetalle[]> {
  const { data, error } = await admin
    .from('corridas')
    .select(
      'id, orden_id, codigo, proceso_id, estado, cantidad_planificada, creado_en, catalogo_procesos!corridas_proceso_id_fkey (nombre, requiere_primera_pieza, intervalo_inspeccion_lote), corrida_items!corrida_items_corrida_id_fkey (id, partida_id, codigo_item, cantidad, partidas_orden_produccion!corrida_items_partida_id_fkey (codigo_pieza, cantidad_solicitada, cantidad_producida))',
    )
    .eq('orden_id', ordenId)
    .order('creado_en', { ascending: false });

  if (error || !data) {
    throw new Error('No se pudieron cargar las corridas');
  }

  return data.map((fila) => {
    const proceso = fila.catalogo_procesos as unknown as {
      nombre: string;
      requiere_primera_pieza: boolean;
      intervalo_inspeccion_lote: number | null;
    } | null;
    const items = (fila.corrida_items ?? []) as unknown as {
      id: string;
      partida_id: string;
      codigo_item: string;
      cantidad: number;
      partidas_orden_produccion: {
        codigo_pieza: string;
        cantidad_solicitada: number;
        cantidad_producida: number;
      } | null;
    }[];

    return {
      id: fila.id,
      ordenId: fila.orden_id,
      codigo: fila.codigo,
      procesoId: fila.proceso_id,
      procesoNombre: proceso?.nombre ?? 'Proceso',
      requierePrimeraPieza: proceso?.requiere_primera_pieza ?? false,
      intervaloInspeccionLote: proceso?.intervalo_inspeccion_lote ?? null,
      estado: ESTADOS_CORRIDA.includes(fila.estado as EstadoCorrida)
        ? (fila.estado as EstadoCorrida)
        : 'PLANIFICADA',
      cantidadPlanificada: numero(fila.cantidad_planificada),
      creadoEn: fila.creado_en,
      items: items.map((item) => ({
        id: item.id,
        partidaId: item.partida_id,
        codigoItem: item.codigo_item,
        cantidad: numero(item.cantidad),
        partidaCodigo: item.partidas_orden_produccion?.codigo_pieza ?? item.codigo_item,
        cantidadSolicitada: numero(item.partidas_orden_produccion?.cantidad_solicitada),
        cantidadProducida: numero(item.partidas_orden_produccion?.cantidad_producida),
      })),
    };
  });
}

/** Motivos de pausa activos, ordenados para el selector de cierre. */
export async function obtenerMotivosPausaServicio(admin: Admin): Promise<MotivoPausaCatalogo[]> {
  const { data, error } = await admin
    .from('catalogo_motivos_pausa')
    .select('codigo, nombre, requiere_nota, libera_maquina')
    .eq('activo', true)
    .order('orden');

  if (error || !data) {
    throw new Error('No se pudieron cargar los motivos de pausa');
  }

  return data.map((fila) => ({
    codigo: fila.codigo,
    nombre: fila.nombre,
    requiereNota: fila.requiere_nota,
    liberaMaquina: fila.libera_maquina,
  }));
}

/** Procesos activos del catálogo para alta de corridas e inspecciones. */
export async function obtenerProcesosPisoServicio(admin: Admin): Promise<ProcesoPiso[]> {
  const { data, error } = await admin
    .from('catalogo_procesos')
    .select('id, codigo, nombre, prefijo_corrida, requiere_primera_pieza, intervalo_inspeccion_lote')
    .eq('activo', true)
    .order('orden');

  if (error || !data) {
    throw new Error('No se pudieron cargar los procesos');
  }

  return data.map((fila) => ({
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    prefijoCorrida: fila.prefijo_corrida,
    requierePrimeraPieza: fila.requiere_primera_pieza,
    intervaloInspeccionLote: fila.intervalo_inspeccion_lote,
  }));
}

/** Sesiones pausadas con motivo liberable desde hace ≥60 minutos. */
export async function obtenerRecursosLiberablesServicio(
  admin: Admin,
): Promise<RecursoLiberable[]> {
  const corte = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('sesiones_trabajo')
    .select(
      'id, orden_id, partida_id, fecha_fin, motivo_pausa_codigo, catalogo_motivos_pausa!sesiones_trabajo_motivo_pausa_codigo_fkey (nombre, libera_maquina), ordenes_produccion!sesiones_trabajo_orden_id_fkey (folio), partidas_orden_produccion!sesiones_trabajo_partida_id_fkey (codigo_pieza), programacion_areas!sesiones_trabajo_programacion_id_fkey (recurso_id, recursos_planeacion!programacion_areas_recurso_id_fkey (codigo, nombre))',
    )
    .eq('estado_sesion', 'pausada')
    .eq('recurso_liberado', false)
    .lte('fecha_fin', corte)
    .order('fecha_fin', { ascending: true });

  if (error || !data) {
    throw new Error('No se pudieron cargar los recursos liberables');
  }

  return (data as unknown as {
    id: string;
    orden_id: string;
    partida_id: string;
    fecha_fin: string | null;
    motivo_pausa_codigo: string | null;
    catalogo_motivos_pausa: { nombre: string; libera_maquina: boolean } | null;
    ordenes_produccion: { folio: string } | null;
    partidas_orden_produccion: { codigo_pieza: string } | null;
    programacion_areas: {
      recurso_id: string;
      recursos_planeacion: { codigo: string; nombre: string } | null;
    } | null;
  }[])
    .filter((fila) => fila.catalogo_motivos_pausa?.libera_maquina === true
      && fila.motivo_pausa_codigo !== null
      && fila.programacion_areas !== null)
    .map((fila) => ({
      sesionId: fila.id,
      ordenId: fila.orden_id,
      ordenFolio: fila.ordenes_produccion?.folio ?? '—',
      partidaId: fila.partida_id,
      partidaCodigo: fila.partidas_orden_produccion?.codigo_pieza ?? '—',
      recursoId: fila.programacion_areas!.recurso_id,
      recursoCodigo: fila.programacion_areas!.recursos_planeacion?.codigo ?? '—',
      recursoNombre: fila.programacion_areas!.recursos_planeacion?.nombre ?? '',
      motivoCodigo: fila.motivo_pausa_codigo!,
      motivoNombre: fila.catalogo_motivos_pausa?.nombre ?? fila.motivo_pausa_codigo!,
      pausadaDesde: fila.fecha_fin,
    }));
}

/** Autorizaciones de horas extra (opcionalmente de una orden), recientes primero. */
export async function obtenerAutorizacionesHoraExtraServicio(
  admin: Admin,
  ordenId?: string,
): Promise<AutorizacionHoraExtraDetalle[]> {
  let consulta = admin
    .from('autorizaciones_hora_extra')
    .select(
      'id, orden_id, sesion_id, horas_autorizadas, motivo, estado, creado_en, ordenes_produccion!autorizaciones_hora_extra_orden_id_fkey (folio), usuarios!autorizaciones_hora_extra_autorizado_por_fkey (nombre_completo)',
    )
    .order('creado_en', { ascending: false })
    .limit(20);
  if (ordenId) consulta = consulta.eq('orden_id', ordenId);

  const { data, error } = await consulta;
  if (error || !data) {
    throw new Error('No se pudieron cargar las autorizaciones de horas extra');
  }

  return (data as unknown as {
    id: string;
    orden_id: string;
    sesion_id: string | null;
    horas_autorizadas: number;
    motivo: string;
    estado: string;
    creado_en: string;
    ordenes_produccion: { folio: string } | null;
    usuarios: { nombre_completo: string } | null;
  }[]).map((fila) => ({
    id: fila.id,
    ordenId: fila.orden_id,
    ordenFolio: fila.ordenes_produccion?.folio ?? '—',
    sesionId: fila.sesion_id,
    horasAutorizadas: numero(fila.horas_autorizadas),
    motivo: fila.motivo,
    estado: (['VIGENTE', 'USADA', 'REVOCADA'] as const).includes(
      fila.estado as EstadoAutorizacionHoraExtra,
    )
      ? (fila.estado as EstadoAutorizacionHoraExtra)
      : 'VIGENTE',
    autorizadoPorNombre: fila.usuarios?.nombre_completo ?? null,
    creadoEn: fila.creado_en,
  }));
}

/** Inspecciones de calidad de una orden con sus fotos vigentes. */
export async function obtenerInspeccionesOrdenServicio(
  admin: Admin,
  ordenId: string,
): Promise<InspeccionDetalle[]> {
  const { data, error } = await admin
    .from('inspecciones_calidad')
    .select(
      'id, orden_id, corrida_id, partida_id, codigo_item, tipo, referencia, resultado, cantidad_inspeccionada, cantidad_ok, cantidad_nok, cantidad_retrabajo, observaciones, creado_en, corridas!inspecciones_calidad_corrida_id_fkey (codigo), partidas_orden_produccion!inspecciones_calidad_partida_id_fkey (codigo_pieza)',
    )
    .eq('orden_id', ordenId)
    .order('creado_en', { ascending: false });

  if (error || !data) {
    throw new Error('No se pudieron cargar las inspecciones');
  }

  const ids = data.map((fila) => fila.id);
  const fotosPorInspeccion = new Map<string, { id: string; nombreOriginal: string }[]>();
  if (ids.length > 0) {
    const { data: archivos, error: errorArchivos } = await admin
      .from('archivos')
      .select('id, entidad_id, nombre_original')
      .eq('entidad', 'inspeccion_calidad')
      .in('entidad_id', ids)
      .eq('vigente', true);
    if (errorArchivos) {
      throw new Error('No se pudieron cargar las fotos de las inspecciones');
    }
    for (const archivo of archivos ?? []) {
      const lista = fotosPorInspeccion.get(archivo.entidad_id) ?? [];
      lista.push({ id: archivo.id, nombreOriginal: archivo.nombre_original });
      fotosPorInspeccion.set(archivo.entidad_id, lista);
    }
  }

  return (data as unknown as {
    id: string;
    orden_id: string;
    corrida_id: string | null;
    partida_id: string | null;
    codigo_item: string;
    tipo: string;
    referencia: number | null;
    resultado: string;
    cantidad_inspeccionada: number;
    cantidad_ok: number;
    cantidad_nok: number;
    cantidad_retrabajo: number;
    observaciones: string | null;
    creado_en: string;
    corridas: { codigo: string } | null;
    partidas_orden_produccion: { codigo_pieza: string } | null;
  }[]).map((fila) => ({
    id: fila.id,
    ordenId: fila.orden_id,
    corridaId: fila.corrida_id,
    partidaId: fila.partida_id,
    codigoItem: fila.codigo_item,
    tipo: (['PRIMERA_PIEZA', 'REFERENCIA_LOTE', 'CIERRE'] as const).includes(
      fila.tipo as 'PRIMERA_PIEZA',
    )
      ? (fila.tipo as InspeccionCalidad['tipo'])
      : 'CIERRE',
    referencia: fila.referencia === null ? null : numero(fila.referencia),
    resultado: fila.resultado === 'APROBADA' ? 'APROBADA' : 'RECHAZADA',
    cantidadInspeccionada: numero(fila.cantidad_inspeccionada),
    cantidadOk: numero(fila.cantidad_ok),
    cantidadNok: numero(fila.cantidad_nok),
    cantidadRetrabajo: numero(fila.cantidad_retrabajo),
    observaciones: fila.observaciones,
    creadoEn: fila.creado_en,
    partidaCodigo: fila.partidas_orden_produccion?.codigo_pieza ?? null,
    corridaCodigo: fila.corridas?.codigo ?? null,
    fotos: fotosPorInspeccion.get(fila.id) ?? [],
  }));
}
