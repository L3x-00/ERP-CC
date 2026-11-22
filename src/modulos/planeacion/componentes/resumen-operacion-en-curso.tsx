'use client';

import { useQuery } from '@tanstack/react-query';

import { formatearNumero } from '@/compartido/utilidades/formatear';
import { obtenerDetalleProgramacionAccion } from '@/modulos/planeacion/acciones/indice';
import { claveDetalleProgramacion } from '@/modulos/planeacion/componentes/claves-consulta';
import type { ProgramacionArea } from '@/modulos/planeacion/tipos/indice';

export interface PropsResumenOperacionEnCurso {
  programacion: Pick<ProgramacionArea, 'id' | 'actualizadoEn'>;
}

function textoHoras(horas: number): string {
  const totalMinutos = Math.max(0, Math.floor(horas * 60));
  const horasEnteras = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return minutos === 0 ? `${horasEnteras} h` : `${horasEnteras} h ${minutos} min`;
}

/**
 * Cierre del módulo de Planeación: estado operativo de la sesión en marcha.
 * Usa la misma clave de consulta que el detalle, así React Query comparte la
 * respuesta y no hace una segunda petición.
 */
export function ResumenOperacionEnCurso({ programacion }: PropsResumenOperacionEnCurso) {
  const consulta = useQuery({
    queryKey: claveDetalleProgramacion(programacion.id, programacion.actualizadoEn),
    queryFn: async () => {
      const respuesta = await obtenerDetalleProgramacionAccion({
        programacionId: programacion.id,
      });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Sin datos de detalle' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 15_000,
  });

  const datos = consulta.data?.operacionEnCurso;
  if (!datos) return null;

  const porcentaje = Math.round(datos.porcentajeAvance);
  return (
    <section
      className="rounded-base border border-borde bg-superficie-2 p-3"
      aria-label="Estado de la operación en curso"
      data-testid="resumen-operacion-en-curso"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <p className="text-texto-secundario">Operador</p>
          <p className="font-medium text-texto-primario" data-testid="resumen-operador">
            {datos.operadorNombre}
          </p>
        </div>
        <div>
          <p className="text-texto-secundario">Inicio</p>
          <p className="font-medium tabular-nums text-texto-primario" data-testid="resumen-hora-inicio">
            {datos.horaInicio}
          </p>
        </div>
        <div>
          <p className="text-texto-secundario">Tiempo transcurrido</p>
          <p className="font-medium tabular-nums text-texto-primario" data-testid="resumen-tiempo-transcurrido">
            {textoHoras(datos.horasTranscurridas)}
          </p>
        </div>
        <div>
          <p className="text-texto-secundario">Avance</p>
          <p className="font-medium tabular-nums text-texto-primario" data-testid="resumen-avance">
            {formatearNumero(datos.piezasProducidas, 0)}/{formatearNumero(datos.metaPiezas, 0)} · {porcentaje}%
          </p>
          <div
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-borde"
            role="progressbar"
            aria-label="Porcentaje de avance"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcentaje}
          >
            <div className="h-full rounded-full bg-exito" style={{ width: `${porcentaje}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
