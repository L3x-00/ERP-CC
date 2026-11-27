'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { cn } from '@/compartido/utilidades/cn';
import { horasJornadaDia } from '@/modulos/planeacion/utilidades/horario-laboral';
import type {
  CargaCapacidadDiaria,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  iniciarProcesoDirectoAccion,
  liberarReclamoAccion,
  moverReclamoAccion,
  reclamarProcesoAccion,
  validarOcupacionInicioAccion,
} from '@/modulos/produccion/acciones/espacio-operador';
import { reanudarSesionOperadorAccion } from '@/modulos/produccion/acciones/reanudar-sesion-operador';
import { cerrarPausaOperadorAccion } from '@/modulos/produccion/acciones/cerrar-pausa-operador';
import { cerrarSesionOperadorAccion } from '@/modulos/produccion/acciones/cerrar-sesion-operador';
import { pausarSesionJornadaAccion } from '@/modulos/produccion/acciones/pausar-sesion-jornada';
import { actualizarAvanceSesionAccion } from '@/modulos/produccion/acciones/actualizar-avance-sesion';
import { validarDisponibilidadInicioAccion } from '@/modulos/produccion/acciones/validar-disponibilidad-inicio';
import { mensajeSinDisponibilidad } from '@/modulos/produccion/utilidades/mensaje-disponibilidad';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import {
  VISTAS_ESPACIO_OPERADOR,
  agruparProcesosPorArea,
  agruparProcesosPorOrden,
  capacidadRestanteDia,
  type AreaEspacioOperador,
  type DiaCalendarioOperador,
  type GrupoOrdenEspacioOperador,
  type LoteTablero,
  type ProcesoEspacioOperador,
  type ResumenEspacioOperador,
  type TipoAccionTarjeta,
  type VerificacionInicio,
  type VistaEspacioOperador,
} from '@/modulos/produccion/tipos/indice';
import {
  horasLegibles,
  tiempoAcumuladoLegible,
} from '@/modulos/produccion/utilidades/formato-operador';
import { resumirJornadaDiaria } from '@/modulos/produccion/utilidades/mi-panel-operador';
import {
  sugerenciasDeAgrupacion,
  type SugerenciaCorrida,
} from '@/modulos/produccion/utilidades/agrupacion-corridas';
import { crearLoteDesdeSugerencia } from '@/modulos/produccion/utilidades/crear-lote-cliente';
import { DialogoChecklistInicio } from './dialogo-checklist-inicio';
import { DialogoConfirmarLote } from './dialogo-confirmar-lote';
import { DialogoDetalleLote } from './dialogo-detalle-lote';
import { DialogoErrorCierre, type DatosErrorCierre } from './dialogo-error-cierre';
import { DetalleOrdenOperador } from './detalle-orden-operador';
import {
  DetalleProcesoOperador,
  type AccionesDetalleProceso,
  type ResultadoOperacion,
} from './detalle-proceso-operador';
import { VistaAreasOperador } from './vista-areas-operador';
import { VistaCalendarioOperador } from './vista-calendario-operador';
import { VistaCargaEquipos } from './vista-carga-equipos';
import { VistaKanbanOperador } from './vista-kanban-operador';
import { MiPanelOperador } from './mi-panel-operador';
import type { MaterialPiso } from '@/modulos/ordenes/componentes/control-piso-panel';
import type { ConsumoMaterialVisible } from '@/modulos/produccion/utilidades/consumo-material-operador';
const ETIQUETAS_VISTA: Record<VistaEspacioOperador, string> = {
  kanban: 'Kanban',
  calendario: 'Calendario',
  carga: 'Carga',
  areas: 'Por área',
};

export interface PropsEspacioOperador {
  procesos: ProcesoEspacioOperador[];
  /** Lotes en curso que aún no abren sesión. */
  lotes?: LoteTablero[];
  areas: AreaEspacioOperador[];
  resumen: ResumenEspacioOperador;
  motivosPausa: MotivoPausaCatalogo[];
  hoy: string;
  /** Semana en curso con la carga reclamada por día. */
  dias: DiaCalendarioOperador[];
  /** Carga por equipo y día de la semana en curso (misma matriz de Planeación). */
  cargasEquipos: readonly CargaCapacidadDiaria[];
  recursosEquipos: readonly RecursoPlaneacion[];
  /** La lectura de capacidad falló; el resto de la terminal sigue disponible. */
  cargaEquiposError?: boolean;
  operadorId: string | null;
  soloLectura: boolean;
  nombreOperador: string;
  materiales: MaterialPiso[];
  consumos: ConsumoMaterialVisible[];
  /** Cierre de acceso al terminal, proporcionado por su contenedor. */
  onSalir?: () => void;
}

