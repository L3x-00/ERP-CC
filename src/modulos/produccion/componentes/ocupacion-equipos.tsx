'use client';

import { useMemo } from 'react';

import { formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';
import { etiquetaDiaLargo } from '@/modulos/produccion/utilidades/formato-operador';
import { ContadorSesionVivo } from './contador-sesion-vivo';

export interface EquipoEnUso {
  recursoId: string;
  recursoCodigo: string;
  recursoNombre: string;
  proceso: ProcesoEspacioOperador;
}

/**
 * Equipos que en este momento tienen una sesión en marcha, con el proceso que
 * los ocupa. Se deriva del mismo espacio del operador que pinta el Kanban: no
 * agrega consultas ni inventa un estado que PostgreSQL no haya registrado.
 */
export function equiposEnUso(
  procesos: readonly ProcesoEspacioOperador[],
): EquipoEnUso[] {
  const equipos: EquipoEnUso[] = [];
  for (const proceso of procesos) {
    const sesion = proceso.sesionActiva;
    const programacion = proceso.programacion;
    if (!sesion || !programacion) continue;
    equipos.push({
      recursoId: programacion.recursoId,
      recursoCodigo: programacion.recursoCodigo ?? 'Equipo',
      recursoNombre: programacion.recursoNombre ?? 'Sin nombre',
      proceso,
    });
  }
  return equipos.sort((primero, segundo) => (
    primero.recursoCodigo.localeCompare(segundo.recursoCodigo, 'es')
    || primero.proceso.folioOrden.localeCompare(segundo.proceso.folioOrden, 'es')
  ));
}

export interface PropsOcupacionEquipos {
  procesos: readonly ProcesoEspacioOperador[];
}

/**
 * Carga: «¿qué equipo está ocupado ahora y con qué orden?». Muestra folio,
 * cliente, proceso, operador, hora de inicio, cronómetro vivo y avance para que
 * piso distinga capacidad pendiente de un equipo realmente en marcha.
 */
export function OcupacionEquipos({ procesos }: PropsOcupacionEquipos) {
  const equipos = useMemo(() => equiposEnUso(procesos), [procesos]);

  return (
    <section
      aria-label="Equipos en uso"
      data-testid="ocupacion-equipos"
      className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-texto-primario">Equipos en uso ahora</h2>
        <p className="text-xs text-texto-secundario">
          {equipos.length === 0
            ? 'Ningún equipo tiene una sesión en marcha.'
            : `${equipos.length} ${equipos.length === 1 ? 'equipo en marcha' : 'equipos en marcha'}`}
        </p>
      </div>

      {equipos.length === 0 ? (
        <p className="text-sm text-texto-secundario" data-testid="ocupacion-equipos-vacio">
          Cuando un operador inicie una sesión, aquí verás el equipo, la orden y el tiempo
          transcurrido.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {equipos.map(({ recursoId, recursoCodigo, recursoNombre, proceso }) => {
            const sesion = proceso.sesionActiva!;
            return (
              <li
                key={`${recursoId}:${proceso.id}`}
                data-testid={`equipo-en-uso-${recursoCodigo}`}
                className="flex flex-col gap-1 rounded-lg border border-exito/40 bg-exito-suave/30 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-texto-primario">
                    {recursoCodigo} · {recursoNombre}
                  </p>
                  <span className="rounded-full bg-exito-suave px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-exito-texto">
                    En uso
                  </span>
                </div>
                <p className="text-xs text-texto-secundario">
                  <span className="font-semibold text-texto-primario">{proceso.folioOrden}</span>
                  {' · '}{proceso.clienteNombre}
                </p>
                <p className="text-xs text-texto-secundario">
                  {proceso.procesoNombre} · {proceso.codigoPieza}
                </p>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="min-w-0">
                    <dt className="text-texto-tenue">Operador</dt>
                    <dd className="truncate font-medium text-texto-primario">
                      {sesion.operadorNombre}
                    </dd>
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
                        testId={`contador-${recursoCodigo}`}
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
                  <div className="col-span-2 min-w-0">
                    <dt className="text-texto-tenue">Entrega</dt>
                    <dd className="font-medium text-texto-primario">
                      {etiquetaDiaLargo(proceso.fechaCompromiso)}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
