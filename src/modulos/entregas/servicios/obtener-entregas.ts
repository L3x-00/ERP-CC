import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaAEntrega,
  filaARenglonEntrega,
  type Entrega,
  type PartidaPendiente,
  type PendienteEntregaItem,
  type RenglonEntrega,
} from '@/modulos/entregas/tipos/indice';
import { agruparPendientesPorItem } from '@/modulos/entregas/servicios/agrupar-pendientes';

/** Entrega con sus renglones. */
export type EntregaConRenglones = Entrega & { renglones: RenglonEntrega[] };

/** Entregas de una orden, más recientes primero. */
export async function obtenerEntregasDeOrden(
  cliente: SupabaseClient<Database>,
  ordenId: string,
): Promise<EntregaConRenglones[]> {
  const { data: notas, error } = await cliente
    .from('notas_entrega')
    .select('*')
    .eq('orden_id', ordenId)
    .order('creado_en', { ascending: false });
  if (error) {
    throw new Error('No se pudieron cargar las entregas');
  }
  const entregas = (notas ?? []).map(filaAEntrega);
  if (entregas.length === 0) return [];

  const { data: renglones } = await cliente
    .from('partidas_nota_entrega')
    .select('*')
    .in(
      'nota_entrega_id',
      entregas.map((entrega) => entrega.id),
    );

  const porNota = new Map<string, RenglonEntrega[]>();
  for (const fila of renglones ?? []) {
    const renglon = filaARenglonEntrega(fila);
    const lista = porNota.get(renglon.notaEntregaId) ?? [];
    lista.push(renglon);
    porNota.set(renglon.notaEntregaId, lista);
  }

  return entregas.map((entrega) => ({
    ...entrega,
    renglones: porNota.get(entrega.id) ?? [],
  }));
}

/** Pendientes por ITxx de una orden (solicitada − entregada, producida − entregada). */
export async function obtenerPendientesDeOrden(
  cliente: SupabaseClient<Database>,
  ordenId: string,
): Promise<PendienteEntregaItem[]> {
  return agruparPendientesPorItem(await obtenerPartidasPendientesDeOrden(cliente, ordenId));
}

/** Partidas crudas con su entregado acumulado (base para agrupar por ITxx). */
export async function obtenerPartidasPendientesDeOrden(
  cliente: SupabaseClient<Database>,
  ordenId: string,
): Promise<PartidaPendiente[]> {
  const { data: partidas, error } = await cliente
    .from('partidas_orden_produccion')
    .select('id, codigo_item, codigo_pieza, descripcion, cantidad_solicitada, cantidad_producida')
    .eq('orden_id', ordenId)
    .order('codigo_pieza', { ascending: true });
  if (error) {
    throw new Error('No se pudieron cargar las partidas');
  }

  const { data: notas } = await cliente
    .from('notas_entrega')
    .select('id')
    .eq('orden_id', ordenId);
  const notaIds = (notas ?? []).map((nota) => nota.id);

  const entregadoPorPartida = new Map<string, number>();
  if (notaIds.length > 0) {
    const { data: renglones } = await cliente
      .from('partidas_nota_entrega')
      .select('partida_id, cantidad_entregada')
      .in('nota_entrega_id', notaIds);
    for (const renglon of renglones ?? []) {
      entregadoPorPartida.set(
        renglon.partida_id,
        (entregadoPorPartida.get(renglon.partida_id) ?? 0) + Number(renglon.cantidad_entregada),
      );
    }
  }

  return (partidas ?? []).map((partida) => ({
    id: partida.id,
    codigoItem: partida.codigo_item ?? null,
    codigoPieza: partida.codigo_pieza,
    descripcion: partida.descripcion ?? null,
    cantidadSolicitada: Number(partida.cantidad_solicitada),
    cantidadProducida: Number(partida.cantidad_producida),
    cantidadEntregada: entregadoPorPartida.get(partida.id) ?? 0,
  }));
}

/** Evidencia/firma vinculada a una nota (`archivos`, entidad `entrega`). */
export type EvidenciaEntrega = {
  id: string;
  clase: string;
  nombreOriginal: string;
  version: number;
  vigente: boolean;
  creadoEn: string;
  subidoPor: string | null;
};

