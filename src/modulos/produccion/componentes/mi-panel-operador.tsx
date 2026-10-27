
'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  Clock3,
  PauseCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { cn } from '@/compartido/utilidades/cn';
import {
  HORAS_JORNADA_OPERADOR,
  inicioSemana,
  sumarDias,
  type ProcesoEspacioOperador,
} from '@/modulos/produccion/tipos/espacio-operador';
import {
  obtenerMisProcesos,
  resumirMiPanel,
  type EstadoMiProceso,
} from '@/modulos/produccion/utilidades/mi-panel-operador';
import { horasLegibles } from '@/modulos/produccion/utilidades/formato-operador';

type Periodo = 'dia' | 'semana' | 'mes';

interface PropsMiPanelOperador {
  abierto: boolean;
  onCerrar: () => void;
  nombreOperador: string;
  operadorId: string;
  procesos: ProcesoEspacioOperador[];
  hoy: string;
  onAbrirProceso: (proceso: ProcesoEspacioOperador) => void;
}

const ETIQUETAS_ESTADO: Record<EstadoMiProceso, string> = {
  en_proceso: 'En proceso',
  pendiente: 'Pendiente',
  pausado: 'Pausado',
  terminado: 'Terminado',
};

const CLASES_ESTADO: Record<EstadoMiProceso, string> = {
  en_proceso: 'bg-acento-suave text-acento-texto',
  pendiente: 'bg-superficie-2 text-texto-secundario',
  pausado: 'bg-advertencia-suave text-advertencia-texto',
  terminado: 'bg-exito-suave text-exito-texto',
};

