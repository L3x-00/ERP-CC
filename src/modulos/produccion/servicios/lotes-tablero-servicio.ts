import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';
import { obtenerCorridasConPrimeraPiezaPendiente } from '@/modulos/produccion/servicios/primera-pieza-corrida';
import type {
  CorridaItem,
  CorridaReferencia,
  EstadoCorrida,
  LoteTablero,
  SesionLote,
} from '@/modulos/produccion/tipos/indice';

type Admin = SupabaseClient<Database>;

/** Lotes terminados o cancelados ya no son trabajo en curso del tablero. */
const ESTADOS_LOTE_VISIBLE = ['PLANIFICADA', 'EN_PROCESO', 'PAUSADA'] as const;

const COLUMNAS_SESION_LOTE =
  'id, corrida_id, partida_id, programacion_id, fecha_inicio, fecha_fin, estado_sesion, horas_netas, operador_id, motivo_pausa_codigo, actualizado_en, pendiente_actualizacion_avance';

type FilaSesionLote = {
  id: string;
  corrida_id: string | null;
  partida_id: string;
  programacion_id: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado_sesion: string;
  horas_netas: string | number;
  operador_id: string;
  motivo_pausa_codigo: string | null;
  actualizado_en: string;
  pendiente_actualizacion_avance: boolean;
};

async function enLotes<T>(
  ids: readonly string[],
  consulta: (lote: string[]) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (const lote of dividirEnLotes(ids)) {
    const { data, error } = await consulta(lote);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
  }
  return filas;
}

/**
 * Lotes en curso de las órdenes visibles. La proyección alimenta tanto la
 * tarjeta resumida como la ficha del lote: por eso trae descripción, material,
 * cantidades, primera pieza pendiente y la sesión de la corrida. El estado y
 * el avance siguen siendo datos del servidor; el realtime solo pide releer.
 */