type Aviso = { tipo: 'ok' | 'error'; texto: string };

const RESUMEN = [
  { clave: 'aprobadas', etiqueta: 'Aprobadas', clase: 'text-info-texto' },
  { clave: 'enBandeja', etiqueta: 'Bandeja', clase: 'text-texto-primario' },
  { clave: 'enProceso', etiqueta: 'En proceso', clase: 'text-exito-texto' },
  { clave: 'pausadas', etiqueta: 'Pausadas', clase: 'text-advertencia-texto' },
  { clave: 'listas', etiqueta: 'Listas', clase: 'text-exito-texto' },
] as const;

/**
 * C10: espacio de operador. Reúne, en un solo tablero, las órdenes aprobadas y
 * liberadas con todo lo capturado en Propuestas/Planeación: cliente, pieza,
 * material, ruta de procesos, avances, archivos y sesiones. La reserva del día
 * y la capacidad de 8 h las valida PostgreSQL; la UI solo las refleja.
 */
export function EspacioOperador({
  procesos,
  lotes = [],
  areas,
  resumen,
  motivosPausa,
  hoy,
  dias,
  cargasEquipos,
  recursosEquipos,
  cargaEquiposError = false,
  operadorId,
  soloLectura,
  nombreOperador,
  materiales,
  consumos,
}: PropsEspacioOperador) {
  const enrutador = useRouter();
  const [vista, setVista] = useState<VistaEspacioOperador>('kanban');
  const [miPanelAbierto, setMiPanelAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [areaFiltro, setAreaFiltro] = useState('');
  const [offsetSemana, setOffsetSemana] = useState(0);
  const [detalle, setDetalle] = useState<ProcesoEspacioOperador | null>(null);
  const [ordenAbiertaId, setOrdenAbiertaId] = useState<string | null>(null);
  const [inicioPendiente, setInicioPendiente] = useState<ProcesoEspacioOperador | null>(null);
  const [corridaInicioId, setCorridaInicioId] = useState<string | null>(null);
  const [inicioFecha, setInicioFecha] = useState('');
  const [inicioTurno, setInicioTurno] = useState('matutino');

  function limpiarInicio(): void {
    setCorridaInicioId(null);
    setInicioPendiente(null);
    setInicioFecha('');
    setInicioTurno('matutino');
  }
  const [loteAbierto, setLoteAbierto] = useState<LoteTablero | null>(null);
  const [equipoOcupadoMensaje, setEquipoOcupadoMensaje] = useState<string | null>(null);
  const [errorDisponibilidad, setErrorDisponibilidad] = useState<DatosErrorCierre | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [creandoLote, setCreandoLote] = useState<string | null>(null);
  const [sugerenciaPorConfirmar, setSugerenciaPorConfirmar] = useState<SugerenciaCorrida | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Tras reclamar o mover, el servidor refresca los procesos y el detalle se
  // renderiza con el estado real sin guardar una copia obsoleta.
  const detalleActual = detalle
    ? procesos.find((proceso) => proceso.id === detalle.id) ?? detalle
    : null;
  const gruposOrden = useMemo(() => agruparProcesosPorOrden(procesos), [procesos]);
  const sugerenciasCorrida = useMemo(() => sugerenciasDeAgrupacion(procesos), [procesos]);
  const sugerenciaDetalle = sugerenciasCorrida.find((sugerencia) =>
    sugerencia.procesos.some((proceso) => proceso.id === detalleActual?.id)) ?? null;
  const ordenAbierta: GrupoOrdenEspacioOperador | null = ordenAbiertaId
    ? gruposOrden.find((grupo) => grupo.ordenId === ordenAbiertaId) ?? null
    : null;

  const operativo = !soloLectura && operadorId !== null;

  async function crearLote(sugerencia: SugerenciaCorrida): Promise<void> {
    if (!operativo || creandoLote !== null) {
      setAviso({
        tipo: 'error',
        texto: 'No se pudo crear el lote. Revisa tu sesión de operador e inténtalo de nuevo.',
      });
      setSugerenciaPorConfirmar(null);
      return;
    }
    setCreandoLote(sugerencia.clave);
    setAviso(null);
    // La Server Action revalida el pendiente de cada ítem: si cambió mientras
    // el diálogo estaba abierto, devuelve error en vez de crear con cantidades
    // obsoletas.
    const resultado = await crearLoteDesdeSugerencia(sugerencia);
    setCreandoLote(null);
    setSugerenciaPorConfirmar(null);
    setAviso({ tipo: resultado.exito ? 'ok' : 'error', texto: resultado.mensaje });
    if (resultado.exito) enrutador.refresh();
  }

  // C27: vigilante del tablero. La jornada es acumulada por día y la decide el
  // servidor: el cliente no compara reloj bruto contra 8 h (esa medición era la
  // causa del desfase). Solo consulta al servidor y refresca cuando pausó algo.
  useEffect(() => {
    if (!operativo) return;
    const sesionActiva = procesos
      .map((proceso) => proceso.sesionActiva)
      .find((sesion): sesion is NonNullable<typeof sesion> => sesion !== null);
    if (!sesionActiva) return;
    let cancelado = false;
    let falloAvisado = false;

    const revisar = async () => {
      const respuesta = await pausarSesionJornadaAccion({ sesionId: sesionActiva.id });
      if (cancelado) return;
      if (!respuesta.exito) {
        if (!falloAvisado) {
          falloAvisado = true;
          setAviso({
            tipo: 'error',
            texto: `No se pudo verificar la jornada del turno: ${respuesta.error}`,
          });
        }
        return;
      }
      falloAvisado = false;
      if ((respuesta.datos?.sesionesPausadas ?? 0) === 0) return;
      setAviso({
        tipo: 'error',
        texto: 'Se cumplió la jornada acumulada del día: la sesión se pausó automáticamente. '
          + 'Continúala en el siguiente turno o justifica horas extra si debes terminarla hoy.',
      });
      enrutador.refresh();
    };

    void revisar();
    const temporizador = window.setInterval(() => void revisar(), 60_000);
    return () => {
      cancelado = true;
      window.clearInterval(temporizador);
    };
  }, [procesos, operativo, enrutador]);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return procesos.filter((proceso) => {
      if (soloUrgentes && proceso.urgencia !== 'urgente' && proceso.urgencia !== 'vencida') {
        return false;
      }
      if (areaFiltro && (proceso.areaMacro ?? '') !== areaFiltro) return false;
      if (!termino) return true;
      return [
        proceso.folioOrden,
        proceso.folioSii,
        proceso.clienteNombre,
        proceso.codigoPieza,
        proceso.descripcion,
        proceso.procesoNombre,
        proceso.areaNombre,
        proceso.material?.codigo,
      ].some((valor) => (valor ?? '').toLowerCase().includes(termino));
    });
  }, [procesos, busqueda, soloUrgentes, areaFiltro]);

  const grupos = useMemo(() => agruparProcesosPorArea(filtrados, areas), [filtrados, areas]);
  // El lote sigue los mismos filtros que sus ítems: si ninguno es visible, no
  // se muestra una tarjeta huérfana en «En proceso».
  const lotesFiltrados = useMemo(() => {
    const partidasVisibles = new Set(filtrados.map((proceso) => proceso.partidaId));
    return lotes.filter((lote) => lote.items.some((item) => partidasVisibles.has(item.partidaId)));
  }, [lotes, filtrados]);

  // A18: el mismo criterio que Mi panel: solo sesiones cerradas dentro del día
  // de negocio. La vista de administrador no pertenece a un operador concreto.
  const horasTrabajadasHoy = useMemo(
    () => operadorId === null
      ? null
      : resumirJornadaDiaria(procesos, operadorId, hoy).horasConsolidadas,
    [procesos, operadorId, hoy],
  );

  const areasMacro = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const area of areas) {
      if (!area.padreCodigo) mapa.set(area.codigo, area.nombre);
    }
    return [...mapa.entries()].sort((primero, segundo) => primero[1].localeCompare(segundo[1], 'es'));
  }, [areas]);

  /** Carga del día propia; no descuenta reservas de otros operadores. */
  function cargaDelDia(fecha: string, proceso: ProcesoEspacioOperador): number {
    return procesos.reduce((total, actual) => {
      if (actual.id === proceso.id) return total;
      if (actual.reclamo?.fecha !== fecha) return total;
      if (!soloLectura && !actual.reclamadoPorMi) return total;
      return total + actual.reclamo.horasEstimadas;
    }, 0);
  }

  async function ejecutar(
    proceso: ProcesoEspacioOperador,
    accion: () => Promise<ResultadoOperacion>,
    mensajeExito: string,
  ): Promise<ResultadoOperacion> {
    setProcesando(proceso.id);
    setAviso(null);
    try {
      const resultado = await accion();
      if (resultado.exito) {
        setAviso({ tipo: 'ok', texto: mensajeExito });
        enrutador.refresh();
      } else {
        setAviso({ tipo: 'error', texto: resultado.error });
      }
      return resultado;
    } finally {
      setProcesando(null);
    }
  }

  async function reclamar(
    proceso: ProcesoEspacioOperador,
    fecha: string,
    turno: string,
  ): Promise<ResultadoOperacion> {
    if (soloLectura) return { exito: false, error: 'Vista de solo lectura' };
    return ejecutar(proceso, async () => {
      const respuesta = await reclamarProcesoAccion({
        ordenId: proceso.ordenId,
        partidaId: proceso.partidaId,
        metaProcesoId: proceso.metaProcesoId,
        fecha,
        turno,
      });
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Proceso reservado en tu jornada');
  }

  async function mover(
    proceso: ProcesoEspacioOperador,
    fecha: string,
    turno: string,
  ): Promise<ResultadoOperacion> {
    if (!proceso.reclamo) return reclamar(proceso, fecha, turno);
    if (soloLectura) return { exito: false, error: 'Vista de solo lectura' };
    return ejecutar(proceso, async () => {
      const respuesta = await moverReclamoAccion({
        reclamoId: proceso.reclamo!.id,
        fecha,
        turno,
      });
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Reserva movida al nuevo día');
  }

  async function liberar(proceso: ProcesoEspacioOperador): Promise<ResultadoOperacion> {
    if (!proceso.reclamo) return { exito: false, error: 'El proceso no tiene reserva' };
    return ejecutar(proceso, async () => {
      const respuesta = await liberarReclamoAccion({ reclamoId: proceso.reclamo!.id });
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Reserva liberada');
  }

  async function reanudar(proceso: ProcesoEspacioOperador): Promise<ResultadoOperacion> {
    if (!proceso.programacion) {
      return { exito: false, error: 'El proceso no tiene programación para reanudar' };
    }
    return ejecutar(proceso, async () => {
      const respuesta = await reanudarSesionOperadorAccion({
        ordenId: proceso.ordenId,
        partidaId: proceso.partidaId,
        programacionId: proceso.programacion!.id,
        actualizadoEnEsperado: proceso.programacion!.actualizadoEn,
      });
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Sesión reanudada y recurso reservado');
  }

  async function cerrarPausa(proceso: ProcesoEspacioOperador): Promise<ResultadoOperacion> {
    const sesion = proceso.ultimaSesion;
    if (!sesion || sesion.estadoSesion !== 'pausada') {
      return { exito: false, error: 'El proceso no tiene una pausa vigente' };
    }
    if (soloLectura) return { exito: false, error: 'Vista de solo lectura' };
    return ejecutar(proceso, async () => {
      const respuesta = await cerrarPausaOperadorAccion({ sesionId: sesion.id });
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Pausa cerrada sin producir. Las horas quedan registradas y la operación vuelve a estar disponible.');
  }

  async function actualizarAvance(
    proceso: ProcesoEspacioOperador,
    datos: {
      sesionId: string;
      piezasProducidas: number;
      horasReales: number;
      materialId?: string | null;
      cantidadUsada?: number;
      cantidadScrap?: number;
      motivoConsumo?: string | null;
      notas?: string;
    },
  ): Promise<ResultadoOperacion> {
    return ejecutar(proceso, async () => {
      const respuesta = await actualizarAvanceSesionAccion(datos);
      return respuesta.exito
        ? { exito: true, estadoSesion: respuesta.datos?.estadoSesion }
        : { exito: false, error: respuesta.error, ...(respuesta.codigo ? { codigo: respuesta.codigo } : {}) };
    }, 'Avance y hora real actualizados');
  }

  async function cerrar(
    proceso: ProcesoEspacioOperador,
    datos: {
      sesionId: string;
      piezasProducidas: number;
      estadoDestino: 'pausada' | 'finalizada';
      motivoPausa?: string;
      notas?: string;
      /** C27: hora real de conclusión cuando el operador olvidó cerrar. */
      horaFin?: string;
      consumo?: {
        materialId: string;
        cantidadUsada: number;
        cantidadScrap: number;
        motivo: string;
      };
    },
  ): Promise<ResultadoOperacion> {
    return ejecutar(proceso, async () => {
      const datosCierre = {
        sesionId: datos.sesionId,
        piezasProducidas: datos.piezasProducidas,
        estadoDestino: datos.estadoDestino,
        ...(datos.motivoPausa ? { motivoPausa: datos.motivoPausa } : {}),
        ...(datos.notas ? { notas: datos.notas } : {}),
        ...(datos.horaFin ? { horaFin: datos.horaFin } : {}),
        ...(datos.consumo ? { consumo: datos.consumo } : {}),
      };

      const respuesta = await cerrarSesionOperadorAccion({
        ...datosCierre,
        ...(proceso.metaProcesoId ? { metaProcesoId: proceso.metaProcesoId } : {}),
      });
      if (!respuesta.exito) {
        return {
          exito: false,
          error: respuesta.error,
          ...(respuesta.codigo ? { codigo: respuesta.codigo } : {}),
        };
      }
      if (!respuesta.datos) {
        return { exito: false, error: 'El cierre no devolvió una confirmación' };
      }
      return { exito: true, datos: respuesta.datos };
    }, 'Sesión registrada y recurso liberado');
  }

  async function confirmarInicio(
    verificacion: VerificacionInicio,
  ): Promise<ResultadoOperacion> {
    if (!inicioPendiente) {
      return { exito: false, error: 'Selecciona un proceso para iniciar' };
    }
    const proceso = inicioPendiente;
    if (inicioFecha === '') {
      return { exito: false, error: 'Indica la fecha de la jornada antes de iniciar.' };
    }
    return ejecutar(proceso, async () => {
      // Obs. cliente: la reserva se crea dentro de la acción de inicio.
      const respuesta = await iniciarProcesoDirectoAccion({
        ordenId: proceso.ordenId,
        partidaId: proceso.partidaId,
        metaProcesoId: proceso.metaProcesoId,
        fecha: inicioFecha,
        turno: inicioTurno as 'matutino' | 'vespertino' | 'nocturno',
        verificacion,
        ...(corridaInicioId ? { corridaId: corridaInicioId } : {}),
      });
      limpiarInicio();
      if (respuesta.exito) setDetalle(null);
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Sesión iniciada');
  }

  async function abrirInicio(
    proceso: ProcesoEspacioOperador,
    fecha: string,
    turno: string,
  ): Promise<void> {
    if (fecha === '') {
      limpiarInicio();
      setAviso({ tipo: 'error', texto: 'Indica la fecha de la jornada antes de iniciar.' });
      return;
    }
    const disponibilidad = await validarDisponibilidadInicioAccion({
      ordenId: proceso.ordenId,
      partidaId: proceso.partidaId,
      ...(proceso.metaProcesoId ? { metaProcesoId: proceso.metaProcesoId } : {}),
      ...(proceso.programacion?.id ? { programacionId: proceso.programacion.id } : {}),
    });
    if (disponibilidad.exito && !disponibilidad.datos?.disponible && disponibilidad.datos) {
      limpiarInicio();
      setErrorDisponibilidad({
        titulo: 'Sin equipo disponible',
        mensaje: mensajeSinDisponibilidad(disponibilidad.datos),
        etiquetaCerrar: 'Entendido',
      });
      return;
    }
    if (proceso.equipoOcupadoPor) {
      limpiarInicio();
      setEquipoOcupadoMensaje(proceso.equipoOcupadoPor);
      return;
    }
    if (proceso.reclamo) {
      const respuesta = await validarOcupacionInicioAccion({ reclamoId: proceso.reclamo.id });
      if (respuesta.exito && respuesta.datos?.ocupadoPor) {
        limpiarInicio();
        setEquipoOcupadoMensaje(respuesta.datos.ocupadoPor);
        return;
      }
    }
    setInicioFecha(fecha);
    setInicioTurno(turno);
    setInicioPendiente(proceso);
  }

  /** El lote se abre como una sola operación: un checklist y una sola corrida. */
  function abrirLote(lote: LoteTablero, fecha: string, turno: string): void {
    const nombres = new Set([lote.procesoNombre.trim().toLowerCase()]);
    const proceso = lote.items
      .map((item) => procesos.find((actual) => (
        actual.partidaId === item.partidaId && actual.secuencia === 1 && nombres.has(actual.procesoNombre.trim().toLowerCase())
      )))
      .find((actual): actual is ProcesoEspacioOperador => actual !== undefined)
      ?? procesos.find((actual) => lote.items.some((item) => item.partidaId === actual.partidaId));
    if (!proceso) {
      setAviso({ tipo: 'error', texto: 'No se pudo ubicar el proceso del lote. Actualiza la ficha y vuelve a abrirlo.' });
      return;
    }
    if (!proceso.puedeIniciar) {
      setAviso({ tipo: 'error', texto: proceso.motivoNoInicia ?? 'Este lote todavía no se puede iniciar.' });
      return;
    }
    setLoteAbierto(null);
    setCorridaInicioId(lote.id);
    void abrirInicio(proceso, fecha, turno);
  }

  function accionRapida(proceso: ProcesoEspacioOperador, tipo: TipoAccionTarjeta): void {
    if (tipo === 'reclamar' || tipo === 'iniciar') {
      // La fecha se completa en la ficha: no se hereda de la programación.
      setDetalle(proceso);
      return;
    }
    if (tipo === 'reanudar') {
      void reanudar(proceso);
      return;
    }
    setDetalle(proceso);
  }

  function soltarEnDia(proceso: ProcesoEspacioOperador, fecha: string): void {
    const jornada = horasJornadaDia(fecha);
    if (jornada === 0) {
      setAviso({
        tipo: 'error',
        texto: 'La empresa no labora ese día. Elige de lunes a sábado.',
      });
      return;
    }
    const libre = capacidadRestanteDia(cargaDelDia(fecha, proceso), fecha);
    if (proceso.horasEstimadas > libre) {
      setAviso({
        tipo: 'error',
        texto: `Ese día solo tiene ${horasLegibles(libre)} libres y el proceso requiere ${horasLegibles(proceso.horasEstimadas)}. Elige otro día.`,
      });
      return;
    }
    void (proceso.reclamo ? mover(proceso, fecha, proceso.reclamo.turno) : reclamar(proceso, fecha, 'matutino'));
  }

  const accionesDetalle: AccionesDetalleProceso = {
    reclamar,
    mover,
    liberar,
    iniciar: (proceso, fecha, turno) => {
      setDetalle(null);
      void abrirInicio(proceso, fecha, turno);
    },
    reanudar,
    cerrarPausa,
    actualizarAvance,
    cerrar,
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Espacio de operador" data-testid="espacio-operador">
      <header className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {horasTrabajadasHoy !== null ? (
              <span data-testid="horas-trabajadas-hoy">
                <Badge variante="exito">
                  Trabajado hoy: {tiempoAcumuladoLegible(horasTrabajadasHoy)}
                </Badge>
              </span>
            ) : null}
            <span data-testid="horas-reservadas-hoy">
              <Badge variante="info">
                Reservado hoy: {tiempoAcumuladoLegible(resumen.horasReclamadasHoy)} de{' '}
                {tiempoAcumuladoLegible(horasJornadaDia(hoy))}
              </Badge>
            </span>

            {resumen.urgentes > 0 ? (
              <Badge variante="peligro">
                {resumen.urgentes} urgente{resumen.urgentes === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="resumen-espacio">
          <div className="rounded-md bg-superficie-2 p-2">
            <dt className="text-xs text-texto-tenue">Total</dt>
            <dd className="text-lg font-bold tabular-nums">{resumen.total}</dd>
          </div>
          {RESUMEN.map((item) => (
            <div key={item.clave} className="rounded-md bg-superficie-2 p-2">
              <dt className="text-xs text-texto-tenue">{item.etiqueta}</dt>
              <dd className={cn('text-lg font-bold tabular-nums', item.clase)}>
                {resumen[item.clave]}
              </dd>
            </div>
          ))}
        </dl>

        <div
          className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
          data-testid="barra-herramientas-tablero"
        >
          <div
            className="grid w-full grid-cols-2 gap-1 rounded-lg border border-borde-fuerte p-1 sm:inline-flex sm:h-11 sm:w-auto sm:items-center sm:p-0"
            role="group"
            aria-label="Vista del espacio de operador"
            data-testid="grupo-vistas"
          >
            {VISTAS_ESPACIO_OPERADOR.map((valor) => (
              <button
                key={valor}
                type="button"
                aria-pressed={vista === valor}
                onClick={() => setVista(valor)}
                data-testid={`vista-${valor}`}
                className={cn(
                  'min-h-11 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40 sm:h-full sm:flex-none sm:rounded-none sm:py-0',
                  vista === valor
                    ? 'bg-acento-hover text-white dark:bg-acento dark:text-fondo'
                    : 'text-texto-secundario hover:bg-superficie-2',
                )}
              >
                {ETIQUETAS_VISTA[valor]}
              </button>
            ))}
          </div>

          {vista !== 'carga' ? (
            <div
              className="flex flex-col gap-2 sm:h-11 sm:flex-row sm:items-center"
              data-testid="grupo-filtros"
            >
              <Input
                className="h-11 sm:w-64"
                type="search"
                placeholder="Buscar folio, cliente, pieza…"
                aria-label="Buscar proceso"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
              />
              <Select
                className="h-11 sm:w-48"
                aria-label="Filtrar por área"
                value={areaFiltro}
                onChange={(evento) => setAreaFiltro(evento.target.value)}
              >
                <option value="">Todas las áreas</option>
                {areasMacro.map(([codigo, nombre]) => (
                  <option key={codigo} value={codigo}>{nombre}</option>
                ))}
              </Select>
              <Button
                variante={soloUrgentes ? 'destructivo' : 'contorno'}
                tamano="lg"
                aria-pressed={soloUrgentes}
                onClick={() => setSoloUrgentes((valor) => !valor)}
                data-testid="filtro-urgentes"
              >
                Solo urgentes
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {aviso ? (
        <p
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-md p-3 text-sm',
            aviso.tipo === 'error'
              ? 'bg-peligro-suave text-peligro-texto'
              : 'bg-exito-suave text-exito-texto',
          )}
          data-testid="aviso-espacio"
        >
          {aviso.texto}
        </p>
      ) : null}

      {vista === 'carga' ? (
        <VistaCargaEquipos
          cargas={cargasEquipos}
          recursos={recursosEquipos}
          hoy={hoy}
          error={cargaEquiposError}
          procesos={procesos}
        />
      ) : filtrados.length === 0 ? (
        <p className="rounded-lg border border-borde bg-superficie p-8 text-center text-sm text-texto-secundario">
          No hay procesos que coincidan con el filtro.
        </p>
      ) : vista === 'kanban' ? (
        <VistaKanbanOperador
          procesos={filtrados}
          lotes={lotesFiltrados}
          onAbrirLote={operativo ? (lote) => setLoteAbierto(lote) : undefined}
          hoy={hoy}
          soloLectura={soloLectura}
          onAbrir={setDetalle}
          onAbrirOrden={setOrdenAbiertaId}
          onReanudar={(proceso) => void reanudar(proceso)}
          onCerrarPausa={(proceso) => void cerrarPausa(proceso)}
          onActualizarAvance={setDetalle}
        />
      ) : vista === 'calendario' ? (
        <VistaCalendarioOperador
          procesos={procesos}
          disponibles={filtrados}
          hoy={hoy}
          offsetSemana={offsetSemana}
          soloLectura={soloLectura}
          procesando={procesando !== null}
          onCambiarSemana={setOffsetSemana}
          onAbrir={setDetalle}
          onAccion={accionRapida}
          onSoltar={soltarEnDia}
        />
      ) : (
        <VistaAreasOperador
          grupos={grupos}
          hoy={hoy}
          soloLectura={soloLectura}
          onAbrir={setDetalle}
          onAbrirOrden={setOrdenAbiertaId}
        />
      )}

      <section aria-label="Días de la semana" className="sr-only">
        <h3>Carga de la jornada</h3>
        <ul>
          {dias.map((dia) => (
            <li key={dia.fecha}>
              {dia.fecha}: {horasLegibles(dia.horasReclamadas)} de {dia.horasJornada} h
            </li>
          ))}
        </ul>
      </section>

      {vista !== 'calendario' && vista !== 'carga' && operativo ? (
        <p className="text-xs text-texto-tenue">
          «Reclamar» reserva el proceso para hoy en turno matutino. Para otro día, abre la ficha y
          elige fecha y turno, o arrástralo en el calendario.
        </p>
      ) : null}

      <DetalleProcesoOperador
        key={detalleActual?.id ?? 'sin-detalle'}
        proceso={detalleActual}
        hoy={hoy}
        soloLectura={soloLectura}
        procesando={procesando !== null}
        motivosPausa={motivosPausa}
        acciones={accionesDetalle}
        materiales={materiales}
        consumos={consumos}
        sugerenciaLote={sugerenciaDetalle}
        onCrearLote={setSugerenciaPorConfirmar}
        creandoLote={creandoLote !== null}
        onIniciarCorridaLote={detalleActual?.loteId
          ? () => {
            const lote = lotes.find((actual) => actual.id === detalleActual.loteId);
            if (lote) setLoteAbierto(lote);
          }
          : undefined}
        onCerrar={() => setDetalle(null)}
        onPausaAutomatica={() => enrutador.refresh()}
      />

      <DetalleOrdenOperador
        orden={ordenAbierta}
        hoy={hoy}
        onCerrar={() => setOrdenAbiertaId(null)}
        onAbrirProceso={(proceso) => {
          setOrdenAbiertaId(null);
          setDetalle(proceso);
        }}
      />

      <DialogoDetalleLote
        key={loteAbierto?.id ?? 'sin-lote'}
        lote={loteAbierto}
        puedeOperar={operativo}
        procesando={procesando !== null}
        onIniciar={abrirLote}
        onCerrar={() => setLoteAbierto(null)}
      />

      <DialogoChecklistInicio
        abierto={inicioPendiente !== null}
        procesando={procesando !== null}
        titulo={inicioPendiente
          ? `${inicioPendiente.folioOrden} · ${inicioPendiente.codigoPieza} · ${inicioPendiente.procesoNombre}`
          : 'Inicio de proceso'}
        procesoNombre={inicioPendiente?.procesoNombre}
        areaMacro={inicioPendiente?.areaMacro}
        onAbiertoCambiar={(abierto) => {
          if (!abierto) limpiarInicio();
        }}
        onConfirmar={confirmarInicio}
      />

      <DialogoConfirmarLote
        sugerencia={sugerenciaPorConfirmar}
        procesando={creandoLote !== null}
        onCancelar={() => setSugerenciaPorConfirmar(null)}
        onConfirmar={(sugerencia) => void crearLote(sugerencia)}
      />

      <DialogoErrorCierre
        error={equipoOcupadoMensaje ? {
          titulo: 'Equipo ocupado',
          mensaje: equipoOcupadoMensaje,
          etiquetaCerrar: 'Entendido',
        } : null}
        descripcion="No se abrió el checklist porque la máquina ya está en uso."
        testId="error-equipo-ocupado"
        onCerrar={() => setEquipoOcupadoMensaje(null)}
      />

      <DialogoErrorCierre
        error={errorDisponibilidad}
        descripcion="No se abrió el checklist: revisa la configuración indicada antes de iniciar."
        testId="error-disponibilidad-inicio"
        onCerrar={() => setErrorDisponibilidad(null)}
      />
            {operadorId !== null ? (
        <MiPanelOperador
          abierto={miPanelAbierto}
          onCerrar={() => setMiPanelAbierto(false)}
          nombreOperador={nombreOperador}
          operadorId={operadorId}
          procesos={procesos}
          hoy={hoy}
          onAbrirProceso={setDetalle}
        />
      ) : null}
    </section>
  );
}
