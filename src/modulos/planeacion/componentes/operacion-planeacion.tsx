'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { usarTiendaPlaneacion } from '@/estado/uso-tienda-planeacion';
import {
  activarModoPreparacionAccion,
  obtenerCalendarioPlaneacionAccion,
  programarPartidaRecursoAccion,
  proponerHuecoReprogramacionAccion,
  reprogramarPartidaRecursoAccion,
} from '@/modulos/planeacion/acciones/indice';
import { CalendarioPlaneacion } from '@/modulos/planeacion/componentes/calendario-planeacion';
import { CLAVE_CALENDARIO_PLANEACION } from '@/modulos/planeacion/componentes/claves-consulta';
import { DialogoReprogramacionPlaneacion } from '@/modulos/planeacion/componentes/dialogo-reprogramacion-planeacion';
import { PanelBolsaPlaneacion } from '@/modulos/planeacion/componentes/panel-bolsa-planeacion';
import {
  PanelAsignacionPlaneacion,
  type DatosAsignacionPlaneacion,
  type EntradaProponerHueco,
  type PartidaProgramablePlaneacion,
  type ResultadoAsignacionPlaneacion,
  type ResultadoProponerHueco,
} from '@/modulos/planeacion/componentes/panel-asignacion-planeacion';
import { SincronizadorPlaneacionRealtime } from '@/modulos/planeacion/componentes/sincronizador-planeacion-realtime';
import type { BolsaPlaneacion, DatosCalendarioPlaneacion, SugerenciaBolsa } from '@/modulos/planeacion/servicios/indice';
import type {
  DesglosePartidaPlaneacion,
  ProgramacionArea,
} from '@/modulos/planeacion/tipos/indice';

export interface PropsOperacionPlaneacion {
  datosIniciales: DatosCalendarioPlaneacion;
  rangoInicial: { fechaInicio: string; fechaFin: string };
  partidasProgramables: readonly PartidaProgramablePlaneacion[];
  desglosePartidas?: readonly DesglosePartidaPlaneacion[];
  /** PLA-05: pausadas sin plan, activas sin fecha hoy y sugerencias por hueco. */
  bolsa?: BolsaPlaneacion;
  /** PLA-06/PRD-15: Reactivar solo para administradores. */
  puedeAdministrar?: boolean;
}

interface SolicitudArrastre {
  programacion: ProgramacionArea;
  fechaDestino: string;
}

/**
 * Une las vistas cliente con Server Actions. Ninguna mutación usa Supabase desde
 * el navegador: tras la respuesta se invalida el calendario y PostgreSQL sigue
 * siendo la fuente de verdad para capacidad, candados y CAS. El arrastre solo
 * abre un diálogo de confirmación con resumen y capacidad.
 */
