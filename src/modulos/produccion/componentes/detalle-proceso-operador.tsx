'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { cn } from '@/compartido/utilidades/cn';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import type { CierreSesionRegistrado } from '@/modulos/produccion/servicios/sesiones-servicio';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/indice';
import { ETIQUETAS_COLUMNA, etiquetaMotivoPausa } from '@/modulos/produccion/tipos/indice';
import {
  AYUDA_HORAS_EXTRA,
  HORAS_JORNADA_PREDETERMINADA,
  ayudaLimitePiezas,
  horasTranscurridasSesion,
  maximoPiezasProceso,
  sesionCercaDeJornada,
  validarCantidadPiezas,
} from '@/modulos/produccion/utilidades/indice';
import { etiquetaPiezasProceso, verboProceso } from '@/modulos/produccion/utilidades/procesos';
import { registrarInspeccionAccion } from '@/modulos/produccion/acciones/registrar-inspeccion';
import { registrarRetrabajoAccion } from '@/modulos/produccion/acciones/registrar-retrabajo';
import { registrarConsumoPiezasAccion } from '@/modulos/produccion/acciones/registrar-consumo-piezas';
import {
  obtenerMaterialClienteOrdenAccion,
  registrarConsumoMaterialClienteAccion,
} from '@/modulos/produccion/acciones/material-cliente';
import {
  obtenerItemsCorridaAccion,
} from '@/modulos/produccion/acciones/corrida-integrada';
import type {
  CausaRetrabajo,
  ItemCorrida,
  ItemIntegrado,
  MaterialClientePartida,
} from '@/modulos/produccion/tipos/indice';
import { solicitarHorasExtraAccion } from '@/modulos/produccion/acciones/solicitar-horas-extra';
import { justificarHorasExtraAccion } from '@/modulos/produccion/acciones/justificar-horas-extra';
import { pausarSesionJornadaAccion } from '@/modulos/produccion/acciones/pausar-sesion-jornada';
import { CampoEntero } from '@/modulos/produccion/componentes/campo-entero';
import { obtenerUrlArchivoPisoAccion } from '@/modulos/ordenes/acciones/obtener-url-archivo-piso';
import {
  etiquetaDiaLargo,
  etiquetaFechaHora,
  horasLegibles,
  tamanoLegible,
  textoCompromiso,
  turnoLegible,
} from '@/modulos/produccion/utilidades/formato-operador';
import {
  resumirConsumosMateriales,
  type ConsumoMaterialVisible,
} from '@/modulos/produccion/utilidades/consumo-material-operador';
import type { MaterialPiso } from '@/modulos/ordenes/componentes/control-piso-panel';

export type ResultadoOperacion =
  | { exito: true; datos?: CierreSesionRegistrado }
  | { exito: false; error: string; codigo?: string };

interface ResumenCierreSesion {
  material: MaterialPiso;
  cantidadUsada: number;
  cantidadMerma: number;
  notas: string | null;
  resultado: CierreSesionRegistrado;
}

export interface AccionesDetalleProceso {
  reclamar: (proceso: ProcesoEspacioOperador, fecha: string, turno: string) => Promise<ResultadoOperacion>;
  mover: (proceso: ProcesoEspacioOperador, fecha: string, turno: string) => Promise<ResultadoOperacion>;
  liberar: (proceso: ProcesoEspacioOperador) => Promise<ResultadoOperacion>;
  iniciar: (proceso: ProcesoEspacioOperador) => void;
  reanudar: (proceso: ProcesoEspacioOperador) => Promise<ResultadoOperacion>;
  /** C15: cierra una pausa que no se retomará, sin producir piezas. */
  cerrarPausa: (proceso: ProcesoEspacioOperador) => Promise<ResultadoOperacion>;
  cerrar: (proceso: ProcesoEspacioOperador, datos: {
    sesionId: string;
    piezasProducidas: number;
    estadoDestino: 'pausada' | 'finalizada';
    motivoPausa?: string;
    notas?: string;
    pinConfirmacion: string;
    consumo?: {
      materialId: string;
      cantidadUsada: number;
      cantidadScrap: number;
      motivo: string;
    };
    itemsIntegrados?: ItemIntegrado[];
    minutosSetup?: number;
  }) => Promise<ResultadoOperacion>;
}

export interface PropsDetalleProceso {
  proceso: ProcesoEspacioOperador | null;
  hoy: string;
  soloLectura: boolean;
  procesando: boolean;
  motivosPausa: MotivoPausaCatalogo[];
  acciones: AccionesDetalleProceso;
  materiales: MaterialPiso[];
  consumos: ConsumoMaterialVisible[];
  onCerrar: () => void;
  /** C15: refresca el tablero cuando la pausa automática cierra la jornada. */
  onPausaAutomatica?: () => void;

  presentacion?: 'dialogo' | 'integrado';
}

const TURNOS = ['matutino', 'vespertino', 'nocturno'] as const;
const CLASE_ETIQUETA = 'grid gap-1 text-sm font-medium text-texto-secundario';

/**
 * C17: en un proceso posterior (Doblado, etc.) producir piezas obliga a haber
 * consumido al menos esas piezas del proceso anterior. Si el operador deja
 * «Usado» en 0, se asume el consumo 1:1 con lo producido: es lo que ocurre en
 * el piso y evita bloquear el cierre por un campo que nadie captura.
 */
export function piezasUsadasEfectivas(
  usada: number,
  producidas: number,
  esProcesoPosterior: boolean,
): number {
  if (!esProcesoPosterior || usada > 0) return usada;
  return Number.isFinite(producidas) && producidas > 0 ? producidas : usada;
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-texto-tenue">{etiqueta}</dt>
      <dd className="break-words text-sm font-medium text-texto-primario">{valor}</dd>
    </div>
  );
}

