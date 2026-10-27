'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import type { RegistroConsumoMaterial } from '@/modulos/ordenes/tipos/ordenes';

import {
  obtenerMisProcesos,
  resumirMiPanel,
  resumirJornadaDiaria,
  resumirConsumosMateriales,
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
  consumos: RegistroConsumoMaterial[];
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
  const resumenConsumos = useMemo(
    () => resumirConsumosMateriales(consumos),
    [consumos],
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
  const consumosDelProceso = useMemo(
    () => procesoSeleccionado
      ? resumenConsumos.filter(
          (consumo) => consumo.partidaId === procesoSeleccionado.partidaId,
        )
      : [],
    [resumenConsumos, procesoSeleccionado],
  );

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
      return resultado.exito
        ? { exito: true }
        : { exito: false, error: resultado.error };
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
          <div className="divide-y divide-borde">
            {visibles.map(({ proceso, estado, horasTrabajadas }) => (
              <div
                key={proceso.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-texto-primario">{proceso.folioOrden}</p>
                  <p className="text-sm text-texto-secundario">
                    {proceso.procesoNombre} · {proceso.areaNombre}
                  </p>
                  <p className="text-xs text-texto-secundario">Pieza: {proceso.codigoPieza}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm tabular-nums text-texto-secundario">
                    {formatearHoras(horasTrabajadas)}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${estilosEstado[estado]}`}>
                    {etiquetas[estado]}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!proceso.reclamadoPorMi || procesando !== null}
                  onClick={() => setProcesoSeleccionadoId(proceso.id)}
                  className={proceso.reclamadoPorMi
                    ? 'rounded-lg bg-acento px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60'
                    : 'cursor-not-allowed rounded-lg bg-superficie-2 px-4 py-2 text-sm font-semibold text-texto-secundario opacity-60'}
                >
                  {proceso.reclamadoPorMi ? 'Gestionar proceso' : 'Sin reserva activa'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {procesoSeleccionado ? (
        <section className="space-y-4" aria-label="Trabajo del proceso seleccionado">
          <DetalleProcesoOperador
            key={procesoSeleccionado.id}
            proceso={procesoSeleccionado}
            hoy={hoy}
            soloLectura={!procesoSeleccionado.reclamadoPorMi}
            procesando={procesando !== null}
            motivosPausa={motivosPausa}
            acciones={accionesDetalle}
            onCerrar={() => setProcesoSeleccionadoId(null)}
            presentacion="integrado"
          />
          <section
            aria-label="Consumo acumulado de materiales de la partida"
            className="rounded-xl border border-borde bg-superficie p-5"
          >
            <h3 className="text-lg font-semibold text-texto-primario">
              Consumo acumulado de materiales
            </h3>

            <p className="mt-1 text-xs text-texto-secundario">
              Cantidades registradas para toda la partida, no exclusivamente
              para este proceso.
            </p>

            {consumosDelProceso.length === 0 ? (
              <p className="mt-4 text-sm text-texto-secundario">
                Todavía no se registraron consumos para esta partida.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-borde text-texto-secundario">
                      <th className="p-2">Material</th>
                      <th className="p-2 text-right">Utilizado</th>
                      <th className="p-2 text-right">Merma</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {consumosDelProceso.map((consumo) => {
                      const material = materiales.find(
                        (item) => item.id === consumo.materialId,
                      );

                      const unidad = material?.unidadBase ?? '';

                      return (
                        <tr
                          key={`${consumo.partidaId}-${consumo.materialId}`}
                          className="border-b border-borde"
                        >
                          <td className="p-2">
                            {material
                              ? `${material.codigo} · ${material.nombre}`
                              : `Material ${consumo.materialId}`}
                          </td>

                          <td className="p-2 text-right tabular-nums">
                            {consumo.cantidadUsada} {unidad}
                          </td>

                          <td className="p-2 text-right tabular-nums">
                            {consumo.cantidadScrap} {unidad}
                          </td>

                          <td className="p-2 text-right font-semibold tabular-nums">
                            {consumo.cantidadTotal} {unidad}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
        </section>
      ) : null}

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