/** Evidencias de una nota, más recientes primero. */
export async function obtenerEvidenciasDeNota(
  cliente: SupabaseClient<Database>,
  notaId: string,
): Promise<EvidenciaEntrega[]> {
  const { data, error } = await cliente
    .from('archivos')
    .select('id, clase, nombre_original, version, vigente, creado_en, subido_por')
    .eq('entidad', 'entrega')
    .eq('entidad_id', notaId)
    .order('creado_en', { ascending: false });
  if (error) {
    throw new Error('No se pudieron cargar las evidencias');
  }
  return (data ?? []).map((archivo) => ({
    id: archivo.id,
    clase: archivo.clase,
    nombreOriginal: archivo.nombre_original,
    version: archivo.version,
    vigente: archivo.vigente,
    creadoEn: archivo.creado_en,
    subidoPor: archivo.subido_por,
  }));
}

/** Nota de entrega con el contexto de su orden para la cola y el detalle. */
export type EntregaCola = {
  entrega: EntregaConRenglones;
  ordenFolio: string;
  ordenFolioSii: string | null;
  esInterna: boolean;
  clienteNombre: string | null;
  totalPiezas: number;
};

type OrdenEmbed = {
  id: string;
  folio: string;
  folio_sii: string | null;
  es_interna: boolean;
  clientes: { razon_social: string; nombre_comercial: string | null } | null;
};

function nombreCliente(orden: OrdenEmbed | null): string | null {
  if (!orden?.clientes) return null;
  return orden.clientes.nombre_comercial || orden.clientes.razon_social;
}

/**
 * SII-B7.3: cola global de notas registradas (más recientes primero) con el
 * folio SII, la orden y el cliente para la vista de Logística.
 */
export async function obtenerColaEntregas(
  cliente: SupabaseClient<Database>,
  limite = 100,
): Promise<EntregaCola[]> {
  const { data: notas, error } = await cliente
    .from('notas_entrega')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (error) {
    throw new Error('No se pudieron cargar las entregas');
  }
  const entregas = (notas ?? []).map(filaAEntrega);
  if (entregas.length === 0) return [];

  const ordenIds = [...new Set(entregas.map((entrega) => entrega.ordenId))];
  const [{ data: ordenes }, { data: renglones }] = await Promise.all([
    cliente
      .from('ordenes_produccion')
      .select('id, folio, folio_sii, es_interna, clientes(razon_social, nombre_comercial)')
      .in('id', ordenIds),
    cliente
      .from('partidas_nota_entrega')
      .select('*')
      .in(
        'nota_entrega_id',
        entregas.map((entrega) => entrega.id),
      ),
  ]);

  const ordenPorId = new Map((ordenes ?? []).map((orden) => [orden.id, orden as unknown as OrdenEmbed]));
  const renglonesPorNota = new Map<string, RenglonEntrega[]>();
  for (const fila of renglones ?? []) {
    const renglon = filaARenglonEntrega(fila);
    const lista = renglonesPorNota.get(renglon.notaEntregaId) ?? [];
    lista.push(renglon);
    renglonesPorNota.set(renglon.notaEntregaId, lista);
  }

  return entregas.map((entrega) => {
    const propios = renglonesPorNota.get(entrega.id) ?? [];
    const orden = ordenPorId.get(entrega.ordenId) ?? null;
    return {
      entrega: { ...entrega, renglones: propios },
      ordenFolio: orden?.folio ?? '—',
      ordenFolioSii: orden?.folio_sii ?? null,
      esInterna: orden?.es_interna ?? false,
      clienteNombre: nombreCliente(orden),
      totalPiezas: propios.reduce((suma, renglon) => suma + renglon.cantidadEntregada, 0),
    };
  });
}

/** Orden con trabajo pendiente por entregar (cola de Logística). */
export type OrdenPendienteEntrega = {
  ordenId: string;
  folio: string;
  folioSii: string | null;
  esInterna: boolean;
  estadoSii: string;
  clienteNombre: string | null;
  totalPendiente: number;
  totalDisponible: number;
  itemsPendientes: number;
};

/**
 * SII-B7.3: órdenes en producción o producción completada con piezas pendientes
 * de entregar (solicitada − entregada > 0), agregadas por ítem ITxx.
 */
