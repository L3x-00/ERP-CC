'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { usarTiendaPlaneacion } from '@/estado/uso-tienda-planeacion';
import {
  activarModoPreparacionAccion,
  asignarResponsablePlaneacionAccion,
  pausarOperacionAdministrativaAccion,
  liberarPreparacionPlaneacionAccion,
  obtenerCalendarioPlaneacionAccion,
  programarOperacionMultidiaAccion,
  programarPartidaRecursoAccion,
  proponerHuecoReprogramacionAccion,
  proponerPlanMultidiaAccion,
  reprogramarPartidaRecursoAccion,
} from '@/modulos/planeacion/acciones/indice';
import { CalendarioPlaneacion } from '@/modulos/planeacion/componentes/calendario-planeacion';
import {
  DialogoErrorPlaneacion,
  type ErrorProgramacion,
} from '@/modulos/planeacion/componentes/dialogo-error-planeacion';
import { Button } from '@/compartido/componentes/ui/button';
import { Textarea } from '@/compartido/componentes/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import {
  CLAVE_CALENDARIO_PLANEACION,
  CLAVE_DETALLE_PROGRAMACION,
} from '@/modulos/planeacion/componentes/claves-consulta';
import {
  generarNotaEntregaAccion,
  obtenerDetalleOrdenConcluidaAccion,
} from '@/modulos/produccion/acciones/indice';
import {
  CLAVE_CONSUMOS_ORDEN,
  CLAVE_DETALLE_ORDEN_CONCLUIDA,
  CLAVE_ENTREGABLES_ORDEN,
} from '@/modulos/produccion/componentes/claves-consulta';
import { DetalleOrdenConcluida } from '@/modulos/produccion/componentes/detalle-orden-concluida';
import {
  operacionConcluida,
  ordenConcluida,
} from '@/modulos/ordenes/utilidades/conclusion-orden';
import { DetalleProgramacionPlaneacion } from '@/modulos/planeacion/componentes/detalle-programacion-planeacion';
import { DialogoReprogramacionPlaneacion } from '@/modulos/planeacion/componentes/dialogo-reprogramacion-planeacion';
import { PanelBolsaPlaneacion } from '@/modulos/planeacion/componentes/panel-bolsa-planeacion';
import { PanelCapacidadInstalada } from '@/modulos/planeacion/componentes/panel-capacidad-instalada';
import {
  PanelAsignacionPlaneacion,
  type DatosAsignacionMultidia,
  type DatosAsignacionPlaneacion,
  type EntradaProponerHueco,
  type EntradaProponerPlanMultidia,
  type PartidaProgramablePlaneacion,
  type PreseleccionProgramacion,
  type ResultadoAsignacionPlaneacion,
  type ResultadoProponerHueco,
  type ResultadoProponerPlanMultidia,
} from '@/modulos/planeacion/componentes/panel-asignacion-planeacion';
import { SincronizadorPlaneacionRealtime } from '@/modulos/planeacion/componentes/sincronizador-planeacion-realtime';
import { ResumenCargaSemanal } from '@/modulos/planeacion/componentes/resumen-carga-semanal';
import type {
  BolsaPlaneacion,
  DatosCalendarioPlaneacion,
  PartidaBloqueadaBolsa,
  SugerenciaBolsa,
} from '@/modulos/planeacion/servicios/indice';
import type {
  CompromisoPlaneacion,
  DesglosePartidaPlaneacion,
  ProgramacionArea,
} from '@/modulos/planeacion/tipos/indice';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import type { CompatibilidadRecursosPlaneacion } from '@/modulos/planeacion/utilidades/compatibilidad';

