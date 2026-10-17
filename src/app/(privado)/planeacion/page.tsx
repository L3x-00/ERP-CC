import { notFound } from 'next/navigation';
import { OperacionPlaneacion } from '@/modulos/planeacion/componentes/operacion-planeacion';
import { PanelCapacidadInstalada } from '@/modulos/planeacion/componentes/panel-capacidad-instalada';
import type { PartidaProgramablePlaneacion } from '@/modulos/planeacion/componentes/panel-asignacion-planeacion';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerDesglosePartidasServicio } from '@/modulos/planeacion/servicios/desglose-servicio';
import {
  ESTADOS_ACTIVOS_PROGRAMACION,
  obtenerBolsaPlaneacionServicio,
} from '@/modulos/planeacion/servicios/bolsa-planeacion-servicio';
import { obtenerDatosCalendarioPlaneacionServicio } from '@/modulos/planeacion/servicios/planeacion-servicio';
import type { OperacionProgramablePartida } from '@/modulos/planeacion/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';
import { obtenerCompatibilidadRecursosServicio } from '@/modulos/planeacion/servicios/compatibilidad-servicio';
import { prepararPartidasProgramables } from '@/modulos/planeacion/utilidades/partidas-programables';
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
  const [datosIniciales, bolsa] = await Promise.all([
    obtenerDatosCalendarioPlaneacionServicio(cliente, crearClienteSupabaseAdmin(), {
      fechaInicio,
      fechaFin,
    }),
    obtenerBolsaPlaneacionServicio(cliente, crearClienteSupabaseAdmin(), hoy),
  ]);

  // C9.2/P06: el selector trabaja con las órdenes vigentes (ni canceladas ni
  // completadas) y todas sus partidas; cada lectura `.in(ids)` viaja en lotes de
  // 100 para no rebasar la URL. La bolsa y el rango del calendario no cambian.
  const { data: ordenesVigentes, error: errorOrdenesVigentes } = await cliente
    .from('ordenes_produccion')
    .select('id')
    .neq('estado', 'cancelada')
    .neq('estado', 'completada');
  if (errorOrdenesVigentes) {
    throw new Error('No se pudieron cargar las órdenes para Planeación');
  }

  const partidasVigentes = (
    await Promise.all(
      dividirEnLotes((ordenesVigentes ?? []).map((orden) => orden.id)).map((lote) =>
        cliente
          .from('partidas_orden_produccion')
          .select('id, orden_id, creado_en')
          .in('orden_id', lote)
          .order('creado_en', { ascending: false }),
      ),
    )
  ).flatMap((respuesta) => {
    if (respuesta.error) {
      throw new Error('No se pudieron cargar las partidas para Planeación');
    }
    return respuesta.data ?? [];
  });

  const programacionesVigentes = (
    await Promise.all(
      dividirEnLotes(partidasVigentes.map((partida) => partida.id)).map((lote) =>
        cliente
          .from('programacion_areas')
          .select('partida_id, secuencia')
          .in('partida_id', lote)
          .in('estado_planeacion', ESTADOS_ACTIVOS_PROGRAMACION),
      ),
    )
  ).flatMap((respuesta) => {
    if (respuesta.error) {
      throw new Error('No se pudieron cargar las programaciones vigentes');
    }
    return respuesta.data ?? [];
  });

  const secuenciasPorPartida = new Map<string, number[]>();
  for (const programacion of programacionesVigentes) {
    const secuencias = secuenciasPorPartida.get(programacion.partida_id) ?? [];
    secuencias.push(Number(programacion.secuencia));
    secuenciasPorPartida.set(programacion.partida_id, secuencias);
  }

  // El desglose cubre tanto las partidas vigentes como las ya programadas del
  // rango visible, para que el selector y las tarjetas tengan rótulo.
  const idsDesglose = [
    ...new Set([
      ...partidasVigentes.map((partida) => partida.id),
      ...datosIniciales.programaciones.map((programacion) => programacion.partidaId),
    ]),
  ];
  const desglosePartidas = (
    await Promise.all(
      dividirEnLotes(idsDesglose).map((lote) => obtenerDesglosePartidasServicio(cliente, lote)),
    )
  ).flat();
  const desglosePorId = new Map(
    desglosePartidas.map((desglose) => [desglose.partidaId, desglose]),
  );

  const { partidas: partidasPreparadas, total: totalPartidasProgramables } =
    prepararPartidasProgramables(
      partidasVigentes.map((partida) => {
        const desglose = desglosePorId.get(partida.id);
        const descripcion = desglose?.descripcion ? ` — ${desglose.descripcion}` : '';
        return {
          ordenId: partida.orden_id,
          partidaId: partida.id,
          creadoEn: partida.creado_en,
          secuenciasVigentes: secuenciasPorPartida.get(partida.id) ?? [],
          etiqueta: desglose
            ? `${desglose.folio} · ${desglose.codigoPieza}${descripcion}`
            : `OP · ${partida.id.slice(0, 8)}`,
        };
      }),
    );

  // C9.0/P-01 B: cada partida viaja con su ruteo y qué operaciones ya tienen
  // programación vigente, para preseleccionar la siguiente pendiente. Las
  // lecturas por ids también viajan en lotes de 100.
  const idsPartidasProgramables = partidasPreparadas.map((partida) => partida.partidaId);
  const metasPartidas = (
    await Promise.all(
      dividirEnLotes(idsPartidasProgramables).map((lote) =>
        cliente
          .from('metas_proceso_partida')
          .select('id, partida_id, secuencia, nombre')
          .in('partida_id', lote)
          .order('secuencia', { ascending: true }),
      ),
    )
  ).flatMap((respuesta) => {
    if (respuesta.error) {
      throw new Error('No se pudieron cargar las operaciones de las partidas');
    }
    return respuesta.data ?? [];
  });
  const metasCubiertas = (
    await Promise.all(
      dividirEnLotes(idsPartidasProgramables).map((lote) =>
        cliente
          .from('programacion_areas')
          .select('meta_proceso_id')
          .in('partida_id', lote)
          .not('meta_proceso_id', 'is', null)
          .neq('estado_planeacion', 'cancelada'),
      ),
    )
  ).flatMap((respuesta) => {
    if (respuesta.error) {
      throw new Error('No se pudieron cargar las operaciones de las partidas');
    }
    return respuesta.data ?? [];
  });

  const metasPorPartida = new Map<string, { id: string; secuencia: number; nombre: string }[]>();
  for (const meta of metasPartidas) {
    const lista = metasPorPartida.get(meta.partida_id) ?? [];
    lista.push({ id: meta.id, secuencia: Number(meta.secuencia), nombre: meta.nombre });
    metasPorPartida.set(meta.partida_id, lista);
  }
  const idsMetasCubiertas = new Set(
    metasCubiertas
      .map((fila) => fila.meta_proceso_id)
      .filter((id): id is string => id !== null),
  );
  const partidasConOperaciones: PartidaProgramablePlaneacion[] = partidasPreparadas.map(
    (partida) => ({
      ordenId: partida.ordenId,
      partidaId: partida.partidaId,
      etiqueta: partida.etiqueta,
      secuenciaSugerida: partida.secuenciaSugerida,
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

  // C9.2/P10: grupos de equipo para la advertencia de compatibilidad del panel.
  // La lectura es tolerante: sin catálogos o sin permiso, el panel no advierte.
  const compatibilidad = await obtenerCompatibilidadRecursosServicio(cliente, {
    partidas: partidasPreparadas.map((partida) => {
      const desglose = desglosePorId.get(partida.partidaId);
      return {
        partidaId: partida.partidaId,
        procesos: desglose?.procesos ?? [],
        maquinaAsignada: desglose?.maquinaAsignada ?? null,
      };
    }),
  });

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
        partidasTotal={totalPartidasProgramables}
        desglosePartidas={desglosePartidas}
        bolsa={bolsa}
        compatibilidad={compatibilidad}
      />
      <PanelCapacidadInstalada />
    </div>
  );
}
