import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaAOrden,
  filaAPartida,
  type Orden,
  type Partida,
} from '@/modulos/ordenes/tipos/ordenes';
import {
  filaAProgramacionArea,
  filaARecursoPlaneacion,
  type ProgramacionArea,
  type RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  filaAMetaProcesoPartida,
  filaANotaEntrega,
  filaASesionTrabajo,
  type EstadoKanbanProduccion,
  type MetaProcesoPartida,
  type NotaEntrega,
  type SesionTrabajo,
} from '@/modulos/produccion/tipos/indice';
import { codigosFamiliaArea } from '@/modulos/produccion/utilidades/indice';
import type { ConsultarTableroProduccionInput } from '@/modulos/produccion/validaciones/indice';

/** PRD-09: hecho/meta/pendiente/porcentaje de una pareja partida×proceso. */
export interface MetaProcesoAvance extends MetaProcesoPartida {
  hechoPiezas: number;
  pendientePiezas: number;
  porcentaje: number;
  esFinal: boolean;
}

export interface PartidaTableroProduccion extends Partida {
  cantidadEntregada: number;
  programaciones: ProgramacionArea[];
  /** Vacío en trabajos históricos sin desglose de procesos. */
  metasProceso: MetaProcesoAvance[];
}

export interface OrdenTableroProduccion extends Orden {
  estadoKanban: EstadoKanbanProduccion;
  partidas: PartidaTableroProduccion[];
  sesiones: SesionTrabajo[];
  notasEntrega: NotaEntrega[];
}

/** OBS-14: entrada mínima del catálogo de taller para etiquetas y filtro. */
export interface AreaCatalogoProduccion {
  codigo: string;
  nombre: string;
  padreCodigo: string | null;
  areaPlaneacion: string | null;
}

export interface DatosTableroProduccion {
  ordenes: OrdenTableroProduccion[];
  recursos: RecursoPlaneacion[];
  /** Catálogo de taller para resolver nombres y filtrar por área. */
  areas?: AreaCatalogoProduccion[];
  /** OBS-09: nombre del operador asignado, por `operador_asignado_id`. */
  responsables?: Record<string, string>;
}

/**
 * Códigos aceptados por el filtro de área: la familia completa del área macro
 * seleccionada, resuelta por ancestros (A06). Delega en el helper compartido
 * con la terminal de piso para que servidor y cliente filtren igual.
 */
export function codigosAreaFiltrada(
  catalogo: readonly AreaCatalogoProduccion[],
  areaCodigo: string,
): Set<string> {
  return codigosFamiliaArea(catalogo, areaCodigo);
}

/**
 * PRD-09: con metas, la partida solo está completa cuando todas las parejas
 * partida×proceso alcanzaron su meta; sin desglose se conserva la comparación
 * física histórica.
 */
export function partidaProduccionCompleta(partida: PartidaTableroProduccion): boolean {
  if (partida.metasProceso.length > 0) {
    return partida.metasProceso.every((meta) => meta.hechoPiezas >= meta.metaPiezas);
  }
  return partida.cantidadProducida >= partida.cantidadSolicitada;
}

/** Deriva una columna de UI desde hechos persistidos; no escribe etiquetas en la OP. */
export function obtenerEstadoKanbanProduccion(
  orden: Orden,
  partidas: readonly PartidaTableroProduccion[],
  sesiones: readonly SesionTrabajo[],
): EstadoKanbanProduccion {
  const todasEntregadas = partidas.length > 0 && partidas.every(
    (partida) => partida.cantidadEntregada >= partida.cantidadSolicitada,
  );
  if (todasEntregadas) return 'entregada';

  const todasCompletadas = partidas.length > 0 && partidas.every(partidaProduccionCompleta);
  if (todasCompletadas || orden.estado === 'completada') return 'lista';

  if (sesiones.some((sesion) => sesion.estadoSesion === 'activa')) return 'en_proceso';
  const sesionMasReciente = [...sesiones].sort((primera, segunda) => (
    segunda.actualizadoEn.localeCompare(primera.actualizadoEn)
  ))[0];
  if (sesionMasReciente?.estadoSesion === 'pausada' || orden.estado === 'pausada') return 'pausada';
  if (orden.estado === 'en_proceso') return 'en_proceso';
  return 'bandeja';
}

/** PostgREST limita cada respuesta; paginar evita recortar el historial de producción. */
async function obtenerTodasLasSesiones(cliente: SupabaseClient<Database>) {
  const sesiones: Database['public']['Tables']['sesiones_trabajo']['Row'][] = [];
  const TAMANO_PAGINA = 500;
  for (let inicio = 0; ; inicio += TAMANO_PAGINA) {
    const { data, error } = await cliente.from('sesiones_trabajo').select('*')
      .order('creado_en').order('id').range(inicio, inicio + TAMANO_PAGINA - 1);
    if (error) throw new Error(`No se pudo cargar el historial de Producción: ${error.message}`);
    sesiones.push(...(data ?? []));
    if (!data || data.length < TAMANO_PAGINA) break;
  }
  return sesiones;
}

