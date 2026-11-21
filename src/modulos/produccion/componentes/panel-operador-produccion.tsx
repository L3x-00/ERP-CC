'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { cn } from '@/compartido/utilidades/cn';
import { etiquetaEstado } from '@/compartido/utilidades/estados';
import { detalleMaterial, etiquetaMaterial } from '@/compartido/utilidades/material-etiqueta';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import { reabrirOperacionBloqueadaAccion, reasignarPartidaAccion } from '@/modulos/produccion/acciones/indice';
import { mensajeReaperturaOperacion, mensajeReasignacionPartida } from '@/modulos/produccion/utilidades/mensajes-reclamo-recurso';
import { MOTIVO_BLOQUEO_TEXTO } from '@/modulos/produccion/tipos/acciones-proceso';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import type { CierreSesionRegistrado } from '@/modulos/produccion/servicios/sesiones-servicio';
import type { MaterialPisoCatalogo } from '@/modulos/produccion/acciones/consultas-b6';
import type { SesionActivaProduccion } from '@/estado/uso-tienda-produccion';
import { type MotivoPausaSesion, type VerificacionInicio } from '@/modulos/produccion/tipos/indice';
import { etiquetaPiezasProceso } from '@/modulos/produccion/utilidades/procesos';
import {
  piezasUsadasEfectivas,
  validarConsumoPiezasCierre,
} from '@/modulos/produccion/utilidades/consumo-piezas';
import {
  ayudaLimitePiezas,
  validarCantidadPiezas,
} from '@/modulos/produccion/utilidades/limites-piezas';
import {
  ahoraHoraInputNegocio,
  fechaHoraNegocioDesdeHora,
  horaFinEsFutura,
} from '@/modulos/produccion/utilidades/horas-extra';
import { describirErrorProduccion } from '@/modulos/produccion/utilidades/mensajes-error-produccion';
import { fechaLocalNegocio } from '@/compartido/utilidades/fecha-negocio';

import { CampoEntero } from './campo-entero';
import { ContadorSesionVivo } from './contador-sesion-vivo';
import { DialogoChecklistInicio } from './dialogo-checklist-inicio';
import { DialogoErrorCierre, type DatosErrorCierre } from './dialogo-error-cierre';
import { solicitarHorasExtraAccion } from '../acciones/solicitar-horas-extra';
import { registrarInspeccionAccion } from '../acciones/registrar-inspeccion';
import { registrarConsumoPiezasAccion } from '../acciones/registrar-consumo-piezas';

type ResultadoOperacion = { exito: true; datos?: CierreSesionRegistrado } | { exito: false; error: string; codigo?: string };
type MensajePanelOperador = { texto: string; tipo: 'error' | 'estado'; codigo?: string };
type SesionOrden = OrdenTableroProduccion['sesiones'][number];
export type CierreSupervisor = {
  sesionId: string;
  piezasProducidas: number;
  estadoDestino: 'pausada' | 'finalizada';
  metaProcesoId?: string;
  motivoPausa?: string;
  notas?: string;
  consumo?: {
    materialId: string;
    cantidadUsada: number;
    cantidadScrap: number;
    motivo: string;
  };
  minutosSetup?: number;
};

type ResumenCierreSesion = {
  material: MaterialPisoCatalogo;
  cantidadUsada: number;
  cantidadMerma: number;
  notas: string | null;
  resultado: CierreSesionRegistrado;
};

export interface PropsPanelOperadorProduccion {
  orden: OrdenTableroProduccion | null;
  sesionActiva: SesionActivaProduccion | null;
  operadorDisponible: boolean;
  /** Vista de administrador: ofrece el piso completo en solo lectura, sin PIN. */
  esAdmin?: boolean;
  /** C31/A2: permiso real de `gestionar_planeacion`, resuelto en el servidor. */
  puedeReabrirOperacion?: boolean;
  /** C31/A4: permiso real de `gestionar_produccion`, resuelto en el servidor. */
  puedeReasignar?: boolean;
  procesando: boolean;
  /** SII-B6: corrida elegida en el panel de corridas (opcional). */
  corridaId?: string | null;
  motivosPausa: MotivoPausaCatalogo[];
  materiales?: readonly MaterialPisoCatalogo[];
  onIniciar: (datos: {
    ordenId: string;
    partidaId: string;
    programacionId: string;
    verificacion: VerificacionInicio;
    corridaId?: string;
  }) => Promise<ResultadoOperacion>;
  onReanudar: (datos: { ordenId: string; partidaId: string; programacionId: string; actualizadoEnEsperado: string }) => Promise<ResultadoOperacion>;
  responsables: Readonly<Record<string, string>>;
  /** Administrador: pausa o finaliza una sesión ajena sin pedir su PIN. */
  onCerrarComoSupervisor?: (datos: CierreSupervisor) => Promise<ResultadoOperacion>;
  onCerrar: (datos: {
    sesionId: string;
    piezasProducidas: number;
    estadoDestino: 'pausada' | 'finalizada';
    metaProcesoId?: string;
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
  }) => Promise<ResultadoOperacion>;
}

const ETIQUETAS_MOTIVO_LEGACY: Record<MotivoPausaSesion, string> = {
  falta_informacion: 'Falta de información',
  material_pendiente: 'Material pendiente',
  aprobacion_cliente: 'Aprobación de cliente',
  problema_tecnico: 'Problema técnico',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro',
};

const CLASE_ETIQUETA = 'flex flex-col gap-1 text-sm font-medium text-texto-secundario';

