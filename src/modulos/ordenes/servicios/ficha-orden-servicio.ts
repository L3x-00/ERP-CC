import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import type {
  EstadoPasoRutaFicha,
  EventoFicha,
  FichaOrden,
  OrigenComercialFicha,
  PartidaFicha,
  TotalesSnapshot,
} from '@/modulos/ordenes/tipos/ficha-orden';
import {
  esSnapshotOrdenSii,
  ESTADO_LEGACY_A_SII,
  type SnapshotOrdenSii,
} from '@/modulos/ordenes/tipos/orden-sii';
import { listarArchivosFichaOrden } from '@/modulos/ordenes/servicios/archivos-ficha-servicio';
import { proyectarHojaTrabajo } from '@/modulos/ordenes/servicios/hoja-trabajo-orden-servicio';
import {
  proyectarRutaFicha,
  type EstadosRutaFicha,
} from '@/modulos/ordenes/servicios/proyectar-snapshot-ficha';
import { esEstadoSiiOrden } from '@/modulos/ordenes/validaciones/orden-sii';

const COLUMNAS_PARTIDA_FICHA =
  'id, codigo_pieza, codigo_item, propuesta_item_id, descripcion, cantidad_solicitada, cantidad_producida, cantidad_conforme, cantidad_scrap, unidad_medida, procesos, tiempo_estimado_minutos, tiempo_real_minutos, area_trabajo_codigo';

export type ClienteFichaOrden = SupabaseClient<Database>;

function aNumero(valor: number | string | null): number {
  if (valor === null) return 0;
  return typeof valor === 'string' ? Number(valor) : valor;
}

function totalesDeSnapshot(snapshot: unknown): TotalesSnapshot | null {
  if (typeof snapshot !== 'object' || snapshot === null) return null;
  const totales = (snapshot as { totales?: Record<string, unknown> }).totales;
  if (typeof totales !== 'object' || totales === null) return null;
  const numero = (valor: unknown): number | null =>
    typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : null;
  return {
    subtotal: numero(totales.subtotal),
    descuento: numero(totales.descuento),
    iva: numero(totales.iva),
    total: numero(totales.total),
    moneda: typeof totales.moneda === 'string' ? totales.moneda : null,
  };
}

function textoOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

/**
 * Origen comercial por lista blanca, campo a campo: jamás se copia el snapshot ni se
 * propaga una clave que no esté aquí (el snapshot trae precios y costos). Sin ningún
 * folio humano (orden interna, snapshot antiguo) no hay origen que mostrar.
 */
function extraerOrigenComercial(snapshot: SnapshotOrdenSii | null): OrigenComercialFicha | null {
  if (!snapshot) return null;
  const origen = snapshot.origen;
  const rfqFolio = textoOpcional(origen.rfq_folio);
  const propuestaFolio = textoOpcional(origen.propuesta_folio);
  const revisionFolio = textoOpcional(origen.revision_folio);
  if (rfqFolio === null && propuestaFolio === null && revisionFolio === null) return null;
  return {
    rfqId: textoOpcional(origen.rfq_id),
    rfqFolio,
    propuestaId: textoOpcional(origen.propuesta_id),
    propuestaFolio,
    revisionFolio,
    revisionLetra: textoOpcional(origen.letra),
  };
}