/**
 * PRD-09: solo interesan los avances atribuidos a una meta de proceso; los
 * registros históricos sin meta se resumen en la cantidad física de la partida.
 */
async function obtenerAvancesProceso(cliente: SupabaseClient<Database>) {
  const avances: { meta_proceso_id: string; cantidad_producida: number }[] = [];
  const TAMANO_PAGINA = 1000;
  for (let inicio = 0; ; inicio += TAMANO_PAGINA) {
    const { data, error } = await cliente.from('registros_avance_partida')
      .select('meta_proceso_id, cantidad_producida')
      .not('meta_proceso_id', 'is', null)
      .order('id')
      .range(inicio, inicio + TAMANO_PAGINA - 1);
    if (error) throw new Error(`No se pudo cargar el avance por proceso: ${error.message}`);
    for (const avance of data ?? []) {
      if (avance.meta_proceso_id) {
        avances.push({
          meta_proceso_id: avance.meta_proceso_id,
          cantidad_producida: Number(avance.cantidad_producida),
        });
      }
    }
    if (!data || data.length < TAMANO_PAGINA) break;
  }
  return avances;
}

/**
 * Proyección de tablero sin N+1. La parcialidad y el estado de entrega se
 * derivan del historial inmutable, nunca del payload Realtime ni de Zustand.
 */
