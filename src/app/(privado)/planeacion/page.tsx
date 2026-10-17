import { notFound } from 'next/navigation';
import { OperacionPlaneacion } from '@/modulos/planeacion/componentes/operacion-planeacion';
import { PanelCapacidadInstalada } from '@/modulos/planeacion/componentes/panel-capacidad-instalada';
import type { PartidaProgramablePlaneacion } from '@/modulos/planeacion/componentes/panel-asignacion-planeacion';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerDesglosePartidasServicio } from '@/modulos/planeacion/servicios/desglose-servicio';
import { obtenerBolsaPlaneacionServicio } from '@/modulos/planeacion/servicios/bolsa-planeacion-servicio';
import { obtenerDatosCalendarioPlaneacionServicio } from '@/modulos/planeacion/servicios/planeacion-servicio';
import type { OperacionProgramablePartida } from '@/modulos/planeacion/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';

function sumarDias(fechaIso: string, dias: number): string {
  const fecha = new Date(`${fechaIso}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/** Devuelve el lunes de la semana ISO sin depender de la zona horaria del servidor. */
function inicioSemana(fechaIso: string): string {
  const fecha = new Date(`${fechaIso}T00:00:00.000Z`);
  const diferencia = (fecha.getUTCDay() + 6) % 7;
  return sumarDias(fechaIso, -diferencia);
}

/** Centro operativo de capacidad: lectura RSC y mutaciones solo mediante Server Actions. */
export default async function PaginaPlaneacion() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) notFound();

  const puedeVer = await can(usuario, 'ver_planeacion');
  if (!puedeVer && !(await can(usuario, 'gestionar_planeacion'))) notFound();

  const cliente = await crearClienteSupabaseServidor();
  // Misma convención que el cliente (`hoyIso`): fecha local del operador, no UTC.
  const hoy = hoyIso();
  const { data: proximaProgramacion, error: errorProximaProgramacion } = await cliente
    .from('programacion_areas')
    .select('fecha_programada')
    .gte('fecha_programada', hoy)
    .order('fecha_programada', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (errorProximaProgramacion) {
    throw new Error('No se pudo determinar el rango inicial de Planeación');
  }

  const fechaReferencia = proximaProgramacion?.fecha_programada ?? hoy;
  const fechaInicio = inicioSemana(fechaReferencia);
  const fechaFin = sumarDias(fechaInicio, 6);
  const [datosIniciales, resultadoPartidas, bolsa] = await Promise.all([
    obtenerDatosCalendarioPlaneacionServicio(cliente, crearClienteSupabaseAdmin(), {
      fechaInicio,
      fechaFin,
    }),
    cliente
      .from('partidas_orden_produccion')
      .select('id, orden_id')
      .order('creado_en', { ascending: false })
      .limit(100),
    obtenerBolsaPlaneacionServicio(cliente, crearClienteSupabaseAdmin(), hoy),
  ]);
  if (resultadoPartidas.error) {
    throw new Error('No se pudieron cargar las partidas para Planeación');
  }

  // El desglose cubre tanto las partidas programables como las ya programadas
  // del rango visible, para que ninguna tarjeta del calendario quede sin datos.
  const idsDesglose = [
    ...new Set([
      ...(resultadoPartidas.data ?? []).map((partida) => partida.id),
      ...datosIniciales.programaciones.map((programacion) => programacion.partidaId),
    ]),
  ];
  const desglosePartidas = await obtenerDesglosePartidasServicio(cliente, idsDesglose);
  const desglosePorId = new Map(
    desglosePartidas.map((desglose) => [desglose.partidaId, desglose]),
  );

  const ordenesIds = [...new Set((resultadoPartidas.data ?? []).map((partida) => partida.orden_id))];
  const { data: ordenes, error: errorOrdenes } = ordenesIds.length === 0
    ? { data: [], error: null }
    : await cliente
        .from('ordenes_produccion')
        .select('id, folio, estado')
        .in('id', ordenesIds);
  if (errorOrdenes) {
    throw new Error('No se pudieron cargar las órdenes para Planeación');
  }

  const folioPorOrden = new Map(
    (ordenes ?? [])
      .filter((orden) => orden.estado !== 'cancelada' && orden.estado !== 'completada')
      .map((orden) => [orden.id, orden.folio]),
  );
  const partidasProgramables: PartidaProgramablePlaneacion[] = (resultadoPartidas.data ?? [])
    .filter((partida) => folioPorOrden.has(partida.orden_id))
    .map((partida) => {
      const desglose = desglosePorId.get(partida.id);
      const descripcion = desglose?.descripcion ? ` — ${desglose.descripcion}` : '';
      return {
        ordenId: partida.orden_id,
        partidaId: partida.id,
        etiqueta: desglose
          ? `${desglose.folio} · ${desglose.codigoPieza}${descripcion}`
          : `OP · ${partida.id.slice(0, 8)}`,
        operaciones: [],
      };
    });

  // C9.0/P-01 B: cada partida viaja con su ruteo y qué operaciones ya tienen
  // programación vigente, para preseleccionar la siguiente pendiente.
  const idsPartidasProgramables = partidasProgramables.map((partida) => partida.partidaId);
  const { data: metasPartidas, error: errorMetasPartidas } = idsPartidasProgramables.length === 0
    ? { data: [], error: null }
    : await cliente
        .from('metas_proceso_partida')
        .select('id, partida_id, secuencia, nombre')
        .in('partida_id', idsPartidasProgramables)
        .order('secuencia', { ascending: true });
  const { data: metasCubiertas, error: errorMetasCubiertas } = idsPartidasProgramables.length === 0
    ? { data: [], error: null }
    : await cliente
        .from('programacion_areas')
        .select('meta_proceso_id')
        .in('partida_id', idsPartidasProgramables)
        .not('meta_proceso_id', 'is', null)
        .neq('estado_planeacion', 'cancelada');
  if (errorMetasPartidas || errorMetasCubiertas) {
    throw new Error('No se pudieron cargar las operaciones de las partidas');
  }

  const metasPorPartida = new Map<string, { id: string; secuencia: number; nombre: string }[]>();
  for (const meta of metasPartidas ?? []) {
    const lista = metasPorPartida.get(meta.partida_id) ?? [];
    lista.push({ id: meta.id, secuencia: Number(meta.secuencia), nombre: meta.nombre });
    metasPorPartida.set(meta.partida_id, lista);
  }
  const idsMetasCubiertas = new Set(
    (metasCubiertas ?? [])
      .map((fila) => fila.meta_proceso_id)
      .filter((id): id is string => id !== null),
  );
  const partidasConOperaciones: PartidaProgramablePlaneacion[] = partidasProgramables.map(
    (partida) => ({
      ...partida,
      operaciones: (metasPorPartida.get(partida.partidaId) ?? []).map(
        (meta): OperacionProgramablePartida => ({
          metaProcesoId: meta.id,
          secuencia: meta.secuencia,
          nombre: meta.nombre,
          programada: idsMetasCubiertas.has(meta.id),
        }),
      ),
    }),
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-planeacion">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Planeación y capacidad</h1>
        <p className="text-sm text-texto-secundario">
          Cada operación del ruteo se programa en su recurso, fecha, turno y horas. La capacidad y
          los candados se validan en PostgreSQL; el calendario se actualiza al cambiar cualquier
          usuario.
        </p>
      </header>
      <OperacionPlaneacion
        datosIniciales={datosIniciales}
        rangoInicial={{ fechaInicio, fechaFin }}
        partidasProgramables={partidasConOperaciones}
        desglosePartidas={desglosePartidas}
        bolsa={bolsa}
      />
      <PanelCapacidadInstalada />
    </div>
  );
}
