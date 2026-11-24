'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import {
  Activity, ArrowLeft, CheckCircle2, ClipboardList, Clock3, PauseCircle,
} from 'lucide-react';
import {
  ControlPisoPanel,
  type AreaPiso,
  type MaterialPiso,
} from '@/modulos/ordenes/componentes/control-piso-panel';
import type { OrdenConPartidas } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { horasJornadaDia } from '@/modulos/planeacion/utilidades/horario-laboral';
import {
  iniciarProcesoReclamadoAccion,
  liberarReclamoAccion,
  moverReclamoAccion,
  reclamarProcesoAccion,
  validarOcupacionInicioAccion,
} from '@/modulos/produccion/acciones/espacio-operador';
import { cerrarSesionOperadorAccion } from '@/modulos/produccion/acciones/cerrar-sesion-operador';
import { reanudarSesionOperadorAccion } from '@/modulos/produccion/acciones/reanudar-sesion-operador';
import { cerrarPausaOperadorAccion } from '@/modulos/produccion/acciones/cerrar-pausa-operador';
import { actualizarAvanceSesionAccion } from '@/modulos/produccion/acciones/actualizar-avance-sesion';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import type {
  ProcesoEspacioOperador,
  VerificacionInicio,
} from '@/modulos/produccion/tipos/indice';
import type { ConsumoMaterialVisible } from '@/modulos/produccion/utilidades/consumo-material-operador';
import { tiempoAcumuladoLegible } from '@/modulos/produccion/utilidades/formato-operador';

import {
  agruparMisProcesosPorOrden,
  obtenerMisProcesos,
  resumirMiPanel,
  resumirJornadaDiaria,
  type EstadoMiProceso,
} from '@/modulos/produccion/utilidades/mi-panel-operador';
import {
  DetalleProcesoOperador,
  type AccionesDetalleProceso,
  type ResultadoOperacion,
} from './detalle-proceso-operador';
import { DialogoChecklistInicio } from './dialogo-checklist-inicio';
import { DialogoErrorCierre } from './dialogo-error-cierre';
import { TarjetaOrdenMisProcesos } from './tarjeta-orden-mis-procesos';
interface PropsPaginaMiPanelOperador {
  nombreOperador: string;
  operadorId: string;
  procesos: ProcesoEspacioOperador[];
  ordenes: OrdenConPartidas[];
  materiales: MaterialPiso[];
  areas: AreaPiso[];
  motivosPausa: MotivoPausaCatalogo[];
  hoy: string;
  horasReclamadasHoy: number;
  consumos: ConsumoMaterialVisible[];
}

type FiltroEstado = 'todos' | EstadoMiProceso;
type Aviso = { tipo: 'ok' | 'error'; texto: string };