export interface PropsOperacionPlaneacion {
  datosIniciales: DatosCalendarioPlaneacion;
  rangoInicial: { fechaInicio: string; fechaFin: string };
  partidasProgramables: readonly PartidaProgramablePlaneacion[];
  desglosePartidas?: readonly DesglosePartidaPlaneacion[];
  /** PLA-05: pausadas sin plan, activas sin fecha hoy y sugerencias por hueco. */
  bolsa?: BolsaPlaneacion;
  /** C9.2/P06: total de partidas antes del tope del selector. */
  partidasTotal?: number;
  /** C9.2/P10+P-04: grupos de equipo para la compatibilidad del recurso. */
  compatibilidad?: CompatibilidadRecursosPlaneacion;
  /** Ficha de una orden concluida: comentarios y permisos de entrega. */
  usuarioActualId?: string;
  esAdmin?: boolean;
  /** PLAN-1: operadores activos para elegir responsable de la partida. */
  operadores?: readonly { id: string; nombre: string }[];
  /** C22: solicitud de programación abierta desde la campana del operador. */
  solicitudProgramacion?: SolicitudProgramacionOperador | null;
}

/**
 * C22: reclamo de un operador que llega por el enlace de la notificación.
 * Los datos se leen de la base en el servidor; la URL solo transporta el id.
 */
