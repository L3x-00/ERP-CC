import { notFound } from 'next/navigation';
import { OperacionPlaneacion } from '@/modulos/planeacion/componentes/operacion-planeacion';
import type { PartidaProgramablePlaneacion } from '@/modulos/planeacion/componentes/panel-asignacion-planeacion';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerDatosCalendarioPlaneacionServicio } from '@/modulos/planeacion/servicios/planeacion-servicio';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

function fechaIsoDesdeFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(fechaIso: string, dias: number): string {
  const fecha = new Date(`${fechaIso}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fechaIsoDesdeFecha(fecha);
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
  const hoy = fechaIsoDesdeFecha(new Date());
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
  const [datosIniciales, resultadoPartidas] = await Promise.all([
    obtenerDatosCalendarioPlaneacionServicio(cliente, crearClienteSupabaseAdmin(), {
      fechaInicio,
      fechaFin,
    }),
    cliente
      .from('partidas_orden_produccion')
      .select('id, orden_id, codigo_pieza, descripcion')
      .order('creado_en', { ascending: false })
      .limit(100),
  ]);
  if (resultadoPartidas.error) {
    throw new Error('No se pudieron cargar las partidas para Planeación');
  }

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
    .map((partida) => ({
      ordenId: partida.orden_id,
      partidaId: partida.id,
      etiqueta: `${folioPorOrden.get(partida.orden_id) ?? 'OP'} · ${partida.codigo_pieza}${
        partida.descripcion ? ` — ${partida.descripcion}` : ''
      }`,
    }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-planeacion">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Planeación y capacidad</h1>
        <p className="text-sm text-foreground/70">
          Programación transaccional por recurso, fecha y turno. La capacidad y los candados se
          validan en PostgreSQL; el calendario se actualiza al cambiar cualquier usuario.
        </p>
      </header>
      <OperacionPlaneacion
        datosIniciales={datosIniciales}
        rangoInicial={{ fechaInicio, fechaFin }}
        partidasProgramables={partidasProgramables}
      />
    </div>
  );
}
