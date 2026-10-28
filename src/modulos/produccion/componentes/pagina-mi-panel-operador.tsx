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
import {
  iniciarProcesoReclamadoAccion,
  liberarReclamoAccion,
  moverReclamoAccion,
  reclamarProcesoAccion,
} from '@/modulos/produccion/acciones/espacio-operador';
import { cerrarSesionOperadorAccion } from '@/modulos/produccion/acciones/cerrar-sesion-operador';
import { reanudarSesionOperadorAccion } from '@/modulos/produccion/acciones/reanudar-sesion-operador';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import { HORAS_JORNADA_OPERADOR } from '@/modulos/produccion/tipos/espacio-operador';
import type {
  ProcesoEspacioOperador,
  VerificacionInicio,
} from '@/modulos/produccion/tipos/indice';
import type { ConsumoMaterialVisible } from '@/modulos/produccion/utilidades/consumo-material-operador';

import {
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

const etiquetas: Record<EstadoMiProceso, string> = {
  en_proceso: 'En proceso',
  pausado: 'Pausado',
  pendiente: 'Pendiente',
  terminado: 'Terminado',
};

const estilosEstado: Record<EstadoMiProceso, string> = {
  en_proceso: 'bg-acento-suave text-acento-texto',
  pausado: 'bg-advertencia-suave text-advertencia-texto',
  pendiente: 'bg-superficie-2 text-texto-secundario',
  terminado: 'bg-exito-suave text-exito-texto',
};

function formatearHoras(horas: number): string {
  return `${horas.toLocaleString('es-PE', { maximumFractionDigits: 2 })} h`;
}

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
  const horasLibresReserva = Math.max(0, HORAS_JORNADA_OPERADOR - horasReclamadasHoy);
  const porcentajeJornada = Math.min(100, Math.max(0,
    jornada.horasConsolidadas / HORAS_JORNADA_OPERADOR * 100,
  ));
  const visibles = useMemo(
    () => filtro === 'todos'
      ? misProcesos
      : misProcesos.filter((item) => item.estado === filtro),
    [misProcesos, filtro],
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

    iniciar: (proceso) => {
      if (procesando === null && proceso.reclamadoPorMi) {
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

    cerrar: (proceso, datos) => ejecutar(proceso, async () => {
      const resultado = await cerrarSesionOperadorAccion({
        ...datos,
        ...(proceso.metaProcesoId ? { metaProcesoId: proceso.metaProcesoId } : {}),
      });
      if (!resultado.exito) return { exito: false, error: resultado.error };
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
            <div key={indicador.titulo} className="rounded-xl border border-borde bg-superficie p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-texto-secundario">{indicador.titulo}</span>
                <Icono size={18} className="text-texto-secundario" aria-hidden="true" />
              </div>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-texto-primario">
                {indicador.valor}
              </p>
            </div>
          );
        })}
      </div>

      <section aria-label="Jornada de hoy" data-testid="jornada-diaria-operador"
        className="space-y-3 rounded-xl border border-borde bg-superficie p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-texto-primario">Mi jornada de hoy</h3>
            <p className="text-xs text-texto-secundario">{hoy} · Horas netas cerradas</p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-texto-primario">
            {formatearHoras(jornada.horasConsolidadas)} / {formatearHoras(HORAS_JORNADA_OPERADOR)}
          </p>
        </div>
        <div role="progressbar" aria-label="Horas registradas de la jornada"
          aria-valuemin={0} aria-valuemax={HORAS_JORNADA_OPERADOR}
          aria-valuenow={Math.min(jornada.horasConsolidadas, HORAS_JORNADA_OPERADOR)}
          className="h-3 overflow-hidden rounded-full bg-superficie-2">
          <div className="h-full rounded-full bg-acento transition-[width]"
            style={{ width: `${porcentajeJornada}%` }} />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-texto-secundario">Horas confirmadas</dt>
            <dd className="font-semibold tabular-nums text-texto-primario">{formatearHoras(jornada.horasConsolidadas)}</dd>
          </div>
          <div><dt className="text-texto-secundario">Horas reservadas hoy</dt>
            <dd className="font-semibold tabular-nums text-texto-primario">{formatearHoras(horasReclamadasHoy)}</dd>
          </div>
          <div><dt className="text-texto-secundario">Capacidad sin reservar</dt>
            <dd className="font-semibold tabular-nums text-texto-primario">{formatearHoras(horasLibresReserva)}</dd>
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

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-borde bg-superficie p-5">
          <p className="text-sm text-texto-secundario">Horas trabajadas registradas</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-texto-primario">
            {formatearHoras(resumen.horasTrabajadas)}
          </p>
        </div>
        <div className="rounded-xl border border-borde bg-superficie p-5">
          <p className="text-sm text-texto-secundario">Horas reservadas en reclamos</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-texto-primario">
            {formatearHoras(resumen.horasReservadas)}
          </p>
        </div>
      </div>

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde p-4 sm:p-5">
          <div>
            <h3 className="text-lg font-semibold text-texto-primario">Mis procesos</h3>
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
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
  {visibles.map(({ proceso, estado, horasTrabajadas }) => {
    const puedeGestionar = proceso.reclamadoPorMi;
    const puedeIniciar = puedeGestionar && proceso.puedeIniciar;
    const puedeReanudar = puedeGestionar && proceso.puedeReanudar;

    const puedeLiberar =
      puedeGestionar &&
      proceso.reclamo !== null &&
      proceso.sesionActiva === null &&
      proceso.programacion?.estadoPlaneacion !== 'en_proceso' &&
      proceso.programacion?.estadoPlaneacion !== 'bloqueada';

    return (
      <article
        key={proceso.id}
        className="flex min-w-0 flex-col gap-4 rounded-xl border border-borde bg-superficie p-4 shadow-sm transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold text-texto-primario">
              {proceso.folioOrden}
            </p>

            <h4 className="mt-1 text-base font-semibold text-texto-primario">
              {proceso.procesoNombre}
            </h4>

            <p className="mt-1 text-xs text-texto-secundario">
              Pieza: {proceso.codigoPieza}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${estilosEstado[estado]}`}
          >
            {etiquetas[estado]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg bg-superficie-2/60 p-3 text-sm">
          <div className="min-w-0">
            <p className="text-xs text-texto-secundario">Área</p>
            <p className="truncate font-medium text-texto-primario">
              {proceso.areaNombre}
            </p>
          </div>

          <div>
            <p className="text-xs text-texto-secundario">Tiempo trabajado</p>
            <p className="font-semibold tabular-nums text-texto-primario">
              {formatearHoras(horasTrabajadas)}
            </p>
          </div>

          <div>
            <p className="text-xs text-texto-secundario">Producidas</p>
            <p className="font-semibold tabular-nums text-texto-primario">
              {proceso.hechoPiezas} / {proceso.metaPiezas}
            </p>
          </div>

          <div>
            <p className="text-xs text-texto-secundario">Pendientes</p>
            <p className="font-semibold tabular-nums text-texto-primario">
              {proceso.pendientePiezas}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-texto-secundario">
            <span>Avance del proceso</span>
            <span className="font-semibold tabular-nums">
              {proceso.porcentaje}%
            </span>
          </div>

          <div
            className="h-2 overflow-hidden rounded-full bg-superficie-2"
            role="progressbar"
            aria-label={`Avance de ${proceso.procesoNombre}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.max(0, proceso.porcentaje))}
          >
            <div
              className="h-full rounded-full bg-acento"
              style={{
                width: `${Math.min(100, Math.max(0, proceso.porcentaje))}%`,
              }}
            />
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2 border-t border-borde pt-3">
          {(puedeIniciar || puedeReanudar || puedeLiberar) && (
            <div className="flex flex-wrap gap-2">
              {puedeIniciar && (
                <button
                  type="button"
                  disabled={procesando !== null}
                  onClick={() => accionesDetalle.iniciar(proceso)}
                  className="flex-1 rounded-lg bg-acento px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Iniciar proceso
                </button>
              )}

              {puedeReanudar && (
                <button
                  type="button"
                  disabled={procesando !== null}
                  onClick={() => void accionesDetalle.reanudar(proceso)}
                  className="flex-1 rounded-lg bg-acento px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Continuar sesión
                </button>
              )}

              {puedeLiberar && (
                <button
                  type="button"
                  disabled={procesando !== null}
                  onClick={() => void accionesDetalle.liberar(proceso)}
                  className="flex-1 rounded-lg border border-borde px-3 py-2 text-sm font-medium text-texto-primario hover:bg-superficie-2 disabled:opacity-50"
                >
                  Liberar reserva
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={!puedeGestionar || procesando !== null}
            onClick={() => setProcesoSeleccionadoId(proceso.id)}
            className={
              puedeGestionar
                ? 'w-full rounded-lg border border-acento px-3 py-2 text-sm font-semibold text-acento-texto transition-colors hover:bg-acento-suave disabled:opacity-50'
                : 'w-full cursor-not-allowed rounded-lg bg-superficie-2 px-3 py-2 text-sm text-texto-secundario'
            }
          >
            {puedeGestionar ? 'Gestionar proceso' : 'Sin reserva activa'}
          </button>
        </div>
      </article>
    );
  })}
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
          soloLectura={!procesoSeleccionado.reclamadoPorMi}
          procesando={procesando !== null}
          motivosPausa={motivosPausa}
          acciones={accionesDetalle}
          onCerrar={() => {
            if (procesando === null) setProcesoSeleccionadoId(null);
          }}
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
        onAbiertoCambiar={(abierto) => {
          if (!abierto && procesando === null) setInicioPendienteId(null);
        }}
        onConfirmar={confirmarInicio}
      />

      <p className="text-xs text-texto-secundario">
        Esta vista muestra la actividad disponible en las órdenes actuales.
        El historial de órdenes archivadas aún no está incluido.
      </p>
    </div>
  );
}