export function OperacionPlaneacion({
  datosIniciales,
  rangoInicial,
  partidasProgramables,
  desglosePartidas = [],
  bolsa,
  puedeAdministrar = false,
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
  const [arrastre, setArrastre] = useState<SolicitudArrastre | null>(null);
  const [bolsaProcesando, setBolsaProcesando] = useState(false);
  const [bolsaMensaje, setBolsaMensaje] = useState<string | null>(null);
  const [bolsaError, setBolsaError] = useState<string | null>(null);

  const consultarCalendario = useCallback(
    async (filtros: {
      fechaInicio: string;
      fechaFin: string;
      recursoId?: string;
      estados?: readonly ProgramacionArea['estadoPlaneacion'][];
    }): Promise<DatosCalendarioPlaneacion> => {
      const resultado = await obtenerCalendarioPlaneacionAccion(filtros);
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'El calendario no devolvió datos' : resultado.error);
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

  const desglosePorPartidaId = useMemo(
    () => new Map(desglosePartidas.map((desglose) => [desglose.partidaId, desglose])),
    [desglosePartidas],
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
            : { exito: false as const, error: 'Selecciona una programación para reprogramarla' };

      if (resultado.exito) await actualizarCalendario();
      return resultado;
    },
    [actualizarCalendario, programacionSeleccionada],
  );

  const proponerHuecoPanel = useCallback(
    async (entrada: EntradaProponerHueco): Promise<ResultadoProponerHueco> =>
      proponerHuecoReprogramacionAccion(entrada),
    [],
  );

  const activarPreparacion = useCallback(async (): Promise<ResultadoAsignacionPlaneacion> => {
    if (!programacionSeleccionada) {
      return { exito: false, error: 'Selecciona una programación para iniciar la preparación' };
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

  const solicitarReprogramacion = useCallback(
    (programacion: ProgramacionArea, fechaDestino: string): void => {
      if (fechaDestino === programacion.fechaProgramada) return;
      setArrastre({ programacion, fechaDestino });
    },
    [],
  );

  const confirmarReprogramacionArrastre = useCallback(
    async (fecha: string): Promise<ResultadoAsignacionPlaneacion> => {
      if (!arrastre) return { exito: false, error: 'La reprogramación ya no está disponible' };
      const resultado = await reprogramarPartidaRecursoAccion({
        programacionId: arrastre.programacion.id,
        recursoId: arrastre.programacion.recursoId,
        fechaProgramada: fecha,
        turno: arrastre.programacion.turno,
        horasEstimadas: arrastre.programacion.horasEstimadas,
        ordenPrioridad: arrastre.programacion.ordenPrioridad,
        actualizadoEnEsperado: arrastre.programacion.actualizadoEn,
      });
      if (resultado.exito) {
        await actualizarCalendario();
        setArrastre(null);
      }
      return resultado;
    },
    [actualizarCalendario, arrastre],
  );

  const buscarHuecoArrastre = useCallback(async (): Promise<ResultadoProponerHueco> => {
    if (!arrastre) return { exito: false, error: 'La reprogramación ya no está disponible' };
    return proponerHuecoReprogramacionAccion({
      recursoId: arrastre.programacion.recursoId,
      turno: arrastre.programacion.turno,
      horasEstimadas: arrastre.programacion.horasEstimadas,
      desdeFecha: arrastre.fechaDestino,
    });
  }, [arrastre]);

  function cancelarSeleccion(): void {
    seleccionarProgramacion(null);
    setProgramacionSeleccionada(null);
  }

  const refrescarEstructuraOperacion = useCallback((): void => {
    enrutador.refresh();
  }, [enrutador]);

  // PLA-05: asignar una sugerencia reutiliza la RPC transaccional; PostgreSQL
  // revalida capacidad y candados aunque la vista previa dijera que cabía.
  const asignarSugerencia = useCallback(async (sugerencia: SugerenciaBolsa) => {
    setBolsaProcesando(true);
    setBolsaMensaje(null);
    setBolsaError(null);
    try {
      const resultado = await programarPartidaRecursoAccion({
        ordenId: sugerencia.ordenId,
        partidaId: sugerencia.partidaId,
        recursoId: sugerencia.recursoId,
        secuencia: sugerencia.secuencia,
        fechaProgramada: sugerencia.fecha,
        turno: sugerencia.turno,
        horasEstimadas: sugerencia.horas,
        ordenPrioridad: 1,
      });
      if (!resultado.exito) {
        setBolsaError(resultado.error);
      } else {
        setBolsaMensaje(`${sugerencia.codigoPieza} programada el ${sugerencia.fecha}.`);
        await actualizarCalendario();
        enrutador.refresh();
      }
      return resultado.exito
        ? { exito: true as const }
        : { exito: false as const, error: resultado.error };
    } catch {
      setBolsaError('No se pudo programar la sugerencia. Intenta de nuevo.');
      return { exito: false as const, error: 'No se pudo programar la sugerencia' };
    } finally {
      setBolsaProcesando(false);
    }
  }, [actualizarCalendario, enrutador]);

  const cargaDestino = arrastre
    ? datosCalendario.cargas.find(
        (carga) =>
          carga.recursoId === arrastre.programacion.recursoId
          && carga.fechaProgramada === arrastre.fechaDestino
          && carga.turno === arrastre.programacion.turno,
      )
    : undefined;

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
        desglosePartidas={desglosePartidas}
        onSeleccionarProgramacion={alSeleccionar}
        onSolicitarReprogramacion={solicitarReprogramacion}
        puedeAdministrar={puedeAdministrar}
        onRefrescarOperacion={refrescarEstructuraOperacion}
      />
      <aside className="rounded-base border border-borde p-4" aria-label="Asignación de recurso">
        <PanelAsignacionPlaneacion
          recursos={datosCalendario.recursos}
          partidasProgramables={partidasProgramables}
          programacion={programacionSeleccionada}
          desglosePartidas={desglosePartidas}
          cargas={datosCalendario.cargas}
          onEnviar={enviarAsignacion}
          onActivarPreparacion={programacionSeleccionada ? activarPreparacion : undefined}
          onCancelar={programacionSeleccionada ? cancelarSeleccion : undefined}
          onProponerHueco={proponerHuecoPanel}
        />
        <PanelBolsaPlaneacion
          bolsa={bolsa ?? { pausadasSinPlan: [], activasSinFechaHoy: [], sugerencias: [] }}
          procesando={bolsaProcesando}
          mensaje={bolsaMensaje}
          error={bolsaError}
          onAsignar={asignarSugerencia}
        />
      </aside>

      {arrastre ? (
        <DialogoReprogramacionPlaneacion
          programacion={arrastre.programacion}
          fechaDestino={arrastre.fechaDestino}
          desglose={desglosePorPartidaId.get(arrastre.programacion.partidaId)}
          carga={cargaDestino}
          onCerrar={() => setArrastre(null)}
          onConfirmar={confirmarReprogramacionArrastre}
          onBuscarHueco={buscarHuecoArrastre}
        />
      ) : null}
    </div>
  );
}
