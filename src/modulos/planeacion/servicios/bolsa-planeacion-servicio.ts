import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { CargaCapacidadDiaria, TurnoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import { obtenerCargaCapacidadDiariaServicio } from '@/modulos/planeacion/servicios/planeacion-servicio';

/**
 * PLA-05: bolsa de trabajo liberable. Las pausadas sin planear, el trabajo en
 * proceso sin programación de hoy y las partidas sin planear que caben en la
 * capacidad libre se calculan sobre lecturas RLS + la RPC de carga; la mutación
 * sigue siendo la RPC transaccional de programación.
 */

export interface PartidaBolsa {
  partidaId: string;
  ordenId: string;
  folio: string;
  codigoPieza: string;
  areaCodigo: string | null;
  procesos: string[];
  horas: number;
  estimadoMinutos: number;
  /** Fecha prometida al cliente; Planeación la usa como fecha preferida. */
  fechaCompromiso?: string | null;
}

export interface SugerenciaBolsa extends PartidaBolsa {
  recursoId: string;
  recursoCodigo: string;
  fecha: string;
  turno: TurnoPlaneacion;
  secuencia: number;
  /** C9.0: operación pendiente sugerida; `null` en partidas sin ruteo (heredadas). */
  metaProcesoId: string | null;
  operacionNombre: string | null;
  horasDisponibles: number;
}

export interface BolsaPlaneacion {
  pausadasSinPlan: PartidaBolsa[];
  activasSinFechaHoy: PartidaBolsa[];
  sugerencias: SugerenciaBolsa[];
  /**
   * Punto 5b: trabajo pendiente que no se sugiere porque el grupo de equipo que
   * pide la operación no tiene hueco en el horizonte. Se muestra con el motivo y
   * una sola acción para programarlo a mano con una máquina compatible.
   */
  bloqueadasPorEquipo: PartidaBloqueadaBolsa[];
}

export interface PartidaBloqueadaBolsa extends PartidaBolsa {
  grupoRequeridoId: string;
  grupoRequeridoNombre: string;
  motivo: string;
}

/** Horas sugeridas para programar: al menos 0.25 h y redondeo a dos decimales. */
export function horasSugeridas(estimadoMinutos: number): number {
  const horas = estimadoMinutos > 0 ? estimadoMinutos / 60 : 0.25;
  return Math.max(0.25, Math.round(horas * 100) / 100);
}

/** Siguiente secuencia libre de una partida a partir de las existentes. */
export function siguienteSecuencia(secuencias: readonly number[]): number {
  const maxima = secuencias.reduce((mayor, valor) => Math.max(mayor, valor), 0);
  return maxima + 1;
}

const ORDEN_TURNOS: readonly TurnoPlaneacion[] = ['matutino', 'vespertino', 'nocturno'];

/** Primer hueco con capacidad para las horas pedidas, en orden fecha→turno→código. */
export function elegirHueco(
  horas: number,
  cargas: readonly CargaCapacidadDiaria[],
  codigoPorRecurso: ReadonlyMap<string, string>,
  fechaPreferida?: string | null,
): { carga: CargaCapacidadDiaria; horasDisponibles: number } | null {
  const candidatas = cargas
    .filter((carga) => !carga.sobrecargado && carga.horasDisponibles >= horas)
    .sort((primera, segunda) => (
      // La fecha compromiso comercial manda: si ese día tiene hueco, se sugiere
      // primero para no prometer al cliente una fecha que Planeación ignora.
      (fechaPreferida
        ? Number(segunda.fechaProgramada === fechaPreferida)
          - Number(primera.fechaProgramada === fechaPreferida)
        : 0)
      || primera.fechaProgramada.localeCompare(segunda.fechaProgramada)
      || ORDEN_TURNOS.indexOf(primera.turno) - ORDEN_TURNOS.indexOf(segunda.turno)
      || (codigoPorRecurso.get(primera.recursoId) ?? '').localeCompare(
        codigoPorRecurso.get(segunda.recursoId) ?? '',
      )
    ));
  const primera = candidatas[0];
  return primera ? { carga: primera, horasDisponibles: primera.horasDisponibles } : null;
}

type FilaOrden = Pick<
  Database['public']['Tables']['ordenes_produccion']['Row'],
  'id' | 'folio' | 'estado' | 'estado_sii' | 'fecha_compromiso_comercial'
>;
type FilaPartida = Pick<
  Database['public']['Tables']['partidas_orden_produccion']['Row'],
  | 'id'
  | 'orden_id'
  | 'codigo_pieza'
  | 'area_trabajo_codigo'
  | 'procesos'
  | 'tiempo_estimado_minutos'
  | 'maquina_asignada'
  | 'propuesta_item_id'
>;
type FilaProgramacion = Pick<
  Database['public']['Tables']['programacion_areas']['Row'],
  'partida_id' | 'secuencia' | 'estado_planeacion' | 'fecha_programada' | 'meta_proceso_id'
>;
type FilaMeta = Pick<
  Database['public']['Tables']['metas_proceso_partida']['Row'],
  'id' | 'partida_id' | 'secuencia' | 'nombre'
>;
type FilaRuteo = Pick<
  Database['public']['Tables']['propuesta_item_ruteo']['Row'],
  'item_id' | 'secuencia' | 'grupo_equipo_id'
>;
type FilaProceso = Pick<
  Database['public']['Tables']['catalogo_procesos']['Row'],
  'codigo' | 'nombre' | 'grupo_equipo_id'
>;

/** Normaliza nombres/códigos de catálogo igual que `privado.grupo_equipo_requerido_operacion`. */
function normalizarCatalogo(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Elige el grupo de equipo que exige la operación pendiente con el mismo orden
 * que aplica PostgreSQL: ruteo de la propuesta → catálogo del proceso →
 * estación anotada en la partida. `null` = sin dato (no filtra).
 */
export function resolverGrupoRequeridoBolsa(entrada: {
  fila: FilaMeta | null;
  partida: Pick<FilaPartida, 'propuesta_item_id' | 'procesos' | 'maquina_asignada'>;
  ruteoPorClave: ReadonlyMap<string, string | null>;
  grupoPorProceso: ReadonlyMap<string, string | null>;
  grupoPorCodigoRecurso: ReadonlyMap<string, string | null>;
}): string | null {
  if (entrada.fila) {
    const claveRuteo = `${entrada.partida.propuesta_item_id ?? ''}:${entrada.fila.secuencia}`;
    if (entrada.partida.propuesta_item_id) {
      const grupoRuteo = entrada.ruteoPorClave.get(claveRuteo);
      if (grupoRuteo) return grupoRuteo;
    }
    const grupoProceso = entrada.grupoPorProceso.get(normalizarCatalogo(entrada.fila.nombre));
    if (grupoProceso) return grupoProceso;
  }
  const maquina = entrada.partida.maquina_asignada;
  if (maquina) {
    const grupoMaquina = entrada.grupoPorCodigoRecurso.get(normalizarCatalogo(maquina));
    if (grupoMaquina) return grupoMaquina;
  }
  return null;
}

/**
 * Un hueco es compatible cuando la máquina no tiene grupo (sin dato) o pertenece
 * al grupo que pide la operación. Evita sugerir una asignación que la RPC
 * rechazaría con `recurso_incompatible`.
 */
export function esRecursoCompatibleBolsa(
  recursoId: string,
  grupoRequerido: string | null,
  grupoPorRecurso: ReadonlyMap<string, string | null>,
): boolean {
  if (!grupoRequerido) return true;
  const grupoRecurso = grupoPorRecurso.get(recursoId) ?? null;
  return grupoRecurso === null || grupoRecurso === grupoRequerido;
}

export const ESTADOS_ACTIVOS_PROGRAMACION = [
  'programada',
  'en_preparacion',
  'en_proceso',
  'bloqueada',
];

function fechaMas(fecha: string, dias: number): string {
  const instante = new Date(`${fecha}T00:00:00.000Z`);
  instante.setUTCDate(instante.getUTCDate() + dias);
  return instante.toISOString().slice(0, 10);
}

export async function obtenerBolsaPlaneacionServicio(
  cliente: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  hoy: string,
  horizonteDias = 14,
): Promise<BolsaPlaneacion> {
  const vacia: BolsaPlaneacion = {
    pausadasSinPlan: [],
    activasSinFechaHoy: [],
    sugerencias: [],
    bloqueadasPorEquipo: [],
  };
  const { data: ordenes, error: errorOrdenes } = await cliente
    .from('ordenes_produccion')
    .select('id, folio, estado, estado_sii, fecha_compromiso_comercial')
    // CONFIRMADA: la aceptación comercial crea la orden, pero Planeación todavía
    // no tiene filas en programacion_areas. Sin este estado la propuesta aceptada
    // no aparecía en ninguna parte; ahora entra a la bolsa como trabajo por planear.
    .in('estado_sii', ['CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION']);
  if (errorOrdenes) throw new Error('No se pudo calcular la bolsa de Planeación');

  const ordenesActivas = (ordenes ?? []) as FilaOrden[];
  if (ordenesActivas.length === 0) return vacia;
  const folioPorOrden = new Map(ordenesActivas.map((orden) => [orden.id, orden.folio]));
  const estadoPorOrden = new Map(ordenesActivas.map((orden) => [orden.id, orden.estado]));
  const compromisoPorOrden = new Map(
    ordenesActivas.map((orden) => [orden.id, orden.fecha_compromiso_comercial?.slice(0, 10) ?? null]),
  );

  const [{ data: partidas, error: errorPartidas }, { data: programaciones, error: errorProgramaciones }, recursosRespuesta] = await Promise.all([
    cliente.from('partidas_orden_produccion')
      .select('id, orden_id, codigo_pieza, area_trabajo_codigo, procesos, tiempo_estimado_minutos, maquina_asignada, propuesta_item_id')
      .in('orden_id', ordenesActivas.map((orden) => orden.id)),
    cliente.from('programacion_areas')
      .select('partida_id, secuencia, estado_planeacion, fecha_programada, meta_proceso_id')
      .in('orden_id', ordenesActivas.map((orden) => orden.id)),
    cliente.from('recursos_planeacion').select('id, codigo, grupo_equipo_id').eq('activo', true),
  ]);
  if (errorPartidas || errorProgramaciones || recursosRespuesta.error) {
    throw new Error('No se pudo calcular la bolsa de Planeación');
  }

  const partidasFilas = (partidas ?? []) as FilaPartida[];
  const programacionesFilas = (programaciones ?? []) as FilaProgramacion[];
  const { data: metas, error: errorMetas } = partidasFilas.length === 0
    ? { data: [], error: null }
    : await cliente.from('metas_proceso_partida')
        .select('id, partida_id, secuencia, nombre')
        .in('partida_id', partidasFilas.map((partida) => partida.id))
        .order('secuencia', { ascending: true });
  if (errorMetas) {
    throw new Error('No se pudo calcular la bolsa de Planeación');
  }
  const metasFilas = (metas ?? []) as FilaMeta[];

  // C9.2/P-04: los grupos de equipo se resuelven con las mismas fuentes que la
  // RPC (ruteo de la propuesta y catálogo de procesos); si la lectura falla la
  // bolsa sigue funcionando sin filtrar, igual que el panel de asignación.
  const itemIds = [...new Set(
    partidasFilas.map((partida) => partida.propuesta_item_id).filter((id): id is string => Boolean(id)),
  )];
  const [ruteoRespuesta, procesosRespuesta, gruposRespuesta] = await Promise.all([
    itemIds.length === 0
      ? Promise.resolve({ data: [] as FilaRuteo[], error: null })
      : cliente.from('propuesta_item_ruteo')
          .select('item_id, secuencia, grupo_equipo_id')
          .in('item_id', itemIds),
    cliente.from('catalogo_procesos').select('codigo, nombre, grupo_equipo_id'),
    cliente.from('grupos_equipo').select('id, nombre'),
  ]);
  if (ruteoRespuesta.error || procesosRespuesta.error || gruposRespuesta.error) {
    console.error('Planeación: grupos de equipo no disponibles para la bolsa');
  }
  const nombrePorGrupo = new Map(
    ((gruposRespuesta.data ?? []) as Array<{ id: string; nombre: string }>)
      .map((grupo) => [grupo.id, grupo.nombre]),
  );
  const ruteoPorClave = new Map<string, string | null>(
    ((ruteoRespuesta.data ?? []) as FilaRuteo[]).map((ruteo) => [
      `${ruteo.item_id}:${ruteo.secuencia}`,
      ruteo.grupo_equipo_id,
    ]),
  );
  const grupoPorProceso = new Map<string, string | null>();
  for (const proceso of (procesosRespuesta.data ?? []) as FilaProceso[]) {
    for (const clave of [proceso.codigo, proceso.nombre]) {
      if (clave) grupoPorProceso.set(normalizarCatalogo(clave), proceso.grupo_equipo_id);
    }
  }

  const filasRecurso = (recursosRespuesta.data ?? []) as Array<{
    id: string;
    codigo: string | null;
    grupo_equipo_id: string | null;
  }>;
  const codigoPorRecurso = new Map(
    filasRecurso.map((recurso) => [recurso.id, recurso.codigo ?? 'Recurso']),
  );
  const grupoPorRecurso = new Map<string, string | null>(
    filasRecurso.map((recurso) => [recurso.id, recurso.grupo_equipo_id]),
  );
  const grupoPorCodigoRecurso = new Map<string, string | null>();
  for (const recurso of filasRecurso) {
    if (recurso.codigo) {
      grupoPorCodigoRecurso.set(normalizarCatalogo(recurso.codigo), recurso.grupo_equipo_id);
    }
  }

  const activasPorPartida = new Map<string, FilaProgramacion[]>();
  const secuenciasPorPartida = new Map<string, number[]>();
  const metasPorPartida = new Map<string, FilaMeta[]>();
  // C9.0: una operación está cubierta si alguna fila viva la referencia; las
  // filas heredadas (meta NULL) cubren la partida completa y conservan la
  // exclusión histórica de la bolsa (no se sugiere trabajo ya planeado).
  const metasCubiertas = new Set<string>();
  const partidasConFilaHeredada = new Set<string>();
  for (const meta of metasFilas) {
    const lista = metasPorPartida.get(meta.partida_id) ?? [];
    lista.push(meta);
    metasPorPartida.set(meta.partida_id, lista);
  }
  for (const programacion of programacionesFilas) {
    const secuencias = secuenciasPorPartida.get(programacion.partida_id) ?? [];
    secuencias.push(Number(programacion.secuencia));
    secuenciasPorPartida.set(programacion.partida_id, secuencias);
    if (programacion.estado_planeacion !== 'cancelada') {
      if (programacion.meta_proceso_id) metasCubiertas.add(programacion.meta_proceso_id);
      else partidasConFilaHeredada.add(programacion.partida_id);
    }
    if (ESTADOS_ACTIVOS_PROGRAMACION.includes(programacion.estado_planeacion)) {
      const activas = activasPorPartida.get(programacion.partida_id) ?? [];
      activas.push(programacion);
      activasPorPartida.set(programacion.partida_id, activas);
    }
  }

  /** Primera operación del ruteo sin fila viva; `null` si no hay o ya está todo. */
  function operacionPendiente(partidaId: string): FilaMeta | null {
    if (partidasConFilaHeredada.has(partidaId)) return null;
    const pendientes = (metasPorPartida.get(partidaId) ?? [])
      .filter((meta) => !metasCubiertas.has(meta.id));
    return pendientes[0] ?? null;
  }

  function aBolsa(partida: FilaPartida): PartidaBolsa {
    const minutos = Number(partida.tiempo_estimado_minutos);
    return {
      partidaId: partida.id,
      ordenId: partida.orden_id,
      folio: folioPorOrden.get(partida.orden_id) ?? 'OP',
      codigoPieza: partida.codigo_pieza,
      areaCodigo: partida.area_trabajo_codigo,
      procesos: partida.procesos ?? [],
      horas: horasSugeridas(minutos),
      estimadoMinutos: minutos,
      fechaCompromiso: compromisoPorOrden.get(partida.orden_id) ?? null,
    };
  }

  const ordenesPausadas = new Set(
    ordenesActivas.filter((orden) => orden.estado === 'pausada').map((orden) => orden.id),
  );
  const pausadasSinPlan = partidasFilas
    .filter((partida) => ordenesPausadas.has(partida.orden_id)
      && (activasPorPartida.get(partida.id) ?? []).length === 0)
    .map(aBolsa);

  const activasSinFechaHoy = partidasFilas
    .filter((partida) => estadoPorOrden.get(partida.orden_id) === 'en_proceso'
      && !(activasPorPartida.get(partida.id) ?? []).some(
        (programacion) => programacion.fecha_programada === hoy,
      ))
    .map(aBolsa);

  // Sugerencias: partidas de órdenes vivas con trabajo por planear (la siguiente
  // operación pendiente del ruteo, o la partida completa si es heredada) que cabe
  // en el primer hueco libre del horizonte. La RPC revalida capacidad y candados.
  const sinPlan = partidasFilas.filter((partida) => (
    !pausadasSinPlan.some((pendiente) => pendiente.partidaId === partida.id)
    && ((metasPorPartida.get(partida.id) ?? []).length > 0
      ? operacionPendiente(partida.id) !== null
      : (activasPorPartida.get(partida.id) ?? []).length === 0)
  ));
  const cargas = sinPlan.length === 0
    ? []
    : await obtenerCargaCapacidadDiariaServicio(admin, hoy, fechaMas(hoy, horizonteDias - 1));

  const sugerencias: SugerenciaBolsa[] = [];
  const bloqueadasPorEquipo: PartidaBloqueadaBolsa[] = [];
  const cargasRestantes = [...cargas];
  const sinPlanOrdenado = [...sinPlan].sort((primera, segunda) => {
    const compromisoPrimera = compromisoPorOrden.get(primera.orden_id);
    const compromisoSegunda = compromisoPorOrden.get(segunda.orden_id);
    if (compromisoPrimera && compromisoSegunda) return compromisoPrimera.localeCompare(compromisoSegunda);
    if (compromisoPrimera) return -1;
    if (compromisoSegunda) return 1;
    return 0;
  });
  for (const partida of sinPlanOrdenado) {
    const item = aBolsa(partida);
    const pendiente = operacionPendiente(partida.id);
    // Punto 5b: la sugerencia nunca ofrece una máquina fuera del grupo de la
    // operación; el aviso del ruteo se evita antes de tocar la RPC.
    const grupoRequerido = resolverGrupoRequeridoBolsa({
      fila: pendiente,
      partida,
      ruteoPorClave,
      grupoPorProceso,
      grupoPorCodigoRecurso,
    });
    const cargasCompatibles = cargasRestantes.filter((carga) =>
      esRecursoCompatibleBolsa(carga.recursoId, grupoRequerido, grupoPorRecurso));
    const hueco = elegirHueco(item.horas, cargasCompatibles, codigoPorRecurso, item.fechaCompromiso);
    if (!hueco) {
      // Sólo se explica el bloqueo cuando la causa es el grupo de equipo; si el
      // horizonte entero está lleno, la partida simplemente no se sugiere.
      if (grupoRequerido) {
        const hayHuecoEnOtroGrupo =
          elegirHueco(item.horas, cargasRestantes, codigoPorRecurso, item.fechaCompromiso) !== null;
        bloqueadasPorEquipo.push({
          ...item,
          grupoRequeridoId: grupoRequerido,
          grupoRequeridoNombre: nombrePorGrupo.get(grupoRequerido) ?? 'el grupo del ruteo',
          motivo: hayHuecoEnOtroGrupo
            ? 'La capacidad libre del horizonte está en máquinas de otro grupo de equipo.'
            : 'No hay capacidad libre en las máquinas de su grupo de equipo.',
        });
      }
      continue;
    }
    sugerencias.push({
      ...item,
      recursoId: hueco.carga.recursoId,
      recursoCodigo: codigoPorRecurso.get(hueco.carga.recursoId) ?? 'Recurso',
      fecha: hueco.carga.fechaProgramada,
      turno: hueco.carga.turno,
      secuencia: pendiente
        ? Number(pendiente.secuencia)
        : siguienteSecuencia(secuenciasPorPartida.get(partida.id) ?? []),
      metaProcesoId: pendiente?.id ?? null,
      operacionNombre: pendiente?.nombre ?? null,
      horasDisponibles: hueco.horasDisponibles,
    });
    // El hueco sugerido se descuenta solo en la vista previa; PostgreSQL decide
    // la capacidad real cuando se confirma cada asignación.
    const indice = cargasRestantes.indexOf(hueco.carga);
    if (indice >= 0) {
      cargasRestantes[indice] = {
        ...hueco.carga,
        horasDisponibles: hueco.carga.horasDisponibles - item.horas,
        horasProgramadas: hueco.carga.horasProgramadas + item.horas,
        sobrecargado: hueco.carga.horasDisponibles - item.horas < 0,
      };
    }
    if (sugerencias.length >= 12) break;
  }

  return { pausadasSinPlan, activasSinFechaHoy, sugerencias, bloqueadasPorEquipo };
}
