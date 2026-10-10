import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import type {
  ArchivoFicha,
  EventoFicha,
  FichaOrden,
  PartidaFicha,
  TotalesSnapshot,
} from '@/modulos/ordenes/tipos/ficha-orden';
import {
  esSnapshotOrdenSii,
  ESTADO_LEGACY_A_SII,
} from '@/modulos/ordenes/tipos/orden-sii';
import { esEstadoSiiOrden } from '@/modulos/ordenes/validaciones/orden-sii';

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

/** Lee la ficha completa de una orden para la ruta /ordenes/[id]. */
export async function obtenerFichaOrdenServicio(
  cliente: ClienteFichaOrden,
  ordenId: string,
): Promise<FichaOrden | null> {
  const { data: orden, error } = await cliente
    .from('ordenes_produccion')
    .select('*')
    .eq('id', ordenId)
    .maybeSingle();
  if (error) throw error;
  if (!orden) return null;

  const [partidasResp, clienteResp, notasResp, eventosResp, cerradaPorResp] = await Promise.all([
    cliente
      .from('partidas_orden_produccion')
      .select('*')
      .eq('orden_id', ordenId)
      .order('codigo_item', { ascending: true, nullsFirst: false })
      .order('creado_en', { ascending: true }),
    cliente
      .from('clientes')
      .select('nombre_comercial, razon_social')
      .eq('id', orden.cliente_id)
      .maybeSingle(),
    cliente
      .from('notas_entrega')
      .select('id, folio, folio_sii, es_parcial, recibido_por, creado_en')
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
  ]);

  if (partidasResp.error) throw partidasResp.error;
  if (clienteResp.error) throw clienteResp.error;
  if (notasResp.error) throw notasResp.error;
  if (eventosResp.error) throw eventosResp.error;

  const partidas: PartidaFicha[] = (partidasResp.data ?? []).map((partida) => ({
    id: partida.id,
    codigoPieza: partida.codigo_pieza,
    codigoItem: partida.codigo_item,
    descripcion: partida.descripcion,
    cantidadSolicitada: aNumero(partida.cantidad_solicitada),
    cantidadProducida: aNumero(partida.cantidad_producida),
    cantidadScrap: aNumero(partida.cantidad_scrap),
    unidadMedida: partida.unidad_medida,
    procesos: partida.procesos ?? [],
    tiempoEstimadoMinutos: aNumero(partida.tiempo_estimado_minutos),
    tiempoRealMinutos: aNumero(partida.tiempo_real_minutos),
    areaTrabajoCodigo: partida.area_trabajo_codigo,
  }));

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

  const snapshot = esSnapshotOrdenSii(orden.snapshot_json) ? orden.snapshot_json : null;
  const archivos: ArchivoFicha[] = [];
  if (snapshot) {
    for (const archivo of snapshot.archivos) {
      archivos.push({
        archivoId: archivo.archivo_id,
        nombreOriginal: archivo.nombre_original ?? null,
        nombreErp: archivo.nombre_erp ?? null,
        clase: archivo.clase ?? null,
        mime: archivo.mime ?? null,
        origen: 'revision',
        itemCodigo: null,
      });
    }
    for (const item of snapshot.items) {
      for (const archivo of item.archivos ?? []) {
        archivos.push({
          archivoId: archivo.archivo_id,
          nombreOriginal: archivo.nombre_original ?? null,
          nombreErp: archivo.nombre_erp ?? null,
          clase: archivo.clase ?? null,
          mime: archivo.mime ?? null,
          origen: 'item',
          itemCodigo: item.codigo ?? item.codigo_item ?? null,
        });
      }
    }
  }

  const estadoSii = esEstadoSiiOrden(orden.estado_sii)
    ? orden.estado_sii
    : ESTADO_LEGACY_A_SII[orden.estado as keyof typeof ESTADO_LEGACY_A_SII] ?? 'CONFIRMADA';

  const clienteFila = clienteResp.data;
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
      referenciaExterna: orden.referencia_externa,
      notas: orden.notas,
      creadoEn: orden.creado_en,
      actualizadoEn: orden.actualizado_en,
      cerradaAdminEn: orden.cerrada_admin_en,
      cerradaAdminPorNombre: cerradaPorResp.data?.nombre_completo ?? null,
      clienteNombre: clienteFila
        ? clienteFila.nombre_comercial || clienteFila.razon_social
        : null,
      moneda: totalesDeSnapshot(orden.snapshot_json)?.moneda ?? null,
    },
    partidas,
    snapshot,
    totales: totalesDeSnapshot(orden.snapshot_json),
    entregas: (notasResp.data ?? []).map((nota) => ({
      id: nota.id,
      folio: nota.folio,
      folioSii: nota.folio_sii ?? null,
      esParcial: nota.es_parcial,
      recibidoPor: nota.recibido_por,
      creadoEn: nota.creado_en,
      partidas: renglonesPorNota.get(nota.id) ?? [],
    })),
    eventos,
    archivos,
  };
}