/** Ficha personal: comparte las Server Actions que utiliza EspacioOperador. */
export function PaginaMiPanelOperador({
  nombreOperador,
  operadorId,
  procesos,
  ordenes,
  materiales,
  areas,
  motivosPausa,
  hoy,
  horasReclamadasHoy,
  consumos,
}: PropsPaginaMiPanelOperador) {
  const enrutador = useRouter();
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');
  const [procesoSeleccionadoId, setProcesoSeleccionadoId] = useState<string | null>(null);
  const [inicioPendienteId, setInicioPendienteId] = useState<string | null>(null);
  const [equipoOcupadoMensaje, setEquipoOcupadoMensaje] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const misProcesos = useMemo(
    () => obtenerMisProcesos(procesos, operadorId),
    [procesos, operadorId],
  );
  const resumen = useMemo(
    () => resumirMiPanel(misProcesos, operadorId),
    [misProcesos, operadorId],
  );
  const jornada = useMemo(
    () => resumirJornadaDiaria(procesos, operadorId, hoy),
    [procesos, operadorId, hoy],
  );
  const horasJornadaHoy = horasJornadaDia(hoy);
  const horasLibresReserva = Math.max(0, horasJornadaHoy - horasReclamadasHoy);
  const porcentajeJornada = horasJornadaHoy > 0
    ? Math.min(100, Math.max(0, jornada.horasConsolidadas / horasJornadaHoy * 100))
    : 0;
  const visibles = useMemo(
    () => filtro === 'todos'
      ? misProcesos
      : misProcesos.filter((item) => item.estado === filtro),
    [misProcesos, filtro],
  );

  // Punto 10: una tarjeta por orden. El filtro se aplica antes de agrupar para
  // que la tarjeta solo muestre los procesos que coinciden con el estado elegido.
  const ordenesVisibles = useMemo(
    () => agruparMisProcesosPorOrden(visibles),
    [visibles],
  );

  const procesoSeleccionado = misProcesos.find(
    ({ proceso }) => proceso.id === procesoSeleccionadoId,
  )?.proceso ?? null;
  const inicioPendiente = misProcesos.find(
    ({ proceso }) => proceso.id === inicioPendienteId,
  )?.proceso ?? null;

  const ordenesDelProceso = useMemo(() => {
    if (!procesoSeleccionado?.reclamadoPorMi) return [];
    return ordenes
      .filter(({ orden }) => orden.id === procesoSeleccionado.ordenId)
      .map((entrada) => ({
        ...entrada,
        partidas: entrada.partidas.filter(
          (partida) => partida.id === procesoSeleccionado.partidaId,
        ),
      }))
      .filter((entrada) => entrada.partidas.length > 0);
  }, [ordenes, procesoSeleccionado]);

  async function ejecutar(
    proceso: ProcesoEspacioOperador,
    accion: () => Promise<ResultadoOperacion>,
    mensajeExito: string,
  ): Promise<ResultadoOperacion> {
    if (procesando !== null) {
      return { exito: false, error: 'Hay una operación en curso' };
    }
    setProcesando(proceso.id);
    setAviso(null);
    try {
      const resultado = await accion();
      setAviso(resultado.exito
        ? { tipo: 'ok', texto: mensajeExito }
        : { tipo: 'error', texto: resultado.error });
      if (resultado.exito) enrutador.refresh();
      return resultado;
    } catch {
      const error = 'No se pudo completar la operación. Intenta de nuevo.';
      setAviso({ tipo: 'error', texto: error });
      return { exito: false, error };
    } finally {
      setProcesando(null);
    }
  }

  const accionesDetalle: AccionesDetalleProceso = {
    reclamar: (proceso, fecha, turno) => ejecutar(proceso, async () => {
      const resultado = await reclamarProcesoAccion({
        ordenId: proceso.ordenId,
        partidaId: proceso.partidaId,
        metaProcesoId: proceso.metaProcesoId,
        fecha,
        turno,
      });
      return resultado.exito
        ? { exito: true }
        : { exito: false, error: resultado.error };
    }, 'Proceso reservado en tu jornada'),

    mover: (proceso, fecha, turno) => {
      if (!proceso.reclamo) {
        return accionesDetalle.reclamar(proceso, fecha, turno);
      }
      return ejecutar(proceso, async () => {
        const resultado = await moverReclamoAccion({
          reclamoId: proceso.reclamo!.id,
          fecha,
          turno,
        });
        return resultado.exito
          ? { exito: true }
          : { exito: false, error: resultado.error };
      }, 'Reserva movida al nuevo día');
    },

    liberar: (proceso) => {
      if (!proceso.reclamo) {
        return Promise.resolve<ResultadoOperacion>({ exito: false, error: 'El proceso no tiene reserva' });
      }
      return ejecutar(proceso, async () => {
        const resultado = await liberarReclamoAccion({ reclamoId: proceso.reclamo!.id });
        return resultado.exito
          ? { exito: true }
          : { exito: false, error: resultado.error };
      }, 'Reserva liberada');
    },

    iniciar: async (proceso) => {
      if (procesando === null && proceso.reclamadoPorMi) {
        if (proceso.equipoOcupadoPor) {
          setEquipoOcupadoMensaje(proceso.equipoOcupadoPor);
          return;
        }
        if (proceso.reclamo) {
          const respuesta = await validarOcupacionInicioAccion({ reclamoId: proceso.reclamo.id });
          if (respuesta.exito && respuesta.datos?.ocupadoPor) {
            setEquipoOcupadoMensaje(respuesta.datos.ocupadoPor);
            return;
          }
        }
        setInicioPendienteId(proceso.id);
      }
    },

    reanudar: (proceso) => {
      if (!proceso.programacion) {
        return Promise.resolve<ResultadoOperacion>({
          exito: false,
          error: 'El proceso no tiene programación para reanudar',
        });
      }
      return ejecutar(proceso, async () => {
        const resultado = await reanudarSesionOperadorAccion({
          ordenId: proceso.ordenId,
          partidaId: proceso.partidaId,
          programacionId: proceso.programacion!.id,
          actualizadoEnEsperado: proceso.programacion!.actualizadoEn,
        });
        return resultado.exito
          ? { exito: true }
          : { exito: false, error: resultado.error };
      }, 'Sesión reanudada y recurso reservado');
    },

    cerrarPausa: (proceso) => {
      const sesion = proceso.ultimaSesion;
      if (!sesion || sesion.estadoSesion !== 'pausada' || sesion.recursoLiberado) {
        return Promise.resolve<ResultadoOperacion>({
          exito: false,
          error: 'El proceso no tiene una pausa vigente',
        });
      }
      return ejecutar(proceso, async () => {
        const resultado = await cerrarPausaOperadorAccion({ sesionId: sesion.id });
        return resultado.exito
          ? { exito: true }
          : { exito: false, error: resultado.error };
      }, 'Pausa cerrada sin producir. Las horas quedan registradas y la operación vuelve a estar disponible.');
    },

    actualizarAvance: (proceso, datos) => ejecutar(proceso, async () => {
      const resultado = await actualizarAvanceSesionAccion(datos);
      return resultado.exito
        ? { exito: true, estadoSesion: resultado.datos?.estadoSesion }
        : { exito: false, error: resultado.error, ...(resultado.codigo ? { codigo: resultado.codigo } : {}) };
    }, 'Avance y hora real actualizados'),

    cerrar: (proceso, datos) => ejecutar(proceso, async () => {
      const resultado = await cerrarSesionOperadorAccion({
        ...datos,
        ...(proceso.metaProcesoId ? { metaProcesoId: proceso.metaProcesoId } : {}),
      });
      if (!resultado.exito) {
        return {
          exito: false,
          error: resultado.error,
          ...(resultado.codigo ? { codigo: resultado.codigo } : {}),
        };
      }
      if (!resultado.datos) {
        return { exito: false, error: 'El cierre no devolvió una confirmación' };
      }
      return { exito: true, datos: resultado.datos };
    }, 'Sesión registrada y recurso liberado'),
  };

  async function confirmarInicio(verificacion: VerificacionInicio): Promise<ResultadoOperacion> {
    if (!inicioPendiente?.reclamo || !inicioPendiente.reclamadoPorMi) {
      return { exito: false, error: 'Reclama el proceso antes de iniciarlo' };
    }
    return ejecutar(inicioPendiente, async () => {
      const resultado = await iniciarProcesoReclamadoAccion({
        reclamoId: inicioPendiente.reclamo!.id,
        verificacion,
      });
      if (resultado.exito) setInicioPendienteId(null);
      return resultado.exito
        ? { exito: true }
        : { exito: false, error: resultado.error };
    }, 'Sesión iniciada');
  }

  const indicadores = [
    { titulo: 'Reclamados', valor: resumen.reclamados, icono: ClipboardList },
    { titulo: 'En proceso', valor: resumen.enProceso, icono: Activity },
    { titulo: 'Pendientes', valor: resumen.pendientes, icono: Clock3 },
    { titulo: 'Pausados', valor: resumen.pausados, icono: PauseCircle },
    { titulo: 'Terminados', valor: resumen.terminados, icono: CheckCircle2 },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="space-y-4">
        <Link
          href="/produccion-piso"
          className="inline-flex items-center gap-2 text-sm text-texto-secundario transition-colors hover:text-acento"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Volver a producción
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-texto-primario">Mi panel</h2>
          <p className="mt-1 text-sm text-texto-secundario">
            Actividad y procesos personales de {nombreOperador}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {indicadores.map((indicador) => {
          const Icono = indicador.icono;
          return (
            <div key={indicador.titulo} className="rounded-lg border border-borde bg-superficie px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-texto-secundario">{indicador.titulo}</span>
                <Icono size={16} className="shrink-0 text-texto-secundario" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-texto-primario">
                {indicador.valor}
              </p>
            </div>
          );
        })}
      </div>

      <section aria-label="Jornada de hoy" data-testid="jornada-diaria-operador"
        className="space-y-3 rounded-xl border border-borde bg-superficie p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-texto-primario">Mi jornada de hoy</h3>
            <p className="text-xs text-texto-secundario">{hoy} · trabajo cerrado del día</p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-texto-primario">
            {horasJornadaHoy > 0
              ? `${tiempoAcumuladoLegible(jornada.horasConsolidadas)} / ${tiempoAcumuladoLegible(horasJornadaHoy)}`
              : 'Cerrado'}
          </p>
        </div>
        {horasJornadaHoy > 0 ? (
          <div role="progressbar" aria-label="Horas registradas de la jornada"
            aria-valuemin={0} aria-valuemax={horasJornadaHoy}
            aria-valuenow={Math.min(jornada.horasConsolidadas, horasJornadaHoy)}
            className="h-3 overflow-hidden rounded-full bg-superficie-2">
            <div className="h-full rounded-full bg-acento transition-[width]"
              style={{ width: `${porcentajeJornada}%` }} />
          </div>
        ) : (
          <p className="text-sm text-texto-secundario">La empresa no labora hoy.</p>
        )}
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-texto-secundario">Trabajado hoy</dt>
            <dd className="font-semibold tabular-nums text-texto-primario">{tiempoAcumuladoLegible(jornada.horasConsolidadas)}</dd>
          </div>
          <div><dt className="text-texto-secundario">Reservado hoy (planeación)</dt>
            <dd className="font-semibold tabular-nums text-texto-primario">{tiempoAcumuladoLegible(horasReclamadasHoy)}</dd>
          </div>
          <div><dt className="text-texto-secundario">Libre para reservar</dt>
            <dd className="font-semibold tabular-nums text-texto-primario">{tiempoAcumuladoLegible(horasLibresReserva)}</dd>
          </div>
        </dl>
        {jornada.sesionesActivas > 0 ? (
          <p className="text-xs text-texto-secundario">
            {jornada.sesionesActivas} sesión(es) iniciada(s) hoy aún en curso: su tiempo no está consolidado.
          </p>
        ) : null}
        {jornada.sesionesEntreDias > 0 ? (
          <p className="text-xs text-advertencia-texto">
            {jornada.sesionesEntreDias} sesión(es) que cruzan medianoche no se incluyen en este total parcial.
          </p>
        ) : null}
        <p className="text-xs text-texto-secundario">
          Indicador informativo sobre órdenes visibles, en horario del taller (Tijuana).
          No incluye órdenes archivadas. La reserva es planificación, no tiempo trabajado.
        </p>
      </section>

      {aviso ? (
        <p
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={aviso.tipo === 'error'
            ? 'rounded-lg bg-peligro-suave p-3 text-sm text-peligro-texto'
            : 'rounded-lg bg-exito-suave p-3 text-sm text-exito-texto'}
        >
          {aviso.texto}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-borde bg-superficie">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-texto-primario">Mis procesos</h3>
            <p className="text-xs text-texto-secundario">
              {visibles.length} proceso(s) en la vista actual
            </p>
          </div>
          <select
            aria-label="Filtrar mis procesos por estado"
            value={filtro}
            onChange={(evento) => setFiltro(evento.target.value as FiltroEstado)}
            className="min-h-10 rounded-lg border border-borde bg-superficie-2 px-3 text-sm text-texto-primario"
          >
            <option value="todos">Todos los estados</option>
            <option value="en_proceso">En proceso</option>
            <option value="pendiente">Pendientes</option>
            <option value="pausado">Pausados</option>
            <option value="terminado">Terminados</option>
          </select>
        </div>

        {visibles.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <ClipboardList size={32} className="mx-auto text-texto-secundario" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-texto-primario">No hay procesos para mostrar</p>
            <p className="mt-1 text-xs text-texto-secundario">
              Los procesos vinculados a tu actividad aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-2">
            {ordenesVisibles.map(({ grupo, procesos }) => (
              <TarjetaOrdenMisProcesos
                key={grupo.ordenId}
                grupo={grupo}
                procesos={procesos}
                hoy={hoy}
                procesando={procesando}
                onIniciar={(proceso) => accionesDetalle.iniciar(proceso)}
                onReanudar={(proceso) => void accionesDetalle.reanudar(proceso)}
                onLiberar={(proceso) => void accionesDetalle.liberar(proceso)}
                onGestionar={(proceso) => setProcesoSeleccionadoId(proceso.id)}
              />
            ))}
          </div>
        )}
      </section>

      <Dialog
  open={procesoSeleccionado !== null}
  onOpenChange={(abierto) => {
    if (!abierto && procesando === null) {
      setProcesoSeleccionadoId(null);
    }
  }}
>
    {procesoSeleccionado ? (
      <DialogContent
        className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-4 overflow-y-auto"
        aria-label={`Gestión del proceso ${procesoSeleccionado.folioOrden}`}
      >
        <DialogHeader>
          <DialogTitle>
            Gestionar proceso — {procesoSeleccionado.folioOrden}
          </DialogTitle>
          <DialogDescription>
            {procesoSeleccionado.procesoNombre} · Pieza{' '}
            {procesoSeleccionado.codigoPieza}
          </DialogDescription>
        </DialogHeader>

        <DetalleProcesoOperador
          key={procesoSeleccionado.id}
          proceso={procesoSeleccionado}
          hoy={hoy}
          soloLectura={false}
          procesando={procesando !== null}
          motivosPausa={motivosPausa}
          acciones={accionesDetalle}
          onCerrar={() => {
            if (procesando === null) setProcesoSeleccionadoId(null);
          }}
          onPausaAutomatica={() => enrutador.refresh()}
          presentacion="integrado"
          materiales={materiales}
          consumos={consumos}
        />

        {ordenesDelProceso.length > 0 ? (
          <ControlPisoPanel
            key={`materiales-${procesoSeleccionado.id}`}
            operadorId={operadorId}
            nombreOperador={nombreOperador}
            ordenes={ordenesDelProceso}
            materiales={materiales}
            areas={areas}
            modo="proceso"
            mostrarConsumoMaterial={false}
          />
        ) : (
          <p className="rounded-lg border border-borde bg-superficie p-4 text-sm text-texto-secundario">
            Este proceso no tiene una partida operativa disponible para registrar materiales.
          </p>
        )}
      </DialogContent>
    ) : null}
  </Dialog>

      <DialogoChecklistInicio
        abierto={inicioPendiente !== null}
        procesando={procesando !== null}
        titulo={inicioPendiente
          ? `${inicioPendiente.folioOrden} · ${inicioPendiente.codigoPieza} · ${inicioPendiente.procesoNombre}`
          : 'Inicio de proceso'}
        procesoNombre={inicioPendiente?.procesoNombre}
        areaMacro={inicioPendiente?.areaMacro}
        onAbiertoCambiar={(abierto) => {
          if (!abierto && procesando === null) setInicioPendienteId(null);
        }}
        onConfirmar={confirmarInicio}
      />

      <DialogoErrorCierre
        error={equipoOcupadoMensaje ? {
          titulo: 'Equipo ocupado',
          mensaje: equipoOcupadoMensaje,
          etiquetaCerrar: 'Entendido',
        } : null}
        descripcion="No se abrió el checklist porque la máquina ya está en uso."
        testId="error-equipo-ocupado"
        onCerrar={() => setEquipoOcupadoMensaje(null)}
      />

      <p className="text-xs text-texto-secundario">
        Esta vista muestra la actividad disponible en las órdenes actuales.
        El historial de órdenes archivadas aún no está incluido.
      </p>
    </div>
  );
}
