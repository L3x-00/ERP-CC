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
  filaANotaEntrega,
  filaASesionTrabajo,
  type EstadoKanbanProduccion,
  type NotaEntrega,
  type SesionTrabajo,
} from '@/modulos/produccion/tipos/indice';
import type { ConsultarTableroProduccionInput } from '@/modulos/produccion/validaciones/indice';

export interface PartidaTableroProduccion extends Partida {
  cantidadEntregada: number;
  programaciones: ProgramacionArea[];
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

/** Área macro efectiva de un código del catálogo (propia o del padre). */
function areaMacroDe(
  catalogo: readonly AreaCatalogoProduccion[],
  codigo: string | null,
): string | null {
  if (!codigo) return null;
  const propia = catalogo.find((area) => area.codigo === codigo);
  if (!propia) return null;
  return (
    propia.areaPlaneacion
    ?? catalogo.find((area) => area.codigo === propia.padreCodigo)?.areaPlaneacion
    ?? null
  );
}

/**
 * Códigos aceptados por el filtro de área: la familia completa del área macro
 * seleccionada (p. ej. "Metal mecánica" incluye corte, doblez y soldadura). Si
 * el código no está en el catálogo, se acepta solo el código exacto.
 */
export function codigosAreaFiltrada(
  catalogo: readonly AreaCatalogoProduccion[],
  areaCodigo: string,
): Set<string> {
  const macro = areaMacroDe(catalogo, areaCodigo);
  if (macro === null) return new Set([areaCodigo]);
  const familia = catalogo
    .filter((area) => areaMacroDe(catalogo, area.codigo) === macro)
    .map((area) => area.codigo);
  return new Set([areaCodigo, ...familia]);
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

  const todasCompletadas = partidas.length > 0 && partidas.every(
    (partida) => partida.cantidadProducida >= partida.cantidadSolicitada,
  );
  if (todasCompletadas || orden.estado === 'completada') return 'lista';

  if (sesiones.some((sesion) => sesion.estadoSesion === 'activa')) return 'en_proceso';
  const sesionMasReciente = [...sesiones].sort((primera, segunda) => (
    segunda.actualizadoEn.localeCompare(primera.actualizadoEn)
  ))[0];
  if (sesionMasReciente?.estadoSesion === 'pausada' || orden.estado === 'pausada') return 'pausada';
  if (orden.estado === 'en_proceso') return 'en_proceso';
  return 'bandeja';
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

  const [resultadoOrdenes, resultadoPartidas, resultadoProgramaciones, resultadoSesiones, resultadoNotas, resultadoRenglones, resultadoRecursos] = await Promise.all([
    cliente.from('ordenes_produccion').select('*').neq('estado', 'cancelada').order('fecha_compromiso'),
    cliente.from('partidas_orden_produccion').select('*').order('creado_en'),
    cliente.from('programacion_areas').select('*').neq('estado_planeacion', 'cancelada').order('secuencia'),
    cliente.from('sesiones_trabajo').select('*').order('creado_en', { ascending: false }),
    cliente.from('notas_entrega').select('*').order('creado_en', { ascending: false }),
    cliente.from('partidas_nota_entrega').select('*'),
    cliente.from('recursos_planeacion').select('*').eq('activo', true).order('codigo'),
  ]);

  const error = [
    resultadoCatalogo.error,
    resultadoOrdenes.error,
    resultadoPartidas.error,
    resultadoProgramaciones.error,
    resultadoSesiones.error,
    resultadoNotas.error,
    resultadoRenglones.error,
    resultadoRecursos.error,
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

  const partidasPorOrden = new Map<string, PartidaTableroProduccion[]>();
  const partidasFilas = (resultadoPartidas.data ?? []).map(filaAPartida);
  for (const partida of partidasFilas) {
    // OBS-09: la cola por área solo considera la familia del área elegida.
    if (codigosAceptados && !codigosAceptados.has(partida.areaTrabajoCodigo ?? '')) continue;
    const actuales = partidasPorOrden.get(partida.ordenId) ?? [];
    actuales.push({
      ...partida,
      cantidadEntregada: cantidadEntregadaPorPartida.get(partida.id) ?? 0,
      programaciones: programacionesPorPartida.get(partida.id) ?? [],
    });
    partidasPorOrden.set(partida.ordenId, actuales);
  }

  // OBS-09: nombre del responsable para las tarjetas (los IDs no se muestran).
  const responsables: Record<string, string> = {};
  const operadorIds = [
    ...new Set(
      partidasFilas
        .map((partida) => partida.operadorAsignadoId)
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
  for (const sesion of (resultadoSesiones.data ?? []).map(filaASesionTrabajo)) {
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