export function MiPanelOperador({
  abierto,
  onCerrar,
  nombreOperador,
  operadorId,
  procesos,
  hoy,
  onAbrirProceso,
}: PropsMiPanelOperador) {
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | EstadoMiProceso>('todos');

  const misProcesos = useMemo(
    () => obtenerMisProcesos(procesos, operadorId),
    [procesos, operadorId],
  );

  const resumen = useMemo(
    () => resumirMiPanel(misProcesos, operadorId),
    [misProcesos, operadorId],
  );

  const fechas = useMemo(() => {
    const referencia = new Date(`${hoy}T12:00:00Z`);

    if (periodo === 'dia') {
      return [sumarDias(hoy, desplazamiento)];
    }

    if (periodo === 'semana') {
      const lunes = sumarDias(inicioSemana(hoy), desplazamiento * 7);
      return Array.from({ length: 7 }, (_, indice) =>
        sumarDias(lunes, indice)
      );
    }

    referencia.setUTCMonth(referencia.getUTCMonth() + desplazamiento, 1);

    const anio = referencia.getUTCFullYear();
    const mes = referencia.getUTCMonth();
    const cantidadDias = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const primerDia = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;

    return Array.from({ length: cantidadDias }, (_, indice) =>
      sumarDias(primerDia, indice)
    );
  }, [hoy, periodo, desplazamiento]);

  const cargaPorFecha = useMemo(() => {
    const cantidades = new Map<string, number>();

    for (const item of misProcesos) {
      const reclamo = item.proceso.reclamo;

      if (
        !reclamo ||
        reclamo.operadorId !== operadorId ||
        reclamo.estado !== 'activo'
      ) {
        continue;
      }

      cantidades.set(
        reclamo.fecha,
        (cantidades.get(reclamo.fecha) ?? 0) + reclamo.horasEstimadas,
      );
    }

    return cantidades;
  }, [misProcesos, operadorId]);

  const horasPeriodo = fechas.reduce(
    (total, fecha) => total + (cargaPorFecha.get(fecha) ?? 0),
    0,
  );

  const procesosVisibles = misProcesos.filter(
    (item) => estadoFiltro === 'todos' || item.estado === estadoFiltro,
  );

  const indicadores = [
    {
      etiqueta: 'Reclamados',
      valor: resumen.reclamados,
      icono: ClipboardList,
      clase: 'text-acento-texto bg-acento-suave',
    },
    {
      etiqueta: 'En proceso',
      valor: resumen.enProceso,
      icono: Activity,
      clase: 'text-info-texto bg-info-suave',
    },
    {
      etiqueta: 'Pendientes',
      valor: resumen.pendientes,
      icono: Clock3,
      clase: 'text-advertencia-texto bg-advertencia-suave',
    },
    {
      etiqueta: 'Terminados',
      valor: resumen.terminados,
      icono: CheckCircle2,
      clase: 'text-exito-texto bg-exito-suave',
    },
    {
      etiqueta: 'Pausados',
      valor: resumen.pausados,
      icono: PauseCircle,
      clase: 'text-peligro-texto bg-peligro-suave',
    },
  ];

  return (
    <Dialog open={abierto} onOpenChange={(valor) => !valor && onCerrar()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-6xl flex-col overflow-hidden bg-superficie p-0 text-texto-primario">
        <DialogHeader className="shrink-0 border-b border-borde px-5 py-4">
          <DialogTitle>Mi panel de producción</DialogTitle>
          <DialogDescription>
            {nombreOperador} · Actividad y programación personal
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {indicadores.map(({ etiqueta, valor, icono: Icono, clase }) => (
              <div
                key={etiqueta}
                className="rounded-xl border border-borde bg-superficie p-3 shadow-suave"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-texto-secundario">{etiqueta}</span>
                  <span className={cn('rounded-lg p-1.5', clase)}>
                    <Icono size={16} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {valor}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <section className="rounded-xl border border-borde bg-superficie p-4 shadow-suave">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Mi disponibilidad</h3>
                  <p className="text-xs text-texto-secundario">
                    Horas reservadas por fecha
                  </p>
                </div>

                <div className="flex rounded-lg bg-superficie-2 p-1" role="group" aria-label="Período">
                  {(['dia', 'semana', 'mes'] as const).map((opcion) => (
                    <button
                      key={opcion}
                      type="button"
                      aria-pressed={periodo === opcion}
                      onClick={() => {
                        setPeriodo(opcion);
                        setDesplazamiento(0);
                      }}
                      className={cn(
                        'rounded-md px-3 py-2 text-xs font-medium transition-colors',
                        periodo === opcion
                          ? 'bg-superficie text-texto-primario shadow-sm'
                          : 'text-texto-secundario hover:text-texto-primario',
                      )}
                    >
                      {opcion === 'dia' ? 'Día' : opcion === 'semana' ? 'Semana' : 'Mes'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="rounded-md border border-borde px-3 py-1 text-sm hover:bg-superficie-2"
                  onClick={() => setDesplazamiento((valor) => valor - 1)}
                >
                  Anterior
                </button>
                <span className="text-center text-xs font-medium text-texto-secundario">
                  {fechas[0]} — {fechas[fechas.length - 1]}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-borde px-3 py-1 text-sm hover:bg-superficie-2"
                  onClick={() => setDesplazamiento((valor) => valor + 1)}
                >
                  Siguiente
                </button>
              </div>

              <div className="mt-4">
                <p className="text-sm text-texto-secundario">
                  Carga reservada del período
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {horasLegibles(horasPeriodo)}
                </p>

                <div className="mt-4 grid max-h-60 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                  {fechas.map((fecha) => {
                    const ocupadas = cargaPorFecha.get(fecha) ?? 0;
                    const porcentaje = Math.min(
                      (ocupadas / HORAS_JORNADA_OPERADOR) * 100,
                      100,
                    );

                    return (
                      <div key={fecha} className="rounded-lg bg-superficie-2 p-3">
                        <div className="flex justify-between gap-2 text-xs">
                          <time dateTime={fecha}>{fecha}</time>
                          <span className="tabular-nums">
                            {horasLegibles(ocupadas)} / {HORAS_JORNADA_OPERADOR} h
                          </span>
                        </div>

                        <div
                          role="progressbar"
                          aria-label={`Carga reservada para ${fecha}`}
                          aria-valuemin={0}
                          aria-valuemax={HORAS_JORNADA_OPERADOR}
                          aria-valuenow={Math.min(ocupadas, HORAS_JORNADA_OPERADOR)}
                          className="mt-2 h-2 overflow-hidden rounded-full bg-borde"
                        >
                          <div
                            className="h-full rounded-full bg-acento transition-[width] duration-300 motion-reduce:transition-none"
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-3 text-xs text-texto-tenue">
                  Referencia: {HORAS_JORNADA_OPERADOR} h por día.
                  La capacidad definitiva la valida el servidor.
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-borde bg-superficie p-4 shadow-suave">
              <h3 className="font-semibold">Mi actividad registrada</h3>
              <p className="mt-1 text-xs text-texto-secundario">
                Sesiones asociadas a los procesos visibles
              </p>

              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="text-xs text-texto-secundario">
                    Horas trabajadas registradas
                  </dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums">
                    {horasLegibles(resumen.horasTrabajadas)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-texto-secundario">
                    Horas actualmente reservadas
                  </dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums">
                    {horasLegibles(resumen.horasReservadas)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="rounded-xl border border-borde bg-superficie p-4 shadow-suave">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Mis procesos</h3>

              <select
                aria-label="Filtrar mis procesos por estado"
                value={estadoFiltro}
                onChange={(evento) =>
                  setEstadoFiltro(
                    evento.target.value as 'todos' | EstadoMiProceso,
                  )
                }
                className="min-h-10 rounded-lg border border-borde-fuerte bg-superficie px-3 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="en_proceso">En proceso</option>
                <option value="pendiente">Pendientes</option>
                <option value="pausado">Pausados</option>
                <option value="terminado">Terminados</option>
              </select>
            </div>

            {procesosVisibles.length === 0 ? (
              <p className="py-8 text-center text-sm text-texto-secundario">
                No hay procesos personales para mostrar.
              </p>
            ) : (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {procesosVisibles.map(({ proceso, estado, horasTrabajadas }) => (
                  <button
                    key={proceso.id}
                    type="button"
                    onClick={() => {
                      onCerrar();
                      onAbrirProceso(proceso);
                    }}
                    className="rounded-lg border border-borde bg-superficie-2 p-3 text-left transition-colors hover:border-acento focus-visible:outline-2 focus-visible:outline-acento"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {proceso.folioOrden}
                      </span>
                      <span className={cn(
                        'rounded-md px-2 py-1 text-xs font-medium',
                        CLASES_ESTADO[estado],
                      )}>
                        {ETIQUETAS_ESTADO[estado]}
                      </span>
                    </div>

                    <p className="mt-2 text-sm font-medium">
                      {proceso.procesoNombre}
                    </p>
                    <p className="mt-1 text-xs text-texto-secundario">
                      {proceso.codigoPieza} · {proceso.areaNombre}
                    </p>

                    <div className="mt-3 flex justify-between text-xs text-texto-secundario">
                      <span>Avance del proceso: {Math.round(proceso.porcentaje)}%</span>
                      <span>{horasLegibles(horasTrabajadas)} registradas</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-texto-tenue">
            Información obtenida de las órdenes vigentes del espacio de producción.
            El historial archivado no está incluido en esta vista.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
