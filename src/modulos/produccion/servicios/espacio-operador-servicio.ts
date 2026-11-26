import type { SupabaseClient } from '@supabase/supabase-js';
import { fechaLocalNegocio } from '@/compartido/utilidades/fecha-negocio';
import type { Database, Tables } from '@/compartido/tipos/supabase';
import { listarArchivosFichaOrden } from '@/modulos/ordenes/servicios/archivos-ficha-servicio';
import { pausarSesionesJornadaExcedidaServicio } from '@/modulos/produccion/servicios/corridas-servicio';
import { esSnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';
import { COLUMNAS_ORDEN_OPERATIVA, filaAOrdenOperativa, filaAPartida } from '@/modulos/ordenes/tipos/ordenes';
import {
  COLUMNAS_SESION_TRABAJO_OPERATIVA,
  filaASesionTrabajo,
  type SesionTrabajo,
} from '@/modulos/produccion/tipos/produccion';
import {
  filaAProgramacionArea,
  type ProgramacionArea,
} from '@/modulos/planeacion/tipos/indice';
import {
  ETIQUETAS_URGENCIA,
  agruparProcesosPorArea,
  calcularDisponibilidadProcesos,
  construirDiasCalendario,
  derivarColumnaProceso,
  derivarUrgenciaProceso,
  diasEntreFechas,
  etiquetasProceso,
  filaAReclamoProceso,
  inicioSemana,
  mensajeEquipoOcupado,
  resumirEspacioOperador,
  resolverAreaRaiz,
  sumarDias,
  type AreaEspacioOperador,
  type ArchivoProceso,
  type AvisoSupervision,
  type ComentarioOrdenVisible,
  type DiaCalendarioOperador,
  type MaterialProceso,
  type ProcesoEspacioOperador,
  type ProcesoRuteoResumen,
  type ReclamoProcesoOperador,
  type ResumenEspacioOperador,
  type SesionProceso,
} from '@/modulos/produccion/tipos/espacio-operador';
import { MOTIVO_BLOQUEO_TEXTO } from '@/modulos/produccion/tipos/acciones-proceso';
import { obtenerMotivosPausaServicio, type MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import {
  claveLotePartida,
  mapaLotesPorOperacion,
  obtenerLotesTableroServicio,
} from '@/modulos/produccion/servicios/lotes-tablero-servicio';
import type { LoteTablero } from '@/modulos/produccion/tipos/corridas';

type Admin = SupabaseClient<Database>;
type FilaPartida = Tables<'partidas_orden_produccion'>;
type FilaMeta = Tables<'metas_proceso_partida'>;
type FilaRecursoResumen = { id: string; codigo: string; nombre: string };

export interface DatosEspacioOperador {
  procesos: ProcesoEspacioOperador[];
  /** Lotes en curso: existen antes de abrir la primera sesión. */
  lotes: LoteTablero[];
  areas: AreaEspacioOperador[];
  motivosPausa: MotivoPausaCatalogo[];
  responsables: Record<string, string>;
  resumen: ResumenEspacioOperador;
  hoy: string;
  /** Días de la semana visible (lunes a domingo) con la carga reclamada. */
  dias: DiaCalendarioOperador[];
  gruposArea: ReturnType<typeof agruparProcesosPorArea>;
}

const TAMANO_PAGINA = 500;

/**
 * AUD-12: «hoy» es la fecha de negocio del taller (America/Tijuana), no la del
 * runtime. Con un servidor en UTC, la versión local cambiaba de día a las 17:00
 * de Tijuana y movía la semana de la vista Carga.
 */
function fechaIsoLocal(ahora: Date = new Date()): string {
  return fechaLocalNegocio(ahora);
}

/** Horas de una operación: programación vigente o reparto del tiempo estimado. */
export function estimarHorasProceso(
  partida: Pick<FilaPartida, 'tiempo_estimado_minutos'>,
  programacion: Pick<ProgramacionArea, 'horasEstimadas'> | null,
  totalMetas: number,
  tieneMeta: boolean,
): number {
  if (programacion && programacion.horasEstimadas > 0) {
    return Math.round(programacion.horasEstimadas * 100) / 100;
  }
  const horasPartida = Number(partida.tiempo_estimado_minutos) / 60;
  const horas = tieneMeta ? horasPartida / Math.max(totalMetas, 1) : horasPartida;
  return Math.max(Math.round(horas * 100) / 100, 0.25);
}

async function obtenerFilasEnLotes<T>(
  ids: readonly string[],
  consulta: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamanoLote = 150,
): Promise<T[]> {
  const filas: T[] = [];
  for (let inicio = 0; inicio < ids.length; inicio += tamanoLote) {
    const lote = ids.slice(inicio, inicio + tamanoLote);
    const { data, error } = await consulta(lote);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
  }
  return filas;
}

async function obtenerSesionesDeOrdenes(
  cliente: Admin,
  ordenIds: readonly string[],
): Promise<SesionTrabajo[]> {
  const filas: ReturnType<typeof filaASesionTrabajo>[] = [];
  const vistas = new Set<string>();
  for (let inicio = 0; inicio < ordenIds.length; inicio += 100) {
    const lote = ordenIds.slice(inicio, inicio + 100);
    for (let pagina = 0; ; pagina += TAMANO_PAGINA) {
      const { data, error } = await cliente
        .from('sesiones_trabajo')
        .select(COLUMNAS_SESION_TRABAJO_OPERATIVA)
        .in('orden_id', lote)
        .order('creado_en')
        .order('id')
        .range(pagina, pagina + TAMANO_PAGINA - 1);
      if (error) throw new Error(`No se pudieron cargar las sesiones: ${error.message}`);
      for (const fila of data ?? []) {
        if (vistas.has(fila.id)) continue;
        vistas.add(fila.id);
        filas.push(filaASesionTrabajo(fila));
      }
      if (!data || data.length < TAMANO_PAGINA) break;
    }
  }
  return filas;
}

async function obtenerAvancesDeMetas(
  cliente: Admin,
  metaIds: readonly string[],
): Promise<{ hechoPorMeta: Map<string, number>; consumidoPorMeta: Map<string, number> }> {
  const hechoPorMeta = new Map<string, number>();
  const consumidoPorMeta = new Map<string, number>();
  for (let inicio = 0; inicio < metaIds.length; inicio += 150) {
    const lote = metaIds.slice(inicio, inicio + 150);
    for (let pagina = 0; ; pagina += 1000) {
      const { data, error } = await cliente
        .from('registros_avance_partida')
        .select('meta_proceso_id, cantidad_producida, cantidad_consumida')
        .in('meta_proceso_id', lote)
        .order('id')
        .range(pagina, pagina + 999);
      if (error) throw new Error(`No se pudo cargar el avance por proceso: ${error.message}`);
      for (const avance of data ?? []) {
        if (!avance.meta_proceso_id) continue;
        hechoPorMeta.set(
          avance.meta_proceso_id,
          (hechoPorMeta.get(avance.meta_proceso_id) ?? 0) + Number(avance.cantidad_producida),
        );
        // C17: los registros históricos sin consumo descuentan lo producido.
        const consumido = Number(avance.cantidad_consumida) > 0
          ? Number(avance.cantidad_consumida)
          : Number(avance.cantidad_producida);
        consumidoPorMeta.set(
          avance.meta_proceso_id,
          (consumidoPorMeta.get(avance.meta_proceso_id) ?? 0) + consumido,
        );
      }
      if (!data || data.length < 1000) break;
    }
  }
  return { hechoPorMeta, consumidoPorMeta };
}

// Únicamente adjuntos originales del RFQ o de la propuesta aceptada.
// Los PDF y documentos generados no tienen una clase técnica permitida.
const CLASES_ADJUNTOS_OPERATIVOS = new Set([
  'CAD', 'DIBUJO', 'IMAGEN', 'ESPECIFICACIONES', 'OTROS', 'TECNICO', 'TÉCNICO',
]);

async function obtenerArchivosDeOrdenes(
  cliente: Admin,
  ordenIds: readonly string[],
): Promise<Map<string, ArchivoProceso[]>> {
  const porOrden = new Map<string, ArchivoProceso[]>();
  if (ordenIds.length === 0) return porOrden;

  // La lista de documentos autorizados proviene de la revisión congelada,
  // no de una carpeta RFQ o propuesta que pudo cambiar después de aprobarse.
  const ordenes = await obtenerFilasEnLotes<
    Pick<Tables<'ordenes_produccion'>, 'id' | 'snapshot_json' | 'propuesta_revision_id'>
  >(ordenIds, async (lote) => {
    const { data, error } = await cliente
      .from('ordenes_produccion')
      .select('id, snapshot_json, propuesta_revision_id')
      .in('id', lote);
    return { data, error };
  });

  const archivosAprobados = await Promise.all(
    ordenes.map(async (orden) => {
      const snapshot = esSnapshotOrdenSii(orden.snapshot_json)
        ? orden.snapshot_json
        : null;
      const archivos = await listarArchivosFichaOrden(cliente, {
        snapshot,
        propuestaRevisionId: orden.propuesta_revision_id,
      });
      return {
        ordenId: orden.id,
        archivos: archivos.filter((archivo) =>
          archivo.disponible &&
          (archivo.origen === 'RFQ' || archivo.origen.startsWith('Propuesta')) &&
          archivo.tipo !== '-',
        ),
      };
    }),
  );

  const ids = [...new Set(
    archivosAprobados.flatMap(({ archivos }) => archivos.map((archivo) => archivo.archivoId)),
  )];
  if (ids.length === 0) return porOrden;

  // Consulta en lista blanca: no se transmiten rutas de Storage ni buckets.
  const filas = await obtenerFilasEnLotes<
    Pick<Tables<'archivos'>,
      'id' | 'nombre_original' | 'mime' | 'tamano_bytes' | 'clase' | 'creado_en'
    >
  >(ids, async (lote) => {
    const { data, error } = await cliente
      .from('archivos')
      .select('id, nombre_original, mime, tamano_bytes, clase, creado_en')
      .in('id', lote)
      .eq('vigente', true)
      .is('retirado_en', null);
    return { data, error };
  });
  const porId = new Map(filas.map((fila) => [fila.id, fila] as const));

  for (const { ordenId, archivos } of archivosAprobados) {
    const resultado: ArchivoProceso[] = [];
    for (const archivo of archivos) {
      const fila = porId.get(archivo.archivoId);
      if (!fila || !CLASES_ADJUNTOS_OPERATIVOS.has((fila.clase ?? '').trim().toUpperCase())) {
        continue;
      }
      resultado.push({
        id: fila.id,
        nombre: archivo.nombreOriginal ?? fila.nombre_original ?? 'Archivo adjunto',
        mime: fila.mime,
        tamanoBytes: Number(fila.tamano_bytes),
        clase: fila.clase,
        creadoEn: fila.creado_en,
      });
    }
    porOrden.set(ordenId, resultado);
  }
  return porOrden;
}

/** Comentarios generales de la orden que el operador puede leer. */
async function obtenerComentariosDeOrdenes(
  cliente: Admin,
  ordenIds: readonly string[],
): Promise<Map<string, ComentarioOrdenVisible[]>> {
  const porOrden = new Map<string, ComentarioOrdenVisible[]>();
  if (ordenIds.length === 0) return porOrden;

  const filas = await obtenerFilasEnLotes<{
    id: string;
    entidad_id: string;
    contenido: string;
    creado_en: string;
    autor_id: string;
  }>(ordenIds, async (lote) => {
    const { data, error } = await cliente
      .from('comentarios_registro')
      .select('id, entidad_id, contenido, creado_en, autor_id')
      .eq('entidad_tipo', 'orden')
      .eq('eliminado', false)
      .in('entidad_id', lote)
      .order('creado_en', { ascending: false });
    return { data, error };
  });
  if (filas.length === 0) return porOrden;

  const autores = [...new Set(filas.map((fila) => fila.autor_id))];
  const nombres = new Map<string, string>();
  const usuarios = await obtenerFilasEnLotes<Pick<Tables<'usuarios'>, 'id' | 'nombre_completo'>>(
    autores,
    async (lote) => {
      const { data, error } = await cliente
        .from('usuarios')
        .select('id, nombre_completo')
        .in('id', lote);
      return { data, error };
    },
  );
  for (const usuario of usuarios) nombres.set(usuario.id, usuario.nombre_completo);

  for (const fila of filas) {
    const lista = porOrden.get(fila.entidad_id) ?? [];
    // Solo el hilo general: el operador necesita el contexto, no 200 entradas.
    if (lista.length >= 20) continue;
    lista.push({
      id: fila.id,
      contenido: fila.contenido,
      autorNombre: nombres.get(fila.autor_id) ?? 'Administración',
      creadoEn: fila.creado_en,
    });
    porOrden.set(fila.entidad_id, lista);
  }
  return porOrden;
}

/** C31/A15: total de horas netas de las sesiones que todavía cuentan. */
export function horasAcumuladasSesiones(
  sesiones: readonly Pick<SesionTrabajo, 'horasNetas' | 'sesionInvalida' | 'recursoLiberado'>[],
): number {
  const total = sesiones
    .filter((sesion) => !sesion.sesionInvalida && !sesion.recursoLiberado)
    .reduce((suma, sesion) => suma
      + (Number.isFinite(sesion.horasNetas) ? sesion.horasNetas : 0), 0);
  return Math.round(total * 100) / 100;
}

export function sesionResumen(
  sesion: SesionTrabajo,
  responsables: Readonly<Record<string, string>>,
  corridasConPrimeraPiezaPendiente: ReadonlyMap<string, string[]>,
): SesionProceso {
  return {
    id: sesion.id,
    corridaId: sesion.corridaId,
    operadorId: sesion.operadorId,
    operadorNombre: responsables[sesion.operadorId] ?? 'Operador',
    estadoSesion: sesion.estadoSesion,
    fechaInicio: sesion.fechaInicio,
    fechaFin: sesion.fechaFin,
    pendienteActualizacionAvance: sesion.pendienteActualizacionAvance,
    sesionInvalida: sesion.sesionInvalida,
    recursoLiberado: sesion.recursoLiberado,
    recursoLiberadoPor: sesion.recursoLiberadoPor,
    recursoLiberadoEn: sesion.recursoLiberadoEn,
    recursoLiberadoReclamosCount: sesion.recursoLiberadoReclamosCount,
    piezasProducidas: sesion.piezasProducidas,
    horasBrutas: sesion.horasBrutas,
    horasNetas: sesion.horasNetas,
    primeraPiezaPendiente: sesion.corridaId !== null
      && corridasConPrimeraPiezaPendiente.has(sesion.corridaId),
    primeraPiezaPendientePartidas: sesion.corridaId !== null
      ? corridasConPrimeraPiezaPendiente.get(sesion.corridaId) ?? []
      : [],
    motivoPausa: sesion.motivoPausaCodigo ?? sesion.motivoPausa,
    motivoPausaNota: sesion.motivoPausaNota,
    motivoExceso: sesion.motivoExceso,
    motivoExcesoDetalle: sesion.motivoExcesoDetalle,
    notas: sesion.notas,
    verificacionCompleta: sesion.verificacionInicio !== null,
  };
}

/**
 * C31/A9: una operación con meta propia nunca debe heredar las sesiones de
 * otra operación de la misma partida. El fallback a `sesionesPartida` solo vale
 * para partidas sin ruteo (una sola operación o meta heredada).
 */
export function sesionesDeOperacion(
  programacion: ProgramacionArea | null,
  sesionesPorProgramacion: ReadonlyMap<string, readonly SesionTrabajo[]>,
  sesionesPartida: readonly SesionTrabajo[],
  metaProcesoId: string | null,
  cantidadMetas: number,
  idsProgramacionPorMeta: ReadonlyMap<string, string> = new Map(),
): SesionTrabajo[] {
  if (programacion) return [...(sesionesPorProgramacion.get(programacion.id) ?? [])];
  if (cantidadMetas <= 1) return [...sesionesPartida];
  // Con varias metas, una operación no debe heredar la sesión activa de otra.
  // Se excluyen las programaciones conocidas de las demás operaciones, pero se
  // conservan las sesiones huérfanas (programación cancelada o sin meta) para
  // no borrar el historial propio de esta operación.
  const ajenas = new Set(
    [...idsProgramacionPorMeta]
      .filter(([meta]) => meta !== metaProcesoId)
      .map(([, id]) => id),
  );
  return sesionesPartida.filter((sesion) => !ajenas.has(sesion.programacionId));
}

/**
 * C31/A2: unificación de «sin sesión» con el diagnóstico C23. Se ignoran
 * sesiones inválidas y pausas ya liberadas por administración.
 */
export function operacionBloqueadaSinSesion(
  estadoPlaneacion: string | null,
  sesiones: readonly Pick<SesionTrabajo, 'estadoSesion' | 'sesionInvalida' | 'recursoLiberado'>[],
): boolean {
  return estadoPlaneacion === 'bloqueada'
    && !sesiones.some((sesion) => (
      (sesion.estadoSesion === 'activa' || sesion.estadoSesion === 'pausada')
      && !sesion.sesionInvalida
      && !sesion.recursoLiberado
    ));
}

/**
 * C31/A1: la traza de liberación se busca en todas las sesiones de la
 * operación, no solo en `ultimaSesion`: si otro operador inicia después, el
 * aviso no debe desaparecer.
 */
function avisoSupervisionDesdeSesiones(
  sesiones: readonly SesionTrabajo[],
  responsables: Readonly<Record<string, string>>,
): AvisoSupervision | null {
  const liberadas = sesiones
    .filter((sesion) => sesion.recursoLiberado)
    .sort((primera, segunda) => (
      (segunda.recursoLiberadoEn ?? segunda.fechaInicio)
        .localeCompare(primera.recursoLiberadoEn ?? primera.fechaInicio)
    ));
  const liberada = liberadas[0];
  if (!liberada) return null;
  const actorId = liberada.recursoLiberadoPor;
  return {
    actorNombre: actorId === null ? null : responsables[actorId] ?? null,
    fecha: liberada.recursoLiberadoEn,
    reclamosCerrados: liberada.recursoLiberadoReclamosCount ?? 0,
  };
}

/**
 * C3: corridas cuyo proceso exige primera pieza y los ítems que aún no la
 * tienen aprobada. Sustituye al aviso por corrida para que el operador sepa qué
 * pieza falta liberar antes de cerrar un lote.
 */
async function obtenerCorridasConPrimeraPiezaPendiente(
  cliente: Admin,
  sesiones: readonly SesionTrabajo[],
): Promise<Map<string, string[]>> {
  const pendientes = new Map<string, string[]>();
  const corridaIds = [...new Set(
    sesiones
      .map((sesion) => sesion.corridaId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )];
  if (corridaIds.length === 0) return pendientes;

  const corridas = await obtenerFilasEnLotes<{ id: string; proceso_id: string }>(
    corridaIds,
    async (lote) => {
      const { data, error } = await cliente
        .from('corridas')
        .select('id, proceso_id')
        .in('id', lote);
      return { data, error };
    },
  );
  if (corridas.length === 0) return pendientes;

  const procesos = await obtenerFilasEnLotes<{ id: string; requiere_primera_pieza: boolean }>(
    [...new Set(corridas.map((corrida) => corrida.proceso_id))],
    async (lote) => {
      const { data, error } = await cliente
        .from('catalogo_procesos')
        .select('id, requiere_primera_pieza')
        .in('id', lote);
      return { data, error };
    },
  );
  const exigen = new Set(
    procesos.filter((proceso) => proceso.requiere_primera_pieza).map((proceso) => proceso.id),
  );
  const candidatas = corridas.filter((corrida) => exigen.has(corrida.proceso_id));
  if (candidatas.length === 0) return pendientes;

  const [aprobadas, items] = await Promise.all([
    obtenerFilasEnLotes<{ corrida_id: string | null; partida_id: string | null }>(
      candidatas.map((corrida) => corrida.id),
      async (lote) => {
        const { data, error } = await cliente
          .from('inspecciones_calidad')
          .select('corrida_id, partida_id')
          .eq('tipo', 'PRIMERA_PIEZA')
          .eq('resultado', 'APROBADA')
          .in('corrida_id', lote);
        return { data, error };
      },
    ),
    obtenerFilasEnLotes<{ corrida_id: string; partida_id: string }>(
      candidatas.map((corrida) => corrida.id),
      async (lote) => {
        const { data, error } = await cliente
          .from('corrida_items')
          .select('corrida_id, partida_id')
          .in('corrida_id', lote);
        return { data, error };
      },
    ),
  ]);

  const itemsPorCorrida = new Map<string, string[]>();
  for (const item of items) {
    const actuales = itemsPorCorrida.get(item.corrida_id) ?? [];
    actuales.push(item.partida_id);
    itemsPorCorrida.set(item.corrida_id, actuales);
  }
  const aprobadasPorCorrida = new Map<string, Set<string>>();
  for (const fila of aprobadas) {
    if (fila.corrida_id === null) continue;
    const actuales = aprobadasPorCorrida.get(fila.corrida_id) ?? new Set<string>();
    actuales.add(fila.partida_id ?? '__sin_partida__');
    aprobadasPorCorrida.set(fila.corrida_id, actuales);
  }

  for (const corrida of candidatas) {
    const ids = itemsPorCorrida.get(corrida.id) ?? [];
    const aprobadasSet = aprobadasPorCorrida.get(corrida.id) ?? new Set<string>();
    if (ids.length === 0) {
      if (!aprobadasSet.size) pendientes.set(corrida.id, []);
      continue;
    }
    // Compatibilidad: una aprobación histórica sin partida cubre la corrida
    // cuando esta tiene un solo ítem.
    const legacy = ids.length === 1 && aprobadasSet.has('__sin_partida__');
    const faltan = ids.filter((id) => !aprobadasSet.has(id) && !legacy);
    if (faltan.length > 0) pendientes.set(corrida.id, faltan);
  }
  return pendientes;
}

/**
 * Carga y deriva el espacio de operador completo sin N+1. El servidor es la
 * Única fuente de verdad: la UI no inventa columnas ni capacidades.
 */
export async function obtenerEspacioOperadorServicio(
  cliente: Admin,
  operadorId: string | null,
  hoy: string = fechaIsoLocal(),
): Promise<DatosEspacioOperador> {
  // C15: antes de pintar el tablero, toda sesión que ya cumplió su jornada se
  // pausa en el instante exacto del límite. Con `operadorId` nulo (vista de
  // supervisor) se revisan todos los operadores, para que una sesión olvidada
  // no siga apareciendo «en proceso» en el piso. Es idempotente y no bloquea la
  // lectura si falla: el operador debe seguir viendo su piso.
  try {
    await pausarSesionesJornadaExcedidaServicio(cliente, { operadorId });
  } catch (error) {
    console.error('[PRODUCCION] No se pudieron pausar las sesiones vencidas:', error);
  }

  const [
    resultadoOrdenes,
    resultadoReclamos,
    resultadoAreas,
    resultadoRecursos,
    resultadoClientes,
    motivosPausa,
  ] = await Promise.all([
    cliente
      .from('ordenes_produccion')
      .select(COLUMNAS_ORDEN_OPERATIVA)
      .neq('estado', 'cancelada')
      .is('archivada_en', null)
      .order('fecha_compromiso'),
    cliente.from('reclamos_proceso_operador').select('*').eq('estado', 'activo'),
    cliente
      .from('areas_trabajo_config')
      .select('codigo, nombre, padre_codigo, area_planeacion, color_hex')
      .order('orden')
      .order('nombre'),
    cliente.from('recursos_planeacion').select('id, codigo, nombre').order('codigo'),
    cliente.from('clientes').select('id, razon_social, nombre_comercial'),
    obtenerMotivosPausaServicio(cliente),
  ]);

  const error = [
    resultadoOrdenes.error,
    resultadoReclamos.error,
    resultadoAreas.error,
    resultadoRecursos.error,
    resultadoClientes.error,
  ].find((actual) => actual !== null);
  if (error) {
    throw new Error(`No se pudo cargar el espacio de operador: ${error.message}`);
  }

  const ordenes = (resultadoOrdenes.data ?? []).map(filaAOrdenOperativa);
  const ordenIds = ordenes.map((orden) => orden.id);

  // Solo se cargan partidas, metas y programaciones de las órdenes vigentes:
  // las tablas históricas crecen con cada ciclo y no deben entrar al tablero.
  const filasPartidas = await obtenerFilasEnLotes<FilaPartida>(ordenIds, async (lote) => {
    const { data, error: errorLote } = await cliente
      .from('partidas_orden_produccion')
      .select('*')
      .in('orden_id', lote)
      .order('creado_en');
    return { data, error: errorLote };
  });
  const partidaIds = filasPartidas.map((partida) => partida.id);

  const [filasMetas, filasProgramaciones] = await Promise.all([
    obtenerFilasEnLotes<FilaMeta>(partidaIds, async (lote) => {
      const { data, error: errorLote } = await cliente
        .from('metas_proceso_partida')
        .select('*')
        .in('partida_id', lote)
        .order('secuencia');
      return { data, error: errorLote };
    }),
    obtenerFilasEnLotes<Tables<'programacion_areas'>>(partidaIds, async (lote) => {
      const { data, error: errorLote } = await cliente
        .from('programacion_areas')
        .select('*')
        .in('partida_id', lote)
        .neq('estado_planeacion', 'cancelada')
        .order('secuencia');
      return { data, error: errorLote };
    }),
  ]);

  const partidas = filasPartidas.map(filaAPartida);
  const filasPartidasPorId = new Map(filasPartidas.map((fila) => [fila.id, fila] as const));
  const ordenesPorId = new Map(ordenes.map((orden) => [orden.id, orden]));
  const ordenesVigentes = new Set(ordenIds);
  const partidasVigentes = partidas.filter((partida) => ordenesVigentes.has(partida.ordenId));

  const metasPorPartida = new Map<string, FilaMeta[]>();
  for (const meta of filasMetas) {
    const actuales = metasPorPartida.get(meta.partida_id) ?? [];
    actuales.push(meta);
    metasPorPartida.set(meta.partida_id, actuales);
  }

  const reclamos: ReclamoProcesoOperador[] = (resultadoReclamos.data ?? []).map(filaAReclamoProceso);
  const reclamoPorOperacion = new Map<string, ReclamoProcesoOperador>();
  for (const reclamo of reclamos) {
    reclamoPorOperacion.set(`${reclamo.partidaId}:${reclamo.metaProcesoId ?? ''}`, reclamo);
  }

  const programacionesPorPartida = new Map<string, ProgramacionArea[]>();
  for (const fila of filasProgramaciones) {
    const programacion = filaAProgramacionArea(fila);
    // C16: los días adicionales solo reservan capacidad. La sesión de piso se
    // abre desde la fila principal para no duplicar la operación en el tablero.
    if (programacion.esContinuacion) continue;
    const actuales = programacionesPorPartida.get(programacion.partidaId) ?? [];
    actuales.push(programacion);
    programacionesPorPartida.set(programacion.partidaId, actuales);
  }

  const recursosPorId = new Map<string, FilaRecursoResumen>(
    (resultadoRecursos.data ?? []).map((recurso) => [recurso.id, recurso as FilaRecursoResumen] as const),
  );
  const clientesPorId = new Map(
    (resultadoClientes.data ?? []).map((cliente) => [cliente.id, cliente] as const),
  );

  const areas: AreaEspacioOperador[] = (resultadoAreas.data ?? []).map((area) => ({
    codigo: area.codigo,
    nombre: area.nombre,
    padreCodigo: area.padre_codigo,
    areaPlaneacion: area.area_planeacion,
    colorHex: area.color_hex,
  }));
  const areasPorCodigo = new Map(areas.map((area) => [area.codigo, area]));

  const [
    sesiones,
    { hechoPorMeta, consumidoPorMeta },
    archivosPorOrden,
    comentariosPorOrden,
    lotes,
  ] = await Promise.all([
    obtenerSesionesDeOrdenes(cliente, ordenIds),
    obtenerAvancesDeMetas(cliente, filasMetas.map((meta) => meta.id)),
    obtenerArchivosDeOrdenes(cliente, ordenIds),
    obtenerComentariosDeOrdenes(cliente, ordenIds),
    obtenerLotesTableroServicio(cliente, ordenIds),
  ]);
  const lotePorOperacion = mapaLotesPorOperacion(lotes);
  const corridasConPrimeraPiezaPendiente = await obtenerCorridasConPrimeraPiezaPendiente(
    cliente,
    sesiones,
  );

  const sesionesPorProgramacion = new Map<string, SesionTrabajo[]>();
  const sesionesPorPartida = new Map<string, SesionTrabajo[]>();
  for (const sesion of sesiones) {
    const porProgramacion = sesionesPorProgramacion.get(sesion.programacionId) ?? [];
    porProgramacion.push(sesion);
    sesionesPorProgramacion.set(sesion.programacionId, porProgramacion);
    const porPartida = sesionesPorPartida.get(sesion.partidaId) ?? [];
    porPartida.push(sesion);
    sesionesPorPartida.set(sesion.partidaId, porPartida);
  }

  const idsOperadores = [
    ...new Set([
      ...reclamos.map((reclamo) => reclamo.operadorId),
      ...sesiones.map((sesion) => sesion.operadorId),
      ...sesiones.map((sesion) => sesion.recursoLiberadoPor).filter((id): id is string => id !== null),
      ...partidas.map((partida) => partida.operadorAsignadoId).filter((id): id is string => id !== null),
    ]),
  ];
  const responsables: Record<string, string> = {};
  if (idsOperadores.length > 0) {
    const operadores = await obtenerFilasEnLotes<Pick<Tables<'usuarios'>, 'id' | 'nombre_completo'>>(
      idsOperadores,
      async (lote) => {
        const { data, error } = await cliente
          .from('usuarios')
          .select('id, nombre_completo')
          .in('id', lote);
        return { data, error };
      },
    );
    for (const operador of operadores) responsables[operador.id] = operador.nombre_completo;
  }

  const idsMateriales = [
    ...new Set(
      partidasVigentes
        .map((partida) => partida.materialId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const materialesPorId = new Map<string, MaterialProceso>();
  if (idsMateriales.length > 0) {
    const [materiales, espesores] = await Promise.all([
      obtenerFilasEnLotes<Pick<Tables<'catalogo_materiales'>, 'id' | 'codigo' | 'nombre' | 'unidad_base' | 'ancho_mm' | 'largo_mm'>>(
        idsMateriales,
        async (lote) => {
          const { data, error } = await cliente
            .from('catalogo_materiales')
            .select('id, codigo, nombre, unidad_base, ancho_mm, largo_mm')
            .in('id', lote);
          return { data, error };
        },
      ),
      obtenerFilasEnLotes<Pick<Tables<'catalogo_espesores'>, 'material_id' | 'espesor_mm'>>(
        idsMateriales,
        async (lote) => {
          const { data, error } = await cliente
            .from('catalogo_espesores')
            .select('material_id, espesor_mm')
            .in('material_id', lote)
            .eq('activo', true);
          return { data, error };
        },
      ),
    ]);
    // Solo se considera calibre cuando el material tiene un único espesor: con
    // varios no se puede saber qué calibre usa cada ítem desde esta pantalla.
    const espesoresPorMaterial = new Map<string, number>();
    const materialesConVariosEspesores = new Set<string>();
    for (const espesor of espesores) {
      if (espesoresPorMaterial.has(espesor.material_id)) {
        materialesConVariosEspesores.add(espesor.material_id);
      } else {
        espesoresPorMaterial.set(espesor.material_id, Number(espesor.espesor_mm));
      }
    }
    for (const material of materiales) {
      const espesorMm = materialesConVariosEspesores.has(material.id)
        ? null
        : espesoresPorMaterial.get(material.id) ?? null;
      materialesPorId.set(material.id, {
        id: material.id,
        codigo: material.codigo,
        nombre: material.nombre,
        unidadBase: material.unidad_base,
        anchoMm: material.ancho_mm === null ? null : Number(material.ancho_mm),
        largoMm: material.largo_mm === null ? null : Number(material.largo_mm),
        espesorMm,
      });
    }
  }

  const procesos: ProcesoEspacioOperador[] = [];

  for (const partida of partidasVigentes) {
    const orden = ordenesPorId.get(partida.ordenId);
    const filaPartida = filasPartidasPorId.get(partida.id);
    if (!orden || !filaPartida) continue;

    const metas = metasPorPartida.get(partida.id) ?? [];
    const programaciones = [...(programacionesPorPartida.get(partida.id) ?? [])]
      .sort((primera, segunda) => segunda.actualizadoEn.localeCompare(primera.actualizadoEn));
    const programacionHeredada = programaciones.find(
      (programacion) => programacion.metaProcesoId === null,
    ) ?? null;
    const idsProgramacionPorMeta = new Map(
      programaciones
        .filter((programacion) => programacion.metaProcesoId !== null)
        .map((programacion) => [programacion.metaProcesoId!, programacion.id] as const),
    );
    const areaCodigo = partida.areaTrabajoCodigo ?? null;
    const area = areaCodigo ? areasPorCodigo.get(areaCodigo) ?? null : null;
    const areaRaiz = resolverAreaRaiz(areas, areaCodigo);
    const cliente = clientesPorId.get(orden.clienteId);
    const archivos = archivosPorOrden.get(orden.id) ?? [];
    const comentariosOrden = comentariosPorOrden.get(orden.id) ?? [];
    const sesionesPartida = sesionesPorPartida.get(partida.id) ?? [];

    const operaciones = metas.length > 0
      ? metas.map((meta) => ({ meta, nombre: meta.nombre, secuencia: Number(meta.secuencia), metaPiezas: Number(meta.meta_piezas) }))
      : [{
        meta: null as FilaMeta | null,
        nombre: 'Proceso completo',
        secuencia: 1,
        metaPiezas: partida.cantidadSolicitada,
      }];

    const ultimaSecuencia = operaciones.reduce(
      (maxima, operacion) => Math.max(maxima, operacion.secuencia),
      0,
    );

    const procesosRuteo: ProcesoRuteoResumen[] = operaciones.map((operacion) => {
      const hecho = operacion.meta ? (hechoPorMeta.get(operacion.meta.id) ?? 0) : partida.cantidadProducida;
      const consumido = operacion.meta
        ? (consumidoPorMeta.get(operacion.meta.id) ?? hecho)
        : hecho;
      return {
        id: operacion.meta?.id ?? `${partida.id}:sin-proceso`,
        secuencia: operacion.secuencia,
        nombre: operacion.nombre,
        metaPiezas: operacion.metaPiezas,
        hechoPiezas: hecho,
        consumidoPiezas: consumido,
        completado: hecho >= operacion.metaPiezas,
      };
    });
    // C11: la disponibilidad se deriva del hecho real del proceso anterior, no
    // del estado de planeación; así el operador puede avanzar por lotes.
    const disponibilidadPorProceso = calcularDisponibilidadProcesos(procesosRuteo);

    for (const operacion of operaciones) {
      const metaProcesoId = operacion.meta?.id ?? null;
      const claveOperacion = `${partida.id}:${metaProcesoId ?? ''}`;
      const lote = lotePorOperacion.get(claveLotePartida(partida.id, operacion.nombre)) ?? null;
      const programacionOperacion = metaProcesoId
        ? programaciones.find((actual) => actual.metaProcesoId === metaProcesoId) ?? null
        : null;
      // C9.0: la fila heredada (sin operación) sigue siendo válida mientras la
      // partida tenga una sola operación; el reclamo la adopta al preparar.
      const programacion = programacionOperacion
        ?? (metaProcesoId === null || metas.length === 1 ? programacionHeredada : null);
      const sesionesOperacion = sesionesDeOperacion(
        programacion,
        sesionesPorProgramacion,
        sesionesPartida,
        metaProcesoId,
        metas.length,
        idsProgramacionPorMeta,
      );
      const sesionesOrdenadas = [...sesionesOperacion].sort((primera, segunda) => (
        segunda.fechaInicio.localeCompare(primera.fechaInicio)
        || segunda.id.localeCompare(primera.id)
      ));
      const sesionActiva = sesionesOrdenadas.find((sesion) => sesion.estadoSesion === 'activa') ?? null;
      const ultimaSesion = sesionesOrdenadas[0] ?? null;
      // C22: una pausa reclamada por supervisión es historial; la operación ya
      // volvió al pool y no debe seguir ofreciéndose como "reanudar".
      const sesionPausada = ultimaSesion?.estadoSesion === 'pausada' && !ultimaSesion.recursoLiberado;
      // C20: solo la última pausa puede estar pendiente; una pausa histórica ya
      // fue superada por otra sesión y no se debe volver a corregir.
      const pendienteActualizacionAvance = sesionPausada
        && ultimaSesion!.pendienteActualizacionAvance === true;
      // Un reclamo activo debe quedar siempre adjunto aunque su meta cambió
      // (reclamos antiguos sin meta_proceso_id). Se prueba la clave exacta y
      // luego los fallbacks de partida para que el calendario no lo marque
      // "Por asignar" cuando ya está reservado.
      const reclamo = reclamoPorOperacion.get(claveOperacion)
        ?? reclamoPorOperacion.get(`${partida.id}:${operacion.meta?.id ?? ''}`)
        ?? reclamoPorOperacion.get(`${partida.id}:`)
        ?? null;
      const reclamadoPorMi = operadorId !== null && reclamo?.operadorId === operadorId;
      const hechoPiezas = operacion.meta
        ? (hechoPorMeta.get(operacion.meta.id) ?? 0)
        : partida.cantidadProducida;
      const pendientePiezas = Math.max(operacion.metaPiezas - hechoPiezas, 0);
      const disponibilidad = disponibilidadPorProceso.get(
        operacion.meta?.id ?? `${partida.id}:sin-proceso`,
      ) ?? { disponiblePiezas: null, procesoPrevioNombre: null };
      const procesoCompleto = operacion.meta
        ? hechoPiezas >= operacion.metaPiezas
        : partida.cantidadProducida >= partida.cantidadSolicitada;
      const porcentaje = operacion.metaPiezas > 0
        ? Math.min((hechoPiezas / operacion.metaPiezas) * 100, 100)
        : 0;
      const horasEstimadas = estimarHorasProceso(
        filaPartida,
        programacion,
        operaciones.length,
        metaProcesoId !== null,
      );
      const horasAcumuladas = horasAcumuladasSesiones(sesionesOrdenadas);
      const columna = derivarColumnaProceso({
        estadoOrden: orden.estado,
        estadoSii: orden.estadoSii,
        procesoCompleto,
        sesionActiva: sesionActiva !== null,
        sesionPausada,
        pendienteActualizacionAvance,
        programacionEstado: programacion?.estadoPlaneacion ?? null,
      });
      const urgencia = derivarUrgenciaProceso(orden.fechaCompromiso, orden.prioridad, hoy);
      const ordenIniciable = orden.estado === 'borrador'
        || orden.estado === 'programada'
        || orden.estado === 'pausada'
        || orden.estado === 'en_proceso';
      const pausado = sesionPausada || programacion?.estadoPlaneacion === 'bloqueada';
      // C31/A2: misma definición de «sin sesión» que el diagnóstico C23.
      const bloqueadoSinSesion = operacionBloqueadaSinSesion(
        programacion?.estadoPlaneacion ?? null,
        sesionesOrdenadas,
      );
      // C29: un proceso posterior no puede arrancar ni retomarse mientras el
      // proceso anterior no le haya liberado piezas nuevas. La pausa no es una
      // excepción: si ya consumió todo el lote, debe esperar más piezas.
      const sinPiezasPrevias = disponibilidad.disponiblePiezas === 0;
      const motivoSinPiezas = disponibilidad.procesoPrevioNombre
        ? (sesionPausada
          ? `Sin piezas de ${disponibilidad.procesoPrevioNombre}: espera a que libere más piezas para reanudar`
          : `Sin piezas de ${disponibilidad.procesoPrevioNombre}: el proceso anterior aún no termina`)
        : (sesionPausada
          ? 'Sin piezas del proceso anterior: espera a que libere más piezas para reanudar'
          : 'Sin piezas del proceso anterior');

      let motivoNoInicia: string | null = null;
      if (operadorId === null) motivoNoInicia = 'Vista de solo lectura';
      else if (reclamo && !reclamadoPorMi) motivoNoInicia = 'Otro operador tiene el proceso';
      // Corrección obs 6: el operador ya puede iniciar con el día/turno de su
      // reclamo; no debe esperar a que Planeación programe ni a que un admin
      // libere la orden a Bandeja. La RPC admite 'borrador' (migración 20261123000000).
      else if (!ordenIniciable) motivoNoInicia = 'La orden ya no está activa';
      else if (bloqueadoSinSesion) {
        motivoNoInicia = MOTIVO_BLOQUEO_TEXTO.programacion_bloqueada_sin_sesion;
      }
      else if (sesionActiva) motivoNoInicia = 'Ya hay una sesión activa en este proceso';
      else if (pendienteActualizacionAvance) {
        motivoNoInicia = 'Actualiza el avance y la hora real antes de continuar';
      } else if (pausado && procesoCompleto) {
        motivoNoInicia = disponibilidad.procesoPrevioNombre
          ? 'Operación completa: actualiza el avance de la pausa para cerrarla'
          : 'Operación completa: registra el consumo de material para cerrarla';
      } else if (sinPiezasPrevias) motivoNoInicia = motivoSinPiezas;
      else if (pausado) motivoNoInicia = 'Proceso pausado: reanuda la sesión';

      // Una operación terminada no se reanuda: la sesión sigue pausada solo
      // porque falta asentar el consumo de material antes de cerrarla. Tampoco
      // se reanuda sin piezas disponibles del proceso anterior (C29).
      const puedeReanudar = operadorId !== null
        && reclamadoPorMi
        && !pendienteActualizacionAvance
        && sesionPausada
        && !procesoCompleto
        && !sinPiezasPrevias
        && programacion?.estadoPlaneacion === 'bloqueada'
        && (orden.estado === 'pausada' || orden.estado === 'en_proceso');

      const proceso: ProcesoEspacioOperador = {
        id: claveOperacion,
        ordenId: orden.id,
        folioOrden: orden.folioSii ?? orden.folio,
        folioSii: orden.folioSii,
        estadoOrden: orden.estado,
        estadoSii: orden.estadoSii,
        prioridad: orden.prioridad,
        clienteNombre: cliente?.nombre_comercial || cliente?.razon_social || 'Cliente',
        fechaCompromiso: orden.fechaCompromiso,
        fechaOperativa: orden.fechaOperativa ?? orden.fechaCompromiso,
        notas: orden.notas,
        partidaId: partida.id,
        codigoPieza: partida.codigoPieza,
        descripcion: partida.descripcion,
        cantidadSolicitada: partida.cantidadSolicitada,
        cantidadProducida: partida.cantidadProducida,
        unidadMedida: partida.unidadMedida,
        esExterno: filaPartida.es_externo,
        proveedorExterno: filaPartida.proveedor_externo,
        material: partida.materialId ? materialesPorId.get(partida.materialId) ?? null : null,
        areaCodigo,
        areaNombre: area?.nombre ?? (areaCodigo ?? 'Sin Área'),
        areaMacro: areaRaiz?.codigo ?? null,
        areaColor: area?.colorHex ?? null,
        metaProcesoId,
        procesoNombre: operacion.nombre,
        secuencia: operacion.secuencia,
        metaPiezas: operacion.metaPiezas,
        hechoPiezas,
        pendientePiezas,
        porcentaje,
        procesoCompleto,
        esFinal: operacion.secuencia === ultimaSecuencia,
        piezasDisponibles: disponibilidad.disponiblePiezas,
        procesoPrevioNombre: disponibilidad.procesoPrevioNombre,
        horasEstimadas,
        horasAcumuladas,
        programacion: programacion
          ? {
            id: programacion.id,
            fecha: programacion.fechaProgramada,
            turno: programacion.turno,
            estadoPlaneacion: programacion.estadoPlaneacion,
            horasEstimadas: programacion.horasEstimadas,
            recursoId: programacion.recursoId,
            recursoCodigo: recursosPorId.get(programacion.recursoId)?.codigo ?? null,
            recursoNombre: recursosPorId.get(programacion.recursoId)?.nombre ?? null,
            actualizadoEn: programacion.actualizadoEn,
          }
          : null,
        reclamo,
        reclamadoPorMi,
        nombreReclamante: reclamo ? responsables[reclamo.operadorId] ?? 'Operador' : null,
        sesionActiva: sesionActiva
          ? sesionResumen(sesionActiva, responsables, corridasConPrimeraPiezaPendiente)
          : null,
        ultimaSesion: ultimaSesion
          ? sesionResumen(ultimaSesion, responsables, corridasConPrimeraPiezaPendiente)
          : null,
        sesiones: sesionesOrdenadas.map((sesion) =>
          sesionResumen(sesion, responsables, corridasConPrimeraPiezaPendiente)),
        avisoSupervision: avisoSupervisionDesdeSesiones(sesionesOrdenadas, responsables),
        pendienteActualizacionAvance,
        procesosRuteo,
        archivos,
        comentariosOrden,
        columna,
        urgencia,
        etiquetas: [],
        puedeIniciar: motivoNoInicia === null,
        puedeReanudar,
        motivoNoInicia,
        motivoBloqueo: bloqueadoSinSesion ? 'programacion_bloqueada_sin_sesion' : null,
        equipoOcupadoPor: null,
        loteId: lote?.id ?? null,
        loteCodigo: lote?.codigo ?? null,
      };
      proceso.etiquetas = etiquetasProceso(proceso);
      procesos.push(proceso);
    }
  }

  // Corrección obs: anticipar la ocupación del equipo con datos que ya están en
  // el espacio (sesión activa + recurso de cada programación). Es solo un aviso
  // para no abrir el checklist en falso; la RPC sigue siendo la autoridad final.
  const ocupantesPorRecurso = new Map<string, ProcesoEspacioOperador>();
  for (const proceso of procesos) {
    const recursoId = proceso.programacion?.recursoId;
    if (proceso.sesionActiva && recursoId) ocupantesPorRecurso.set(recursoId, proceso);
  }
  for (const proceso of procesos) {
    if (!operadorId) continue;
    const recursoId = proceso.programacion?.recursoId;
    if (!recursoId) continue;
    const ocupante = ocupantesPorRecurso.get(recursoId);
    if (!ocupante || ocupante.id === proceso.id) continue;
    proceso.equipoOcupadoPor = mensajeEquipoOcupado(ocupante, operadorId);
  }

  // Orden estable: urgencia, fecha compromiso y secuencia del ruteo.
  const pesoUrgencia = { vencida: 0, urgente: 1, proxima: 2, normal: 3 } as const;
  procesos.sort((primero, segundo) => (
    pesoUrgencia[primero.urgencia] - pesoUrgencia[segundo.urgencia]
    || primero.fechaCompromiso.localeCompare(segundo.fechaCompromiso)
    || primero.folioOrden.localeCompare(segundo.folioOrden)
    || primero.secuencia - segundo.secuencia
  ));

  const fechasSemana = Array.from({ length: 7 }, (_, indice) => sumarDias(inicioSemana(hoy), indice));
  // La jornada de 8 h es por operador: las reservas de otros no consumen su día.
  // En la vista de administrador (operadorId null) se muestra la carga completa.
  const procesosParaJornada = operadorId === null
    ? procesos
    : procesos.filter((proceso) => proceso.reclamo === null || proceso.reclamadoPorMi);
  const dias = construirDiasCalendario(fechasSemana, procesosParaJornada, hoy);
  const gruposArea = agruparProcesosPorArea(procesos, areas);
  const resumen = resumirEspacioOperador(procesos, hoy);
  resumen.horasReclamadasHoy = Math.round(
    procesosParaJornada.reduce(
      (total, proceso) => (
        proceso.reclamo?.fecha === hoy ? total + proceso.reclamo.horasEstimadas : total
      ),
      0,
    ) * 100,
  ) / 100;

  return {
    procesos,
    lotes,
    areas,
    motivosPausa,
    responsables,
    resumen,
    hoy,
    dias,
    gruposArea,
  };
}

/** Etiqueta legible de urgencia para la UI y las pruebas. */
export function etiquetaUrgencia(urgencia: keyof typeof ETIQUETAS_URGENCIA): string {
  return ETIQUETAS_URGENCIA[urgencia];
}

/** Días restantes para la fecha compromiso (negativo = vencida). */
export function diasParaCompromiso(fechaCompromiso: string, hoy: string): number {
  return diasEntreFechas(hoy, fechaCompromiso);
}