/** Lee la ficha completa de una orden para la ruta /ordenes/[id]. */
export async function obtenerFichaOrdenServicio(
  cliente: ClienteFichaOrden,
  ordenId: string,
  opciones: { incluirTotales?: boolean } = {},
): Promise<FichaOrden | null> {
  const { data: orden, error } = await cliente
    .from('ordenes_produccion')
    .select(
      'id, folio, folio_sii, estado_sii, estado, prioridad, fecha_compromiso_comercial, fecha_operativa, archivada_en, es_interna, id_historico, orden_origen_id, referencia_externa, notas, creado_en, actualizado_en, cerrada_admin_en, cerrada_admin_por, cliente_id, propuesta_revision_id',
    )
    .eq('id', ordenId)
    .maybeSingle();
  if (error) throw error;
  if (!orden) return null;

  // El snapshot se lee SIEMPRE en servidor para extraer el origen comercial a cualquier rol con
  // orden_vista, pero solo sale completo (ítems, archivos, totales, moneda) con orden_ver_totales.
  const incluirTotales = opciones.incluirTotales === true;
  const snapshotResp = await cliente
    .from('ordenes_produccion')
    .select('snapshot_json')
    .eq('id', ordenId)
    .maybeSingle();
  if (snapshotResp.error) throw snapshotResp.error;
  const snapshotJson = snapshotResp.data?.snapshot_json ?? null;
  const snapshotLeido = esSnapshotOrdenSii(snapshotJson) ? snapshotJson : null;
  const origen = extraerOrigenComercial(snapshotLeido);
  const snapshot = incluirTotales ? snapshotLeido : null;
  const totales = incluirTotales ? totalesDeSnapshot(snapshotJson) : null;

  const [partidasResp, clienteResp, notasResp, eventosResp, cerradaPorResp, archivos, origenOrdenResp, programacionesResp] = await Promise.all([
    cliente
      .from('partidas_orden_produccion')
      .select(COLUMNAS_PARTIDA_FICHA)
      .eq('orden_id', ordenId)
      .order('codigo_item', { ascending: true, nullsFirst: false })
      .order('creado_en', { ascending: true }),
    // Obs. cliente 2026-10-12 (5): la orden interna no tiene cliente (null).
    orden.cliente_id
      ? cliente
        .from('clientes')
        .select('nombre_comercial, razon_social')
        .eq('id', orden.cliente_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    cliente
      .from('notas_entrega')
      .select('id, folio, folio_sii, es_parcial, recibido_por, creado_en, estado, motivo_anulacion')
      .eq('orden_id', ordenId)
      .order('creado_en', { ascending: false }),
    cliente
      .from('orden_eventos_cambio')
      .select('*')
      .eq('orden_id', ordenId)
      .order('creado_en', { ascending: false })
      .limit(50),
    orden.cerrada_admin_por
      ? cliente.from('usuarios').select('nombre_completo').eq('id', orden.cerrada_admin_por).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // R09: los archivos son operativos (sin economía) y se leen para todo rol con orden_vista.
    listarArchivosFichaOrden(cliente, {
      snapshot: snapshotLeido,
      propuestaRevisionId: orden.propuesta_revision_id,
    }),
    orden.orden_origen_id
      ? cliente
        .from('ordenes_produccion')
        .select('folio, folio_sii')
        .eq('id', orden.orden_origen_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Obs. cliente 2026-11-14: la Ruta muestra el estado real de cada operación,
    // no un «Pendiente» fijo; se lee la programación vigente de la orden.
    cliente
      .from('programacion_areas')
      .select('partida_id, secuencia, estado_planeacion, meta_proceso_id')
      .eq('orden_id', ordenId),
  ]);

  if (partidasResp.error) throw partidasResp.error;
  if (clienteResp.error) throw clienteResp.error;
  if (notasResp.error) throw notasResp.error;
  if (eventosResp.error) throw eventosResp.error;
  if (origenOrdenResp.error) throw origenOrdenResp.error;
  if (programacionesResp.error) throw programacionesResp.error;

  const partidas: PartidaFicha[] = (partidasResp.data ?? []).map((partida) => ({
    id: partida.id,
    codigoPieza: partida.codigo_pieza,
    codigoItem: partida.codigo_item,
    descripcion: partida.descripcion,
    cantidadSolicitada: aNumero(partida.cantidad_solicitada),
    cantidadProducida: aNumero(partida.cantidad_producida),
    cantidadConforme: aNumero(partida.cantidad_conforme ?? partida.cantidad_producida),
    cantidadScrap: aNumero(partida.cantidad_scrap),
    unidadMedida: partida.unidad_medida,
    procesos: partida.procesos ?? [],
    tiempoEstimadoMinutos: aNumero(partida.tiempo_estimado_minutos),
    tiempoRealMinutos: aNumero(partida.tiempo_real_minutos),
    areaTrabajoCodigo: partida.area_trabajo_codigo,
  }));

  const partidasFilas = partidasResp.data ?? [];
  const partidaPorId = new Map(partidasFilas.map((partida) => [partida.id, partida]));
  const partidasIds = partidasFilas.map((partida) => partida.id);
  const [metasRutaResp, avancesResp] = partidasIds.length === 0
    ? [{ data: [], error: null }, { data: [], error: null }]
    : await Promise.all([
      cliente
        .from('metas_proceso_partida')
        .select('id, partida_id, secuencia')
        .in('partida_id', partidasIds),
      cliente
        .from('registros_avance_partida')
        .select('partida_id, meta_proceso_id')
        .in('partida_id', partidasIds),
    ]);
  if (metasRutaResp.error) throw metasRutaResp.error;
  if (avancesResp.error) throw avancesResp.error;

  const secuenciaPorMeta = new Map(
    (metasRutaResp.data ?? []).map((meta) => [
      meta.id,
      { partidaId: meta.partida_id, secuencia: Number(meta.secuencia) },
    ]),
  );
  const avancesPorSecuencia = new Set<string>();
  for (const avance of avancesResp.data ?? []) {
    if (!avance.meta_proceso_id) continue;
    const meta = secuenciaPorMeta.get(avance.meta_proceso_id);
    if (meta) avancesPorSecuencia.add(`${meta.partidaId}:${meta.secuencia}`);
  }

  const estadoSii = esEstadoSiiOrden(orden.estado_sii)
    ? orden.estado_sii
    : ESTADO_LEGACY_A_SII[orden.estado as keyof typeof ESTADO_LEGACY_A_SII] ?? 'CONFIRMADA';
  const ordenCerrada =
    estadoSii === 'PRODUCCION_COMPLETADA'
    || estadoSii === 'CERRADA'
    || orden.estado === 'completada';

  const porCodigoItem = new Map<string, Map<number, EstadoPasoRutaFicha>>();
  const porItemId = new Map<string, Map<number, EstadoPasoRutaFicha>>();
  const estadoPorPlaneacion: Record<string, EstadoPasoRutaFicha> = {
    programada: 'programada',
    en_preparacion: 'en_preparacion',
    en_proceso: 'en_proceso',
    bloqueada: 'bloqueada',
    completada: 'completada',
    cancelada: 'cancelada',
  };
  for (const programacion of programacionesResp.data ?? []) {
    const partida = partidaPorId.get(programacion.partida_id);
    if (!partida) continue;
    const secuencia = Number(programacion.secuencia);
    let estado = estadoPorPlaneacion[programacion.estado_planeacion] ?? 'sin_registro';
    // Un avance sobre una operación aún marcada como programada significa que el
    // piso ya la empezó; el estado real no puede seguir diciendo «Programada».
    if (estado === 'programada'
      && avancesPorSecuencia.has(`${programacion.partida_id}:${secuencia}`)) {
      estado = 'en_proceso';
    }
    for (const clave of [partida.codigo_item, partida.propuesta_item_id]) {
      if (!clave) continue;
      const destino = clave === partida.codigo_item ? porCodigoItem : porItemId;
      const mapa = destino.get(clave) ?? new Map<number, EstadoPasoRutaFicha>();
      mapa.set(secuencia, estado);
      destino.set(clave, mapa);
    }
  }
  const estadosRuta: EstadosRutaFicha = {
    porCodigoItem,
    porItemId,
    ordenConcluida: ordenCerrada,
  };

  const notasIds = (notasResp.data ?? []).map((nota) => nota.id);
  const renglonesResp = notasIds.length > 0
    ? await cliente
      .from('partidas_nota_entrega')
      .select('nota_entrega_id, partida_id, cantidad_entregada')
      .in('nota_entrega_id', notasIds)
    : { data: [], error: null };
  if (renglonesResp.error) throw renglonesResp.error;

  const renglonesPorNota = new Map<string, { partidaId: string; cantidadEntregada: number }[]>();
  for (const renglon of renglonesResp.data ?? []) {
    const lista = renglonesPorNota.get(renglon.nota_entrega_id) ?? [];
    lista.push({ partidaId: renglon.partida_id, cantidadEntregada: aNumero(renglon.cantidad_entregada) });
    renglonesPorNota.set(renglon.nota_entrega_id, lista);
  }

  const eventosFilas = eventosResp.data ?? [];
  const actorIds = [...new Set(eventosFilas.map((evento) => evento.actor_id).filter((id): id is string => id !== null))];
  const actoresResp = actorIds.length > 0
    ? await cliente.from('usuarios').select('id, nombre_completo').in('id', actorIds)
    : { data: [], error: null };
  if (actoresResp.error) throw actoresResp.error;
  const nombresActores = new Map((actoresResp.data ?? []).map((actor) => [actor.id, actor.nombre_completo]));

  const eventos: EventoFicha[] = eventosFilas.map((evento) => ({
    id: evento.id,
    tipo: evento.tipo,
    motivo: evento.motivo,
    actorNombre: evento.actor_id ? nombresActores.get(evento.actor_id) ?? null : null,
    creadoEn: evento.creado_en,
    detalle: (typeof evento.detalle === 'object' && evento.detalle !== null && !Array.isArray(evento.detalle))
      ? evento.detalle as Record<string, unknown>
      : {},
  }));

  const clienteFila = clienteResp.data;
  const clienteNombre = clienteFila ? clienteFila.nombre_comercial || clienteFila.razon_social : null;
  return {
    orden: {
      id: orden.id,
      folio: orden.folio,
      folioSii: orden.folio_sii,
      estadoSii,
      estadoLegacy: orden.estado,
      prioridad: orden.prioridad,
      fechaCompromisoComercial: orden.fecha_compromiso_comercial,
      fechaOperativa: orden.fecha_operativa,
      archivadaEn: orden.archivada_en,
      esInterna: orden.es_interna,
      idHistorico: orden.id_historico,
      ordenOrigenFolio: origenOrdenResp.data?.folio_sii ?? origenOrdenResp.data?.folio ?? null,
      referenciaExterna: orden.referencia_externa,
      notas: orden.notas,
      creadoEn: orden.creado_en,
      actualizadoEn: orden.actualizado_en,
      cerradaAdminEn: orden.cerrada_admin_en,
      cerradaAdminPorNombre: cerradaPorResp.data?.nombre_completo ?? null,
      clienteNombre,
      moneda: totales?.moneda ?? null,
    },
    origen,
    partidas,
    ruta: proyectarRutaFicha(snapshotLeido, estadosRuta),
    snapshot,
    totales,
    entregas: (notasResp.data ?? []).map((nota) => ({
      id: nota.id,
      folio: nota.folio,
      folioSii: nota.folio_sii ?? null,
      esParcial: nota.es_parcial,
      recibidoPor: nota.recibido_por,
      creadoEn: nota.creado_en,
      estado: nota.estado === 'ANULADA' ? 'ANULADA' : 'VIGENTE',
      motivoAnulacion: nota.motivo_anulacion ?? null,
      partidas: renglonesPorNota.get(nota.id) ?? [],
    })),
    eventos,
    archivos,
    // R17: la hoja de trabajo sale por lista blanca para todo rol con orden_vista, con o sin totales.
    hojaTrabajo: proyectarHojaTrabajo({
      snapshot: snapshotLeido,
      folio: orden.folio_sii ?? orden.folio,
      clienteNombre,
      observacionesOrden: orden.notas,
      archivos,
    }),
  };
}
