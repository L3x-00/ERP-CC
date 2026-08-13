'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { usarTiendaPlaneacion } from '@/estado/uso-tienda-planeacion';
import {
  activarModoPreparacionAccion,
  obtenerCalendarioPlaneacionAccion,
  programarPartidaRecursoAccion,
  reprogramarPartidaRecursoAccion,
} from '@/modulos/planeacion/acciones/indice';
import { CalendarioPlaneacion } from '@/modulos/planeacion/componentes/calendario-planeacion';
import { CLAVE_CALENDARIO_PLANEACION } from '@/modulos/planeacion/componentes/claves-consulta';
import {
  PanelAsignacionPlaneacion,
  type DatosAsignacionPlaneacion,
  type PartidaProgramablePlaneacion,
  type ResultadoAsignacionPlaneacion,
} from '@/modulos/planeacion/componentes/panel-asignacion-planeacion';
import { SincronizadorPlaneacionRealtime } from '@/modulos/planeacion/componentes/sincronizador-planeacion-realtime';
import type { DatosCalendarioPlaneacion } from '@/modulos/planeacion/servicios/indice';
import type { ProgramacionArea } from '@/modulos/planeacion/tipos/indice';

export interface PropsOperacionPlaneacion {
  datosIniciales: DatosCalendarioPlaneacion;
  rangoInicial: { fechaInicio: string; fechaFin: string };
  partidasProgramables: readonly PartidaProgramablePlaneacion[];
}

/**
 * Une las vistas cliente con Server Actions. Ninguna mutaci\u00f3n usa Supabase desde
 * el navegador: tras la respuesta se invalida el calendario y PostgreSQL sigue
 * siendo la fuente de verdad para capacidad, candados y CAS.
 */
export function OperacionPlaneacion({
  datosIniciales,
  rangoInicial,
  partidasProgramables,
}: PropsOperacionPlaneacion) {
  const clienteConsultas = useQueryClient();
  const enrutador = useRouter();
  const seleccionarProgramacion = usarTiendaPlaneacion(
    (estado) => estado.seleccionarProgramacion,
  );
  const rango = usarTiendaPlaneacion((estado) => estado.rango);
  const recursoId = usarTiendaPlaneacion((estado) => estado.recursoId);
  const estados = usarTiendaPlaneacion((estado) => estado.estados);
  const [programacionSeleccionada, setProgramacionSeleccionada] =
    useState<ProgramacionArea | null>(null);

  const consultarCalendario = useCallback(
    async (filtros: {
      fechaInicio: string;
      fechaFin: string;
      recursoId?: string;
      estados?: readonly ProgramacionArea['estadoPlaneacion'][];
    }): Promise<DatosCalendarioPlaneacion> => {
      const resultado = await obtenerCalendarioPlaneacionAccion(filtros);
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'El calendario no devolvi\u00f3 datos' : resultado.error);
      }
      return resultado.datos;
    },
    [],
  );

  const rangoEfectivo = rango ?? rangoInicial;
  const filtros = {
    fechaInicio: rangoEfectivo.fechaInicio,
    fechaFin: rangoEfectivo.fechaFin,
    ...(recursoId ? { recursoId } : {}),
    ...(estados.length > 0 ? { estados } : {}),
  };
  const esConsultaInicial = rango === null && recursoId === null && estados.length === 0;
  const consulta = useQuery({
    queryKey: [...CLAVE_CALENDARIO_PLANEACION, filtros],
    queryFn: () => consultarCalendario(filtros),
    ...(esConsultaInicial ? { initialData: datosIniciales } : {}),
  });
  const datosCalendario = consulta.data ?? (
    esConsultaInicial
      ? datosIniciales
      : { recursos: datosIniciales.recursos, cargas: [], programaciones: [] }
  );

  const actualizarCalendario = useCallback(async (): Promise<void> => {
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CALENDARIO_PLANEACION });
  }, [clienteConsultas]);

  const enviarAsignacion = useCallback(
    async (datos: DatosAsignacionPlaneacion): Promise<ResultadoAsignacionPlaneacion> => {
      const resultado =
        datos.tipo === 'crear'
          ? await programarPartidaRecursoAccion({
              ordenId: datos.ordenId,
              partidaId: datos.partidaId,
              recursoId: datos.recursoId,
              secuencia: datos.secuencia,
              fechaProgramada: datos.fechaProgramada,
              turno: datos.turno,
              horasEstimadas: datos.horasEstimadas,
              ordenPrioridad: datos.ordenPrioridad,
            })
          : programacionSeleccionada
            ? await reprogramarPartidaRecursoAccion({
                programacionId: programacionSeleccionada.id,
                recursoId: datos.recursoId,
                fechaProgramada: datos.fechaProgramada,
                turno: datos.turno,
                horasEstimadas: datos.horasEstimadas,
                ordenPrioridad: datos.ordenPrioridad,
                actualizadoEnEsperado: programacionSeleccionada.actualizadoEn,
              })
            : { exito: false as const, error: 'Selecciona una programaci\u00f3n para reprogramarla' };

      if (resultado.exito) await actualizarCalendario();
      return resultado;
    },
    [actualizarCalendario, programacionSeleccionada],
  );

  const activarPreparacion = useCallback(async (): Promise<ResultadoAsignacionPlaneacion> => {
    if (!programacionSeleccionada) {
      return { exito: false, error: 'Selecciona una programaci\u00f3n para iniciar la preparaci\u00f3n' };
    }
    const resultado = await activarModoPreparacionAccion({
      programacionId: programacionSeleccionada.id,
      actualizadoEnEsperado: programacionSeleccionada.actualizadoEn,
    });
    if (resultado.exito) await actualizarCalendario();
    return resultado;
  }, [actualizarCalendario, programacionSeleccionada]);

  const alSeleccionar = useCallback((programacion: ProgramacionArea | null): void => {
    setProgramacionSeleccionada((anterior) => {
      if (
        anterior?.id === programacion?.id
        && anterior?.actualizadoEn === programacion?.actualizadoEn
      ) {
        return anterior;
      }
      return programacion;
    });
  }, []);

  function cancelarSeleccion(): void {
    seleccionarProgramacion(null);
    setProgramacionSeleccionada(null);
  }

  const refrescarEstructuraOperacion = useCallback((): void => {
    enrutador.refresh();
  }, [enrutador]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <SincronizadorPlaneacionRealtime
        alCambiarEstructuraOperacion={refrescarEstructuraOperacion}
      />
      <CalendarioPlaneacion
        datos={datosCalendario}
        rangoInicial={rangoInicial}
        actualizando={consulta.isFetching}
        errorActualizacion={consulta.isError}
        onSeleccionarProgramacion={alSeleccionar}
      />
      <aside className="rounded-base border border-foreground/10 p-4" aria-label="Asignaci\u00f3n de recurso">
        <PanelAsignacionPlaneacion
          recursos={datosCalendario.recursos}
          partidasProgramables={partidasProgramables}
          programacion={programacionSeleccionada}
          onEnviar={enviarAsignacion}
          onActivarPreparacion={programacionSeleccionada ? activarPreparacion : undefined}
          onCancelar={programacionSeleccionada ? cancelarSeleccion : undefined}
        />
      </aside>
    </div>
  );
}