/** C10: ficha completa de la operación con las acciones que permite su estado. */
export function DetalleProcesoOperador({
  proceso,
  hoy,
  soloLectura,
  procesando,
  motivosPausa,
  acciones,
  materiales,
  consumos,
  onCerrar,
  onPausaAutomatica,
  presentacion = 'dialogo',
}: PropsDetalleProceso) {
  const [fecha, setFecha] = useState(proceso?.reclamo?.fecha ?? hoy);
  const [turno, setTurno] = useState<string>(proceso?.reclamo?.turno ?? 'matutino');
  const [piezas, setPiezas] = useState('0');
  // El material de la orden viene preseleccionado: el operador no debe elegirlo
  // entre todo el catálogo. Solo cambia si la partida no declara material.
  const [materialId, setMaterialId] = useState(() => {
    const delProceso = proceso?.material;
    if (delProceso && materiales.some((material) => material.id === delProceso.id)) {
      return delProceso.id;
    }
    return materiales.length === 1 ? materiales[0].id : '';
  });
  const [cierreAbierto, setCierreAbierto] = useState(false);
  const [cantidadUsada, setCantidadUsada] = useState('0');
  const [cantidadMerma, setCantidadMerma] = useState('0');
  // B7: el consumo real exige motivo y el setup se identifica sin duplicar costo.
  const [motivoConsumo, setMotivoConsumo] = useState('');
  const [minutosSetup, setMinutosSetup] = useState('');
  const [estadoDestino, setEstadoDestino] = useState<'pausada' | 'finalizada'>('finalizada');
  const [motivoPausa, setMotivoPausa] = useState('');
  const [notas, setNotas] = useState('');
  const [pin, setPin] = useState('');
  const [mensaje, setMensaje] = useState<ResultadoOperacion | null>(null);
  // C17: el cierre fallido se muestra en un diálogo fijo para que el operador
  // lo vea aunque el formulario esté muy abajo; guarda el motivo exacto.
  const [errorCierre, setErrorCierre] = useState<{ titulo: string; mensaje: string } | null>(null);
  const [resumenCierre, setResumenCierre] = useState<ResumenCierreSesion | null>(null);
  const [archivoAbriendo, setArchivoAbriendo] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [primeraPiezaAbierta, setPrimeraPiezaAbierta] = useState(false);
  const [reintentarCierreTrasPrimeraPieza, setReintentarCierreTrasPrimeraPieza] = useState(false);
  const [resultadoPrimeraPieza, setResultadoPrimeraPieza] = useState<'APROBADA' | 'RECHAZADA'>('APROBADA');
  const [observacionesPrimeraPieza, setObservacionesPrimeraPieza] = useState('');
  const [procesandoPrimeraPieza, setProcesandoPrimeraPieza] = useState(false);
  const [registrarInspeccionCierre, setRegistrarInspeccionCierre] = useState(false);
  const [resultadoInspeccionCierre, setResultadoInspeccionCierre] = useState<'APROBADA' | 'RECHAZADA'>('APROBADA');
  const [recuperablesCierre, setRecuperablesCierre] = useState('0');
  const [scrapCierre, setScrapCierre] = useState('0');
  const [observacionesCierre, setObservacionesCierre] = useState('');
  const [mensajeInspeccionCierre, setMensajeInspeccionCierre] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const [registrarRetrabajo, setRegistrarRetrabajo] = useState(false);
  const [retrabajoMaterialId, setRetrabajoMaterialId] = useState('');
  const [retrabajoUsado, setRetrabajoUsado] = useState('0');
  const [retrabajoMerma, setRetrabajoMerma] = useState('0');
  const [retrabajoMinutos, setRetrabajoMinutos] = useState('');
  const [retrabajoCausa, setRetrabajoCausa] = useState<CausaRetrabajo>('operador');
  const [retrabajoMotivo, setRetrabajoMotivo] = useState('');
  const [retrabajoNotas, setRetrabajoNotas] = useState('');
  const [retrabajoResultado, setRetrabajoResultado] = useState<'PENDIENTE' | 'RECUPERADO' | 'SCRAP'>('PENDIENTE');
  const [retrabajoRegistrado, setRetrabajoRegistrado] = useState(false);
  const solicitudRetrabajo = useRef<string | null>(null);
  const [mensajeRetrabajo, setMensajeRetrabajo] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const [materialCliente, setMaterialCliente] = useState<MaterialClientePartida[]>([]);
  const [consumoCliente, setConsumoCliente] = useState(false);
  const [consumoClienteMaterialId, setConsumoClienteMaterialId] = useState('');
  const [consumoClienteUsado, setConsumoClienteUsado] = useState('0');
  const [consumoClienteMerma, setConsumoClienteMerma] = useState('0');
  const [consumoClienteRegistrado, setConsumoClienteRegistrado] = useState(false);
  const solicitudConsumoCliente = useRef<string | null>(null);
  const [mensajeConsumoCliente, setMensajeConsumoCliente] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const [mensajeConsumoPiezas, setMensajeConsumoPiezas] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const [itemsCorrida, setItemsCorrida] = useState<ItemCorrida[]>([]);
  const [integrada, setIntegrada] = useState(false);
  const [piezasPorItem, setPiezasPorItem] = useState<Record<string, string>>({});
  const [minutosPorItem, setMinutosPorItem] = useState<Record<string, string>>({});
  const [ahoraAviso] = useState(() => new Date());
  const [mensajePrimeraPieza, setMensajePrimeraPieza] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  // C15: salida para el cierre bloqueado por horas extra.
  const [justificacionAbierta, setJustificacionAbierta] = useState(false);
  const [motivoJustificacion, setMotivoJustificacion] = useState('');
  const [procesandoJustificacion, setProcesandoJustificacion] = useState(false);
  const [mensajeJustificacion, setMensajeJustificacion] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const pausaAutomaticaIntentada = useRef<string | null>(null);
  const ultimaRevisionPausa = useRef(0);

  useEffect(() => {
    const ordenId = proceso?.ordenId;
    if (!ordenId) return;
    let vigente = true;
    void obtenerMaterialClienteOrdenAccion({ ordenId }).then((respuesta) => {
      if (!vigente || !respuesta.exito) return;
      const datos = respuesta.datos ?? [];
      setMaterialCliente(datos);
      const primero = datos.find((material) => material.partidaId === proceso?.partidaId);
      if (primero) setConsumoClienteMaterialId(primero.materialId);
    });
    return () => {
      vigente = false;
    };
  }, [proceso?.ordenId, proceso?.partidaId]);

  useEffect(() => {
    const corridaId = proceso?.sesionActiva?.corridaId;
    if (!corridaId) return;
    let vigente = true;
    void obtenerItemsCorridaAccion({ corridaId }).then((respuesta) => {
      if (!vigente || !respuesta.exito) return;
      const items = respuesta.datos ?? [];
      setItemsCorrida(items);
      setPiezasPorItem((actual) => {
        const siguiente = { ...actual };
        for (const item of items) {
          if (siguiente[item.partidaId] === undefined) siguiente[item.partidaId] = '0';
        }
        return siguiente;
      });
    });
    return () => {
      vigente = false;
    };
  }, [proceso?.sesionActiva?.corridaId]);

  // Punto 11: el resumen de cierre es informativo; se cierra solo para que el
  // operador siga con el siguiente proceso. Si alguna operación posterior al
  // cierre falló, el modal permanece abierto hasta que se lea el aviso.
  useEffect(() => {
    if (!resumenCierre) return;
    const hayError = mensajeInspeccionCierre?.tipo === 'error'
      || mensajeRetrabajo?.tipo === 'error'
      || mensajeConsumoCliente?.tipo === 'error';
    if (hayError) return;
    const temporizador = window.setTimeout(() => setResumenCierre(null), 10000);
    return () => window.clearTimeout(temporizador);
  }, [resumenCierre, mensajeInspeccionCierre, mensajeRetrabajo, mensajeConsumoCliente]);

  // C15: al cumplirse la jornada, el panel pausa la sesión por el operador.
  // El servidor vuelve a verificar la jornada real del turno antes de pausar.
  useEffect(() => {
    const sesion = proceso?.sesionActiva;
    if (!sesion || soloLectura) return;
    const sesionId = sesion.id;
    const revisar = () => {
      if (cierreAbierto || pausaAutomaticaIntentada.current === sesionId) return;
      const ahora = Date.now();
      if (ahora - ultimaRevisionPausa.current < 30_000) return;
      ultimaRevisionPausa.current = ahora;
      const transcurridas = horasTranscurridasSesion(sesion.fechaInicio, new Date(ahora));
      if (transcurridas < HORAS_JORNADA_PREDETERMINADA) return;
      pausaAutomaticaIntentada.current = sesionId;
      void pausarSesionJornadaAccion({ sesionId }).then((respuesta) => {
        if (!respuesta.exito || (respuesta.datos?.sesionesPausadas ?? 0) === 0) {
          pausaAutomaticaIntentada.current = null;
          return;
        }
        setMensaje({
          exito: false,
          codigo: 'pausa_automatica_jornada',
          error: 'Se cumplió la jornada del turno: la sesión se pausó automáticamente. '
            + 'Retómala en el siguiente turno o justifica horas extra si debes terminarla hoy.',
        });
        onPausaAutomatica?.();
      });
    };
    revisar();
    const temporizador = window.setInterval(revisar, 60_000);
    return () => window.clearInterval(temporizador);
  }, [proceso?.sesionActiva, soloLectura, cierreAbierto, onPausaAutomatica]);

  if (!proceso) return null;

  const consumosDePartida = resumirConsumosMateriales(consumos).filter(
    (consumo) => consumo.partidaId === proceso.partidaId,
  );

  const motivoSeleccionado = motivosPausa.find((motivo) => motivo.codigo === motivoPausa)
    ?? motivosPausa[0]
    ?? null;
  const puedeReclamar = !soloLectura && !proceso.reclamo && proceso.columna !== 'lista';
  const puedeMover = !soloLectura && proceso.reclamadoPorMi === true
    && proceso.sesionActiva === null
    && proceso.programacion?.estadoPlaneacion !== 'en_proceso'
    && proceso.programacion?.estadoPlaneacion !== 'bloqueada';
  const puedeLiberar = !soloLectura && proceso.reclamadoPorMi === true
    && proceso.sesionActiva === null
    && proceso.programacion?.estadoPlaneacion !== 'en_proceso'
    && proceso.programacion?.estadoPlaneacion !== 'bloqueada';
  const abrirHoja = proceso.estadoOrden === 'en_proceso'
    && (proceso.reclamadoPorMi || proceso.sesionActiva !== null);
  const horasSesion = proceso.sesionActiva
    ? horasTranscurridasSesion(proceso.sesionActiva.fechaInicio, ahoraAviso)
    : 0;
  const avisoJornada = proceso.sesionActiva
    ? sesionCercaDeJornada(proceso.sesionActiva.fechaInicio, ahoraAviso)
    : false;
  const etiquetaPiezas = etiquetaPiezasProceso(proceso.procesoNombre, proceso.areaMacro);
  const maximoPiezas = maximoPiezasProceso({
    metaProcesoId: proceso.metaProcesoId,
    pendientePiezas: proceso.pendientePiezas,
    piezasDisponibles: proceso.piezasDisponibles,
    cantidadSolicitada: proceso.cantidadSolicitada,
    cantidadProducida: proceso.cantidadProducida,
  });
  const errorHorasExtra = mensaje !== null
    && !mensaje.exito
    && mensaje.codigo === 'horas_extra_sin_autorizacion';
  // C17: la primera operación consume materia prima; las posteriores consumen
  // las piezas que liberó el proceso anterior.
  const esProcesoPosterior = typeof proceso.piezasDisponibles === 'number';
  const piezasDisponibles = typeof proceso.piezasDisponibles === 'number'
    ? proceso.piezasDisponibles
    : 0;
  const nombreProcesoPrevio = proceso.procesoPrevioNombre ?? 'el proceso anterior';
  const piezasCapturadasVista = Number(piezas);
  const usadaVista = piezasUsadasEfectivas(
    Number(cantidadUsada),
    piezasCapturadasVista,
    esProcesoPosterior,
  );
  const consumoAutomatico = esProcesoPosterior
    && estadoDestino === 'finalizada'
    && Number(cantidadUsada) === 0
    && Number.isInteger(piezasCapturadasVista)
    && piezasCapturadasVista > 0;
  const primeraPiezaPendiente = proceso.sesionActiva?.primeraPiezaPendiente === true;
  // C15: la pausa (manual o automática) deja motivo, operador, corte y horas
  // netas. Se muestran juntos para que el operador sepa qué retomar.
  const sesionPausada = proceso.columna === 'pausada'
    && proceso.ultimaSesion?.estadoSesion === 'pausada'
    ? proceso.ultimaSesion
    : null;
  const materialClientePartida = materialCliente.filter(
    (material) => material.partidaId === proceso.partidaId,
  );
  const errorPrimeraPieza = mensaje !== null
    && !mensaje.exito
    && mensaje.codigo === 'primera_pieza_pendiente';

  async function reclamar(): Promise<void> {
    const resultado = await acciones.reclamar(proceso!, fecha, turno);
    setMensaje(resultado);
  }

  async function mover(): Promise<void> {
    const resultado = await acciones.mover(proceso!, fecha, turno);
    setMensaje(resultado);
  }

  async function liberar(): Promise<void> {
    const resultado = await acciones.liberar(proceso!);
    setMensaje(resultado);
  }

  async function reanudar(): Promise<void> {
    const resultado = await acciones.reanudar(proceso!);
    setMensaje(resultado);
  }

  async function cerrarPausa(): Promise<void> {
    const resultado = await acciones.cerrarPausa(proceso!);
    setMensaje(resultado);
  }

  /** Muestra el fallo del cierre en el diálogo fijo y en el aviso inline. */
  function fallarCierre(resultado: { exito?: boolean; error: string; codigo?: string }): void {
    setMensaje({
      exito: false,
      error: resultado.error,
      ...(resultado.codigo ? { codigo: resultado.codigo } : {}),
    });
    setErrorCierre({ titulo: 'No se pudo cerrar la sesión', mensaje: resultado.error });
  }

  async function ejecutarCierre(): Promise<void> {
    if (!proceso?.sesionActiva) return;
    setErrorCierre(null);
    if (!/^\d{4,6}$/.test(pin)) {
      fallarCierre({ exito: false, error: 'El PIN debe tener entre 4 y 6 dígitos' });
      return;
    }
    const piezasCapturadas = Number(piezas);
    if (!Number.isInteger(piezasCapturadas) || piezasCapturadas < 0) {
      fallarCierre({ exito: false, error: 'Las piezas producidas deben ser un número entero' });
      return;
    }
    // Obs. cliente 2026-11-14: la orden no puede fabricar más de lo solicitado
    // ni más de lo que el proceso anterior dejó disponible.
    const errorLimitePiezas = validarCantidadPiezas(
      piezasCapturadas,
      maximoPiezas,
      etiquetaPiezas.toLowerCase(),
    );
    if (errorLimitePiezas) {
      fallarCierre({ exito: false, error: errorLimitePiezas });
      return;
    }
    const usada = Number(cantidadUsada);
    const merma = Number(cantidadMerma);
    const materialSeleccionado = materiales.find((material) => material.id === materialId) ?? null;
    const consumoValido = Boolean(materialSeleccionado)
      && Number.isFinite(usada)
      && Number.isFinite(merma)
      && usada >= 0
      && merma >= 0
      && usada + merma > 0;

    // B7: el servidor decide si la ruta exige consumo (AUD-02). Si se captura
    // consumo, el motivo es obligatorio; sin consumo no se exige material.
    const incluirConsumo = !esProcesoPosterior
      && estadoDestino === 'finalizada'
      && consumoValido;
    const incluirConsumoPiezas = esProcesoPosterior && estadoDestino === 'finalizada';
    // C17: si el operador no captura «Usado», se asume 1:1 con lo producido.
    const usadaConsumoPiezas = piezasUsadasEfectivas(usada, piezasCapturadas, esProcesoPosterior);
    if (incluirConsumo && motivoConsumo.trim().length < 3) {
      fallarCierre({
        exito: false,
        error: 'Indica el motivo del consumo de material (mínimo 3 caracteres).',
      });
      return;
    }
    if (incluirConsumoPiezas) {
      const totalPiezas = usadaConsumoPiezas + merma;
      if (!Number.isInteger(usadaConsumoPiezas) || !Number.isInteger(merma)
        || usadaConsumoPiezas < 0 || merma < 0) {
        fallarCierre({
          exito: false,
          error: `Las piezas usadas de ${nombreProcesoPrevio} y la merma deben ser números enteros.`,
        });
        return;
      }
      if (totalPiezas > piezasDisponibles) {
        fallarCierre({
          exito: false,
          error: `No puedes consumir ${formatearNumero(totalPiezas, 0)} piezas de ${nombreProcesoPrevio}: solo hay ${formatearNumero(piezasDisponibles, 0)} disponibles. Declaraste ${formatearNumero(piezasCapturadas, 0)} producidas y ${formatearNumero(merma, 0)} de merma; ajusta «Usado» o «Merma».`,
        });
        return;
      }
      if (usadaConsumoPiezas < piezasCapturadas) {
        fallarCierre({
          exito: false,
          error: `Declaraste ${formatearNumero(piezasCapturadas, 0)} piezas producidas en ${proceso.procesoNombre}, pero solo ${formatearNumero(usadaConsumoPiezas, 0)} usadas de ${nombreProcesoPrevio}. Las piezas usadas no pueden ser menores a las producidas.`,
        });
        return;
      }
      if (piezasCapturadas > 0 && totalPiezas === 0) {
        fallarCierre({
          exito: false,
          error: `Registra cuántas piezas de ${nombreProcesoPrevio} consumiste (al menos ${formatearNumero(piezasCapturadas, 0)}).`,
        });
        return;
      }
      if (totalPiezas > 0 && motivoConsumo.trim().length < 3) {
        fallarCierre({
          exito: false,
          error: `Indica el motivo del consumo de ${formatearNumero(totalPiezas, 0)} piezas de ${nombreProcesoPrevio} (mínimo 3 caracteres).`,
        });
        return;
      }
    }
    const minutosSetupNumero = minutosSetup.trim() === '' ? undefined : Number(minutosSetup);
    if (
      minutosSetupNumero !== undefined
      && (!Number.isFinite(minutosSetupNumero) || minutosSetupNumero < 0 || minutosSetupNumero > 1440)
    ) {
      fallarCierre({
        exito: false,
        error: 'Los minutos de setup deben ser un número entre 0 y 1440.',
      });
      return;
    }

    if (estadoDestino === 'finalizada' && registrarRetrabajo && !retrabajoRegistrado) {
      const rUsado = Number(retrabajoUsado);
      const rMerma = Number(retrabajoMerma);
      const rMinutos = Number(retrabajoMinutos);
      if (!Number.isFinite(rUsado) || !Number.isFinite(rMerma) || rUsado < 0 || rMerma < 0
        || rUsado + rMerma <= 0 || !Number.isFinite(rMinutos) || rMinutos <= 0
        || (!retrabajoMaterialId && !materialId)
        || retrabajoMotivo.trim().length < 3) {
        fallarCierre({
          exito: false,
          error: 'Completa el retrabajo: material usado o merma, tiempo y motivo.',
        });
        return;
      }
    }

    if (estadoDestino === 'finalizada' && consumoCliente && !consumoClienteRegistrado) {
      const material = materialClientePartida.find(
        (actual) => actual.materialId === consumoClienteMaterialId,
      );
      const usado = Number(consumoClienteUsado);
      const merma = Number(consumoClienteMerma);
      if (!material || !Number.isFinite(usado) || !Number.isFinite(merma)
        || usado < 0 || merma < 0 || usado + merma <= 0) {
        fallarCierre({ exito: false, error: 'Indica el consumo del material del cliente.' });
        return;
      }
      if (usado + merma > material.saldo) {
        fallarCierre({
          exito: false,
          error: `El material del cliente no alcanza: saldo ${material.saldo} ${material.unidadBase}. Pausa por falta de material o corrige la cantidad.`,
        });
        return;
      }
    }
    if (estadoDestino === 'finalizada' && registrarInspeccionCierre) {
      const recuperables = Number(recuperablesCierre);
      const scrap = Number(scrapCierre);
      if (!Number.isFinite(recuperables) || !Number.isFinite(scrap)
        || recuperables < 0 || scrap < 0) {
        fallarCierre({ exito: false, error: 'Las piezas recuperables y el scrap deben ser cantidades válidas.' });
        return;
      }
      if (resultadoInspeccionCierre === 'APROBADA' && recuperables + scrap > 0) {
        fallarCierre({
          exito: false,
          error: 'Si la inspección es aprobada, no puedes marcar piezas recuperables ni scrap.',
        });
        return;
      }
      if (resultadoInspeccionCierre === 'RECHAZADA'
        && (recuperables + scrap <= 0 || recuperables + scrap > piezasCapturadas)) {
        fallarCierre({
          exito: false,
          error: 'Indica cuántas piezas son recuperables o scrap (sin superar las producidas).',
        });
        return;
      }
    }
    const integradaActiva = estadoDestino === 'finalizada' && integrada && itemsCorrida.length > 1;
    let itemsIntegrados: ItemIntegrado[] | undefined;
    let piezasPrincipal = Number(piezas);
    if (integradaActiva) {
      const minutosDeclarados = itemsCorrida.map((item) => {
        const valor = minutosPorItem[item.partidaId];
        if (valor === undefined || valor.trim() === '') return null;
        return Number(valor);
      });
      const minutosTotales = minutosDeclarados.reduce<number>(
        (total, valor) => total + (valor ?? 0),
        0,
      );
      const piezasTotales = itemsCorrida.reduce(
        (total, item) => total + (Number(piezasPorItem[item.partidaId] ?? '0') || 0),
        0,
      );
      const minutosValidos = minutosDeclarados.every(
        (valor) => valor === null || (Number.isFinite(valor) && valor > 0),
      );
      const piezasValidas = itemsCorrida.every((item) => {
        const cantidad = Number(piezasPorItem[item.partidaId] ?? '0');
        return Number.isInteger(cantidad) && cantidad >= 0;
      });
      if (!piezasValidas) {
        fallarCierre({
          exito: false,
          error: 'Las piezas de cada ítem deben ser un número entero',
        });
        return;
      }
      const itemExcedido = itemsCorrida.find((item) => {
        const cantidad = Number(piezasPorItem[item.partidaId] ?? '0');
        return validarCantidadPiezas(cantidad, maximoPiezasProceso({
          metaProcesoId: item.metaProcesoId,
          piezasDisponibles: item.disponible,
          cantidadSolicitada: item.cantidadSolicitada,
          cantidadProducida: item.cantidadProducida,
        }), `piezas de ${item.codigoPieza}`) !== null;
      });
      if (itemExcedido) {
        const cantidad = Number(piezasPorItem[itemExcedido.partidaId] ?? '0');
        fallarCierre({
          exito: false,
          error: validarCantidadPiezas(cantidad, maximoPiezasProceso({
            metaProcesoId: itemExcedido.metaProcesoId,
            piezasDisponibles: itemExcedido.disponible,
            cantidadSolicitada: itemExcedido.cantidadSolicitada,
            cantidadProducida: itemExcedido.cantidadProducida,
          }), `piezas de ${itemExcedido.codigoPieza}`) ?? '',
        });
        return;
      }
      if (!minutosValidos || piezasTotales <= 0) {
        fallarCierre({
          exito: false,
          error: 'Completa las piezas de cada ítem; los minutos por ítem son opcionales.',
        });
        return;
      }
      if (minutosTotales > Math.max(horasSesion * 60, 1)) {
        fallarCierre({
          exito: false,
          error: `Los minutos por ítem (${minutosTotales}) superan el tiempo de la sesión (${(horasSesion * 60).toFixed(0)} min).`,
        });
        return;
      }
      itemsIntegrados = itemsCorrida.map((item, indice) => ({
        partidaId: item.partidaId,
        piezas: Number(piezasPorItem[item.partidaId] ?? '0') || 0,
        minutos: minutosDeclarados[indice] ?? null,
      }));
      piezasPrincipal = Number(piezasPorItem[proceso.partidaId] ?? '0') || 0;
    }

    const resultado = await acciones.cerrar(proceso, {
      sesionId: proceso.sesionActiva.id,
      piezasProducidas: piezasPrincipal,
      estadoDestino,
      ...(estadoDestino === 'pausada' && motivoSeleccionado ? { motivoPausa: motivoSeleccionado.codigo } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      ...(incluirConsumo
        ? {
            consumo: {
              materialId,
              cantidadUsada: usada,
              cantidadScrap: merma,
              motivo: motivoConsumo.trim(),
            },
          }
        : {}),
      ...(itemsIntegrados ? { itemsIntegrados } : {}),
      ...(minutosSetupNumero !== undefined ? { minutosSetup: minutosSetupNumero } : {}),
      pinConfirmacion: pin,
    });
    setMensaje(resultado);
    if (!resultado.exito) {
      // C15: el exceso de jornada ya no crea una solicitud a ciegas. El panel
      // muestra dos salidas: justificar el exceso o pedir aprobación.
      // El fallo se muestra además en el diálogo fijo, salvo que tenga su
      // propio diálogo de resolución (primera pieza).
      if (resultado.codigo !== 'primera_pieza_pendiente') {
        setErrorCierre({ titulo: 'No se pudo cerrar la sesión', mensaje: resultado.error });
      }
      setMensajeJustificacion(null);
      return;
    }
    if (resultado.exito) {
      setPin('');
      setNotas('');
      setMotivoConsumo('');
      setMinutosSetup('');
      // Punto 11: el cierre ya se registró; el formulario se repliega solo para
      // no dejar al operador con la captura abierta y el botón "Cerrar" a mano.
      setCierreAbierto(false);
      // C17: el consumo de piezas del proceso anterior se registra después del
      // cierre para actualizar el inventario de piezas disponibles. Sin piezas
      // consumidas no hay nada que registrar (ni motivo que exigir).
      if (incluirConsumoPiezas && usadaConsumoPiezas + merma > 0) {
        const consumoPiezas = await registrarConsumoPiezasAccion({
          sesionId: proceso.sesionActiva.id,
          cantidadUsada: usadaConsumoPiezas,
          cantidadMerma: merma,
          motivo: motivoConsumo.trim(),
        });
        setMensajeConsumoPiezas(
          consumoPiezas.exito
            ? {
                tipo: 'ok',
                texto: `Piezas consumidas: ${formatearNumero(usadaConsumoPiezas, 0)} · merma: ${formatearNumero(merma, 0)}.`,
              }
            : {
                tipo: 'error',
                texto: `La sesión cerró, pero el consumo de piezas falló: ${consumoPiezas.error}`,
              },
        );
        if (!consumoPiezas.exito) {
          setErrorCierre({
            titulo: 'La sesión cerró, pero faltó registrar el consumo de piezas',
            mensaje: `${consumoPiezas.error} Corrige el consumo desde la ficha para no descontar de más del proceso anterior.`,
          });
        }
      }
      if (incluirConsumo && materialSeleccionado && resultado.datos) {
        setResumenCierre({
          material: materialSeleccionado,
          cantidadUsada: usada,
          cantidadMerma: merma,
          notas: notas.trim() || null,
          resultado: resultado.datos,
        });
      }
      // El operador cierra el proceso y, si lo decide, deja la inspección de
      // cierre en el mismo paso; el panel de administración solo la consulta.
      if (estadoDestino === 'finalizada' && registrarInspeccionCierre) {
        const recuperables = Number(recuperablesCierre) || 0;
        const scrap = Number(scrapCierre) || 0;
        const piezasInspeccion = piezasPrincipal;
        const inspeccion = await registrarInspeccionAccion({
          ordenId: proceso.ordenId,
          corridaId: proceso.sesionActiva?.corridaId ?? null,
          partidaId: proceso.partidaId,
          codigoItem: proceso.codigoPieza,
          tipo: 'CIERRE',
          resultado: resultadoInspeccionCierre,
          cantidadInspeccionada: piezasInspeccion,
          cantidadOk: Math.max(piezasInspeccion - recuperables - scrap, 0),
          cantidadNok: recuperables + scrap,
          cantidadRetrabajo: recuperables,
          cantidadScrap: scrap,
          sesionId: proceso.sesionActiva.id,
          ...(observacionesCierre.trim() ? { observaciones: observacionesCierre.trim() } : {}),
        });
        setMensajeInspeccionCierre(
          inspeccion.exito
            ? { tipo: 'ok', texto: 'Inspección de cierre registrada.' }
            : { tipo: 'error', texto: `La sesión cerró, pero la inspección falló: ${inspeccion.error}` },
        );
      }

      // C13.2: el retrabajo se registra al cerrar. Si falla, la sesión ya cerró
      // y el mensaje lo indica; no se repite si el formulario se reenvía.
      if (registrarRetrabajo && !retrabajoRegistrado) {
        if (!solicitudRetrabajo.current) solicitudRetrabajo.current = crypto.randomUUID();
        const retrabajo = await registrarRetrabajoAccion({
          sesionId: proceso.sesionActiva.id,
          materialId: retrabajoMaterialId || materialId,
          cantidadUsada: Number(retrabajoUsado),
          cantidadScrap: Number(retrabajoMerma),
          minutos: Number(retrabajoMinutos),
          causa: retrabajoCausa,
          motivo: retrabajoMotivo.trim(),
          resultado: retrabajoResultado,
          solicitudId: solicitudRetrabajo.current,
          ...(retrabajoNotas.trim() ? { notas: retrabajoNotas.trim() } : {}),
        });
        setMensajeRetrabajo(
          retrabajo.exito
            ? { tipo: 'ok', texto: 'Retrabajo registrado con su material y tiempo.' }
            : { tipo: 'error', texto: `La sesión cerró, pero el retrabajo falló: ${retrabajo.error}` },
        );
        if (retrabajo.exito) {
          setRetrabajoRegistrado(true);
          solicitudRetrabajo.current = null;
        }
      }

      // C13.3: descuenta el material del cliente (sin inventario ni costo).
      if (consumoCliente && !consumoClienteRegistrado) {
        if (!solicitudConsumoCliente.current) solicitudConsumoCliente.current = crypto.randomUUID();
        const consumo = await registrarConsumoMaterialClienteAccion({
          sesionId: proceso.sesionActiva.id,
          materialId: consumoClienteMaterialId,
          cantidadUsada: Number(consumoClienteUsado),
          cantidadScrap: Number(consumoClienteMerma),
          solicitudId: solicitudConsumoCliente.current,
        });
        setMensajeConsumoCliente(
          consumo.exito
            ? {
                tipo: 'ok',
                texto: `Material del cliente registrado. Saldo: ${formatearNumero(consumo.datos?.saldo ?? 0, 3)}.`,
              }
            : {
                tipo: 'error',
                texto: `La sesión cerró, pero el consumo del cliente falló: ${consumo.error}`,
              },
        );
        if (consumo.exito) {
          setConsumoClienteRegistrado(true);
          solicitudConsumoCliente.current = null;
        }
      }
    }
  }

  async function justificarHorasExtra(): Promise<void> {
    if (!proceso?.sesionActiva || procesandoJustificacion) return;
    if (motivoJustificacion.trim().length < 10) {
      setMensajeJustificacion({
        tipo: 'error',
        texto: 'Escribe una justificación de al menos 10 caracteres.',
      });
      return;
    }
    setProcesandoJustificacion(true);
    setMensajeJustificacion(null);
    try {
      const respuesta = await justificarHorasExtraAccion({
        sesionId: proceso.sesionActiva.id,
        motivo: motivoJustificacion.trim(),
      });
      if (!respuesta.exito) {
        setMensajeJustificacion({ tipo: 'error', texto: respuesta.error });
        return;
      }
      setMensajeJustificacion({
        tipo: 'ok',
        texto: 'Horas extra justificadas. Cerrando la sesión…',
      });
      setJustificacionAbierta(false);
      await ejecutarCierre();
    } catch {
      setMensajeJustificacion({
        tipo: 'error',
        texto: 'No se pudo registrar la justificación. Vuelve a intentarlo.',
      });
    } finally {
      setProcesandoJustificacion(false);
    }
  }

  async function solicitarAprobacionHorasExtra(): Promise<void> {
    if (!proceso?.sesionActiva || procesandoJustificacion) return;
    setProcesandoJustificacion(true);
    setMensajeJustificacion(null);
    try {
      const solicitud = await solicitarHorasExtraAccion({ sesionId: proceso.sesionActiva.id });
      if (!solicitud.exito) {
        setMensajeJustificacion({ tipo: 'error', texto: solicitud.error });
        return;
      }
      setMensaje({
        exito: false,
        codigo: 'horas_extra_solicitud_pendiente',
        error: `Solicitud de horas extra enviada (${formatearNumero(solicitud.datos?.horasAutorizadas ?? 0, 2)} h). Un responsable debe aprobarla antes de cerrar.`,
      });
    } catch {
      setMensajeJustificacion({
        tipo: 'error',
        texto: 'No se pudo enviar la solicitud. Vuelve a intentarlo.',
      });
    } finally {
      setProcesandoJustificacion(false);
    }
  }

  function cerrar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void ejecutarCierre();
  }

  async function liberarPrimeraPieza(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!proceso || procesandoPrimeraPieza) return;
    setProcesandoPrimeraPieza(true);
    setMensajePrimeraPieza(null);
    try {
      const aprobada = resultadoPrimeraPieza === 'APROBADA';
      const respuesta = await registrarInspeccionAccion({
        ordenId: proceso.ordenId,
        corridaId: proceso.sesionActiva?.corridaId ?? null,
        partidaId: proceso.partidaId,
        codigoItem: proceso.codigoPieza,
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
          ? 'Primera pieza liberada. Ya puedes finalizar la sesión sin salir de este proceso.'
          : 'Primera pieza rechazada. Corrige la pieza y vuelve a liberarla antes de declarar producción.',
      });
      setPrimeraPiezaAbierta(false);
      // Si veníamos del error de cierre, reintenta solo para no obligar al
      // operador a repetir el formulario que ya llenó.
      if (aprobada && reintentarCierreTrasPrimeraPieza) {
        setReintentarCierreTrasPrimeraPieza(false);
        await ejecutarCierre();
      }
    } catch {
      setMensajePrimeraPieza({
        tipo: 'error',
        texto: 'No se pudo registrar la primera pieza. Revisa la corrida y vuelve a intentarlo.',
      });
    } finally {
      setProcesandoPrimeraPieza(false);
    }
  }

  async function abrirArchivo(archivoId: string): Promise<void> {
    if (!proceso || archivoAbriendo !== null) return;
    setArchivoAbriendo(archivoId);
    setErrorArchivo(null);
    try {
      const respuesta = await obtenerUrlArchivoPisoAccion({
        ordenId: proceso.ordenId,
        archivoId,
      });
      if (!respuesta.exito) {
        setErrorArchivo(respuesta.error);
        return;
      }
      // La URL firmada dura cinco minutos y no se conserva en el estado.
      // Se abre en la pestaña actual para evitar el bloqueo de ventanas emergentes.
      if (!respuesta.datos?.url) {
        setMensaje({
          exito: false,
          error: 'No se pudo obtener el enlace de descarga del archivo.',
        });
        return;
      }

      window.location.assign(respuesta.datos.url);
    } catch {
      setErrorArchivo('No se pudo abrir el archivo. Intenta de nuevo.');
    } finally {
      setArchivoAbriendo(null);
    }
  }

  const contenido = (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        {presentacion === 'dialogo' ? (
          <>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-texto-secundario">{proceso.folioOrden}</span>
              <span>{proceso.codigoPieza}</span>
              <Badge variante={proceso.urgencia === 'vencida' || proceso.urgencia === 'urgente' ? 'peligro' : proceso.urgencia === 'proxima' ? 'alerta' : 'neutro'}>
                {textoCompromiso(proceso.fechaCompromiso, hoy)}
              </Badge>
              {proceso.prioridad !== 'normal' ? (
                <Badge variante="alerta">Prioridad {proceso.prioridad}</Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {proceso.clienteNombre} · {proceso.descripcion ?? 'Sin descripción de pieza'}
            </DialogDescription>
          </>
        ) : (
          <>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-texto-primario">
              <span className="font-mono text-sm text-texto-secundario">{proceso.folioOrden}</span>
              <span>{proceso.codigoPieza}</span>
              <Badge variante={proceso.urgencia === 'vencida' || proceso.urgencia === 'urgente' ? 'peligro' : proceso.urgencia === 'proxima' ? 'alerta' : 'neutro'}>
                {textoCompromiso(proceso.fechaCompromiso, hoy)}
              </Badge>
              {proceso.prioridad !== 'normal' ? (
                <Badge variante="alerta">Prioridad {proceso.prioridad}</Badge>
              ) : null}
            </h2>
            <p className="text-sm text-texto-secundario">
              {proceso.clienteNombre} · {proceso.descripcion ?? 'Sin descripción de pieza'}
            </p>
          </>
        )}
      </header>

      {proceso.notas ? (
        <p className="rounded-md bg-superficie-2 p-3 text-sm text-texto-secundario">
          <span className="font-semibold text-texto-primario">Notas de la orden: </span>
          {proceso.notas}
        </p>
      ) : null}

      <section
        aria-label="Resumen de la orden"
        className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie-2/60 p-3"
        data-testid="resumen-orden-operador"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-texto-tenue">Ruta de fabricación</p>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-sm font-medium text-texto-primario">
              {(proceso.procesosRuteo.length > 0
                ? proceso.procesosRuteo
                : [{
                  id: proceso.metaProcesoId ?? `${proceso.partidaId}:sin-proceso`,
                  secuencia: proceso.secuencia,
                  nombre: proceso.procesoNombre,
                  hechoPiezas: proceso.hechoPiezas,
                  metaPiezas: proceso.metaPiezas,
                }]
              ).map((paso, indice) => {
                const actual = paso.id === proceso.metaProcesoId
                  || (proceso.metaProcesoId === null && paso.id === `${proceso.partidaId}:sin-proceso`);
                return (
                  <span key={paso.id}>
                    {indice > 0 ? <span className="mx-1 text-texto-tenue">→</span> : null}
                    <span className={actual ? 'font-semibold text-acento-texto' : undefined}>
                      {indice + 1}. {paso.nombre}
                    </span>
                  </span>
                );
              })}
            </p>
          </div>
          <Badge variante={proceso.columna === 'lista' ? 'exito' : proceso.columna === 'pausada' ? 'alerta' : 'info'}>
            {ETIQUETAS_COLUMNA[proceso.columna]}
          </Badge>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Dato etiqueta="Estado" valor={proceso.estadoOrden} />
          <Dato etiqueta="Fecha entrega" valor={etiquetaDiaLargo(proceso.fechaCompromiso)} />
          <Dato etiqueta="Planeado" valor={proceso.programacion ? etiquetaDiaLargo(proceso.programacion.fecha) : 'Sin programar'} />
          <Dato
            etiqueta="Sesiones"
            valor={`${proceso.sesiones.length} registrada${proceso.sesiones.length === 1 ? '' : 's'}`}
          />
        </dl>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-label="Qué fabricar" className="rounded-lg border border-borde p-3">
          <h3 className="mb-2 text-sm font-semibold text-texto-primario">Qué fabricar</h3>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-texto-tenue">Descripción</dt>
              <dd className="break-words font-medium text-texto-primario">
                {proceso.descripcion ?? 'Sin descripción de pieza'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-texto-tenue">Material</dt>
              <dd className="break-words">
                {proceso.material
                  ? `${proceso.material.codigo} · ${proceso.material.nombre}`
                  : 'Sin material registrado'}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-texto-tenue">Medidas</dt>
                <dd>
                  {proceso.material?.anchoMm && proceso.material.largoMm
                    ? `${formatearNumero(proceso.material.anchoMm, 0)} × ${formatearNumero(proceso.material.largoMm, 0)} mm`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-texto-tenue">Cantidad</dt>
                <dd className="tabular-nums">
                  {formatearNumero(proceso.cantidadSolicitada, 0)} {proceso.unidadMedida}
                </dd>
              </div>
            </div>
          </dl>
        </section>

        <section aria-label="Archivos de la orden" className="rounded-lg border border-borde p-3">
          <h3 className="mb-2 text-sm font-semibold text-texto-primario">
            Planos y archivos ({proceso.archivos.length})
          </h3>
          {proceso.archivos.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sin archivos vigentes en la orden.</p>
          ) : (
            <ul className="grid max-h-40 gap-1 overflow-y-auto pr-1 text-sm">
              {proceso.archivos.map((archivo) => (
                <li key={archivo.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate" title={archivo.nombre}>{archivo.nombre}</span>
                  <span className="shrink-0 text-xs text-texto-tenue">{tamanoLegible(archivo.tamanoBytes)}</span>
                  <button
                    type="button"
                    onClick={() => void abrirArchivo(archivo.id)}
                    disabled={archivoAbriendo !== null}
                    className="shrink-0 text-xs font-semibold text-acento-texto underline-offset-2 hover:underline disabled:opacity-50"
                    aria-label={`Abrir o descargar ${archivo.nombre}`}
                  >
                    {archivoAbriendo === archivo.id ? 'Abriendo…' : 'Ver / Descargar'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errorArchivo ? (
            <p role="alert" className="mt-2 text-xs text-peligro-texto">{errorArchivo}</p>
          ) : null}
          {abrirHoja ? (
            <Link
              href={`/produccion-piso/hoja/${proceso.ordenId}`}
              className="mt-2 inline-flex text-sm font-semibold text-acento-texto underline-offset-2 hover:underline"
              data-testid="abrir-hoja-detalle"
            >
              Abrir hoja de trabajo
            </Link>
          ) : null}
        </section>

        {proceso.comentariosOrden.length > 0 ? (
          <section aria-label="Comentarios de la orden" className="rounded-lg border border-borde p-3" data-testid="comentarios-orden-operador">
            <h3 className="mb-2 text-sm font-semibold text-texto-primario">
              Comentarios de la orden ({proceso.comentariosOrden.length})
            </h3>
            <ul className="grid max-h-48 gap-2 overflow-y-auto pr-1">
              {proceso.comentariosOrden.map((comentario) => (
                <li key={comentario.id} className="rounded-md bg-superficie-2 p-2 text-sm">
                  <p className="whitespace-pre-line break-words text-texto-primario">{comentario.contenido}</p>
                  <p className="mt-1 text-xs text-texto-tenue">
                    {comentario.autorNombre} · {formatearFecha(comentario.creadoEn)} {formatearHora(comentario.creadoEn)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <section aria-label="Datos de la operación" className="rounded-lg border border-borde p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-texto-primario">
            Esta operación: {proceso.secuencia}. {proceso.procesoNombre}
          </h3>
          <span className="text-xs text-texto-secundario">{proceso.areaNombre}</span>
        </div>
        {proceso.piezasDisponibles !== null && proceso.piezasDisponibles > 0 ? (
          <p
            className="mb-3 rounded-md bg-acento-suave px-3 py-2 text-sm text-acento-texto"
            data-testid="aviso-piezas-disponibles"
          >
            <strong className="tabular-nums">{formatearNumero(proceso.piezasDisponibles, 0)}</strong>
            {' disponibles para '}{verboProceso(proceso.procesoNombre, proceso.areaMacro)}
            {proceso.procesoPrevioNombre ? `, listas desde ${proceso.procesoPrevioNombre}` : ''}.
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Dato
            etiqueta="Meta"
            valor={`${formatearNumero(proceso.hechoPiezas, 0)}/${formatearNumero(proceso.metaPiezas, 0)} ${proceso.unidadMedida}`}
          />
          <Dato etiqueta="Pendiente" valor={`${formatearNumero(proceso.pendientePiezas, 0)} ${proceso.unidadMedida}`} />
          <Dato etiqueta="Horas estimadas" valor={horasLegibles(proceso.horasEstimadas)} />
          <Dato
            etiqueta="Programación"
            valor={proceso.programacion
              ? `${turnoLegible(proceso.programacion.turno)} · ${proceso.programacion.recursoNombre ?? 'recurso'}`
              : 'Sin programar'}
          />
          {proceso.piezasDisponibles !== null ? (
            <Dato
              etiqueta="Piezas disponibles"
              valor={`${formatearNumero(proceso.piezasDisponibles, 0)} ${proceso.unidadMedida}${proceso.procesoPrevioNombre ? ` · de ${proceso.procesoPrevioNombre}` : ''}`}
            />
          ) : null}
          {proceso.esExterno ? <Dato etiqueta="Externo" valor={proceso.proveedorExterno ?? 'Sí'} /> : null}
        </dl>
        <div className="mt-3 grid gap-1">
          <p className="text-xs uppercase tracking-wide text-texto-tenue">Avance del proceso</p>
          <BarraProgreso valor={proceso.porcentaje} tono={proceso.columna === 'lista' ? 'exito' : 'acento'} mostrarPorcentaje etiqueta="Avance del proceso" />
        </div>
      </section>

        <section aria-label="Historial de sesiones" className="rounded-lg border border-borde p-3">
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-semibold text-texto-primario marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40">
              <span>Sesiones registradas ({proceso.sesiones.length})</span>
              {proceso.sesionActiva ? <Badge variante="exito">sesión activa</Badge> : null}
            </summary>
            <div className="mt-3">
              {proceso.sesiones.length === 0 ? (
                <p className="text-sm text-texto-secundario">Aún no hay sesiones para este proceso.</p>
              ) : (
                <ul className="grid max-h-44 gap-2 overflow-y-auto pr-1 text-sm">
                  {proceso.sesiones.map((sesion) => (
                    <li key={sesion.id} className="rounded-md bg-superficie-2/60 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{sesion.operadorNombre}</span>
                        <Badge variante={sesion.estadoSesion === 'activa' ? 'exito' : sesion.estadoSesion === 'pausada' ? 'alerta' : 'neutro'}>
                          {sesion.estadoSesion}
                        </Badge>
                      </div>
                      <p className="text-xs text-texto-secundario">
                        {etiquetaFechaHora(sesion.fechaInicio)} → {etiquetaFechaHora(sesion.fechaFin)}
                        {' . '}{formatearNumero(sesion.piezasProducidas, 0)} piezas
                        {' . '}{horasLegibles(sesion.horasNetas)} netas
                      </p>
                      {sesion.motivoPausa ? (
                        <p className="text-xs text-advertencia-texto">
                          Motivo: {etiquetaMotivoPausa(sesion.motivoPausa) ?? sesion.motivoPausa}
                        </p>
                      ) : null}
                      {sesion.notas ? (
                        <p className="whitespace-pre-wrap text-xs text-texto-secundario">{sesion.notas}</p>
                      ) : null}
                      {sesion.estadoSesion === 'pausada' ? (
                        <p className="text-xs text-texto-secundario">
                          {sesion.id === proceso.ultimaSesion?.id && proceso.puedeReanudar
                            ? 'Pausa vigente: puedes continuarla o cerrarla sin producir.'
                            : 'Periodo cerrado: conserva sus horas y no requiere cierre.'}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </section>

        <section aria-label="Consumo acumulado de materiales de la partida" className="rounded-lg border border-borde p-3">
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-semibold text-texto-primario marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40">
              <span>Consumo acumulado de materiales ({consumosDePartida.length})</span>
            </summary>
            <div className="mt-3">
              <p className="text-xs text-texto-secundario">
                Cantidades registradas para toda la partida, no exclusivamente para este proceso.
              </p>
              {consumosDePartida.length === 0 ? (
                <p className="mt-2 text-sm text-texto-secundario">
                  Todavía no se registraron consumos para esta partida.
                </p>
              ) : (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {consumosDePartida.map((consumo) => {
                    const material = materiales.find((item) => item.id === consumo.materialId);
                    const unidad = material?.unidadBase ?? '';
                    return (
                      <div
                        key={`${consumo.partidaId}-${consumo.materialId}`}
                        className="rounded-md bg-superficie-2/60 p-2"
                      >
                        <dt className="text-xs text-texto-secundario">
                          {material
                            ? `${material.codigo} · ${material.nombre}`
                            : `Material ${consumo.materialId}`}
                        </dt>
                        <dd className="mt-1 text-sm tabular-nums text-texto-primario">
                          Usado: {formatearNumero(consumo.cantidadUsada, 3)} {unidad}
                          {' · '}Merma: {formatearNumero(consumo.cantidadScrap, 3)} {unidad}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </div>
          </details>
        </section>

        {soloLectura ? (
          <p className="rounded-md bg-advertencia-suave p-3 text-sm text-advertencia-texto">
            Vista de solo lectura: no puedes reclamar, iniciar ni cerrar procesos.
          </p>
        ) : null}

        {mensaje && mensaje.exito ? (
          <p role="status" className="text-sm text-exito-texto">
            Acción registrada. Actualizando el tablero…
          </p>
        ) : null}

        {mensaje && !mensaje.exito && mensaje.codigo !== 'primera_pieza_pendiente' ? (
          <p role="alert" className="text-sm text-peligro-texto">
            {mensaje.error}
          </p>
        ) : null}

        {mensajeConsumoPiezas ? (
          <p
            role={mensajeConsumoPiezas.tipo === 'error' ? 'alert' : 'status'}
            className={mensajeConsumoPiezas.tipo === 'error'
              ? 'text-sm text-peligro-texto'
              : 'text-sm text-exito-texto'}
          >
            {mensajeConsumoPiezas.texto}
          </p>
        ) : null}

        {errorHorasExtra ? (
          <section
            aria-label="Horas extra por justificar"
            data-testid="horas-extra-cierre"
            className="grid gap-3 rounded-lg border border-advertencia/60 bg-advertencia-suave p-3"
          >
            <div>
              <p className="text-sm font-semibold text-advertencia-texto">
                La sesión superó la jornada del turno
              </p>
              <p className="text-xs text-texto-secundario">
                Puedes justificar el exceso con un motivo (queda registrado para revisión) o
                pedir que un responsable lo apruebe antes de cerrar.
              </p>
            </div>
            {mensajeJustificacion ? (
              <p
                role={mensajeJustificacion.tipo === 'error' ? 'alert' : 'status'}
                className={mensajeJustificacion.tipo === 'error'
                  ? 'text-sm text-peligro-texto'
                  : 'text-sm text-exito-texto'}
              >
                {mensajeJustificacion.texto}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                tamano="sm"
                variante="secundario"
                disabled={procesandoJustificacion}
                onClick={() => setJustificacionAbierta((valor) => !valor)}
                data-testid="justificar-horas-extra"
              >
                Justificar horas extra
              </Button>
              <Button
                type="button"
                tamano="sm"
                variante="contorno"
                disabled={procesandoJustificacion}
                onClick={() => void solicitarAprobacionHorasExtra()}
                data-testid="solicitar-horas-extra"
              >
                Pedir aprobación
              </Button>
            </div>
            {justificacionAbierta ? (
              <div className="grid gap-2">
                <label className={CLASE_ETIQUETA}>
                  Motivo de las horas extra
                  <Textarea
                    maxLength={270}
                    value={motivoJustificacion}
                    onChange={(evento) => setMotivoJustificacion(evento.target.value)}
                    placeholder="Explica por qué la sesión siguió abierta más allá de la jornada"
                    data-testid="motivo-justificacion-horas-extra"
                  />
                  <span className="text-xs font-normal text-texto-tenue">
                    Mínimo 10 caracteres. El motivo se guarda junto con las horas excedidas.
                  </span>
                </label>
                <Button
                  type="button"
                  tamano="sm"
                  disabled={procesandoJustificacion || motivoJustificacion.trim().length < 10}
                  onClick={() => void justificarHorasExtra()}
                  data-testid="confirmar-justificacion-horas-extra"
                >
                  {procesandoJustificacion ? 'Registrando…' : 'Justificar y finalizar'}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {proceso.reclamo ? (
          <p className="rounded-md bg-superficie-2 p-3 text-sm text-texto-secundario">
            <span className="font-semibold text-texto-primario">Reserva: </span>
            {proceso.reclamadoPorMi ? 'tuya' : `de ${proceso.nombreReclamante ?? 'otro operador'}`}
            {' . '}{etiquetaDiaLargo(proceso.reclamo.fecha)} . {turnoLegible(proceso.reclamo.turno)}
            {' . '}{horasLegibles(proceso.reclamo.horasEstimadas)}
          </p>
        ) : null}

        {sesionPausada ? (
          <section
            aria-label="Sesión pausada"
            data-testid="pausa-sesion-detalle"
            className="grid gap-1 rounded-lg border border-advertencia/50 bg-advertencia-suave p-3 text-sm"
          >
            <p className="font-semibold text-advertencia-texto">
              Sesión pausada:{' '}
              {etiquetaMotivoPausa(sesionPausada.motivoPausa) ?? 'sin motivo registrado'}
            </p>
            <p className="text-xs text-texto-secundario">
              {sesionPausada.operadorNombre}
              {' · '}{etiquetaFechaHora(sesionPausada.fechaInicio)} → {etiquetaFechaHora(sesionPausada.fechaFin)}
              {' · '}{horasLegibles(sesionPausada.horasNetas)} netas
            </p>
            {sesionPausada.motivoPausaNota ? (
              <p className="text-xs text-texto-secundario">{sesionPausada.motivoPausaNota}</p>
            ) : null}
            {proceso.puedeReanudar ? (
              <p className="text-xs text-advertencia-texto">
                Puedes retomarla con «Continuar sesión pausada»; el avance y las horas
                registradas se conservan.
              </p>
            ) : (
              <p className="text-xs text-texto-secundario">
                Este periodo ya está cerrado en el tiempo: conserva sus horas y su motivo.
                No requiere cierre y no se modifica al cerrar otra sesión.
              </p>
            )}
          </section>
        ) : null}

        {!soloLectura && primeraPiezaPendiente ? (
          <section
            aria-label="Primera pieza pendiente"
            data-testid="alerta-primera-pieza"
            className="flex flex-col gap-2 rounded-lg border border-advertencia/50 bg-advertencia-suave p-3"
          >
            <p className="text-sm font-semibold text-advertencia-texto">
              Antes de cerrar: libera la primera pieza
            </p>
            <p className="text-xs text-texto-secundario">
              Sin la revisión de la primera pieza el cierre se bloquea. Puedes hacerlo ahora, sin
              capturar el formulario de cierre.
            </p>
            <Button
              type="button"
              tamano="sm"
              className="self-start"
              onClick={() => {
                setMensajePrimeraPieza(null);
                setReintentarCierreTrasPrimeraPieza(false);
                setPrimeraPiezaAbierta(true);
              }}
              data-testid="alerta-liberar-primera-pieza"
            >
              Liberar primera pieza
            </Button>
          </section>
        ) : null}

        {!soloLectura ? (
          <section aria-label="Acciones del proceso" className="grid gap-3 rounded-lg border border-borde-fuerte p-3">
            {proceso.sesionActiva ? (
              <form className="grid gap-3" onSubmit={cerrar}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
                  aria-expanded={cierreAbierto}
                  aria-controls="cierre-sesion-campos"
                  onClick={() => setCierreAbierto((valor) => !valor)}
                  data-testid="alternar-cierre-sesion"
                >
                  <span>
                    <span className="block text-sm font-semibold text-texto-primario">
                      Cerrar la sesión en marcha
                    </span>
                    <span className="block text-xs text-texto-secundario">
                      {cierreAbierto ? 'Oculta el formulario de cierre' : 'Toca para registrar el cierre'}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'text-texto-secundario transition-transform duration-300',
                      cierreAbierto && 'rotate-180',
                    )}
                  >
                    ▾
                  </span>
                </button>
                <div
                  id="cierre-sesion-campos"
                  aria-hidden={!cierreAbierto}
                  inert={!cierreAbierto}
                  className={cn(
                    'grid transition-all duration-300 ease-out',
                    cierreAbierto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                  )}
                >
                  <div className="grid gap-3 overflow-hidden">
                {proceso.sesiones.some((sesion) => sesion.estadoSesion === 'pausada') ? (
                  <p
                    data-testid="nota-pausas-independientes"
                    className="rounded-md bg-superficie-2 px-3 py-2 text-xs text-texto-secundario"
                  >
                    Este cierre solo afecta la sesión en marcha. Las sesiones pausadas conservan
                    sus horas y su motivo como historial independiente: no se cierran ni se
                    modifican desde aquí.
                  </p>
                ) : null}
                <p className="text-xs text-texto-secundario">
                  La jornada del turno es de {HORAS_JORNADA_PREDETERMINADA} h. {AYUDA_HORAS_EXTRA}
                </p>
                {avisoJornada ? (
                  <p
                    role="status"
                    data-testid="aviso-horas-extra"
                    className="rounded-md bg-advertencia-suave px-3 py-2 text-sm text-advertencia-texto"
                  >
                    Llevas {horasSesion.toFixed(1)} h en esta sesión. Si el tiempo neto supera la
                    jornada, el cierre pedirá autorización de horas extra; solicítala a un
                    responsable antes de continuar.
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label className={CLASE_ETIQUETA}>
                      {etiquetaPiezas}
                      <CampoEntero
                        valor={piezas}
                        onValorCambiar={setPiezas}
                        required
                        data-testid="piezas-cierre"
                      />
                    </label>
                    <span className="text-xs font-normal text-texto-tenue">
                      {ayudaLimitePiezas(maximoPiezas)}
                    </span>
                  </div>
                  <label className={CLASE_ETIQUETA}>
                    Resultado
                    <Select value={estadoDestino} onChange={(evento) => setEstadoDestino(evento.target.value as 'pausada' | 'finalizada')}>
                      <option value="finalizada">Finalizar sesión de trabajo</option>
                      <option value="pausada">Pausar sesión de trabajo</option>
                    </Select>
                  </label>
                  {estadoDestino === 'finalizada' ? (
                    <label className={CLASE_ETIQUETA}>
                      Minutos de setup (opcional)
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={minutosSetup}
                        onChange={(evento) => setMinutosSetup(evento.target.value)}
                        placeholder="0"
                        data-testid="minutos-setup"
                      />
                      <span className="text-xs font-normal text-texto-tenue">
                        Identifica el setup dentro del tiempo real; no se cobra dos veces.
                      </span>
                    </label>
                  ) : null}
                  {estadoDestino === 'pausada' ? (
                    <label className={CLASE_ETIQUETA}>
                      Motivo de pausa
                      <Select value={motivoSeleccionado?.codigo ?? ''} onChange={(evento) => setMotivoPausa(evento.target.value)}>
                        {motivosPausa.map((motivo) => (
                          <option key={motivo.codigo} value={motivo.codigo}>
                            {motivo.nombre}{motivo.requiereNota ? ' (nota obligatoria)' : ''}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ) : null}
                  {estadoDestino === 'finalizada' && (
                    <div className="col-span-full grid gap-3 rounded-lg border border-borde p-3">
                      <p className="text-sm font-semibold">Consumo de material</p>

                      {esProcesoPosterior ? (
                        <>
                          <label className={CLASE_ETIQUETA}>
                            Material
                            <Select
                              value={proceso.partidaId}
                              disabled
                              data-testid="material-cierre"
                            >
                              <option value={proceso.partidaId}>
                                {proceso.codigoPieza} — {proceso.procesoPrevioNombre ?? 'piezas del proceso anterior'} ({formatearNumero(piezasDisponibles, 0)} disponibles)
                              </option>
                            </Select>
                            <span className="text-xs font-normal text-texto-tenue">
                              Piezas liberadas por el proceso anterior. No se consume la lámina completa.
                            </span>
                          </label>

                          <div className="grid grid-cols-2 gap-3">
                            <label className={CLASE_ETIQUETA}>
                              Usado
                              <CampoEntero
                                valor={cantidadUsada}
                                onValorCambiar={setCantidadUsada}
                                data-testid="usado-cierre"
                              />
                            </label>

                            <label className={CLASE_ETIQUETA}>
                              Merma
                              <CampoEntero
                                valor={cantidadMerma}
                                onValorCambiar={setCantidadMerma}
                                data-testid="merma-cierre"
                              />
                            </label>
                          </div>
                          <span className="text-xs font-normal text-texto-tenue">
                            Usado + merma descuenta del inventario de piezas. Disponibles: {formatearNumero(piezasDisponibles, 0)}.
                            {consumoAutomatico ? ' Si dejas «Usado» en 0, se toma 1:1 con lo producido.' : ''}
                          </span>
                          {consumoAutomatico ? (
                            <span
                              data-testid="aviso-consumo-automatico"
                              className="text-xs font-normal text-acento-texto"
                            >
                              Se consumirán {formatearNumero(usadaVista, 0)} piezas de {nombreProcesoPrevio} (igual que las producidas) y {formatearNumero(Number(cantidadMerma) || 0, 0)} de merma.
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <label className={CLASE_ETIQUETA}>
                            Material
                            <Select
                              value={materialId}
                              onChange={(evento) => setMaterialId(evento.target.value)}
                              data-testid="material-cierre"
                            >
                              <option value="">Selecciona un material</option>
                              {materiales.map((material) => (
                                <option key={material.id} value={material.id}>
                                  {material.codigo} — {material.nombre} ({material.unidadBase})
                                </option>
                              ))}
                            </Select>
                          </label>
                          {proceso.material && materialId === proceso.material.id ? (
                            <span className="text-xs font-normal text-texto-tenue">
                              Preseleccionado desde el material del ítem.
                            </span>
                          ) : null}

                          <div className="grid grid-cols-2 gap-3">
                            <label className={CLASE_ETIQUETA}>
                              Usado
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={cantidadUsada}
                                onChange={(evento) => setCantidadUsada(evento.target.value)}
                                data-testid="usado-cierre"
                              />
                            </label>

                            <label className={CLASE_ETIQUETA}>
                              Merma
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={cantidadMerma}
                                onChange={(evento) => setCantidadMerma(evento.target.value)}
                                data-testid="merma-cierre"
                              />
                            </label>
                          </div>
                        </>
                      )}

                      <label className={CLASE_ETIQUETA}>
                        Motivo del consumo
                        <Input
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

                      <div className="grid gap-3 rounded-lg bg-superficie-2 p-3">
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
                            {resultadoInspeccionCierre === 'RECHAZADA' ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className={CLASE_ETIQUETA}>
                                  Recuperables (retrabajo)
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={recuperablesCierre}
                                    onChange={(evento) => setRecuperablesCierre(evento.target.value)}
                                    data-testid="recuperables-inspeccion-cierre"
                                  />
                                </label>
                                <label className={CLASE_ETIQUETA}>
                                  Scrap definitivo
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={scrapCierre}
                                    onChange={(evento) => setScrapCierre(evento.target.value)}
                                    data-testid="scrap-inspeccion-cierre"
                                  />
                                </label>
                              </div>
                            ) : null}
                            <label className={CLASE_ETIQUETA}>
                              Observaciones (opcional)
                              <Textarea
                                maxLength={1000}
                                value={observacionesCierre}
                                onChange={(evento) => setObservacionesCierre(evento.target.value)}
                                placeholder="Detalles de la revisión final"
                              />
                            </label>
                          </>
                        ) : null}
                      </div>

                      {estadoDestino === 'finalizada' && itemsCorrida.length > 1 ? (
                        <div className="grid gap-3 rounded-lg border border-acento/40 bg-acento/5 p-3">
                          <label className="flex items-start gap-2 text-sm font-medium text-texto-primario">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4"
                              checked={integrada}
                              onChange={(evento) => setIntegrada(evento.target.checked)}
                              data-testid="corrida-integrada"
                            />
                            <span>
                              Los ítems se trabajaron juntos ({itemsCorrida.length})
                              <span className="block text-xs font-normal text-texto-secundario">
                                Declara las piezas por ítem; el avance de cada uno queda separado.
                                Los minutos por ítem son opcionales: el tiempo real de la sesión
                                se registra una sola vez.
                              </span>
                            </span>
                          </label>
                          {integrada ? (
                            <div className="grid gap-2">
                              <p className="text-xs text-texto-secundario">
                                Si capturas minutos por ítem, su suma no debe exceder el tiempo de
                                la sesión ({Math.max(horasSesion * 60, 1).toFixed(0)} min). Puedes
                                dejarlos vacíos para costear solo el total de la corrida.
                              </p>
                              {itemsCorrida.map((item) => (
                                <div
                                  key={item.partidaId}
                                  className="grid grid-cols-[1fr_6rem_6rem] items-end gap-2"
                                >
                                  <span className="text-sm font-medium text-texto-primario">
                                    {item.codigoPieza}
                                    {item.disponible !== null ? (
                                      <span className="block text-xs font-normal text-texto-tenue">
                                        disponible {formatearNumero(item.disponible, 0)}
                                      </span>
                                    ) : null}
                                  </span>
                                  <label className="flex flex-col gap-1 text-xs text-texto-secundario">
                                    Piezas
                                    <CampoEntero
                                      valor={piezasPorItem[item.partidaId] ?? '0'}
                                      onValorCambiar={(valor) => setPiezasPorItem((actual) => ({
                                        ...actual,
                                        [item.partidaId]: valor,
                                      }))}
                                      data-testid={`integrada-piezas-${item.codigoPieza}`}
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1 text-xs text-texto-secundario">
                                    Minutos (opcional)
                                    <Input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={minutosPorItem[item.partidaId] ?? ''}
                                      onChange={(evento) => setMinutosPorItem((actual) => ({
                                        ...actual,
                                        [item.partidaId]: evento.target.value,
                                      }))}
                                      data-testid={`integrada-minutos-${item.codigoPieza}`}
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {materialClientePartida.length > 0 ? (
                        <div className="grid gap-3 rounded-lg border border-borde p-3">
                          <p className="text-sm font-semibold text-texto-primario">Material del cliente</p>
                          <ul className="flex flex-col gap-1 text-xs text-texto-secundario">
                            {materialClientePartida.map((material) => (
                              <li key={material.materialId}>
                                {material.materialCodigo} · {material.materialNombre}: declarado{' '}
                                {formatearNumero(material.declarado, 3)}, usado{' '}
                                {formatearNumero(material.consumido, 3)}, saldo{' '}
                                <strong>{formatearNumero(material.saldo, 3)}</strong> {material.unidadBase}
                              </li>
                            ))}
                          </ul>
                          <label className="flex items-start gap-2 text-sm font-medium text-texto-primario">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4"
                              checked={consumoCliente}
                              onChange={(evento) => setConsumoCliente(evento.target.checked)}
                              data-testid="registrar-consumo-cliente"
                            />
                            <span>
                              Registrar consumo de material del cliente
                              <span className="block text-xs font-normal text-texto-secundario">
                                Se descuenta del saldo del cliente; no toca inventario propio.
                              </span>
                            </span>
                          </label>
                          {consumoCliente ? (
                            <>
                              <label className={CLASE_ETIQUETA}>
                                Material
                                <Select
                                  value={consumoClienteMaterialId}
                                  onChange={(evento) => setConsumoClienteMaterialId(evento.target.value)}
                                  data-testid="consumo-cliente-material"
                                >
                                  {materialClientePartida.map((material) => (
                                    <option key={material.materialId} value={material.materialId}>
                                      {material.materialCodigo} — {material.materialNombre} ({material.unidadBase})
                                    </option>
                                  ))}
                                </Select>
                              </label>
                              <div className="grid grid-cols-2 gap-3">
                                <label className={CLASE_ETIQUETA}>
                                  Usado
                                  <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={consumoClienteUsado}
                                    onChange={(evento) => setConsumoClienteUsado(evento.target.value)}
                                    data-testid="consumo-cliente-usado"
                                  />
                                </label>
                                <label className={CLASE_ETIQUETA}>
                                  Merma
                                  <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={consumoClienteMerma}
                                    onChange={(evento) => setConsumoClienteMerma(evento.target.value)}
                                    data-testid="consumo-cliente-merma"
                                  />
                                </label>
                              </div>
                            </>
                          ) : null}
                          <Button
                            type="button"
                            variante="contorno"
                            tamano="sm"
                            className="self-start"
                            onClick={() => {
                              setEstadoDestino('pausada');
                              setMotivoPausa('material_pendiente');
                              setNotas((actual) => actual || 'Falta de material del cliente: ');
                              setCierreAbierto(true);
                            }}
                            data-testid="pausar-falta-material-cliente"
                          >
                            Pausar por falta de material del cliente
                          </Button>
                        </div>
                      ) : null}

                      <div className="grid gap-3 rounded-lg border border-borde p-3">
                        <label className="flex items-start gap-2 text-sm font-medium text-texto-primario">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4"
                            checked={registrarRetrabajo}
                            onChange={(evento) => setRegistrarRetrabajo(evento.target.checked)}
                            data-testid="registrar-retrabajo"
                          />
                          <span>
                            Registrar retrabajo
                            <span className="block text-xs font-normal text-texto-secundario">
                              Trabajo extra con material propio, tiempo y causa. No cambia el avance.
                            </span>
                          </span>
                        </label>
                        {registrarRetrabajo ? (
                          <>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className={CLASE_ETIQUETA}>
                                Material del retrabajo
                                <Select
                                  value={retrabajoMaterialId || materialId}
                                  onChange={(evento) => setRetrabajoMaterialId(evento.target.value)}
                                  data-testid="retrabajo-material"
                                >
                                  <option value="">Selecciona un material</option>
                                  {materiales.map((material) => (
                                    <option key={material.id} value={material.id}>
                                      {material.codigo} — {material.nombre} ({material.unidadBase})
                                    </option>
                                  ))}
                                </Select>
                              </label>
                              <label className={CLASE_ETIQUETA}>
                                Tiempo del retrabajo (min)
                                <Input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={retrabajoMinutos}
                                  onChange={(evento) => setRetrabajoMinutos(evento.target.value)}
                                  data-testid="retrabajo-minutos"
                                />
                              </label>
                              <label className={CLASE_ETIQUETA}>
                                Usado
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={retrabajoUsado}
                                  onChange={(evento) => setRetrabajoUsado(evento.target.value)}
                                  data-testid="retrabajo-usado"
                                />
                              </label>
                              <label className={CLASE_ETIQUETA}>
                                Merma
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={retrabajoMerma}
                                  onChange={(evento) => setRetrabajoMerma(evento.target.value)}
                                  data-testid="retrabajo-merma"
                                />
                              </label>
                            </div>
                            <label className={CLASE_ETIQUETA}>
                              Causa
                              <Select
                                value={retrabajoCausa}
                                onChange={(evento) => setRetrabajoCausa(evento.target.value as CausaRetrabajo)}
                                data-testid="retrabajo-causa"
                              >
                                <option value="operador">Error del operador</option>
                                <option value="cliente">Cambio o error del cliente</option>
                                <option value="material">Defecto del material</option>
                                <option value="otro">Otro</option>
                              </Select>
                            </label>
                            <label className={CLASE_ETIQUETA}>
                              Resultado del retrabajo
                              <Select
                                value={retrabajoResultado}
                                onChange={(evento) =>
                                  setRetrabajoResultado(
                                    evento.target.value as 'PENDIENTE' | 'RECUPERADO' | 'SCRAP',
                                  )
                                }
                                data-testid="retrabajo-resultado"
                              >
                                <option value="PENDIENTE">Pendiente de validación</option>
                                <option value="RECUPERADO">Recuperado</option>
                                <option value="SCRAP">Scrap definitivo</option>
                              </Select>
                            </label>
                            <label className={CLASE_ETIQUETA}>
                              Motivo
                              <Input
                                maxLength={300}
                                value={retrabajoMotivo}
                                onChange={(evento) => setRetrabajoMotivo(evento.target.value)}
                                placeholder="Qué se corrigió y por qué"
                                data-testid="retrabajo-motivo"
                              />
                            </label>
                            <label className={CLASE_ETIQUETA}>
                              Notas (opcional)
                              <Textarea
                                maxLength={1000}
                                value={retrabajoNotas}
                                onChange={(evento) => setRetrabajoNotas(evento.target.value)}
                              />
                            </label>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
                  <label className={CLASE_ETIQUETA}>
                    PIN de confirmación
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      pattern="[0-9]{4,6}"
                      type="password"
                      value={pin}
                      onChange={(evento) => setPin(evento.target.value)}
                      required
                      data-testid="pin-cierre"
                    />
                  </label>

                  <label className={CLASE_ETIQUETA}>
                    Notas{estadoDestino === 'pausada' && motivoSeleccionado?.requiereNota
                      ? ' (obligatorias)'
                      : ' (opcional)'}
                    <Textarea
                      maxLength={1000}
                      value={notas}
                      onChange={(evento) => setNotas(evento.target.value)}
                      required={
                        estadoDestino === 'pausada' &&
                        motivoSeleccionado?.requiereNota === true
                      }
                    />
                  </label>

                  <Button
                    type="submit"
                    tamano="lg"
                    disabled={procesando}
                    data-testid="cerrar-sesion-detalle"
                  >
                    {estadoDestino === 'pausada'
                      ? 'Pausar sesión de trabajo'
                      : 'Finalizar sesión de trabajo'}
                  </Button>
                  </div>
                </div>
                  </form>
            ) : null}

            {proceso.columna !== 'lista' && !proceso.sesionActiva ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className={CLASE_ETIQUETA}>
                  Día de la jornada
                  <Input
                    type="date"
                    value={fecha}
                    onChange={(evento) => setFecha(evento.target.value)}
                  />
                </label>
                <label className={CLASE_ETIQUETA}>
                  Turno
                  <Select value={turno} onChange={(evento) => setTurno(evento.target.value)}>
                    {TURNOS.map((valor) => (
                      <option key={valor} value={valor}>{turnoLegible(valor)}</option>
                    ))}
                  </Select>
                </label>
                {puedeReclamar ? (
                  <Button type="button" tamano="lg" disabled={procesando} onClick={() => void reclamar()} data-testid="reclamar-detalle">
                    Reclamar
                  </Button>
                ) : null}
                {puedeMover ? (
                  <Button type="button" tamano="lg" variante="contorno" disabled={procesando} onClick={() => void mover()} data-testid="mover-detalle">
                    Mover reserva
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {proceso.puedeIniciar ? (
                <Button type="button" tamano="lg" disabled={procesando} onClick={() => acciones.iniciar(proceso)} data-testid="iniciar-detalle">
                  Iniciar proceso
                </Button>
              ) : null}
              {proceso.puedeReanudar ? (
                <Button type="button" tamano="lg" variante="secundario" disabled={procesando} onClick={() => void reanudar()} data-testid="reanudar-detalle">
                  Continuar sesión pausada
                </Button>
              ) : null}
              {proceso.puedeReanudar ? (
                <Button type="button" variante="contorno" disabled={procesando} onClick={() => void cerrarPausa()} data-testid="cerrar-pausa-detalle">
                  Cerrar pausa sin producir
                </Button>
              ) : null}
              {puedeLiberar ? (
                <Button type="button" variante="destructivo" disabled={procesando} onClick={() => void liberar()} data-testid="liberar-detalle">
                  Liberar reserva
                </Button>
              ) : null}
            </div>

            {proceso.motivoNoInicia ? (
              <p className="text-xs text-texto-secundario">{proceso.motivoNoInicia}</p>
            ) : null}
          </section>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variante="contorno" onClick={onCerrar}>Cerrar ficha</Button>
        </div>
    </div>
  );

  const anuncioResumenCierre = resumenCierre ? (
    <p className="sr-only" role="status" data-testid="resumen-cierre-registrado">
      Sesión finalizada: {formatearNumero(resumenCierre.resultado.piezasProducidas, 0)} piezas,
      {' '}{horasLegibles(resumenCierre.resultado.horasNetas)} netas y material registrado.
    </p>
  ) : null;

  const dialogoResumenCierre = resumenCierre ? (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) setResumenCierre(null);
      }}
    >
      <DialogContent
        className="max-w-md"
        data-testid="resumen-cierre-sesion"
        aria-label="Resumen de sesión finalizada"
      >
        <DialogHeader>
          <DialogTitle>Sesión finalizada</DialogTitle>
          <DialogDescription>
            {proceso.folioOrden} · {proceso.codigoPieza} · {proceso.procesoNombre}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-superficie-2 p-3">
          <Dato
            etiqueta={etiquetaPiezasProceso(proceso.procesoNombre, proceso.areaMacro)}
            valor={`${formatearNumero(resumenCierre.resultado.piezasProducidas, 0)} piezas`}
          />
          <Dato
            etiqueta="Tiempo neto"
            valor={horasLegibles(resumenCierre.resultado.horasNetas)}
          />
          <Dato etiqueta="Resultado" valor="Sesión finalizada" />
          <Dato etiqueta="Estado de orden" valor={resumenCierre.resultado.estadoOrden} />
          <Dato etiqueta="Planeación" valor={resumenCierre.resultado.estadoPlaneacion} />
          <Dato
            etiqueta="Material usado"
            valor={`${resumenCierre.material.codigo} · ${formatearNumero(resumenCierre.cantidadUsada, 3)} ${resumenCierre.material.unidadBase}`}
          />
          <Dato
            etiqueta="Merma"
            valor={`${formatearNumero(resumenCierre.cantidadMerma, 3)} ${resumenCierre.material.unidadBase}`}
          />
          {resumenCierre.notas ? <Dato etiqueta="Notas" valor={resumenCierre.notas} /> : null}
          {mensajeInspeccionCierre ? (
            <p
              role={mensajeInspeccionCierre.tipo === 'error' ? 'alert' : 'status'}
              className={cn(
                'col-span-full text-sm',
                mensajeInspeccionCierre.tipo === 'error' ? 'text-peligro-texto' : 'text-exito-texto',
              )}
              data-testid="mensaje-inspeccion-cierre"
            >
              {mensajeInspeccionCierre.texto}
            </p>
          ) : null}
          {mensajeRetrabajo ? (
            <p
              role={mensajeRetrabajo.tipo === 'error' ? 'alert' : 'status'}
              className={cn(
                'col-span-full text-sm',
                mensajeRetrabajo.tipo === 'error' ? 'text-peligro-texto' : 'text-exito-texto',
              )}
              data-testid="mensaje-retrabajo"
            >
              {mensajeRetrabajo.texto}
            </p>
          ) : null}
          {mensajeConsumoCliente ? (
            <p
              role={mensajeConsumoCliente.tipo === 'error' ? 'alert' : 'status'}
              className={cn(
                'col-span-full text-sm',
                mensajeConsumoCliente.tipo === 'error' ? 'text-peligro-texto' : 'text-exito-texto',
              )}
              data-testid="mensaje-consumo-cliente"
            >
              {mensajeConsumoCliente.texto}
            </p>
          ) : null}
        </dl>

        <DialogFooter>
          <Button type="button" onClick={() => setResumenCierre(null)}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  const dialogoPrimeraPieza = (
    <Dialog
      open={primeraPiezaAbierta}
      onOpenChange={(abierto) => {
        if (!procesandoPrimeraPieza) setPrimeraPiezaAbierta(abierto);
      }}
    >
      <DialogContent data-testid="dialogo-primera-pieza" aria-label="Liberar primera pieza">
        <DialogHeader>
          <DialogTitle>Liberar primera pieza</DialogTitle>
          <DialogDescription>
            {proceso.folioOrden} · {proceso.codigoPieza}. La inspección se registra en la corrida
            de esta sesión, sin salir del proceso.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(evento) => void liberarPrimeraPieza(evento)}>
          <label className={CLASE_ETIQUETA}>
            Resultado de la inspección
            <Select
              value={resultadoPrimeraPieza}
              onChange={(evento) => setResultadoPrimeraPieza(evento.target.value as 'APROBADA' | 'RECHAZADA')}
              data-testid="resultado-primera-pieza"
            >
              <option value="APROBADA">Aprobada: la pieza cumple</option>
              <option value="RECHAZADA">Rechazada: requiere corrección</option>
            </Select>
          </label>
          <label className={CLASE_ETIQUETA}>
            Observaciones (opcional)
            <Textarea
              maxLength={1000}
              value={observacionesPrimeraPieza}
              onChange={(evento) => setObservacionesPrimeraPieza(evento.target.value)}
              placeholder="Ej. Medidas y acabado conforme al plano."
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
  );

  const dialogoErrorPrimeraPieza = (
    <Dialog open={errorPrimeraPieza} onOpenChange={(abierto) => { if (!abierto) setMensaje(null); }}>
      <DialogContent
        className="max-w-md"
        data-testid="modal-primera-pieza-pendiente"
        aria-label="Falta liberar la primera pieza"
      >
        <DialogHeader>
          <DialogTitle>Falta liberar la primera pieza</DialogTitle>
          <DialogDescription>
            El cierre se bloqueó para no declarar producción sin la revisión de la primera pieza.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm text-texto-secundario">
          <p>Puedes resolverlo aquí mismo:</p>
          <ol className="list-decimal pl-5">
            <li>Libera la primera pieza con el resultado de la revisión.</li>
            <li>El cierre se reintenta solo con los datos que ya capturaste.</li>
          </ol>
        </div>
        <DialogFooter>
          <Button type="button" variante="contorno" onClick={() => setMensaje(null)}>
            Seguir editando
          </Button>
          <Button
            type="button"
            disabled={procesandoPrimeraPieza}
            onClick={() => {
              setMensaje(null);
              setMensajePrimeraPieza(null);
              setReintentarCierreTrasPrimeraPieza(true);
              setPrimeraPiezaAbierta(true);
            }}
            data-testid="modal-liberar-primera-pieza"
          >
            Liberar primera pieza
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const dialogoCierreFallido = errorCierre && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onKeyDown={(evento) => {
            if (evento.key === 'Escape') setErrorCierre(null);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="error-cierre-titulo"
            aria-describedby="error-cierre-detalle"
            data-testid="error-cierre-dialogo"
            className="grid w-full max-w-md gap-4 rounded-2xl bg-superficie p-6 shadow-elevada ring-1 ring-borde/60"
          >
            <div className="flex flex-col gap-1">
              <p id="error-cierre-titulo" className="text-lg font-bold text-texto-primario">
                {errorCierre.titulo}
              </p>
              <p id="error-cierre-detalle" className="text-sm text-texto-secundario">
                El cierre no se registró. Revisa el detalle y corrige lo que se indica.
              </p>
            </div>
            <p
              data-testid="error-cierre-mensaje"
              className="rounded-md bg-peligro-suave px-3 py-2 text-sm text-peligro-texto"
            >
              {errorCierre.mensaje}
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                autoFocus
                onClick={() => setErrorCierre(null)}
                data-testid="error-cierre-entendido"
              >
                Entendido
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  if (presentacion === 'integrado') {
    return (
      <section
        data-testid="detalle-proceso-integrado"
        aria-label={`Detalle de ${proceso.folioOrden} ${proceso.codigoPieza}`}
        className="rounded-xl border border-borde bg-superficie p-4"
      >
        {contenido}
        {anuncioResumenCierre}
        {dialogoResumenCierre}
        {dialogoPrimeraPieza}
        {dialogoErrorPrimeraPieza}
        {dialogoCierreFallido}
      </section>
    );
  }

  return (
    <>
      <Dialog open onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
        <DialogContent
          className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-[880px] flex-col gap-4 overflow-y-auto"
          data-testid="detalle-proceso"
          aria-label={`Detalle de ${proceso.folioOrden} ${proceso.codigoPieza}`}
        >
          {contenido}
        </DialogContent>
      </Dialog>
      {anuncioResumenCierre}
      {dialogoResumenCierre}
      {dialogoPrimeraPieza}
      {dialogoErrorPrimeraPieza}
      {dialogoCierreFallido}
    </>
  );
}

