'use client';

import { formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { formatearHoras } from '@/modulos/planeacion/utilidades/carga-semanal';
import type { RecursoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';
import type {
  CapacidadDiaArea,
  DetalleAreaCarga,
} from '@/modulos/produccion/utilidades/carga-area';
import { etiquetaDiaLargo } from '@/modulos/produccion/utilidades/formato-operador';
import { ContadorSesionVivo } from './contador-sesion-vivo';

export interface PropsDetalleCargaArea {
  /** Recurso cuyo detalle se muestra; null cierra el diálogo. */
  recurso: RecursoPlaneacion | null;
  detalle: DetalleAreaCarga;
  capacidad: CapacidadDiaArea;
  /** Día de negocio del que se listan los procesos trabajados. */
  fecha: string;
  onCerrar: () => void;
}

/**
 * Detalle de un equipo de la carga: quién lo ocupa ahora, desde cuándo y qué
 * procesos se trabajaron en él durante el día. Usa los mismos datos del espacio
 * del operador, así que se refresca con la sincronización del piso.
 */
export function DetalleCargaArea({
  recurso,
  detalle,
  capacidad,
  fecha,
  onCerrar,
}: PropsDetalleCargaArea) {
  const procesoActual = detalle.procesoActual;
  const sesionActual = procesoActual?.sesionActiva ?? null;

  return (
    <Dialog
      open={recurso !== null}
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] max-w-2xl flex-col gap-4 overflow-hidden"
        data-testid="detalle-carga-area"
      >
        <DialogHeader>
          <DialogTitle>
            {recurso ? `${recurso.codigo} · ${recurso.nombre}` : 'Detalle del equipo'}
          </DialogTitle>
          <DialogDescription>
            {etiquetaDiaLargo(fecha)} ·{' '}
            {sesionActual ? 'Ocupado ahora' : 'Libre ahora'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-sutil pr-1">
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-superficie-2 p-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-texto-secundario">Capacidad</dt>
              <dd className="font-medium tabular-nums">{formatearHoras(capacidad.capacidad)} h</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-secundario">Pendiente</dt>
              <dd className="font-medium tabular-nums">{formatearHoras(capacidad.pendientes)} h</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-secundario">Trabajadas</dt>
              <dd className="font-medium tabular-nums">{formatearHoras(capacidad.trabajadas)} h</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-secundario">Libre</dt>
              <dd className="font-medium tabular-nums">{formatearHoras(capacidad.libres)} h</dd>
            </div>
          </dl>

          <section className="mt-4 flex flex-col gap-2" aria-label="Proceso en marcha">
            <h3 className="text-sm font-semibold text-texto-primario">
              {sesionActual ? 'Ocupado ahora' : 'Sin proceso en marcha'}
            </h3>
            {sesionActual && procesoActual ? (
              <DetalleProcesoActual proceso={procesoActual} />
            ) : (
              <p
                className="text-sm text-texto-secundario"
                data-testid="detalle-carga-area-sin-proceso"
              >
                Nadie está usando este equipo en este momento.
              </p>
            )}
          </section>

          <section className="mt-4 flex flex-col gap-2" aria-label="Procesos trabajados hoy">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-texto-primario">
                Procesos trabajados hoy
              </h3>
              <p className="text-xs text-texto-secundario">
                {detalle.sesionesCerradas.length === 0
                  ? 'Sin trabajo registrado'
                  : `${formatearHoras(detalle.horasTrabajadas)} h · ${formatearNumero(detalle.piezasProducidas, 0)} piezas`}
              </p>
            </div>

            {detalle.sesionesCerradas.length === 0 ? (
              <p
                className="text-sm text-texto-secundario"
                data-testid="detalle-carga-area-sin-trabajo"
              >
                Todavía no hay procesos cerrados en este equipo el día de hoy. El tiempo de la
                sesión en marcha se suma aquí cuando se cierra.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-borde text-left text-texto-secundario">
                      <th scope="col" className="px-2 py-1 font-medium">Horario</th>
                      <th scope="col" className="px-2 py-1 font-medium">Orden</th>
                      <th scope="col" className="px-2 py-1 font-medium">Proceso</th>
                      <th scope="col" className="px-2 py-1 font-medium">Operador</th>
                      <th scope="col" className="px-2 py-1 text-right font-medium">Horas</th>
                      <th scope="col" className="px-2 py-1 text-right font-medium">Piezas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.sesionesCerradas.map(({ sesion, proceso }) => (
                      <tr
                        key={sesion.id}
                        className="border-b border-borde/60 last:border-0"
                        data-testid={`trabajo-area-${sesion.id}`}
                      >
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                          {formatearHora(sesion.fechaInicio)}
                          {'–'}
                          {sesion.fechaFin ? formatearHora(sesion.fechaFin) : '—'}
                        </td>
                        <td className="px-2 py-1 font-medium">{proceso.folioOrden}</td>
                        <td className="px-2 py-1">
                          {proceso.procesoNombre}
                          <span className="block text-[10px] text-texto-tenue">
                            {proceso.codigoPieza}
                          </span>
                        </td>
                        <td className="px-2 py-1">{sesion.operadorNombre}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {formatearNumero(sesion.horasNetas)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {formatearNumero(sesion.piezasProducidas, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetalleProcesoActual({ proceso }: { proceso: ProcesoEspacioOperador }) {
  const sesion = proceso.sesionActiva!;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-advertencia/40 bg-advertencia-suave/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-texto-primario">{proceso.folioOrden}</p>
        <p className="text-xs text-texto-secundario">{proceso.clienteNombre}</p>
      </div>
      <p className="text-xs text-texto-secundario">
        {proceso.procesoNombre} · {proceso.codigoPieza}
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-texto-tenue">Operador</dt>
          <dd className="truncate font-medium text-texto-primario">{sesion.operadorNombre}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-texto-tenue">Desde</dt>
          <dd className="font-medium tabular-nums text-texto-primario">
            {formatearHora(sesion.fechaInicio)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-texto-tenue">Tiempo transcurrido</dt>
          <dd>
            <ContadorSesionVivo
              fechaInicio={sesion.fechaInicio}
              limiteHoras={proceso.horasEstimadas}
              testId="contador-detalle-area"
            />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-texto-tenue">Avance</dt>
          <dd className="font-medium tabular-nums text-texto-primario">
            {formatearNumero(proceso.hechoPiezas, 0)}/{formatearNumero(proceso.metaPiezas, 0)}
            {' '}{proceso.unidadMedida}
          </dd>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-4">
          <dt className="text-texto-tenue">Entrega</dt>
          <dd className="font-medium text-texto-primario">
            {etiquetaDiaLargo(proceso.fechaCompromiso)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