export async function obtenerLotesTableroServicio(
  cliente: Admin,
  ordenIds: readonly string[],
): Promise<LoteTablero[]> {
  if (ordenIds.length === 0) return [];

  const [corridas, ordenes] = await Promise.all([
    enLotes<{
      id: string;
      codigo: string;
      estado: string;
      orden_id: string;
      proceso_id: string;
      cantidad_planificada: string | number;
      creado_en: string;
    }>(ordenIds, (lote) =>
      cliente
        .from('corridas')
        .select('id, codigo, estado, orden_id, proceso_id, cantidad_planificada, creado_en')
        .in('orden_id', lote)
        .in('estado', [...ESTADOS_LOTE_VISIBLE])
        .order('creado_en', { ascending: false })
        .order('id')
        .range(0, 999)),
    enLotes<{ id: string; folio: string; folio_sii: string | null; cliente_id: string }>(
      ordenIds,
      (lote) => cliente
        .from('ordenes_produccion')
        .select('id, folio, folio_sii, cliente_id')
        .in('id', lote)
        .range(0, 999),
    ),
  ]);
  if (corridas.length === 0) return [];

  const corridaIds = corridas.map((corrida) => corrida.id);
  const [items, procesos, clientes] = await Promise.all([
    enLotes<{
      id: string;
      corrida_id: string;
      partida_id: string;
      codigo_item: string;
      cantidad: string | number;
    }>(
      corridaIds,
      (lote) => cliente
        .from('corrida_items')
        .select('id, corrida_id, partida_id, codigo_item, cantidad')
        .in('corrida_id', lote)
        .range(0, 999),
    ),
    enLotes<{ id: string; nombre: string }>(
      [...new Set(corridas.map((corrida) => corrida.proceso_id))],
      (lote) => cliente
        .from('catalogo_procesos')
        .select('id, nombre')
        .in('id', lote)
        .range(0, 999),
    ),
    enLotes<{ id: string; razon_social: string; nombre_comercial: string | null }>(
      [...new Set(ordenes.map((orden) => orden.cliente_id))],
      (lote) => cliente
        .from('clientes')
        .select('id, razon_social, nombre_comercial')
        .in('id', lote)
        .range(0, 999),
    ),
  ]);

  const partidaIds = [...new Set(items.map((item) => item.partida_id))];
  const [partidas, programaciones, sesiones] = await Promise.all([
    enLotes<{
      id: string;
      descripcion: string | null;
      cantidad_solicitada: string | number;
      cantidad_producida: string | number;
      material_id: string | null;
      area_trabajo_codigo: string | null;
    }>(partidaIds, (lote) => cliente
      .from('partidas_orden_produccion')
      .select('id, descripcion, cantidad_solicitada, cantidad_producida, material_id, area_trabajo_codigo')
      .in('id', lote)
      .range(0, 999)),
    enLotes<{
      id: string;
      partida_id: string;
      horas_estimadas: string | number | null;
      es_continuacion: boolean | null;
      actualizado_en: string;
    }>(partidaIds, (lote) => cliente
      .from('programacion_areas')
      .select('id, partida_id, horas_estimadas, es_continuacion, actualizado_en')
      .in('partida_id', lote)
      .neq('estado_planeacion', 'cancelada')
      .range(0, 999)),
    enLotes<FilaSesionLote>(corridaIds, (lote) => cliente
      .from('sesiones_trabajo')
      .select(COLUMNAS_SESION_LOTE)
      .in('corrida_id', lote)
      .order('fecha_inicio', { ascending: false })
      .range(0, 999)),
  ]);

  const materialIds = [
    ...new Set(partidas.map((partida) => partida.material_id).filter((id): id is string => id !== null)),
  ];
  const operadorIds = [...new Set(sesiones.map((sesion) => sesion.operador_id))];
  const [materiales, operadores, primeraPiezaPendiente] = await Promise.all([
    enLotes<{
      id: string;
      codigo: string;
      nombre: string;
      ancho_mm: string | number | null;
      largo_mm: string | number | null;
    }>(materialIds, (lote) => cliente
      .from('catalogo_materiales')
      .select('id, codigo, nombre, ancho_mm, largo_mm')
      .in('id', lote)
      .range(0, 999)),
    enLotes<{ id: string; nombre_completo: string | null }>(
      operadorIds,
      (lote) => cliente
        .from('usuarios')
        .select('id, nombre_completo')
        .in('id', lote)
        .range(0, 999),
    ),
    obtenerCorridasConPrimeraPiezaPendiente(cliente, corridaIds),
  ]);

  const materialesPorId = new Map(materiales.map((material) => [material.id, material] as const));
  const nombresOperador = new Map(
    operadores.map((operador) => [operador.id, operador.nombre_completo] as const),
  );
  const partidasPorId = new Map(partidas.map((partida) => [partida.id, partida] as const));
  const horasPorPartida = new Map<string, number>();
  const tokenPorProgramacion = new Map<string, string>();
  for (const programacion of programaciones) {
    tokenPorProgramacion.set(programacion.id, programacion.actualizado_en);
    // C16: los días de continuación solo reservan capacidad; no duplican la
    // estimación de la operación que realmente se abre en piso.
    if (programacion.es_continuacion === true) continue;
    const horas = Number(programacion.horas_estimadas ?? 0);
    horasPorPartida.set(
      programacion.partida_id,
      (horasPorPartida.get(programacion.partida_id) ?? 0) + (Number.isFinite(horas) ? horas : 0),
    );
  }
  const sesionPorCorrida = new Map<string, SesionLote>();
  const sesionesOrdenadas = [...sesiones].sort((primera, segunda) => {
    const peso = (valor: string) => valor === 'activa' || valor === 'pausada' ? 0 : 1;
    const diferencia = peso(primera.estado_sesion) - peso(segunda.estado_sesion);
    return diferencia !== 0 ? diferencia : segunda.fecha_inicio.localeCompare(primera.fecha_inicio);
  });
  for (const sesion of sesionesOrdenadas) {
    if (sesion.corrida_id === null || sesionPorCorrida.has(sesion.corrida_id)) continue;
    const estadoSesion = sesion.estado_sesion === 'pausada'
      ? 'pausada'
      : sesion.estado_sesion === 'finalizada' ? 'finalizada' : 'activa';
    sesionPorCorrida.set(sesion.corrida_id, {
      sesionId: sesion.id,
      partidaId: sesion.partida_id,
      programacionId: sesion.programacion_id,
      // La RPC de reanudación compara el token de la programación, no el de la sesión.
      actualizadoEnEsperado: sesion.programacion_id
        ? tokenPorProgramacion.get(sesion.programacion_id) ?? sesion.actualizado_en
        : sesion.actualizado_en,
      fechaInicio: sesion.fecha_inicio,
      estadoSesion,
      horasNetas: Number(sesion.horas_netas ?? 0),
      operadorNombre: nombresOperador.get(sesion.operador_id) ?? null,
      motivoPausa: sesion.motivo_pausa_codigo,
      pendienteActualizacionAvance: sesion.pendiente_actualizacion_avance === true,
    });
  }

  const itemsPorCorrida = new Map<string, CorridaItem[]>();
  for (const item of items) {
    const partida = partidasPorId.get(item.partida_id);
    const material = partida?.material_id ? materialesPorId.get(partida.material_id) : undefined;
    const actuales = itemsPorCorrida.get(item.corrida_id) ?? [];
    actuales.push({
      id: item.id,
      partidaId: item.partida_id,
      codigoItem: item.codigo_item,
      cantidad: Number(item.cantidad),
      descripcion: partida?.descripcion ?? null,
      materialCodigo: material?.codigo ?? null,
      materialNombre: material?.nombre ?? null,
      anchoMm: material?.ancho_mm == null ? null : Number(material.ancho_mm),
      largoMm: material?.largo_mm == null ? null : Number(material.largo_mm),
      pendientePiezas: partida
        ? Math.max(Number(partida.cantidad_solicitada) - Number(partida.cantidad_producida), 0)
        : null,
      hechoPiezas: partida ? Number(partida.cantidad_producida) : null,
      horasEstimadas: horasPorPartida.get(item.partida_id) ?? null,
      primeraPiezaPendiente: false,
    });
    itemsPorCorrida.set(item.corrida_id, actuales);
  }
  const procesosPorId = new Map(procesos.map((proceso) => [proceso.id, proceso.nombre] as const));
  const clientesPorId = new Map(ordenes.map((orden) => [orden.id, orden] as const));
  const nombresClientes = new Map(
    clientes.map((cliente) => [cliente.id, cliente.nombre_comercial || cliente.razon_social] as const),
  );

  // El inicio independiente crea en la BD una corrida legacy de un solo ítem
  // (20261123000000:202-269) solo para trazabilidad. No es un lote: mostrarla
  // como tal quitaba la tarjeta individual y ofrecía «Ver lote» en su lugar.
  const lotes = corridas.filter((corrida) => (itemsPorCorrida.get(corrida.id)?.length ?? 0) >= 2);

  return lotes.map((corrida): LoteTablero => {
    const orden = clientesPorId.get(corrida.orden_id);
    const corridaItems = itemsPorCorrida.get(corrida.id) ?? [];
    const faltan = new Set(primeraPiezaPendiente.get(corrida.id) ?? []);
    for (const item of corridaItems) item.primeraPiezaPendiente = faltan.has(item.partidaId);
    const areaCodigos = [...new Set(corridaItems
      .map((item) => partidasPorId.get(item.partidaId)?.area_trabajo_codigo)
      .filter((codigo): codigo is string => codigo !== null))];
    return {
      id: corrida.id,
      codigo: corrida.codigo,
      estado: corrida.estado as EstadoCorrida,
      ordenId: corrida.orden_id,
      folioOrden: orden?.folio_sii || orden?.folio || 'Orden',
      clienteNombre: orden ? nombresClientes.get(orden.cliente_id) ?? 'Cliente' : 'Cliente',
      procesoNombre: procesosPorId.get(corrida.proceso_id) ?? 'Proceso',
      areaCodigo: areaCodigos[0] ?? null,
      areaCodigos,
      cantidadPlanificada: Number(corrida.cantidad_planificada),
      items: corridaItems,
      creadoEn: corrida.creado_en,
      sesion: sesionPorCorrida.get(corrida.id) ?? null,
      limiteHoras: corridaItems.reduce((total, item) => total + (item.horasEstimadas ?? 0), 0),
    };
  });
}

