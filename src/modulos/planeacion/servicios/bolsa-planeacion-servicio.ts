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
}

export interface SugerenciaBolsa extends PartidaBolsa {
  recursoId: string;
  recursoCodigo: string;
  fecha: string;
  turno: TurnoPlaneacion;
  secuencia: number;
  horasDisponibles: number;
}

export interface BolsaPlaneacion {
  pausadasSinPlan: PartidaBolsa[];
  activasSinFechaHoy: PartidaBolsa[];
  sugerencias: SugerenciaBolsa[];
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
): { carga: CargaCapacidadDiaria; horasDisponibles: number } | null {
  const candidatas = cargas
    .filter((carga) => !carga.sobrecargado && carga.horasDisponibles >= horas)
    .sort((primera, segunda) => (
      primera.fechaProgramada.localeCompare(segunda.fechaProgramada)
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
  'id' | 'folio' | 'estado'
>;
type FilaPartida = Pick<
  Database['public']['Tables']['partidas_orden_produccion']['Row'],
  'id' | 'orden_id' | 'codigo_pieza' | 'area_trabajo_codigo' | 'procesos' | 'tiempo_estimado_minutos'
>;
type FilaProgramacion = Pick<
  Database['public']['Tables']['programacion_areas']['Row'],
  'partida_id' | 'secuencia' | 'estado_planeacion' | 'fecha_programada'
>;

const ESTADOS_ACTIVOS_PROGRAMACION = ['programada', 'en_preparacion', 'en_proceso', 'bloqueada'];

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
  const vacia: BolsaPlaneacion = { pausadasSinPlan: [], activasSinFechaHoy: [], sugerencias: [] };
  const { data: ordenes, error: errorOrdenes } = await cliente
    .from('ordenes_produccion')
    .select('id, folio, estado')
    .in('estado', ['programada', 'en_proceso', 'pausada']);
  if (errorOrdenes) throw new Error('No se pudo calcular la bolsa de Planeación');

  const ordenesActivas = (ordenes ?? []) as FilaOrden[];
  if (ordenesActivas.length === 0) return vacia;
  const folioPorOrden = new Map(ordenesActivas.map((orden) => [orden.id, orden.folio]));
  const estadoPorOrden = new Map(ordenesActivas.map((orden) => [orden.id, orden.estado]));

  const [{ data: partidas, error: errorPartidas }, { data: programaciones, error: errorProgramaciones }, recursosRespuesta] = await Promise.all([
    cliente.from('partidas_orden_produccion')
      .select('id, orden_id, codigo_pieza, area_trabajo_codigo, procesos, tiempo_estimado_minutos')
      .in('orden_id', ordenesActivas.map((orden) => orden.id)),
    cliente.from('programacion_areas')
      .select('partida_id, secuencia, estado_planeacion, fecha_programada')
      .in('orden_id', ordenesActivas.map((orden) => orden.id)),
    cliente.from('recursos_planeacion').select('id, codigo').eq('activo', true),
  ]);
  if (errorPartidas || errorProgramaciones || recursosRespuesta.error) {
    throw new Error('No se pudo calcular la bolsa de Planeación');
  }

  const partidasFilas = (partidas ?? []) as FilaPartida[];
  const programacionesFilas = (programaciones ?? []) as FilaProgramacion[];
  const codigoPorRecurso = new Map(
    (recursosRespuesta.data ?? []).map((recurso) => [recurso.id, recurso.codigo]),
  );

  const activasPorPartida = new Map<string, FilaProgramacion[]>();
  const secuenciasPorPartida = new Map<string, number[]>();
  for (const programacion of programacionesFilas) {
    const secuencias = secuenciasPorPartida.get(programacion.partida_id) ?? [];
    secuencias.push(Number(programacion.secuencia));
    secuenciasPorPartida.set(programacion.partida_id, secuencias);
    if (ESTADOS_ACTIVOS_PROGRAMACION.includes(programacion.estado_planeacion)) {
      const activas = activasPorPartida.get(programacion.partida_id) ?? [];
      activas.push(programacion);
      activasPorPartida.set(programacion.partida_id, activas);
    }
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

  // Sugerencias: partidas sin planear de órdenes vivas que caben en el primer
  // hueco libre del horizonte. La RPC revalida capacidad y candados al asignar.
  const sinPlan = partidasFilas.filter(
    (partida) => (activasPorPartida.get(partida.id) ?? []).length === 0
      && !pausadasSinPlan.some((pendiente) => pendiente.partidaId === partida.id),
  );
  const cargas = sinPlan.length === 0
    ? []
    : await obtenerCargaCapacidadDiariaServicio(admin, hoy, fechaMas(hoy, horizonteDias - 1));

  const sugerencias: SugerenciaBolsa[] = [];
  const cargasRestantes = [...cargas];
  for (const partida of sinPlan) {
    const item = aBolsa(partida);
    const hueco = elegirHueco(item.horas, cargasRestantes, codigoPorRecurso);
    if (!hueco) continue;
    sugerencias.push({
      ...item,
      recursoId: hueco.carga.recursoId,
      recursoCodigo: codigoPorRecurso.get(hueco.carga.recursoId) ?? 'Recurso',
      fecha: hueco.carga.fechaProgramada,
      turno: hueco.carga.turno,
      secuencia: siguienteSecuencia(secuenciasPorPartida.get(partida.id) ?? []),
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

  return { pausadasSinPlan, activasSinFechaHoy, sugerencias };
}