/** Panel rápido: el navegador solicita acciones, PostgreSQL confirma cada transición. */
export function PanelOperadorProduccion({
  orden,
  sesionActiva,
  operadorDisponible,
  esAdmin = false,
  puedeReabrirOperacion = false,
  puedeReasignar = false,
  procesando,
  corridaId = null,
  motivosPausa,
  materiales = [],
  onIniciar,
  onReanudar,
  responsables,
  onCerrarComoSupervisor,
  onCerrar,
}: PropsPanelOperadorProduccion) {
  const enrutador = useRouter();
  const clienteConsultas = useQueryClient();
  const preparaciones = useMemo(() => orden?.partidas.flatMap((partida) => (
    partida.programaciones
      .filter((programacion) => programacion.estadoPlaneacion === 'en_preparacion')
      .map((programacion) => ({
        partidaId: partida.id,
        programacionId: programacion.id,
        etiqueta: `${partida.codigoPieza} · ${programacion.fechaProgramada} / ${programacion.turno}`,
      }))
  )) ?? [], [orden]);
  // C31/A2: misma regla del diagnóstico C23 (sin sesión válida) para ofrecer
  // la reapertura solo donde la RPC realmente puede aplicarla.
  const bloqueadasSinSesion = useMemo(() => orden?.partidas.flatMap((partida) => (
    partida.programaciones
      .filter((programacion) => programacion.estadoPlaneacion === 'bloqueada'
        && !(orden.sesiones ?? []).some((sesion) => sesion.programacionId === programacion.id
          && (sesion.estadoSesion === 'activa' || sesion.estadoSesion === 'pausada')
          && !sesion.sesionInvalida
          && !sesion.recursoLiberado))
      .map((programacion) => ({
        partidaId: partida.id,
        partidaCodigo: partida.codigoPieza,
        programacionId: programacion.id,
        actualizadoEn: programacion.actualizadoEn,
      }))
  )) ?? [], [orden]);
  const [programacionId, setProgramacionId] = useState('');
  const [piezasProducidas, setPiezasProducidas] = useState('0');
  const [metaProcesoId, setMetaProcesoId] = useState('');
  const [estadoDestino, setEstadoDestino] = useState<'pausada' | 'finalizada'>('finalizada');
  const [motivoPausa, setMotivoPausa] = useState('');
  const [notas, setNotas] = useState('');
  // C27: hora real de conclusión. Solo se envía si el operador la corrige; de
  // lo contrario el servidor sella el cierre con su propio reloj.
  const horaFinRef = useRef<HTMLInputElement | null>(null);
  const horaFinEditada = useRef(false);
  const sesionHoraFinPrellenada = useRef<string | null>(null);

  // El prellenado escribe en el DOM y no en el estado: así el HTML del servidor
  // y el primer render del cliente coinciden (sin error de hidratación) y no se
  // provoca un render en cascada.
  useEffect(() => {
    const idSesion = sesionActiva?.id ?? null;
    if (sesionHoraFinPrellenada.current === idSesion) return;
    sesionHoraFinPrellenada.current = idSesion;
    horaFinEditada.current = false;
    const campo = horaFinRef.current;
    if (campo) campo.value = ahoraHoraInputNegocio();
  }, [sesionActiva?.id]);
  const [materialId, setMaterialId] = useState('');
  const [cantidadUsada, setCantidadUsada] = useState('0');
  const [cantidadMerma, setCantidadMerma] = useState('0');
  const [motivoConsumo, setMotivoConsumo] = useState('');
  const [mensaje, setMensaje] = useState<MensajePanelOperador | null>(null);
  // C31/A2: estado local por programación para evitar doble pulsación; la RPC
  // también es idempotente por correlation.
  const [reabriendo, setReabriendo] = useState<string | null>(null);
  const [mensajeReapertura, setMensajeReapertura] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const correlacionesReapertura = useRef<Record<string, string>>({});
  // C31/A4: reasignación administrativa con doble pulsación protegida.
  const [reasignando, setReasignando] = useState(false);
  const [mensajeReasignacion, setMensajeReasignacion] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const [partidaReasignar, setPartidaReasignar] = useState('');
  const [operadorReasignar, setOperadorReasignar] = useState('');
  const correlacionReasignacion = useRef<string | null>(null);
  const [resumenCierre, setResumenCierre] = useState<ResumenCierreSesion | null>(null);
  const [registrarInspeccionCierre, setRegistrarInspeccionCierre] = useState(false);
  const [resultadoInspeccionCierre, setResultadoInspeccionCierre] = useState<'APROBADA' | 'RECHAZADA'>('APROBADA');
  const [observacionesCierre, setObservacionesCierre] = useState('');
  const [mensajeInspeccionCierre, setMensajeInspeccionCierre] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const [primeraPiezaAbierta, setPrimeraPiezaAbierta] = useState(false);
  const [resultadoPrimeraPieza, setResultadoPrimeraPieza] = useState<'APROBADA' | 'RECHAZADA'>('APROBADA');
  const [observacionesPrimeraPieza, setObservacionesPrimeraPieza] = useState('');
  const [procesandoPrimeraPieza, setProcesandoPrimeraPieza] = useState(false);
  const [mensajePrimeraPieza, setMensajePrimeraPieza] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const [confirmarReanudacion, setConfirmarReanudacion] = useState(false);
  const [errorReanudacion, setErrorReanudacion] = useState<string | null>(null);
  const [confirmarChecklist, setConfirmarChecklist] = useState(false);
  const [expandido, setExpandido] = useState(sesionActiva !== null || operadorDisponible || (esAdmin && orden !== null));
  const [sesionSupervisor, setSesionSupervisor] = useState<{
    sesion: SesionOrden;
    destino: 'pausada' | 'finalizada';
  } | null>(null);
  const [errorCierre, setErrorCierre] = useState<DatosErrorCierre | null>(null);

  const sesionesEnPiso = useMemo(
    () => [...(orden?.sesiones ?? [])]
      .filter((sesion) => sesion.estadoSesion === 'activa' || sesion.estadoSesion === 'pausada')
      .sort((primera, segunda) => segunda.fechaInicio.localeCompare(primera.fechaInicio)),
    [orden?.sesiones],
  );
  // Realtime: la franja «En piso ahora» queda siempre visible; el panel de
  // acciones se abre por defecto para el administrador cuando hay una orden.
  function contextoDeSesion(sesion: SesionOrden): string {
    const partida = orden?.partidas.find((actual) => actual.id === sesion.partidaId);
    const programacion = partida?.programaciones.find(
      (actual) => actual.id === sesion.programacionId,
    );
    return [
      partida?.codigoPieza ?? 'Partida',
      programacion?.operacionNombre ?? null,
    ].filter((parte): parte is string => Boolean(parte)).join(' · ');
  }

  const seleccion = preparaciones.find((item) => item.programacionId === programacionId)
    ?? preparaciones[0]
    ?? null;
  // PRD-09: la sesión activa pertenece a una partida con metas; se preselecciona
  // el proceso de su programación y, si no coincide, el primero con pendientes.
  const partidaSesionActiva = sesionActiva
    ? orden?.partidas.find((partida) => partida.id === sesionActiva.partidaId) ?? null
    : null;
  const metasSesion = partidaSesionActiva?.metasProceso ?? [];
  const programacionSesionActiva = sesionActiva
    ? partidaSesionActiva?.programaciones.find(
      (programacion) => programacion.id === sesionActiva.programacionId,
    ) ?? null
    : null;
  const sesionActivaRegistro = sesionActiva
    ? orden?.sesiones.find((sesion) => sesion.id === sesionActiva.id) ?? null
    : null;
  const secuenciaProgramacion = programacionSesionActiva?.secuencia;
  const metaPorDefecto = metasSesion.find((meta) => meta.secuencia === secuenciaProgramacion)
    ?? metasSesion.find((meta) => meta.pendientePiezas > 0)
    ?? metasSesion[metasSesion.length - 1]
    ?? null;
  const metaSeleccionada = metasSesion.find((meta) => meta.id === metaProcesoId) ?? metaPorDefecto;
  const etiquetaPiezas = etiquetaPiezasProceso(metaSeleccionada?.nombre);
  // C17: la primera operación consume materia prima; las posteriores consumen
  // las piezas que liberó el proceso anterior.
  const esProcesoPosterior = typeof metaSeleccionada?.disponiblePiezas === 'number';
  const piezasDisponiblesPosterior = metaSeleccionada?.disponiblePiezas ?? 0;
  // Obs. cliente 2026-11-14: el tope visible coincide con la validación del
  // servidor (meta pendiente o piezas pendientes de la partida).
  const maximoPiezasCierre = metaSeleccionada
    ? Math.max(0, metaSeleccionada.pendientePiezas)
    : partidaSesionActiva
      && Number.isFinite(partidaSesionActiva.cantidadSolicitada)
      && Number.isFinite(partidaSesionActiva.cantidadProducida)
      ? Math.max(0, partidaSesionActiva.cantidadSolicitada - partidaSesionActiva.cantidadProducida)
      : null;
  const motivoSeleccionado = motivosPausa.find((motivo) => motivo.codigo === motivoPausa)
    ?? motivosPausa[0]
    ?? null;
  const materialSeleccionado = materiales.find((material) => material.id === materialId) ?? null;
  // El consumo capturado pertenece al proceso elegido: al cambiar de proceso
  // (Corte ↔ Doblado) no debe arrastrarse la captura del anterior. Se ajusta
  // durante el render (patrón recomendado por React) en vez de en un efecto.
  const [metaCapturada, setMetaCapturada] = useState(metaSeleccionada?.id ?? null);
  if ((metaSeleccionada?.id ?? null) !== metaCapturada) {
    setMetaCapturada(metaSeleccionada?.id ?? null);
    setCantidadUsada('0');
    setCantidadMerma('0');
    setMotivoConsumo('');
    setErrorCierre(null);
  }
  const ultimaPausa = (() => {
    if (!orden || orden.estadoKanban !== 'pausada') return null;
    const sesiones = [...orden.sesiones]
      .sort((primera, segunda) => segunda.creadoEn.localeCompare(primera.creadoEn)
        || segunda.id.localeCompare(primera.id));
    const programacionesVistas = new Set<string>();
    for (const sesion of sesiones) {
      if (programacionesVistas.has(sesion.programacionId)) continue;
      programacionesVistas.add(sesion.programacionId);
      if (sesion.estadoSesion !== 'pausada') continue;
      const partida = orden.partidas.find((item) => item.id === sesion.partidaId);
      const programacion = partida?.programaciones.find((item) =>
        item.id === sesion.programacionId && item.estadoPlaneacion === 'bloqueada');
      if (partida && programacion) {
        // Una operación ya terminada no se reanuda: la pausa solo espera el
        // consumo de material para cerrarse.
        const meta = partida.metasProceso.find((actual) => (programacion.metaProcesoId
          ? actual.id === programacion.metaProcesoId
          : actual.secuencia === programacion.secuencia)) ?? null;
        const completa = meta !== null && meta.pendientePiezas <= 0;
        // C29: sin piezas nuevas del proceso anterior no se reanuda; la pausa
        // se puede cerrar desde la ficha sin producir.
        const sinPiezas = !completa && meta !== null && meta.disponiblePiezas === 0;
        return {
          sesion,
          partida,
          programacion,
          completa,
          sinPiezas,
          procesoPrevioNombre: meta?.procesoPrevioNombre ?? null,
        };
      }
    }
    return null;
  })();

  async function reasignar(): Promise<void> {
    if (!partidaReasignar || !operadorReasignar) return;
    setMensajeReasignacion(null);
    setReasignando(true);
    const correlationId = correlacionReasignacion.current ?? crypto.randomUUID();
    correlacionReasignacion.current = correlationId;
    try {
      const resultado = await reasignarPartidaAccion({
        partidaId: partidaReasignar,
        operadorNuevoId: operadorReasignar,
        correlationId,
      });
      const partida = orden?.partidas.find((item) => item.id === partidaReasignar);
      setMensajeReasignacion(resultado.exito
        ? {
            tipo: 'ok',
            texto: mensajeReasignacionPartida(resultado.datos!, partida?.codigoPieza ?? 'La partida'),
          }
        : { tipo: 'error', texto: resultado.error });
      correlacionReasignacion.current = null;
      await clienteConsultas.invalidateQueries();
    } catch {
      correlacionReasignacion.current = null;
      setMensajeReasignacion({
        tipo: 'error',
        texto: 'No se pudo confirmar la reasignación. Recarga la orden: si el responsable ya cambió, la acción se registró.',
      });
    } finally {
      setReasignando(false);
    }
  }

  async function reabrir(item: (typeof bloqueadasSinSesion)[number]): Promise<void> {
    setMensajeReapertura(null);
    setReabriendo(item.programacionId);
    const correlationId = correlacionesReapertura.current[item.programacionId] ?? crypto.randomUUID();
    correlacionesReapertura.current[item.programacionId] = correlationId;
    try {
      const resultado = await reabrirOperacionBloqueadaAccion({
        programacionId: item.programacionId,
        correlationId,
      });
      setMensajeReapertura(resultado.exito
        ? {
            tipo: 'ok',
            texto: mensajeReaperturaOperacion(resultado.datos!, item.partidaCodigo),
          }
        : { tipo: 'error', texto: resultado.error });
      delete correlacionesReapertura.current[item.programacionId];
      await clienteConsultas.invalidateQueries();
    } catch {
      delete correlacionesReapertura.current[item.programacionId];
      setMensajeReapertura({
        tipo: 'error',
        texto: `No se pudo confirmar la reapertura de ${item.partidaCodigo}. Vuelve a cargar la orden: si la operación ya aparece como programada, el cambio se registró.`,
      });
    } finally {
      setReabriendo(null);
    }
  }

  async function reanudar(): Promise<void> {
    if (!orden || !ultimaPausa || ultimaPausa.completa) return;
    if (ultimaPausa.sinPiezas) {
      setErrorReanudacion(ultimaPausa.procesoPrevioNombre
        ? `Sin piezas de ${ultimaPausa.procesoPrevioNombre}: espera a que libere más piezas para reanudar.`
        : 'Sin piezas del proceso anterior: espera a que libere más piezas para reanudar.');
      return;
    }
    setErrorReanudacion(null);
    const resultado = await onReanudar({
      ordenId: orden.id, partidaId: ultimaPausa.partida.id,
      programacionId: ultimaPausa.programacion.id,
      actualizadoEnEsperado: ultimaPausa.programacion.actualizadoEn,
    });
    if (resultado.exito) {
      setConfirmarReanudacion(false);
      setMensaje({ texto: 'Sesión reanudada y recurso reservado', tipo: 'estado' });
    } else setErrorReanudacion(resultado.error);
  }

  async function confirmarInicio(verificacion: VerificacionInicio): Promise<ResultadoOperacion> {
    if (!orden || !seleccion) return { exito: false, error: 'Selecciona una partida preparada' };
    const resultado = await onIniciar({
      ordenId: orden.id,
      partidaId: seleccion.partidaId,
      programacionId: seleccion.programacionId,
      verificacion,
      ...(corridaId ? { corridaId } : {}),
    });
    setMensaje(resultado.exito
      ? { texto: 'Sesión iniciada', tipo: 'estado' }
      : { texto: resultado.error, tipo: 'error' });
    return resultado;
  }

  /** Muestra el fallo del cierre en el diálogo modal y en el aviso del panel. */
  function fallarCierre(
    texto: string,
    accion?: DatosErrorCierre['accion'],
    titulo?: string,
    etiquetaCerrar?: string,
  ): void {
    setMensaje({ texto, tipo: 'error' });
    setErrorCierre({
      titulo: titulo ?? 'No se pudo cerrar la sesión',
      mensaje: texto,
      ...(etiquetaCerrar ? { etiquetaCerrar } : {}),
      ...(accion ? { accion } : {}),
    });
  }

  async function cerrar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!sesionActiva) return;
    setErrorCierre(null);
    const piezas = Number(piezasProducidas);
    if (!Number.isInteger(piezas) || piezas < 0) {
      fallarCierre('Las piezas producidas deben ser un número entero.');
      return;
    }
    const errorLimite = validarCantidadPiezas(
      piezas,
      maximoPiezasCierre,
      etiquetaPiezas.toLowerCase(),
    );
    if (errorLimite) {
      fallarCierre(errorLimite);
      return;
    }
    const valorHoraFin = horaFinRef.current?.value ?? '';
    if (horaFinEditada.current && !/^\d{2}:\d{2}$/u.test(valorHoraFin)) {
      fallarCierre('Indica la hora real de conclusión.');
      return;
    }
    const fechaNegocioHora = sesionActivaRegistro?.fechaInicio
      ? fechaLocalNegocio(new Date(sesionActivaRegistro.fechaInicio))
      : null;
    if (horaFinEditada.current && fechaNegocioHora
      && horaFinEsFutura(valorHoraFin, fechaNegocioHora)) {
      const guiaHora = describirErrorProduccion('fecha_fin_futura');
      fallarCierre(
        guiaHora.mensaje,
        {
          etiqueta: guiaHora.accion,
          alElegir: () => {
            setMensaje(null);
            window.requestAnimationFrame(() => {
              document.querySelector<HTMLElement>(`[data-testid="${guiaHora.campo}"]`)?.focus();
            });
          },
        },
        guiaHora.accion,
        'Volver a revisar',
      );
      return;
    }
    const usada = Number(cantidadUsada);
    const merma = Number(cantidadMerma);
    // B7: el servidor decide si la ruta exige consumo. Si se captura, el motivo
    // es obligatorio; sin consumo no se exige material.
    const incluirConsumo = !esProcesoPosterior
      && estadoDestino === 'finalizada'
      && Boolean(materialSeleccionado)
      && Number.isFinite(usada)
      && Number.isFinite(merma)
      && usada >= 0
      && merma >= 0
      && usada + merma > 0;
    const incluirConsumoPiezas = esProcesoPosterior && estadoDestino === 'finalizada';
    // C17: si el operador no captura «Usado», se asume 1:1 con lo producido.
    const usadaConsumoPiezas = piezasUsadasEfectivas(usada, piezas, esProcesoPosterior);
    const nombreProcesoPrevio = metaSeleccionada?.procesoPrevioNombre ?? 'el proceso anterior';
    if (incluirConsumo && motivoConsumo.trim().length < 3) {
      fallarCierre(
        'Escribe por qué consumiste ese material. Necesitamos al menos 3 caracteres.',
        undefined,
        'Falta el motivo del consumo',
        'Volver a revisar',
      );
      return;
    }
    if (incluirConsumoPiezas) {
      const fallo = validarConsumoPiezasCierre({
        usada: usadaConsumoPiezas,
        merma,
        producidas: piezas,
        disponibles: piezasDisponiblesPosterior,
        procesoPrevio: nombreProcesoPrevio,
        procesoActual: metaSeleccionada?.nombre ?? 'el proceso actual',
      });
      if (fallo) {
        fallarCierre(
          fallo.mensaje,
          fallo.sugerirUsarProducidas
            ? {
                etiqueta: `Usar ${formatearNumero(piezas, 0)} piezas de ${nombreProcesoPrevio}`,
                alElegir: () => {
                  setCantidadUsada(String(piezas));
                  setMensaje(null);
                },
              }
            : undefined,
          fallo.titulo,
          'Volver a revisar',
        );
        return;
      }
      const totalPiezas = usadaConsumoPiezas + merma;
      if (totalPiezas > 0 && motivoConsumo.trim().length < 3) {
        fallarCierre(
          `Escribe por qué consumiste ${formatearNumero(totalPiezas, 0)} piezas de ${nombreProcesoPrevio}. Necesitamos al menos 3 caracteres.`,
          undefined,
          'Falta el motivo del consumo',
          'Volver a revisar',
        );
        return;
      }
    }
    const resultado = await onCerrar({
      sesionId: sesionActiva.id,
      piezasProducidas: Number(piezasProducidas),
      estadoDestino,
      ...(metaSeleccionada ? { metaProcesoId: metaSeleccionada.id } : {}),
      ...(estadoDestino === 'pausada' && motivoSeleccionado ? { motivoPausa: motivoSeleccionado.codigo } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      ...(horaFinEditada.current && valorHoraFin
        ? {
            horaFin: fechaHoraNegocioDesdeHora(
              valorHoraFin,
              sesionActivaRegistro?.fechaInicio
                ? fechaLocalNegocio(new Date(sesionActivaRegistro.fechaInicio))
                : fechaLocalNegocio(),
            ),
          }
        : {}),
      ...(incluirConsumo ? {
        consumo: {
          materialId,
          cantidadUsada: usada,
          cantidadScrap: merma,
          motivo: motivoConsumo.trim(),
        },
      } : {}),
    });
    if (resultado.exito) {
      setMensaje({ texto: 'Sesión registrada y recurso liberado', tipo: 'estado' });
      if (incluirConsumoPiezas && usadaConsumoPiezas + merma > 0) {
        const consumoPiezas = await registrarConsumoPiezasAccion({
          sesionId: sesionActiva.id,
          cantidadUsada: usadaConsumoPiezas,
          cantidadMerma: merma,
          motivo: motivoConsumo.trim(),
        });
        setMensaje(
          consumoPiezas.exito
            ? {
                texto: `Piezas consumidas: ${usadaConsumoPiezas} · merma: ${merma}.`,
                tipo: 'estado',
              }
            : {
                texto: `La sesión cerró, pero el consumo de piezas falló: ${consumoPiezas.error}`,
                tipo: 'error',
              },
        );
        if (!consumoPiezas.exito) {
          setErrorCierre({
            titulo: 'La sesión cerró, pero faltó registrar el consumo de piezas',
            mensaje: `${consumoPiezas.error} Corrige el consumo desde la ficha para no descontar de más del proceso anterior.`,
          });
        }
      }
    } else {
      setMensaje({
        texto: resultado.error,
        tipo: 'error',
        ...(resultado.codigo ? { codigo: resultado.codigo } : {}),
      });
      if (resultado.codigo === 'costo_material_no_configurado') {
        // Misma salida que en la ficha del proceso: el costo no se inventa, se
        // pausa la sesión y se avisa para que administración lo configure.
        const nombreMaterial = materialSeleccionado?.nombre ?? 'seleccionado';
        setErrorCierre({
          titulo: 'Falta el costo confirmado del material',
          mensaje: `${resultado.error} (${nombreMaterial}). No se puede finalizar sin valorizar el consumo. Pide a administración que registre el costo en Materiales y costos o pausa la sesión mientras tanto.`,
          acciones: [{
            etiqueta: 'Pausar sesión y avisar',
            alElegir: () => {
              setEstadoDestino('pausada');
              const motivoMaterial = motivosPausa.find((motivo) => motivo.codigo === 'MATERIAL');
              if (motivoMaterial) setMotivoPausa(motivoMaterial.codigo);
              const aviso = `Falta costo confirmado de ${nombreMaterial}`;
              setNotas((previo) => (previo.trim() ? `${previo.trim()} · ${aviso}` : aviso));
              setMensaje({
                texto: `${aviso}. La sesión quedó lista para pausar; revisa los datos y confirma.`,
                tipo: 'error',
              });
            },
          }],
        });
      } else if (resultado.codigo !== 'primera_pieza_pendiente') {
        setErrorCierre({
          titulo: 'No se pudo cerrar la sesión',
          mensaje: resultado.error,
          acciones: [{
            etiqueta: 'Revisar los datos y reintentar',
            alElegir: () => setMensaje(null),
          }],
        });
      }
      if (resultado.codigo === 'horas_extra_sin_autorizacion') {
        // C12: el operador no llena solicitudes; el sistema la deja pendiente
        // para que Admin/Management solo la apruebe o la rechace.
        const solicitud = await solicitarHorasExtraAccion({ sesionId: sesionActiva.id });
        if (solicitud.exito) {
          setMensaje({
            texto: `Solicitud de horas extra enviada (${formatearNumero(solicitud.datos?.horasAutorizadas ?? 0, 2)} h). Un responsable debe aprobarla antes de cerrar.`,
            tipo: 'estado',
          });
        }
      }
      return;
    }
    setNotas('');
    setMaterialId('');
    setCantidadUsada('0');
    setCantidadMerma('0');
    setMotivoConsumo('');
    if (incluirConsumo && materialSeleccionado && resultado.datos) {
      setResumenCierre({
        material: materialSeleccionado,
        cantidadUsada: usada,
        cantidadMerma: merma,
        notas: notas.trim() || null,
        resultado: resultado.datos,
      });
    }
    // C12: el operador registra la inspección de calidad del cierre; el panel
    // de administración solo consulta el resumen.
    if (estadoDestino === 'finalizada' && registrarInspeccionCierre && orden) {
      const aprobada = resultadoInspeccionCierre === 'APROBADA';
      const cantidad = Number(piezasProducidas);
      const inspeccion = await registrarInspeccionAccion({
        ordenId: orden.id,
        corridaId: corridaId ?? null,
        partidaId: sesionActiva.partidaId,
        codigoItem: partidaSesionActiva?.codigoPieza ?? '',
        tipo: 'CIERRE',
        resultado: resultadoInspeccionCierre,
        cantidadInspeccionada: cantidad,
        cantidadOk: aprobada ? cantidad : 0,
        cantidadNok: aprobada ? 0 : cantidad,
        cantidadRetrabajo: aprobada ? 0 : cantidad,
        cantidadScrap: 0,
        sesionId: sesionActiva.id,
        ...(observacionesCierre.trim() ? { observaciones: observacionesCierre.trim() } : {}),
      });
      setMensajeInspeccionCierre(
        inspeccion.exito
          ? { tipo: 'ok', texto: 'Inspección de cierre registrada.' }
          : { tipo: 'error', texto: `La sesión cerró, pero la inspección falló: ${inspeccion.error}` },
      );
      setRegistrarInspeccionCierre(false);
      setObservacionesCierre('');
    }
  }

  /**
   * Cierre bloqueado por primera pieza: el operador la libera aquí mismo, sin
   * cambiar de pantalla, y luego reintenta el cierre.
   */
  async function liberarPrimeraPieza(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!sesionActiva || !orden || procesandoPrimeraPieza) return;
    setProcesandoPrimeraPieza(true);
    setMensajePrimeraPieza(null);
    try {
      const aprobada = resultadoPrimeraPieza === 'APROBADA';
      const respuesta = await registrarInspeccionAccion({
        ordenId: orden.id,
        corridaId: corridaId ?? null,
        partidaId: sesionActiva.partidaId,
        codigoItem: partidaSesionActiva?.codigoPieza ?? '',
        tipo: 'PRIMERA_PIEZA',
        resultado: resultadoPrimeraPieza,
        cantidadInspeccionada: 1,
        cantidadOk: aprobada ? 1 : 0,
        cantidadNok: aprobada ? 0 : 1,
        cantidadRetrabajo: 0,
        ...(observacionesPrimeraPieza.trim()
          ? { observaciones: observacionesPrimeraPieza.trim() }
          : {}),
      });
      if (!respuesta.exito) {
        setMensajePrimeraPieza({ tipo: 'error', texto: respuesta.error });
        return;
      }
      setMensajePrimeraPieza({
        tipo: 'ok',
        texto: aprobada
          ? 'Primera pieza liberada. Ya puedes cerrar la sesión.'
          : 'Primera pieza rechazada: corrige la pieza y vuelve a liberarla.',
      });
      setPrimeraPiezaAbierta(false);
    } catch {
      setMensajePrimeraPieza({
        tipo: 'error',
        texto: 'No se pudo registrar la primera pieza. Revisa la corrida y vuelve a intentarlo.',
      });
    } finally {
      setProcesandoPrimeraPieza(false);
    }
  }

  return (
    <section
      id="panel-operador-produccion"
      className="rounded-lg border border-borde bg-superficie p-4"
      aria-labelledby="titulo-panel-operador"
      data-testid="panel-operador-produccion"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="titulo-panel-operador" className="text-base font-semibold text-texto-primario">
            Panel de operador
          </h2>
          {orden ? (
            <p className="mt-1 text-sm text-texto-secundario" data-testid="orden-seleccionada-panel">
              Orden seleccionada: <span className="font-mono font-medium text-texto-primario">{orden.folio}</span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-borde px-3 text-xs font-medium text-texto-secundario transition-colors hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
          aria-expanded={expandido}
          aria-controls="contenido-panel-operador"
          onClick={() => setExpandido((valor) => !valor)}
          data-testid="alternar-panel-operador"
        >
          {expandido ? 'Ocultar' : 'Abrir'}
          <span
            aria-hidden
            className={cn('transition-transform duration-300', expandido ? 'rotate-180' : 'rotate-0')}
          >
            ▾
          </span>
        </button>
      </div>
      <p className="mt-1 text-sm text-texto-secundario">
        {operadorDisponible
          ? 'La identidad de piso está confirmada por sesión HMAC.'
          : esAdmin
            ? 'Vista de administrador (sin PIN): consulta quién trabaja y finaliza su sesión sólo si es necesario.'
            : 'Ingresa por /operador con tu PIN antes de iniciar o cerrar una sesión.'}
      </p>
      {corridaId ? (
        <p className="mt-1 text-xs text-texto-secundario">
          Corrida seleccionada: <span className="font-mono">{corridaId.slice(0, 8)}</span>
        </p>
      ) : null}

      {sesionesEnPiso.length > 0 ? (
        <div
          className="mt-3 rounded-md border border-borde bg-superficie-2/50 p-3"
          data-testid="operadores-en-piso"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
            En piso ahora
          </p>
          <ul className="mt-1 grid gap-1 text-sm">
            {sesionesEnPiso.map((sesion) => (
              <li key={sesion.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <strong className="text-texto-primario">
                    {responsables[sesion.operadorId] ?? 'Operador histórico'}
                  </strong>
                  <span className="text-texto-secundario"> · {contextoDeSesion(sesion)}</span>
                </span>
                <span className="text-xs text-texto-secundario">
                  {sesion.estadoSesion === 'activa' ? 'Trabajando' : 'En pausa'} ·{' '}
                  {formatearHora(sesion.fechaInicio)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-xs text-texto-tenue" data-testid="sin-operador-en-piso">
          Ningún operador tiene una sesión activa en esta orden.
        </p>
      )}

      <div
        id="contenido-panel-operador"
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          expandido ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-clip" inert={!expandido ? true : undefined}>
          {!operadorDisponible ? (
            esAdmin ? (
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                className="mt-3 self-start"
                data-testid="abrir-vista-piso-admin"
                onClick={() => enrutador.push('/produccion-piso')}
              >
                Ver piso (solo lectura)
              </Button>
            ) : (
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                className="mt-3 self-start"
                data-testid="abrir-terminal-operador"
                onClick={() => enrutador.push('/operador')}
              >
                Abrir terminal de operador (/operador)
              </Button>
            )
          ) : null}
          {mensaje ? (
            <p
              className={mensaje.tipo === 'error' ? 'mt-3 text-sm text-peligro-texto' : 'mt-3 text-sm text-exito-texto'}
              role={mensaje.tipo === 'error' ? 'alert' : 'status'}
            >
              {mensaje.texto}
            </p>
          ) : null}

      {esAdmin && !operadorDisponible ? (
        <div className="mt-4 flex flex-col gap-3" data-testid="admin-panel-operador">
          <p className="text-sm text-texto-secundario">
            Como administrador no capturas producción aquí: el operador inicia y cierra su sesión.
            Si una sesión quedó abierta, puedes pausarla o finalizarla para liberar la orden.
          </p>
          {sesionesEnPiso.length === 0 ? (
            <p className="text-sm text-texto-tenue">
              No hay una sesión de operador que finalizar en esta orden.
            </p>
          ) : (
            <ul className="grid gap-2">
              {sesionesEnPiso.map((sesion) => (
                <li
                  key={sesion.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde p-3"
                  data-testid={`sesion-supervisor-${sesion.id}`}
                >
                  <span className="text-sm">
                    <strong>{responsables[sesion.operadorId] ?? 'Operador histórico'}</strong>
                    <span className="text-texto-secundario"> · {contextoDeSesion(sesion)}</span>
                    <span className="block text-xs text-texto-secundario">
                      {sesion.estadoSesion === 'activa' ? 'Trabajando' : 'En pausa'} desde{' '}
                      {formatearFecha(sesion.fechaInicio)} {formatearHora(sesion.fechaInicio)}
                    </span>
                  </span>
                  {onCerrarComoSupervisor ? (
                    <span className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variante="contorno"
                        tamano="sm"
                        disabled={procesando}
                        onClick={() => { setMensaje(null); setSesionSupervisor({ sesion, destino: 'finalizada' }); }}
                        data-testid={`finalizar-sesion-supervisor-${sesion.id}`}
                      >
                        Finalizar sin producir
                      </Button>
                      <Button
                        type="button"
                        variante="contorno"
                        tamano="sm"
                        disabled={procesando}
                        onClick={() => { setMensaje(null); setSesionSupervisor({ sesion, destino: 'pausada' }); }}
                        data-testid={`pausar-sesion-supervisor-${sesion.id}`}
                      >
                        Pausar sesión
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : sesionActiva ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={cerrar}>
          <p className="text-sm text-texto-secundario">Sesión activa en la orden seleccionada.</p>
          {sesionActivaRegistro ? (
            <div
              className="flex flex-wrap items-center gap-2 rounded-md border border-borde bg-superficie-2/60 px-3 py-2 text-sm"
              data-testid="sesion-en-curso-panel"
            >
              <span className="text-texto-secundario">
                Inició {formatearFecha(sesionActivaRegistro.fechaInicio)}{' '}
                {formatearHora(sesionActivaRegistro.fechaInicio)}
              </span>
              <ContadorSesionVivo
                fechaInicio={sesionActivaRegistro.fechaInicio}
                limiteHoras={programacionSesionActiva?.horasEstimadas ?? null}
                testId="contador-sesion-panel"
              />
            </div>
          ) : null}
          <div className="grid gap-1">
            <label className={CLASE_ETIQUETA}>
              {etiquetaPiezas} ahora
              <CampoEntero
                className="min-h-11"
                valor={piezasProducidas}
                onValorCambiar={setPiezasProducidas}
                required
              />
            </label>
            {maximoPiezasCierre !== null ? (
              <span className="text-xs font-normal text-texto-tenue">
                {ayudaLimitePiezas(maximoPiezasCierre)}
              </span>
            ) : null}
          </div>
          {metasSesion.length > 1 ? (
            <label className={CLASE_ETIQUETA}>
              Proceso trabajado
              <Select
                className="min-h-11"
                data-testid="meta-proceso-cierre"
                value={metaSeleccionada?.id ?? ''}
                onChange={(evento) => setMetaProcesoId(evento.target.value)}
              >
                {metasSesion.map((meta) => (
                  <option key={meta.id} value={meta.id}>
                    {meta.nombre} · {formatearNumero(meta.hechoPiezas, 0)}/{formatearNumero(meta.metaPiezas, 0)}
                    {' · '}{formatearNumero(meta.pendientePiezas, 0)} pend · {Math.round(meta.porcentaje)}%
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label className={CLASE_ETIQUETA}>
            Resultado
            <Select
              className="min-h-11"
              value={estadoDestino}
              onChange={(evento) => setEstadoDestino(evento.target.value as 'pausada' | 'finalizada')}
            >
              <option value="finalizada">Finalizar sesión</option>
              <option value="pausada">Pausar sesión</option>
            </Select>
          </label>
          <label className={CLASE_ETIQUETA}>
            Hora real de conclusión
            <Input
              ref={horaFinRef}
              type="time"
              className="min-h-11"
              defaultValue=""
              required
              onChange={() => {
                horaFinEditada.current = true;
              }}
              data-testid="hora-fin-cierre-panel"
            />
            <span className="text-xs font-normal text-texto-tenue">
              Si el proceso terminó antes y olvidaste cerrar la sesión, corrige esta hora para no
              cargar horas de más.
            </span>
          </label>
          {estadoDestino === 'pausada' ? (
            <label className={CLASE_ETIQUETA}>
              Motivo de pausa
              <Select
                className="min-h-11"
                value={motivoSeleccionado?.codigo ?? ''}
                onChange={(evento) => setMotivoPausa(evento.target.value)}
              >
                {motivosPausa.map((motivo) => (
                  <option key={motivo.codigo} value={motivo.codigo}>
                    {motivo.nombre}{motivo.requiereNota ? ' (nota obligatoria)' : ''}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {estadoDestino === 'finalizada' ? (
            <fieldset className="grid gap-3 rounded-lg border border-borde p-3">
              <legend className="px-1 text-sm font-semibold text-texto-primario">Consumo de material</legend>
              {esProcesoPosterior ? (
                <>
                  <label className={CLASE_ETIQUETA}>
                    Material
                    <Select
                      className="min-h-11"
                      value={sesionActiva.partidaId}
                      disabled
                    >
                      <option value={sesionActiva.partidaId}>
                        {partidaSesionActiva?.codigoPieza ?? 'Pieza'} — {metaSeleccionada?.procesoPrevioNombre ?? 'piezas del proceso anterior'} ({piezasDisponiblesPosterior} disponibles)
                      </option>
                    </Select>
                    <span className="text-xs font-normal text-texto-tenue">
                      Piezas liberadas por el proceso anterior. No se consume la lámina completa.
                    </span>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={CLASE_ETIQUETA}>
                      Usado
                      <CampoEntero
                        className="min-h-11"
                        valor={cantidadUsada}
                        onValorCambiar={setCantidadUsada}
                      />
                    </label>
                    <label className={CLASE_ETIQUETA}>
                      Merma
                      <CampoEntero
                        className="min-h-11"
                        valor={cantidadMerma}
                        onValorCambiar={setCantidadMerma}
                      />
                    </label>
                  </div>
                  <span className="text-xs font-normal text-texto-tenue">
                    Piezas de {metaSeleccionada?.procesoPrevioNombre ?? 'el proceso anterior'} que consumiste. Usado + merma descuenta del inventario de piezas (disponibles: {piezasDisponiblesPosterior}). Debe ser al menos lo producido; si dejas «Usado» en 0, se toma 1:1.
                  </span>
                </>
              ) : (
                <>
                  {materiales.length === 0 ? (
                    <p role="alert" className="text-sm text-advertencia-texto">
                      No hay materiales activos para registrar el cierre.
                    </p>
                  ) : (
                    <div className={CLASE_ETIQUETA}>
                      <label htmlFor="material-cierre-operador">Material</label>
                      <Select
                        className="min-h-11"
                        id="material-cierre-operador"
                        aria-describedby={
                          materialSeleccionado ? 'material-cierre-unidad' : undefined
                        }
                        value={materialId}
                        onChange={(evento) => setMaterialId(evento.target.value)}
                      >
                        <option value="">Selecciona un material</option>
                        {materiales.map((material) => (
                          <option
                            key={material.id}
                            value={material.id}
                            title={detalleMaterial(material.codigo, material.nombre, material.unidadBase)}
                          >
                            {etiquetaMaterial(material.codigo, material.nombre)}
                          </option>
                        ))}
                      </Select>
                      {materialSeleccionado ? (
                        <span
                          id="material-cierre-unidad"
                          className="text-xs font-normal text-texto-tenue"
                        >
                          Unidad del material: {materialSeleccionado.unidadBase}. Usado y merma se capturan en esa unidad.
                        </span>
                      ) : null}
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={CLASE_ETIQUETA}>
                      Usado
                      <Input
                        className="min-h-11"
                        type="number"
                        min="0"
                        step="any"
                        value={cantidadUsada}
                        onChange={(evento) => setCantidadUsada(evento.target.value)}
                      />
                    </label>
                    <label className={CLASE_ETIQUETA}>
                      Merma
                      <Input
                        className="min-h-11"
                        type="number"
                        min="0"
                        step="any"
                        value={cantidadMerma}
                        onChange={(evento) => setCantidadMerma(evento.target.value)}
                      />
                    </label>
                  </div>
                </>
              )}
              <label className={CLASE_ETIQUETA}>
                Motivo del consumo
                <Input
                  className="min-h-11"
                  maxLength={200}
                  value={motivoConsumo}
                  onChange={(evento) => setMotivoConsumo(evento.target.value)}
                  placeholder={esProcesoPosterior
                    ? 'Para qué se usaron las piezas del proceso anterior'
                    : 'Para qué se usó el material'}
                  data-testid="motivo-consumo"
                />
                <span className="text-xs font-normal text-texto-tenue">
                  Obligatorio cuando registras consumo o merma.
                </span>
              </label>
            </fieldset>
          ) : null}
          {estadoDestino === 'finalizada' ? (
            <div className="grid gap-3 rounded-lg border border-borde p-3">
              <label className="flex items-start gap-2 text-sm font-medium text-texto-primario">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={registrarInspeccionCierre}
                  onChange={(evento) => setRegistrarInspeccionCierre(evento.target.checked)}
                  data-testid="registrar-inspeccion-cierre"
                />
                <span>
                  Registrar inspección de cierre
                  <span className="block text-xs font-normal text-texto-secundario">
                    Queda como evidencia de calidad del lote terminado.
                  </span>
                </span>
              </label>
              {registrarInspeccionCierre ? (
                <>
                  <label className={CLASE_ETIQUETA}>
                    Resultado de la revisión
                    <Select
                      className="min-h-11"
                      data-testid="resultado-inspeccion-cierre"
                      value={resultadoInspeccionCierre}
                      onChange={(evento) =>
                        setResultadoInspeccionCierre(evento.target.value as 'APROBADA' | 'RECHAZADA')
                      }
                    >
                      <option value="APROBADA">Aprobada</option>
                      <option value="RECHAZADA">Rechazada</option>
                    </Select>
                  </label>
                  <label className={CLASE_ETIQUETA}>
                    Observaciones (opcional)
                    <Textarea
                      className="min-h-11"
                      maxLength={1000}
                      value={observacionesCierre}
                      onChange={(evento) => setObservacionesCierre(evento.target.value)}
                      placeholder="Detalles de la revisión final"
                    />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
          <label className={CLASE_ETIQUETA}>
            Notas operativas{estadoDestino === 'pausada' && motivoSeleccionado?.requiereNota ? ' (obligatorias)' : ''}
            <Textarea
              className="min-h-11"
              maxLength={1000}
              value={notas}
              onChange={(evento) => setNotas(evento.target.value)}
              required={estadoDestino === 'pausada' && motivoSeleccionado?.requiereNota === true}
            />
          </label>
          {mensaje?.tipo === 'error' && mensaje.codigo === 'primera_pieza_pendiente' ? (
            <section
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-advertencia/60 bg-advertencia-suave p-3"
              data-testid="aviso-primera-pieza"
            >
              <p className="text-sm font-semibold text-advertencia-texto">
                Falta liberar la primera pieza antes de declarar producción
              </p>
              <p className="text-xs text-texto-secundario">
                Regístrala aquí mismo; no necesitas cambiar de pantalla.
              </p>
              {mensajePrimeraPieza ? (
                <p
                  role={mensajePrimeraPieza.tipo === 'error' ? 'alert' : 'status'}
                  className={cn(
                    'text-xs',
                    mensajePrimeraPieza.tipo === 'error' ? 'text-peligro-texto' : 'text-exito-texto',
                  )}
                >
                  {mensajePrimeraPieza.texto}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  tamano="sm"
                  onClick={() => {
                    setMensajePrimeraPieza(null);
                    setPrimeraPiezaAbierta(true);
                  }}
                  data-testid="abrir-liberar-primera-pieza"
                >
                  Liberar primera pieza
                </Button>
                {mensajePrimeraPieza?.tipo === 'ok' ? (
                  <Button
                    type="submit"
                    tamano="sm"
                    variante="contorno"
                    disabled={procesando}
                    data-testid="continuar-cierre-primera-pieza"
                  >
                    Continuar con el cierre
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
          <Button type="submit" tamano="lg" disabled={procesando || !operadorDisponible} data-testid="cerrar-sesion-produccion">
            {estadoDestino === 'pausada' ? 'Pausar sesión' : 'Finalizar sesión'}
          </Button>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {!orden ? <p className="text-sm text-texto-secundario">Selecciona una orden del Kanban.</p> : null}
          {orden && preparaciones.length === 0 && !ultimaPausa ? (
            <div className="flex flex-col gap-2 rounded-md border border-borde bg-superficie-2/40 p-3">
              <p className="text-sm text-texto-secundario">
                Para operar {orden.folio}: primero programa su partida y usa «Iniciar preparación»
                en Planeación; después entra por /operador con el PIN del operador y vuelve a esta
                pantalla para iniciar o cerrar la sesión.
              </p>
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                className="self-start"
                data-testid="ir-planeacion-preparar"
                onClick={() => enrutador.push('/planeacion')}
              >
                Programar la partida en Planeación
              </Button>
            </div>
          ) : null}
          {bloqueadasSinSesion.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-md border border-advertencia/30 bg-advertencia-suave p-3">
              <p className="text-sm text-advertencia-texto" data-testid="aviso-operacion-bloqueada-sin-sesion">
                {MOTIVO_BLOQUEO_TEXTO.programacion_bloqueada_sin_sesion}
              </p>
              {puedeReabrirOperacion ? bloqueadasSinSesion.map((item) => (
                <div key={item.programacionId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-texto-secundario">{item.partidaCodigo}</span>
                  <Button
                    type="button"
                    tamano="sm"
                    disabled={reabriendo === item.programacionId}
                    data-testid={`accion-reabrir_operacion-${item.programacionId}`}
                    onClick={() => void reabrir(item)}
                  >
                    {reabriendo === item.programacionId ? 'Reabriendo…' : 'Reabrir operación'}
                  </Button>
                </div>
              )) : null}
              {mensajeReapertura ? (
                <p
                  role={mensajeReapertura.tipo === 'error' ? 'alert' : 'status'}
                  className={mensajeReapertura.tipo === 'error' ? 'text-sm text-peligro-texto' : 'text-sm text-exito-texto'}
                >
                  {mensajeReapertura.texto}
                </p>
              ) : null}
            </div>
          ) : null}
          {puedeReasignar && orden && orden.partidas.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-md border border-borde bg-superficie-2/40 p-3">
              <p className="text-sm font-medium text-texto-primario">Reasignar responsable de partida</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-texto-secundario">
                  Partida
                  <Select
                    className="min-h-11"
                    value={partidaReasignar}
                    onChange={(evento) => setPartidaReasignar(evento.target.value)}
                    data-testid="reasignar-partida-select"
                  >
                    <option value="">Selecciona una partida</option>
                    {orden.partidas.map((partida) => (
                      <option key={partida.id} value={partida.id}>{partida.codigoPieza}</option>
                    ))}
                  </Select>
                </label>
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-texto-secundario">
                  Operador
                  <Select
                    className="min-h-11"
                    value={operadorReasignar}
                    onChange={(evento) => setOperadorReasignar(evento.target.value)}
                    data-testid="reasignar-operador-select"
                  >
                    <option value="">Selecciona un operador</option>
                    {Object.entries(responsables).map(([id, nombre]) => (
                      <option key={id} value={id}>{nombre}</option>
                    ))}
                  </Select>
                </label>
                <Button
                  type="button"
                  tamano="sm"
                  disabled={reasignando || !partidaReasignar || !operadorReasignar}
                  data-testid="reasignar-partida-boton"
                  onClick={() => void reasignar()}
                >
                  {reasignando ? 'Reasignando…' : 'Reasignar'}
                </Button>
              </div>
              {mensajeReasignacion ? (
                <p
                  role={mensajeReasignacion.tipo === 'error' ? 'alert' : 'status'}
                  className={mensajeReasignacion.tipo === 'error' ? 'text-sm text-peligro-texto' : 'text-sm text-exito-texto'}
                >
                  {mensajeReasignacion.texto}
                </p>
              ) : null}
            </div>
          ) : null}
          {preparaciones.length > 0 ? (
            <>
              <label className={CLASE_ETIQUETA}>
                Partida preparada
                <Select
                  className="min-h-11"
                  value={seleccion?.programacionId ?? ''}
                  onChange={(evento) => setProgramacionId(evento.target.value)}
                >
                  {preparaciones.map((item) => <option key={item.programacionId} value={item.programacionId}>{item.etiqueta}</option>)}
                </Select>
              </label>
              <Button
                type="button"
                tamano="lg"
                disabled={procesando || !operadorDisponible || motivosPausa.length === 0}
                onClick={() => { setMensaje(null); setConfirmarChecklist(true); }}
                data-testid="iniciar-sesion-produccion"
              >
                Iniciar sesión
              </Button>
            </>
          ) : null}
          {ultimaPausa && !ultimaPausa.completa && !ultimaPausa.sinPiezas && operadorDisponible ? (
            <Button type="button" tamano="lg" variante="secundario"
              disabled={procesando} onClick={() => { setErrorReanudacion(null); setConfirmarReanudacion(true); }}>
              Continuar sesión pausada
            </Button>
          ) : null}
          {ultimaPausa?.sinPiezas && operadorDisponible ? (
            <p className="text-sm text-texto-secundario" data-testid="aviso-sin-piezas-reanudar-panel">
              Sin piezas de {ultimaPausa.procesoPrevioNombre ?? 'el proceso anterior'} todavía:
              espera a que libere más piezas para reanudar. La pausa se puede cerrar desde la
              ficha del proceso sin producir.
            </p>
          ) : null}
        </div>
      )}
        </div>
      </div>
      <Dialog open={primeraPiezaAbierta} onOpenChange={(abierto) => {
        if (!procesandoPrimeraPieza) setPrimeraPiezaAbierta(abierto);
      }}>
        <DialogContent className="max-w-md" data-testid="dialogo-primera-pieza" aria-label="Liberar primera pieza">
          <DialogHeader>
            <DialogTitle>Liberar primera pieza</DialogTitle>
            <DialogDescription>
              {orden?.folio ?? 'Orden'} · {partidaSesionActiva?.codigoPieza ?? 'Partida'}
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={(evento) => void liberarPrimeraPieza(evento)}>
            <label className={CLASE_ETIQUETA}>
              Resultado de la revisión
              <Select
                value={resultadoPrimeraPieza}
                onChange={(evento) => setResultadoPrimeraPieza(evento.target.value as 'APROBADA' | 'RECHAZADA')}
              >
                <option value="APROBADA">Aprobada</option>
                <option value="RECHAZADA">Rechazada</option>
              </Select>
            </label>
            <label className={CLASE_ETIQUETA}>
              Observaciones (opcional)
              <Textarea
                maxLength={1000}
                value={observacionesPrimeraPieza}
                onChange={(evento) => setObservacionesPrimeraPieza(evento.target.value)}
                placeholder="Detalles de la primera pieza"
              />
            </label>
            {mensajePrimeraPieza?.tipo === 'error' ? (
              <p role="alert" className="text-sm text-peligro-texto">{mensajePrimeraPieza.texto}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variante="contorno"
                disabled={procesandoPrimeraPieza}
                onClick={() => setPrimeraPiezaAbierta(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={procesandoPrimeraPieza}>
                {procesandoPrimeraPieza ? 'Registrando…' : 'Registrar y liberar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DialogoChecklistInicio
        abierto={confirmarChecklist}
        procesando={procesando}
        titulo={orden ? `Inicio de sesión ${orden.folio}` : 'Inicio de sesión'}
        onAbiertoCambiar={setConfirmarChecklist}
        onConfirmar={confirmarInicio}
      />
      <Dialog open={confirmarReanudacion} onOpenChange={(abierto) => {
        if (!procesando) setConfirmarReanudacion(abierto);
      }}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Reanudar {orden?.folio}</DialogTitle>
            <DialogDescription>Revisa la última sesión. Continuar vuelve a comprobar capacidad, recurso y operador; cancelar conserva la pausa.</DialogDescription>
          </DialogHeader>
          {ultimaPausa ? <div className="grid max-h-[45vh] min-h-0 shrink gap-1 overflow-y-auto pr-1 text-sm">
            <p>Operador: {responsables[ultimaPausa.sesion.operadorId] ?? 'Operador histórico'}</p>
            <p>Horario: {formatearFecha(ultimaPausa.sesion.fechaInicio)} · {formatearHora(ultimaPausa.sesion.fechaInicio)}–{ultimaPausa.sesion.fechaFin ? formatearHora(ultimaPausa.sesion.fechaFin) : 'sin cierre'}</p>
            <p>Partida: {ultimaPausa.partida.codigoPieza} · {formatearNumero(ultimaPausa.sesion.piezasProducidas, 0)} piezas · {formatearNumero(ultimaPausa.sesion.horasNetas)} h netas</p>
            {ultimaPausa.sesion.motivoPausaCodigo
              ? <p>Motivo: {motivosPausa.find((motivo) => motivo.codigo === ultimaPausa.sesion.motivoPausaCodigo)?.nombre
                ?? ultimaPausa.sesion.motivoPausaCodigo}</p>
              : ultimaPausa.sesion.motivoPausa
                ? <p>Motivo: {ETIQUETAS_MOTIVO_LEGACY[ultimaPausa.sesion.motivoPausa]}</p>
                : null}
            {(ultimaPausa.sesion.motivoPausaNota ?? ultimaPausa.sesion.notas)
              ? <p className="whitespace-pre-wrap">Notas: {ultimaPausa.sesion.motivoPausaNota ?? ultimaPausa.sesion.notas}</p>
              : null}
          </div> : null}
          {errorReanudacion ? <p role="alert" className="text-sm text-peligro-texto">{errorReanudacion}</p> : null}
          {ultimaPausa?.completa ? (
            <p className="text-sm text-advertencia-texto" data-testid="pausa-operacion-completa">
              La operación ya está completa. Cierra la pausa registrando el consumo pendiente
              desde la ficha del proceso; no se puede continuar produciendo.
            </p>
          ) : null}
          {ultimaPausa?.sinPiezas ? (
            <p className="text-sm text-advertencia-texto" data-testid="pausa-sin-piezas">
              Sin piezas de {ultimaPausa.procesoPrevioNombre ?? 'el proceso anterior'}: espera a
              que el proceso anterior libere más piezas para reanudar.
            </p>
          ) : null}
          <DialogFooter className="static mt-2 shrink-0">
            <Button type="button" variante="contorno" disabled={procesando} onClick={() => setConfirmarReanudacion(false)}>Cancelar</Button>
            <Button type="button" disabled={procesando || !ultimaPausa || ultimaPausa.completa || ultimaPausa.sinPiezas} onClick={() => void reanudar()}>{procesando ? 'Reanudando…' : 'Continuar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={resumenCierre !== null} onOpenChange={(abierto) => {
        if (!abierto) setResumenCierre(null);
      }}>
        <DialogContent className="max-w-md" data-testid="resumen-cierre-sesion" aria-label="Resumen de sesión finalizada">
          <DialogHeader>
            <DialogTitle>Sesión finalizada</DialogTitle>
            <DialogDescription>{orden?.folio ?? 'Orden'} · resumen registrado</DialogDescription>
          </DialogHeader>
          {resumenCierre ? (
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-superficie-2 p-3 text-sm">
              <div><dt className="text-texto-secundario">{etiquetaPiezas}</dt><dd className="font-medium">{formatearNumero(resumenCierre.resultado.piezasProducidas, 0)}</dd></div>
              <div><dt className="text-texto-secundario">Tiempo neto</dt><dd className="font-medium">{formatearNumero(resumenCierre.resultado.horasNetas, 2)} h</dd></div>
              <div><dt className="text-texto-secundario">Resultado</dt><dd className="font-medium">Sesión finalizada</dd></div>
              <div><dt className="text-texto-secundario">Estado de orden</dt><dd className="font-medium">{etiquetaEstado(resumenCierre.resultado.estadoOrden)}</dd></div>
              <div><dt className="text-texto-secundario">Planeación</dt><dd className="font-medium">{etiquetaEstado(resumenCierre.resultado.estadoPlaneacion)}</dd></div>
              <div><dt className="text-texto-secundario">Material usado</dt><dd className="font-medium">{resumenCierre.material.codigo} · {formatearNumero(resumenCierre.cantidadUsada, 3)} {resumenCierre.material.unidadBase}</dd></div>
              <div><dt className="text-texto-secundario">Merma</dt><dd className="font-medium">{formatearNumero(resumenCierre.cantidadMerma, 3)} {resumenCierre.material.unidadBase}</dd></div>
              {resumenCierre.notas ? <div className="col-span-full"><dt className="text-texto-secundario">Notas</dt><dd className="whitespace-pre-wrap font-medium">{resumenCierre.notas}</dd></div> : null}
              {mensajeInspeccionCierre ? (
                <div className="col-span-full">
                  <p
                    role={mensajeInspeccionCierre.tipo === 'error' ? 'alert' : 'status'}
                    className={cn(
                      'text-sm',
                      mensajeInspeccionCierre.tipo === 'error' ? 'text-peligro-texto' : 'text-exito-texto',
                    )}
                    data-testid="mensaje-inspeccion-cierre"
                  >
                    {mensajeInspeccionCierre.texto}
                  </p>
                </div>
              ) : null}
            </dl>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setResumenCierre(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {sesionSupervisor && onCerrarComoSupervisor ? (
        <DialogoCerrarSesionSupervisor
          sesion={sesionSupervisor.sesion}
          destino={sesionSupervisor.destino}
          orden={orden}
          responsables={responsables}
          motivosPausa={motivosPausa}
          procesando={procesando}
          onCerrar={() => setSesionSupervisor(null)}
          onConfirmar={async (datos) => {
            const resultado = await onCerrarComoSupervisor(datos);
            if (resultado.exito) {
              setSesionSupervisor(null);
              setMensaje({
                texto: datos.estadoDestino === 'finalizada'
                  ? 'Sesión del operador finalizada sin declarar producción'
                  : 'Sesión del operador pausada y recurso liberado',
                tipo: 'estado',
              });
            }
            return resultado;
          }}
        />
      ) : null}
      <DialogoErrorCierre
        error={errorCierre}
        onCerrar={() => setErrorCierre(null)}
        testId="error-cierre-panel"
      />
    </section>
  );
}

/**
 * Cierre excepcional por administrador. Administración no captura piezas,
 * consumo ni merma: puede pausar la sesión o finalizarla sin producción para
 * liberar la máquina, dejando una nota obligatoria de por qué se cierra.
 */
function DialogoCerrarSesionSupervisor({
  sesion,
  destino,
  orden,
  responsables,
  motivosPausa,
  procesando,
  onCerrar,
  onConfirmar,
}: {
  sesion: SesionOrden;
  destino: 'pausada' | 'finalizada';
  orden: OrdenTableroProduccion | null;
  responsables: Readonly<Record<string, string>>;
  motivosPausa: MotivoPausaCatalogo[];
  procesando: boolean;
  onCerrar: () => void;
  onConfirmar: (datos: CierreSupervisor) => Promise<ResultadoOperacion>;
}) {
  const [motivoPausa, setMotivoPausa] = useState(motivosPausa[0]?.codigo ?? '');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const esPausa = destino === 'pausada';
  const motivoSeleccionado = motivosPausa.find((motivo) => motivo.codigo === motivoPausa)
    ?? motivosPausa[0]
    ?? null;
  const partida = orden?.partidas.find((actual) => actual.id === sesion.partidaId) ?? null;
  const meta = partida?.metasProceso.find(
    (actual) => actual.id === partida.programaciones.find(
      (programacion) => programacion.id === sesion.programacionId,
    )?.metaProcesoId,
  ) ?? partida?.metasProceso[0] ?? null;

  async function confirmar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (enviando) return;
    if (esPausa && !motivoSeleccionado) {
      setError('Selecciona el motivo de la pausa');
      return;
    }
    if (esPausa && motivoSeleccionado?.requiereNota && notas.trim().length === 0) {
      setError('Este motivo exige una nota');
      return;
    }
    if (!esPausa && notas.trim().length < 5) {
      setError('Explica brevemente por qué se cierra la sesión sin producción');
      return;
    }
    setError(null);
    setEnviando(true);
    const resultado = await onConfirmar({
      sesionId: sesion.id,
      piezasProducidas: 0,
      estadoDestino: destino,
      ...(meta ? { metaProcesoId: meta.id } : {}),
      ...(esPausa && motivoSeleccionado ? { motivoPausa: motivoSeleccionado.codigo } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
    });
    setEnviando(false);
    if (!resultado.exito) setError(resultado.error);
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent className="max-w-lg" data-testid="dialogo-supervisor-sesion">
        <DialogHeader>
          <DialogTitle>
            {esPausa ? 'Pausar sesión de ' : 'Finalizar sesión de '}
            {responsables[sesion.operadorId] ?? 'operador'}
          </DialogTitle>
          <DialogDescription>
            {partida?.codigoPieza ?? 'Partida'}
            {meta ? ` · ${meta.nombre}` : ''} · {formatearFecha(sesion.fechaInicio)}{' '}
            {formatearHora(sesion.fechaInicio)}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(evento) => void confirmar(evento)}>
          <p className="rounded-md bg-superficie-2 p-3 text-sm text-texto-secundario">
            {esPausa
              ? 'La captura de piezas, material y merma corresponde al operador. Si su sesión quedó abierta, esta pausa libera la máquina sin declarar producción.'
              : 'La sesión se cerrará como finalizada con 0 piezas: no se declara producción ni consumo. Úsalo solo si el operador olvidó cerrar y no hay piezas que registrar.'}
          </p>
          {esPausa ? (
            <label className={CLASE_ETIQUETA}>
              Motivo de pausa
              <Select
                value={motivoSeleccionado?.codigo ?? ''}
                onChange={(evento) => setMotivoPausa(evento.target.value)}
                data-testid="supervisor-motivo-pausa"
              >
                {motivosPausa.map((motivo) => (
                  <option key={motivo.codigo} value={motivo.codigo}>
                    {motivo.nombre}{motivo.requiereNota ? ' (nota obligatoria)' : ''}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label className={CLASE_ETIQUETA}>
            Notas
            {esPausa
              ? (motivoSeleccionado?.requiereNota ? ' (obligatorias)' : ' (opcional)')
              : ' (obligatorias)'}
            <Textarea
              maxLength={1000}
              value={notas}
              onChange={(evento) => setNotas(evento.target.value)}
              required={esPausa ? motivoSeleccionado?.requiereNota === true : true}
            />
          </label>
          {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variante="contorno" disabled={enviando} onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || procesando} data-testid="confirmar-supervisor-sesion">
              {enviando || procesando ? 'Guardando…' : (esPausa ? 'Pausar sesión' : 'Finalizar sin producir')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