export interface SolicitudProgramacionOperador {
  reclamoId: string;
  partidaId: string;
  metaProcesoId: string | null;
  operadorNombre: string;
  fecha: string;
  turno: string;
  horas: number;
  /** La misma operación ya tiene programación vigente: se avisa en vez de duplicar. */
  yaProgramada: boolean;
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
  partidasTotal,
  compatibilidad,
  usuarioActualId,
  esAdmin = false,
  operadores = [],
  solicitudProgramacion = null,
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
  const [errorBolsaModal, setErrorBolsaModal] = useState<ErrorProgramacion | null>(null);
  const [sugerenciaFallida, setSugerenciaFallida] = useState<SugerenciaBolsa | null>(null);
  const [preseleccion, setPreseleccion] = useState<PreseleccionProgramacion | null>(() =>
    solicitudProgramacion
      ? {
          partidaId: solicitudProgramacion.partidaId,
          fecha: solicitudProgramacion.fecha,
          horas: solicitudProgramacion.horas,
          metaProcesoId: solicitudProgramacion.metaProcesoId,
        }
      : null,
  );
  const [fechaSolicitada, setFechaSolicitada] = useState(solicitudProgramacion?.fecha ?? '');
  const [panelAbierto, setPanelAbierto] = useState(
    Boolean(solicitudProgramacion && !solicitudProgramacion.yaProgramada),
  );
  const [solicitudVisible, setSolicitudVisible] = useState(Boolean(solicitudProgramacion));
  const [detalleConcluido, setDetalleConcluido] = useState<{
    id: string;
    esOrdenConcluida: boolean;
  } | null>(null);
  const [entregaProcesando, setEntregaProcesando] = useState(false);

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
      : { recursos: datosIniciales.recursos, cargas: [], programaciones: [], compromisos: [] }
  );

  // Una orden concluida se consulta con la misma proyección del tablero de
  // Producción, en modo lectura y sin cargar el tablero completo.
  const consultaDetalleConcluido = useQuery({
    queryKey: [...CLAVE_DETALLE_ORDEN_CONCLUIDA, detalleConcluido?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!detalleConcluido) throw new Error('No hay una orden concluida seleccionada');
      const resultado = await obtenerDetalleOrdenConcluidaAccion({
        ordenId: detalleConcluido.id,
      });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La orden no devolvió datos' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: detalleConcluido !== null,
    staleTime: 15_000,
  });

  const generarNotaConcluida = useCallback(async (datosNota: {
    ordenId: string;
    recibidoPor: string;
    firmaClienteUrl?: string;
    partidas: { partidaId: string; cantidadEntregada: number }[];
  }): Promise<{ exito: true; folio: string } | { exito: false; error: string }> => {
    setEntregaProcesando(true);
    try {
      const resultado = await generarNotaEntregaAccion(datosNota);
      if (!resultado.exito) return { exito: false, error: resultado.error };
      if (!resultado.datos) return { exito: false, error: 'La entrega no devolvió una confirmación' };
      await Promise.all([
        clienteConsultas.invalidateQueries({ queryKey: CLAVE_DETALLE_ORDEN_CONCLUIDA }),
        clienteConsultas.invalidateQueries({ queryKey: CLAVE_CONSUMOS_ORDEN }),
        clienteConsultas.invalidateQueries({ queryKey: CLAVE_ENTREGABLES_ORDEN }),
        clienteConsultas.invalidateQueries({ queryKey: CLAVE_CALENDARIO_PLANEACION }),
        clienteConsultas.invalidateQueries({ queryKey: CLAVE_DETALLE_PROGRAMACION }),
      ]);
      return { exito: true, folio: resultado.datos.folio };
    } finally {
      setEntregaProcesando(false);
    }
  }, [clienteConsultas]);

  // C9.2/P09: si la fecha capturada en el panel cae fuera del rango visible, se
  // consulta ese día con la misma acción del calendario antes de previsualizar;
  // dentro del rango la carga ya viaja en `datosCalendario` y no hay consulta extra.
  const fueraDelRango =
    fechaSolicitada !== ''
    && (fechaSolicitada < rangoEfectivo.fechaInicio || fechaSolicitada > rangoEfectivo.fechaFin);
  const consultaFechaFueraDeRango = useQuery({
    queryKey: [...CLAVE_CALENDARIO_PLANEACION, 'capacidad-fecha', fechaSolicitada],
    queryFn: () => consultarCalendario({ fechaInicio: fechaSolicitada, fechaFin: fechaSolicitada }),
    enabled: fueraDelRango,
    staleTime: 15_000,
  });
  const cargasPanel =
    fueraDelRango && consultaFechaFueraDeRango.data
      ? consultaFechaFueraDeRango.data.cargas
      : datosCalendario.cargas;
  const verificandoCapacidad = fueraDelRango && consultaFechaFueraDeRango.isFetching;

  const desglosePorPartidaId = useMemo(
    () => new Map(desglosePartidas.map((desglose) => [desglose.partidaId, desglose])),
    [desglosePartidas],
  );

  const actualizarCalendario = useCallback(async (): Promise<void> => {
    await Promise.all([
      clienteConsultas.invalidateQueries({ queryKey: CLAVE_CALENDARIO_PLANEACION }),
      clienteConsultas.invalidateQueries({ queryKey: CLAVE_DETALLE_PROGRAMACION }),
    ]);
  }, [clienteConsultas]);

  const actualizarDatosPlaneacion = useCallback((): void => {
    void actualizarCalendario();
    enrutador.refresh();
  }, [actualizarCalendario, enrutador]);

  const enviarAsignacion = useCallback(
    async (datos: DatosAsignacionPlaneacion): Promise<ResultadoAsignacionPlaneacion> => {
      const resultado =
        datos.tipo === 'crear'
          ? await programarPartidaRecursoAccion({
              ordenId: datos.ordenId,
              partidaId: datos.partidaId,
              recursoId: datos.recursoId,
              secuencia: datos.secuencia,
              metaProcesoId: datos.metaProcesoId,
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
                motivo: datos.motivo,
                actualizadoEnEsperado: programacionSeleccionada.actualizadoEn,
              })
            : { exito: false as const, error: 'Selecciona una programación para reprogramarla' };

      if (resultado.exito) {
        // La reprogramación devuelve el nuevo `actualizado_en`: se aplica de
        // inmediato al panel para que «Iniciar preparación» use el CAS vigente
        // y no falle por un token obsoleto mientras el calendario se refresca.
        if (datos.tipo === 'reprogramar' && programacionSeleccionada && resultado.datos) {
          setProgramacionSeleccionada((anterior) => (anterior
            ? {
                ...anterior,
                recursoId: datos.recursoId,
                fechaProgramada: datos.fechaProgramada,
                turno: datos.turno,
                horasEstimadas: datos.horasEstimadas,
                ordenPrioridad: datos.ordenPrioridad,
                actualizadoEn: resultado.datos!.actualizadoEn,
                estadoPlaneacion: resultado.datos!.estadoPlaneacion,
              }
            : anterior));
        }
        // PLAN-1: el responsable se asigna con la RPC existente, solo si el
        // usuario eligió uno (null = quien sea reclame).
        if (datos.responsableId !== undefined) {
          const partidaResponsable = datos.tipo === 'crear'
            ? datos.partidaId
            : programacionSeleccionada?.partidaId;
          if (!partidaResponsable) {
            return { exito: false, error: 'No se pudo identificar la partida para asignar el responsable' };
          }
          const asignacion = await asignarResponsablePlaneacionAccion({
            partidaId: partidaResponsable,
            operadorId: datos.responsableId ?? null,
          });
          if (!asignacion.exito) {
            return {
              exito: false,
              error: `La operación quedó programada, pero no se pudo asignar el responsable: ${asignacion.error}`,
            };
          }
        }
        await actualizarCalendario();
        // Al reprogramar se conserva el panel abierto: así el usuario ve el
        // cambio aplicado y puede continuar con «Iniciar preparación» sin
        // volver a buscar la operación en el calendario.
        if (datos.tipo === 'crear') setPanelAbierto(false);
      }
      return resultado;
    },
    [actualizarCalendario, programacionSeleccionada],
  );

  const proponerHuecoPanel = useCallback(
    async (entrada: EntradaProponerHueco): Promise<ResultadoProponerHueco> =>
      proponerHuecoReprogramacionAccion(entrada),
    [],
  );

  const proponerPlanPanel = useCallback(
    async (entrada: EntradaProponerPlanMultidia): Promise<ResultadoProponerPlanMultidia> =>
      proponerPlanMultidiaAccion(entrada),
    [],
  );

  const enviarMultidia = useCallback(
    async (datos: DatosAsignacionMultidia): Promise<ResultadoAsignacionPlaneacion> => {
      const resultado = await programarOperacionMultidiaAccion({
        ordenId: datos.ordenId,
        partidaId: datos.partidaId,
        recursoId: datos.recursoId,
        metaProcesoId: datos.metaProcesoId,
        turno: datos.turno,
        horasTotales: datos.horasTotales,
        ordenPrioridad: datos.ordenPrioridad,
        dias: datos.dias,
      });
      if (resultado.exito) {
        setPanelAbierto(false);
        await actualizarCalendario();
      }
      return resultado;
    },
    [actualizarCalendario],
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

  const liberarPreparacion = useCallback(async (): Promise<ResultadoAsignacionPlaneacion> => {
    if (!programacionSeleccionada) {
      return { exito: false, error: 'Selecciona una programación para liberar la preparación' };
    }
    const resultado = await liberarPreparacionPlaneacionAccion({
      programacionId: programacionSeleccionada.id,
      actualizadoEnEsperado: programacionSeleccionada.actualizadoEn,
    });
    if (resultado.exito) await actualizarCalendario();
    return resultado;
  }, [actualizarCalendario, programacionSeleccionada]);

  const [pausaNotas, setPausaNotas] = useState('');

  const pausarOperacion = useCallback(async (): Promise<void> => {
    if (!programacionSeleccionada) return;
    const resultado = await pausarOperacionAdministrativaAccion({
      programacionId: programacionSeleccionada.id,
      notas: pausaNotas,
    });
    if (resultado.exito) {
      setPausaNotas('');
      setPanelAbierto(false);
      await actualizarCalendario();
    }
  }, [actualizarCalendario, pausaNotas, programacionSeleccionada]);

  const abrirProduccion = useCallback((): void => {
    const ordenId = programacionSeleccionada?.ordenId ?? detalleConcluido?.id ?? null;
    enrutador.push(ordenId ? `/produccion?ordenId=${ordenId}` : '/produccion');
  }, [detalleConcluido, enrutador, programacionSeleccionada]);

  const alSeleccionar = useCallback((programacion: ProgramacionArea | null): void => {
    if (!programacion) {
      setFechaSolicitada('');
      setPanelAbierto(false);
      setProgramacionSeleccionada(null);
      setDetalleConcluido(null);
      return;
    }

    setFechaSolicitada(programacion.fechaProgramada);

    // Programar u operar trabajo ya concluido no tiene sentido: la tarjeta abre
    // la ficha de resultados y, si toda la orden terminó, su entrega.
    if (operacionConcluida(programacion)) {
      setPanelAbierto(false);
      setProgramacionSeleccionada(null);
      setDetalleConcluido({
        id: programacion.ordenId,
        esOrdenConcluida: ordenConcluida({
          estado: programacion.ordenEstado,
          estadoSii: programacion.ordenEstadoSii,
        }),
      });
      return;
    }

    setDetalleConcluido(null);
    setPanelAbierto(true);
    setProgramacionSeleccionada((anterior) => {
      if (
        anterior?.id === programacion.id
        && anterior?.actualizadoEn === programacion.actualizadoEn
      ) {
        return anterior;
      }
      return programacion;
    });
  }, []);

  const programarCompromiso = useCallback((compromiso: CompromisoPlaneacion): void => {
    seleccionarProgramacion(null);
    setProgramacionSeleccionada(null);
    setDetalleConcluido(null);
    setFechaSolicitada(compromiso.fechaCompromiso);
    setPreseleccion({
      partidaId: compromiso.partidaId,
      fecha: compromiso.fechaCompromiso,
      horas: compromiso.horas,
    });
    setPanelAbierto(true);
  }, [seleccionarProgramacion]);

  // Punto 5b: la partida bloqueada por grupo de equipo abre el panel con su fecha
  // compromiso; el selector ya ordena las máquinas compatibles y bloquea guardar
  // con una máquina de otro grupo.
  const programarBloqueada = useCallback((partida: PartidaBloqueadaBolsa): void => {
    seleccionarProgramacion(null);
    setProgramacionSeleccionada(null);
    setDetalleConcluido(null);
    setFechaSolicitada(partida.fechaCompromiso ?? '');
    setPreseleccion({
      partidaId: partida.partidaId,
      fecha: partida.fechaCompromiso ?? hoyIso(),
      horas: partida.horas,
    });
    setPanelAbierto(true);
  }, [seleccionarProgramacion]);

  const solicitarReprogramacion = useCallback(
    (programacion: ProgramacionArea, fechaDestino: string): void => {
      if (operacionConcluida(programacion)) return;
      if (fechaDestino === programacion.fechaProgramada) return;
      setArrastre({ programacion, fechaDestino });
    },
    [],
  );

  const confirmarReprogramacionArrastre = useCallback(
    async (fecha: string, motivo: string): Promise<ResultadoAsignacionPlaneacion> => {
      if (!arrastre) return { exito: false, error: 'La reprogramación ya no está disponible' };
      const resultado = await reprogramarPartidaRecursoAccion({
        programacionId: arrastre.programacion.id,
        recursoId: arrastre.programacion.recursoId,
        fechaProgramada: fecha,
        turno: arrastre.programacion.turno,
        horasEstimadas: arrastre.programacion.horasEstimadas,
        ordenPrioridad: arrastre.programacion.ordenPrioridad,
        motivo,
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
    setFechaSolicitada('');
    setPanelAbierto(false);
    setDetalleConcluido(null);
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
        secuencia: sugerencia.metaProcesoId ? null : sugerencia.secuencia,
        metaProcesoId: sugerencia.metaProcesoId,
        fechaProgramada: sugerencia.fecha,
        turno: sugerencia.turno,
        horasEstimadas: sugerencia.horas,
        ordenPrioridad: 1,
      });
      if (!resultado.exito) {
        setBolsaError(resultado.error);
        setSugerenciaFallida(sugerencia);
        setErrorBolsaModal({ mensaje: resultado.error, codigo: resultado.codigo ?? null });
      } else {
        setBolsaMensaje(`${sugerencia.codigoPieza} programada el ${sugerencia.fecha}.`);
        setSugerenciaFallida(null);
        await actualizarCalendario();
        enrutador.refresh();
      }
      return resultado.exito
        ? { exito: true as const }
        : { exito: false as const, error: resultado.error };
    } catch {
      setBolsaError('No se pudo programar la sugerencia. Intenta de nuevo.');
      setSugerenciaFallida(sugerencia);
      setErrorBolsaModal({
        mensaje: 'No se pudo programar la sugerencia. Intenta de nuevo.',
        codigo: null,
      });
      return { exito: false as const, error: 'No se pudo programar la sugerencia' };
    } finally {
      setBolsaProcesando(false);
    }
  }, [actualizarCalendario, enrutador]);

  const cargaDestino = arrastre
    ? datosCalendario.cargas.find(
        (carga) =>
          carga.recursoId === arrastre.programacion.recursoId
          && carga.fechaProgramada === arrastre.fechaDestino,
      )
    : undefined;

  const partidaSolicitud = solicitudProgramacion
    ? partidasProgramables.find(
        (partida) => partida.partidaId === solicitudProgramacion.partidaId,
      )
    : undefined;
  const operacionSolicitudId = solicitudProgramacion?.metaProcesoId;
  const operacionSolicitud = operacionSolicitudId
    ? partidaSolicitud?.operaciones.find(
        (operacion) => operacion.metaProcesoId === operacionSolicitudId,
      )
    : undefined;

  const detalleConcluidoDatos = consultaDetalleConcluido.data ?? null;
  const esOrdenConcluidaDetalle = detalleConcluidoDatos
    ? ordenConcluida(detalleConcluidoDatos.orden)
    : detalleConcluido?.esOrdenConcluida ?? false;
  const entregaCompletaDetalle = (() => {
    const partidas = detalleConcluidoDatos?.orden.partidas ?? [];
    return partidas.length > 0
      && partidas.every((partida) => partida.cantidadEntregada >= partida.cantidadSolicitada);
  })();

  return (
    <div className="flex flex-col gap-4">
      {solicitudProgramacion && solicitudVisible ? (
        <section
          data-testid="solicitud-programacion-operador"
          aria-label="Solicitud de programación del operador"
          className="flex flex-col gap-2 rounded-xl border border-acento/40 bg-acento-suave/40 px-4 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-texto-primario">
                {`El operador ${solicitudProgramacion.operadorNombre} ha reclamado esta orden; programa la operación para que pueda trabajar`}
              </p>
              <p className="text-xs text-texto-secundario">
                {partidaSolicitud?.etiqueta ?? 'Partida de la solicitud'}
                {operacionSolicitud ? ` · ${operacionSolicitud.nombre}` : ''}
                {' · '}Fecha pedida: {solicitudProgramacion.fecha}
                {' · '}Turno {solicitudProgramacion.turno}
                {' · '}{solicitudProgramacion.horas} h
              </p>
              <p className="text-xs text-texto-secundario">
                {solicitudProgramacion.yaProgramada
                  ? 'La operación ya tiene una programación vigente. Búscala en el calendario para reprogramarla en lugar de crear otra.'
                  : 'El panel ya viene llenado con la solicitud del operador; confirma el recurso y guarda.'}
              </p>
            </div>
            <Button
              type="button"
              variante="fantasma"
              tamano="sm"
              aria-label="Ocultar solicitud de programación"
              onClick={() => setSolicitudVisible(false)}
            >
              ×
            </Button>
          </div>
        </section>
      ) : null}
      <ResumenCargaSemanal
        cargas={datosCalendario.cargas}
        recursos={datosCalendario.recursos}
        rango={rangoEfectivo}
        filtroRecursoId={recursoId}
        cargando={consulta.isFetching}
      />
      <PanelCapacidadInstalada />
      <PanelBolsaPlaneacion
        bolsa={bolsa ?? {
          pausadasSinPlan: [],
          activasSinFechaHoy: [],
          sugerencias: [],
          bloqueadasPorEquipo: [],
        }}
        procesando={bolsaProcesando}
        mensaje={bolsaMensaje}
        error={bolsaError}
        onAsignar={asignarSugerencia}
        onProgramarBloqueada={programarBloqueada}
      />
      <SincronizadorPlaneacionRealtime
        alCambiarEstructuraOperacion={refrescarEstructuraOperacion}
      />
      {/* El calendario conserva todo el ancho: el panel de programación flota a
          la derecha y no reacomoda la rejilla al abrirse o cerrarse. */}
      <CalendarioPlaneacion
        datos={datosCalendario}
        rangoInicial={rangoInicial}
        actualizando={consulta.isFetching}
        errorActualizacion={consulta.isError}
        desglosePartidas={desglosePartidas}
        programando={panelAbierto}
        onProgramar={() => {
          setPreseleccion(null);
          if (panelAbierto) {
            setPanelAbierto(false);
            if (programacionSeleccionada) cancelarSeleccion();
            return;
          }
          setProgramacionSeleccionada(null);
          setPanelAbierto(true);
        }}
        onSeleccionarProgramacion={alSeleccionar}
        onProgramarCompromiso={programarCompromiso}
        onSolicitarReprogramacion={solicitarReprogramacion}
        onRefrescarOperacion={refrescarEstructuraOperacion}
      />

      <Dialog
        open={panelAbierto}
        onOpenChange={(abierto) => {
          if (abierto) return;
          setPanelAbierto(false);
          if (programacionSeleccionada) cancelarSeleccion();
        }}
      >
        <DialogContent
          data-testid="panel-programar-partida"
          aria-label="Panel de programación"
          className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="shrink-0 gap-0.5 border-b border-borde px-4 py-3">
            <DialogTitle className="text-sm font-semibold">
              {programacionSeleccionada?.estadoPlaneacion === 'en_proceso'
                ? 'Pausar operación en marcha'
                : programacionSeleccionada ? 'Reprogramar operación' : 'Programar operación'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {programacionSeleccionada
                ? 'Ajusta recurso, fecha, turno u horas en una sola ventana.'
                : 'Operación, recurso, fecha, turno y horas.'}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-sutil px-4 py-4">
            {programacionSeleccionada?.estadoPlaneacion === 'en_proceso' ? (
              <section className="flex flex-col gap-3" data-testid="pausa-administrativa-planeacion">
                <p className="text-sm text-texto-secundario">
                  Esta operación ya está en marcha. No se puede reprogramar: pausa la sesión con un
                  motivo administrativo para que el operador lo vea en su vista.
                </p>
                {esAdmin ? (
                  <>
                    <label className="flex flex-col gap-1 text-xs text-texto-secundario" htmlFor="pausa-administrativa-notas">
                      Motivo de la pausa
                      <Textarea
                        id="pausa-administrativa-notas"
                        value={pausaNotas}
                        onChange={(evento) => setPausaNotas(evento.target.value)}
                        maxLength={1000}
                        rows={3}
                        data-testid="pausa-administrativa-notas"
                      />
                    </label>
                    <Button
                      type="button"
                      disabled={pausaNotas.trim().length < 3}
                      onClick={() => void pausarOperacion()}
                      data-testid="pausar-operacion-administrativa"
                    >
                      Pausar operación (administrativa)
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-texto-tenue">
                    Solo un administrador puede pausar una operación en marcha.
                  </p>
                )}
              </section>
            ) : (
            <PanelAsignacionPlaneacion
              recursos={datosCalendario.recursos}
              partidasProgramables={partidasProgramables}
              programacion={programacionSeleccionada}
              desglosePartidas={desglosePartidas}
              cargas={cargasPanel}
              partidasTotal={partidasTotal}
              compatibilidad={compatibilidad}
              operadores={operadores}
              verificandoCapacidad={verificandoCapacidad}
              onEnviar={enviarAsignacion}
              onActivarPreparacion={
                programacionSeleccionada && !programacionSeleccionada.esContinuacion
                  ? activarPreparacion
                  : undefined
              }
              onProponerHueco={proponerHuecoPanel}
              onProponerPlanMultidia={proponerPlanPanel}
              onEnviarMultidia={enviarMultidia}
              onCambiarFecha={setFechaSolicitada}
              onActualizarDatos={actualizarDatosPlaneacion}
              onAbrirProduccion={abrirProduccion}
              onLiberarPreparacion={
                programacionSeleccionada?.estadoPlaneacion === 'en_preparacion'
                  && !programacionSeleccionada.esContinuacion
                  ? liberarPreparacion
                  : undefined
              }
              preseleccion={preseleccion}
            />
            )}
            {programacionSeleccionada ? (
              <DetalleProgramacionPlaneacion
                programacion={programacionSeleccionada}
                onPausaAprobada={actualizarDatosPlaneacion}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {detalleConcluido ? (
        <aside
          id="panel-detalle-orden-concluida"
          data-testid="panel-detalle-orden-concluida"
          aria-label="Detalle de la orden concluida"
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-borde bg-superficie shadow-elevada sm:max-w-3xl"
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borde px-4 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[11px] uppercase tracking-wide text-texto-tenue">Orden concluida</p>
              <h2 className="font-mono text-lg font-bold text-texto-primario">
                {detalleConcluidoDatos?.orden.folio ?? 'Cargando orden…'}
              </h2>
              <p className="text-xs text-texto-secundario">
                Avance, procesos, material y archivos.{' '}
                {entregaCompletaDetalle
                  ? 'La orden ya está entregada por completo.'
                  : 'La entrega se registra aquí.'}
              </p>
            </div>
            <Button
              type="button"
              variante="fantasma"
              tamano="sm"
              aria-label="Cerrar detalle de la orden concluida"
              onClick={cancelarSeleccion}
            >
              ×
            </Button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scroll-sutil px-4 py-4">
            {consultaDetalleConcluido.isPending ? (
              <p className="text-sm text-texto-secundario" role="status">
                Cargando el detalle de la orden…
              </p>
            ) : consultaDetalleConcluido.isError ? (
              <div className="flex flex-col items-start gap-2" role="alert">
                <p className="text-sm font-medium text-peligro-texto">
                  No se pudo cargar la orden concluida.
                </p>
                <Button
                  type="button"
                  variante="contorno"
                  tamano="sm"
                  onClick={() => void consultaDetalleConcluido.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            ) : detalleConcluidoDatos ? (
              <DetalleOrdenConcluida
                orden={detalleConcluidoDatos.orden}
                areas={detalleConcluidoDatos.areas}
                responsables={detalleConcluidoDatos.responsables}
                recursos={detalleConcluidoDatos.recursos}
                esOrdenConcluida={esOrdenConcluidaDetalle}
                puedeEntregar={detalleConcluidoDatos.puedeEntregar}
                procesando={entregaProcesando}
                usuarioActualId={usuarioActualId}
                esAdmin={esAdmin}
                onEntregar={generarNotaConcluida}
              />
            ) : null}
          </div>
        </aside>
      ) : null}

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

      <DialogoErrorPlaneacion
        error={errorBolsaModal}
        onCerrar={() => setErrorBolsaModal(null)}
        onActualizarDatos={() => {
          actualizarDatosPlaneacion();
          setErrorBolsaModal(null);
        }}
        onAbrirProduccion={sugerenciaFallida
          ? () => {
              setErrorBolsaModal(null);
              enrutador.push(`/produccion?ordenId=${sugerenciaFallida.ordenId}`);
            }
          : undefined}
        onAbrirProgramacion={sugerenciaFallida
          ? () => {
              const sugerencia = sugerenciaFallida;
              setErrorBolsaModal(null);
              setPreseleccion({
                partidaId: sugerencia.partidaId,
                fecha: sugerencia.fecha,
                horas: sugerencia.horas,
              });
              setFechaSolicitada(sugerencia.fecha);
              setPanelAbierto(true);
            }
          : undefined}
      />
    </div>
  );
}