export interface GrupoLotesOrden {
  ordenId: string;
  folioOrden: string;
  clienteNombre: string;
  lotes: LoteTablero[];
}

/**
 * Agrupación visual: una sola cabecera por orden con una fila por corrida.
 * No fusiona lotes: cada uno conserva su código, estado y acción de apertura.
 */
export function agruparLotesPorOrden(lotes: readonly LoteTablero[]): GrupoLotesOrden[] {
  const grupos = new Map<string, GrupoLotesOrden>();
  for (const lote of lotes) {
    const actual = grupos.get(lote.ordenId);
    if (actual) {
      actual.lotes.push(lote);
      continue;
    }
    grupos.set(lote.ordenId, {
      ordenId: lote.ordenId,
      folioOrden: lote.folioOrden,
      clienteNombre: lote.clienteNombre,
      lotes: [lote],
    });
  }
  return [...grupos.values()];
}

/** Clave estable para saber si una operación ya pertenece a un lote en curso. */
export function claveLotePartida(partidaId: string, procesoNombre: string): string {
  return `${partidaId}:${procesoNombre.trim().toLowerCase()}`;
}

export function mapaLotesPorOperacion(
  lotes: readonly LoteTablero[],
): Map<string, LoteTablero> {
  const mapa = new Map<string, LoteTablero>();
  // Los lotes llegan del más reciente al más antiguo: si quedaron lotes
  // duplicados de antes de esta regla, la operación se asocia al último creado.
  for (const lote of lotes) {
    if (lote.items.length < 2) continue;
    for (const item of lote.items) {
      const clave = claveLotePartida(item.partidaId, lote.procesoNombre);
      if (!mapa.has(clave)) mapa.set(clave, lote);
    }
  }
  return mapa;
}

