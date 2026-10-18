'use client';

import { useQuery } from '@tanstack/react-query';

import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { Button } from '@/compartido/componentes/ui/button';
import { obtenerDetalleProgramacionAccion } from '@/modulos/planeacion/acciones/indice';
import { claveDetalleProgramacion } from '@/modulos/planeacion/componentes/claves-consulta';
import type { ProgramacionArea } from '@/modulos/planeacion/tipos/indice';

export interface PropsDetalleProgramacionPlaneacion {
  programacion: Pick<ProgramacionArea, 'id' | 'actualizadoEn'>;
}

function horas(valor: number): string {
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(valor)} h`;
}

function fechaHora(valor: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(valor));
}

/** Detalle C9.3 cargado bajo demanda para la programación seleccionada. */
export function DetalleProgramacionPlaneacion({
  programacion,
}: PropsDetalleProgramacionPlaneacion) {
  const consulta = useQuery({
    queryKey: claveDetalleProgramacion(programacion.id, programacion.actualizadoEn),
    queryFn: async () => {
      const respuesta = await obtenerDetalleProgramacionAccion({ programacionId: programacion.id });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La consulta no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 15_000,
  });

  return (
    <section
      className="mt-4 border-t border-borde pt-4"
      aria-labelledby="titulo-detalle-programacion"
      data-testid="detalle-programacion-planeacion"
    >
      <h2 id="titulo-detalle-programacion" className="text-sm font-semibold text-texto-primario">
        Detalle de programación
      </h2>

      {consulta.isPending ? (
        <div className="mt-3 space-y-3" role="status" aria-label="Cargando detalle de programación">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : consulta.isError ? (
        <div
          className="mt-3 rounded-md border border-peligro/30 bg-peligro-suave p-3 text-sm text-peligro-texto"
          role="alert"
        >
          <p>No se pudo cargar el detalle de la programación.</p>
          <Button
            className="mt-2"
            variante="contorno"
            tamano="sm"
            onClick={() => void consulta.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : consulta.data ? (
        <div className="mt-3 space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div className="col-span-2">
              <dt className="text-xs text-texto-secundario">Responsable inicial</dt>
              <dd className="font-medium text-texto-primario">{consulta.data.responsableNombre}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-texto-secundario">Recurso</dt>
              <dd className="font-medium text-texto-primario">{consulta.data.recursoNombre}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-texto-secundario">Grupo de equipo</dt>
              <dd className="font-medium text-texto-primario">
                {consulta.data.grupoEquipoNombre ?? 'Sin grupo registrado'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-texto-secundario">Estimadas</dt>
              <dd className="font-mono text-texto-primario">{horas(consulta.data.horasEstimadas)}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-secundario">Reales</dt>
              <dd className="font-mono text-texto-primario">{horas(consulta.data.horasReales)}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-secundario">Exceso</dt>
              <dd className={consulta.data.horasExceso > 0 ? 'font-mono text-advertencia-texto' : 'font-mono text-texto-primario'}>
                {horas(consulta.data.horasExceso)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-texto-secundario">Liberación</dt>
              <dd className="text-texto-primario">
                {consulta.data.recursoLiberado ? 'Recurso liberado' : 'Conserva la capacidad'}
              </dd>
            </div>
          </dl>

          <div>
            <h3 className="font-medium text-texto-primario">Últimas reprogramaciones</h3>
            {consulta.data.historial.length === 0 ? (
              <p className="mt-1 text-texto-secundario">Sin reprogramaciones registradas.</p>
            ) : (
              <ol className="mt-2 space-y-3">
                {consulta.data.historial.map((cambio, indice) => (
                  <li
                    key={`${cambio.creadoEn}-${indice}`}
                    className="rounded-md border border-borde bg-superficie-2 p-3"
                  >
                    <p className="font-medium text-texto-primario">{cambio.motivo}</p>
                    <p className="text-xs text-texto-secundario">
                      {fechaHora(cambio.creadoEn)} · {cambio.actorNombre}
                    </p>
                    <p className="mt-2 text-xs text-texto-secundario">
                      {cambio.anterior.recurso} · {cambio.anterior.fechaProgramada} · {cambio.anterior.turno}
                      {' · '}{horas(cambio.anterior.horasEstimadas)} · prioridad {cambio.anterior.ordenPrioridad}
                    </p>
                    <p className="text-xs text-texto-primario">
                      → {cambio.nuevo.recurso} · {cambio.nuevo.fechaProgramada} · {cambio.nuevo.turno}
                      {' · '}{horas(cambio.nuevo.horasEstimadas)} · prioridad {cambio.nuevo.ordenPrioridad}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