export async function obtenerDatosTableroProduccionServicio(
  cliente: SupabaseClient<Database>,
  filtros: ConsultarTableroProduccionInput,
  admin?: SupabaseClient<Database>,
): Promise<DatosTableroProduccion> {
  const resultadoCatalogo = admin
    ? await admin
        .from('areas_trabajo_config')
        .select('codigo, nombre, padre_codigo, area_planeacion')
        .order('orden')
        .order('nombre')
    : { data: [], error: null };

  const [resultadoOrdenes, resultadoPartidas, resultadoProgramaciones, sesiones, resultadoNotas, resultadoRenglones, resultadoRecursos, resultadoMetas, avancesProceso] = await Promise.all([
    cliente.from('ordenes_produccion').select('*').neq('estado', 'cancelada').order('fecha_compromiso'),
    cliente.from('partidas_orden_produccion').select('*').order('creado_en'),
    cliente.from('programacion_areas').select('*').neq('estado_planeacion', 'cancelada').order('secuencia'),
    obtenerTodasLasSesiones(cliente),
    cliente.from('notas_entrega').select('*').order('creado_en', { ascending: false }),
    cliente.from('partidas_nota_entrega').select('*'),
    cliente.from('recursos_planeacion').select('*').eq('activo', true).order('codigo'),
    cliente.from('metas_proceso_partida').select('*').order('partida_id').order('secuencia'),
    obtenerAvancesProceso(cliente),
  ]);

  const error = [
    resultadoCatalogo.error,
    resultadoOrdenes.error,
    resultadoPartidas.error,
    resultadoProgramaciones.error,
    resultadoNotas.error,
    resultadoRenglones.error,
    resultadoRecursos.error,
    resultadoMetas.error,
  ].find((actual) => actual !== null);
  if (error) throw new Error(`No se pudo cargar el tablero de Producción: ${error.message}`);

  const areas: AreaCatalogoProduccion[] = (resultadoCatalogo.data ?? []).map((fila) => ({
    codigo: fila.codigo,
    nombre: fila.nombre,
    padreCodigo: fila.padre_codigo,
    areaPlaneacion: fila.area_planeacion,
  }));
  const codigosAceptados = filtros.areaCodigo
    ? codigosAreaFiltrada(areas, filtros.areaCodigo)
    : null;

  const recursos = (resultadoRecursos.data ?? []).map(filaARecursoPlaneacion);
  const programacionesPorPartida = new Map<string, ProgramacionArea[]>();
  for (const programacion of (resultadoProgramaciones.data ?? []).map(filaAProgramacionArea)) {
    if (filtros.recursoId && programacion.recursoId !== filtros.recursoId) continue;
    const actuales = programacionesPorPartida.get(programacion.partidaId) ?? [];
    actuales.push(programacion);
    programacionesPorPartida.set(programacion.partidaId, actuales);
  }

  const cantidadEntregadaPorPartida = new Map<string, number>();
  for (const renglon of resultadoRenglones.data ?? []) {
    cantidadEntregadaPorPartida.set(
      renglon.partida_id,
      (cantidadEntregadaPorPartida.get(renglon.partida_id) ?? 0) + Number(renglon.cantidad_entregada),
    );
  }

  // PRD-09: metas ordenadas por partida y suma de avances por pareja partida×proceso.
  const metasPorPartida = new Map<string, MetaProcesoPartida[]>();
  for (const meta of (resultadoMetas.data ?? []).map(filaAMetaProcesoPartida)) {
    const actuales = metasPorPartida.get(meta.partidaId) ?? [];
    actuales.push(meta);
    metasPorPartida.set(meta.partidaId, actuales);
  }
  const hechoPorMeta = new Map<string, number>();
  for (const avance of avancesProceso) {
    hechoPorMeta.set(
      avance.meta_proceso_id,
      (hechoPorMeta.get(avance.meta_proceso_id) ?? 0) + avance.cantidad_producida,
    );
  }

  const partidasPorOrden = new Map<string, PartidaTableroProduccion[]>();
  const partidasFilas = (resultadoPartidas.data ?? []).map(filaAPartida);
  for (const partida of partidasFilas) {
    // OBS-09: la cola por área solo considera la familia del área elegida.
    if (codigosAceptados && !codigosAceptados.has(partida.areaTrabajoCodigo ?? '')) continue;
    const actuales = partidasPorOrden.get(partida.ordenId) ?? [];
    const metas = metasPorPartida.get(partida.id) ?? [];
    const ultimaSecuencia = metas.reduce((maxima, meta) => Math.max(maxima, meta.secuencia), 0);
    actuales.push({
      ...partida,
      cantidadEntregada: cantidadEntregadaPorPartida.get(partida.id) ?? 0,
      programaciones: programacionesPorPartida.get(partida.id) ?? [],
      metasProceso: metas.map((meta) => {
        const hechoPiezas = hechoPorMeta.get(meta.id) ?? 0;
        return {
          ...meta,
          hechoPiezas,
          pendientePiezas: Math.max(meta.metaPiezas - hechoPiezas, 0),
          porcentaje: meta.metaPiezas > 0
            ? Math.min((hechoPiezas / meta.metaPiezas) * 100, 100)
            : 0,
          esFinal: meta.secuencia === ultimaSecuencia,
        };
      }),
    });
    partidasPorOrden.set(partida.ordenId, actuales);
  }

  // OBS-09: nombre del responsable para las tarjetas (los IDs no se muestran).
  const responsables: Record<string, string> = {};
  const operadorIds = [
    ...new Set(
      [...partidasFilas.map((partida) => partida.operadorAsignadoId),
        ...sesiones.map((sesion) => sesion.operador_id)]
        .filter((valor): valor is string => valor !== null),
    ),
  ];
  if (admin && operadorIds.length > 0) {
    const { data: operadores, error: errorOperadores } = await admin
      .from('usuarios')
      .select('id, nombre_completo')
      .in('id', operadorIds);
    if (errorOperadores) {
      throw new Error(`No se pudo cargar el tablero de Producción: ${errorOperadores.message}`);
    }
    for (const operador of operadores ?? []) {
      responsables[operador.id] = operador.nombre_completo;
    }
  }

  const sesionesPorOrden = new Map<string, SesionTrabajo[]>();
  for (const sesion of sesiones.map(filaASesionTrabajo)) {
    const actuales = sesionesPorOrden.get(sesion.ordenId) ?? [];
    actuales.push(sesion);
    sesionesPorOrden.set(sesion.ordenId, actuales);
  }
  const notasPorOrden = new Map<string, NotaEntrega[]>();
  for (const nota of (resultadoNotas.data ?? []).map(filaANotaEntrega)) {
    const actuales = notasPorOrden.get(nota.ordenId) ?? [];
    actuales.push(nota);
    notasPorOrden.set(nota.ordenId, actuales);
  }

  const ordenes = (resultadoOrdenes.data ?? []).map(filaAOrden).map((orden) => {
    const partidas = partidasPorOrden.get(orden.id) ?? [];
    const sesiones = sesionesPorOrden.get(orden.id) ?? [];
    return {
      ...orden,
      partidas,
      sesiones,
      notasEntrega: notasPorOrden.get(orden.id) ?? [],
      estadoKanban: obtenerEstadoKanbanProduccion(orden, partidas, sesiones),
    };
  }).filter((orden) => {
    if (filtros.recursoId && !orden.partidas.some((partida) => partida.programaciones.length > 0)) {
      return false;
    }
    // OBS-09: con filtro de área, la orden sin partidas de esa familia no entra.
    if (codigosAceptados && orden.partidas.length === 0) {
      return false;
    }
    return !filtros.estados || filtros.estados.length === 0 || filtros.estados.includes(orden.estadoKanban);
  });

  return { ordenes, recursos, areas, responsables };
}