export async function obtenerOrdenesConPendientes(
  cliente: SupabaseClient<Database>,
): Promise<OrdenPendienteEntrega[]> {
  const { data: ordenes, error } = await cliente
    .from('ordenes_produccion')
    .select('id, folio, folio_sii, es_interna, estado_sii, archivada_en, clientes(razon_social, nombre_comercial)')
    .in('estado_sii', ['EN_PRODUCCION', 'PRODUCCION_COMPLETADA'])
    .is('archivada_en', null)
    .order('fecha_compromiso', { ascending: true });
  if (error) {
    throw new Error('No se pudieron cargar las órdenes pendientes');
  }
  const lista = (ordenes ?? []) as unknown as (OrdenEmbed & {
    estado_sii: string;
    archivada_en: string | null;
  })[];
  if (lista.length === 0) return [];

  const ordenIds = lista.map((orden) => orden.id);
  const { data: partidas } = await cliente
    .from('partidas_orden_produccion')
    .select('id, orden_id, codigo_item, codigo_pieza, descripcion, cantidad_solicitada, cantidad_producida')
    .in('orden_id', ordenIds);
  const { data: notas } = await cliente
    .from('notas_entrega')
    .select('id, orden_id')
    .in('orden_id', ordenIds);
  const notaIds = (notas ?? []).map((nota) => nota.id);

  const entregadoPorPartida = new Map<string, number>();
  if (notaIds.length > 0) {
    const { data: renglones } = await cliente
      .from('partidas_nota_entrega')
      .select('partida_id, cantidad_entregada')
      .in('nota_entrega_id', notaIds);
    for (const renglon of renglones ?? []) {
      entregadoPorPartida.set(
        renglon.partida_id,
        (entregadoPorPartida.get(renglon.partida_id) ?? 0) + Number(renglon.cantidad_entregada),
      );
    }
  }

  const partidasPorOrden = new Map<string, PartidaPendiente[]>();
  for (const partida of partidas ?? []) {
    const listaPartidas = partidasPorOrden.get(partida.orden_id) ?? [];
    listaPartidas.push({
      id: partida.id,
      codigoItem: partida.codigo_item ?? null,
      codigoPieza: partida.codigo_pieza,
      descripcion: partida.descripcion ?? null,
      cantidadSolicitada: Number(partida.cantidad_solicitada),
      cantidadProducida: Number(partida.cantidad_producida),
      cantidadEntregada: entregadoPorPartida.get(partida.id) ?? 0,
    });
    partidasPorOrden.set(partida.orden_id, listaPartidas);
  }

  return lista
    .map((orden) => {
      const items = agruparPendientesPorItem(partidasPorOrden.get(orden.id) ?? []);
      const conPendiente = items.filter((item) => item.pendiente > 0);
      return {
        ordenId: orden.id,
        folio: orden.folio,
        folioSii: orden.folio_sii ?? null,
        esInterna: orden.es_interna,
        estadoSii: orden.estado_sii,
        clienteNombre: nombreCliente(orden),
        totalPendiente: conPendiente.reduce((suma, item) => suma + item.pendiente, 0),
        totalDisponible: conPendiente.reduce((suma, item) => suma + item.disponible, 0),
        itemsPendientes: conPendiente.length,
      };
    })
    .filter((orden) => orden.totalPendiente > 0);
}

/** Detalle de una nota con el contexto de su orden. */
export type DetalleEntrega = {
  entrega: EntregaConRenglones;
  orden: {
    id: string;
    folio: string;
    folioSii: string | null;
    esInterna: boolean;
    clienteNombre: string | null;
  };
  entregadoPorNombre: string | null;
};

/** SII-B7.3: detalle de una nota exacta (o `null` si no existe/visible). */
export async function obtenerDetalleEntrega(
  cliente: SupabaseClient<Database>,
  notaId: string,
): Promise<DetalleEntrega | null> {
  const { data: nota, error } = await cliente
    .from('notas_entrega')
    .select('*')
    .eq('id', notaId)
    .maybeSingle();
  if (error) {
    throw new Error('No se pudo cargar la entrega');
  }
  if (!nota) return null;

  const entrega = filaAEntrega(nota);
  const { data: renglones } = await cliente
    .from('partidas_nota_entrega')
    .select('*')
    .eq('nota_entrega_id', notaId);
  const { data: orden } = await cliente
    .from('ordenes_produccion')
    .select('id, folio, folio_sii, es_interna, clientes(razon_social, nombre_comercial)')
    .eq('id', entrega.ordenId)
    .maybeSingle();
  const ordenEmbed = (orden as unknown as OrdenEmbed | null) ?? null;

  let entregadoPorNombre: string | null = null;
  if (entrega.entregadoPorId) {
    const { data: entregador } = await cliente
      .from('usuarios')
      .select('nombre_completo')
      .eq('id', entrega.entregadoPorId)
      .maybeSingle();
    entregadoPorNombre = entregador?.nombre_completo ?? null;
  }

  return {
    entrega: {
      ...entrega,
      renglones: (renglones ?? []).map(filaARenglonEntrega),
    },
    orden: {
      id: entrega.ordenId,
      folio: ordenEmbed?.folio ?? '—',
      folioSii: ordenEmbed?.folio_sii ?? null,
      esInterna: ordenEmbed?.es_interna ?? false,
      clienteNombre: nombreCliente(ordenEmbed),
    },
    entregadoPorNombre,
  };
}