/**
 * Historial de corridas por partida y proceso, incluidas las terminadas.
 * Solo lectura: sirve para etiquetar el ítem sin cambiar su avance ni su flujo.
 */
export async function obtenerReferenciasCorridaPorPartida(
  cliente: Admin,
  partidaIds: readonly string[],
): Promise<Map<string, CorridaReferencia>> {
  const referencias = new Map<string, CorridaReferencia>();
  if (partidaIds.length === 0) return referencias;

  const items = await enLotes<{ corrida_id: string; partida_id: string }>(
    partidaIds,
    (lote) => cliente
      .from('corrida_items')
      .select('corrida_id, partida_id')
      .in('partida_id', lote)
      .range(0, 999),
  );
  if (items.length === 0) return referencias;

  const corridaIds = [...new Set(items.map((item) => item.corrida_id))];
  const corridas = await enLotes<{
    id: string;
    codigo: string;
    estado: string;
    proceso_id: string;
    creado_en: string;
  }>(corridaIds, (lote) => cliente
    .from('corridas')
    .select('id, codigo, estado, proceso_id, creado_en')
    .in('id', lote)
    .in('estado', [...ESTADOS_LOTE_VISIBLE, 'COMPLETADA'])
    .order('creado_en', { ascending: false })
    .order('id')
    .range(0, 999));
  const procesos = await enLotes<{ id: string; nombre: string }>(
    [...new Set(corridas.map((corrida) => corrida.proceso_id))],
    (lote) => cliente
      .from('catalogo_procesos')
      .select('id, nombre')
      .in('id', lote)
      .range(0, 999),
  );
  const nombresProceso = new Map(procesos.map((proceso) => [proceso.id, proceso.nombre] as const));
  const partidasPorCorrida = new Map<string, string[]>();
  for (const item of items) {
    const actuales = partidasPorCorrida.get(item.corrida_id) ?? [];
    actuales.push(item.partida_id);
    partidasPorCorrida.set(item.corrida_id, actuales);
  }
  // Las corridas llegan de la más reciente a la más antigua: se conserva la
  // última en que participó cada operación.
  for (const corrida of corridas) {
    const nombre = nombresProceso.get(corrida.proceso_id);
    if (!nombre) continue;
    // Solo se ocultan las corridas activas de un ítem; las terminadas siguen
    // etiquetando el trabajo histórico como «Trabajado en lote X».
    if (corrida.estado !== 'COMPLETADA'
      && (partidasPorCorrida.get(corrida.id)?.length ?? 0) < 2) continue;
    for (const partidaId of partidasPorCorrida.get(corrida.id) ?? []) {
      const clave = claveLotePartida(partidaId, nombre);
      if (!referencias.has(clave)) {
        referencias.set(clave, {
          id: corrida.id,
          codigo: corrida.codigo,
          estado: corrida.estado as EstadoCorrida,
        });
      }
    }
  }
  return referencias;
}
