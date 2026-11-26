'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
import { etiquetaEstado } from '@/compartido/utilidades/estados';
import { detalleMaterial, etiquetaMaterial } from '@/compartido/utilidades/material-etiqueta';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import { fechaLocalNegocio } from '@/compartido/utilidades/fecha-negocio';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import { fechaHoraLocalTallerAIso } from '@/modulos/produccion/servicios/calculo-tiempos-servicio';
import type { CierreSesionRegistrado } from '@/modulos/produccion/servicios/sesiones-servicio';
import type { ProcesoEspacioOperador, EstadoSesionTrabajo } from '@/modulos/produccion/tipos/indice';
import { ETIQUETAS_COLUMNA, etiquetaMotivoPausa } from '@/modulos/produccion/tipos/indice';
import {
  AYUDA_HORAS_EXTRA,
  HORAS_JORNADA_PREDETERMINADA,
  ahoraHoraInputNegocio,
  fechaHoraNegocioDesdeHora,
  horaFinEsFutura,
  ayudaLimitePiezas,
  etiquetaEstadoOrden,
  etiquetaEstadoPlaneacion,
  horasTranscurridasSesion,
  maximoPiezasProceso,
  validarCantidadPiezas,
} from '@/modulos/produccion/utilidades/indice';
import { etiquetaPiezasProceso, verboProceso } from '@/modulos/produccion/utilidades/procesos';
import type { SugerenciaCorrida } from '@/modulos/produccion/utilidades/agrupacion-corridas';
import {
  mensajeMotivoConsumoPiezas,
  piezasUsadasEfectivas,
  validarConsumoPiezasCierre,
} from '@/modulos/produccion/utilidades/consumo-piezas';
import { DialogoErrorCierre, type DatosErrorCierre } from '@/modulos/produccion/componentes/dialogo-error-cierre';
import { ContadorSesionVivo } from '@/modulos/produccion/componentes/contador-sesion-vivo';
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
  turnosDelDia,
  ventanaTurno,
} from '@/modulos/planeacion/utilidades/horario-laboral';
import {
  avisoHorasComida,
  duracionLegible,
  etiquetaDiaLargo,
  etiquetaFechaHora,
  horasBloquePausa,
  horasLegibles,
  maximoHorasVisiblesBloque,
  tamanoLegible,
  textoCompromiso,
  tiempoAcumuladoLegible,
  turnoLegible,
} from '@/modulos/produccion/utilidades/formato-operador';
import { mensajeAvisoSupervision } from '@/modulos/produccion/utilidades/mensajes-reclamo-recurso';
import { describirErrorProduccion } from '@/modulos/produccion/utilidades/mensajes-error-produccion';
import {
  resumirConsumosMateriales,
  type ConsumoMaterialVisible,
} from '@/modulos/produccion/utilidades/consumo-material-operador';
import type { MaterialPiso } from '@/modulos/ordenes/componentes/control-piso-panel';

export type ResultadoOperacion =
  | { exito: true; datos?: CierreSesionRegistrado; estadoSesion?: EstadoSesionTrabajo }
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
  /** C20: corrige piezas y hora real de una pausa automática por jornada. */
  actualizarAvance: (proceso: ProcesoEspacioOperador, datos: {
    sesionId: string;
    piezasProducidas: number;
    horasReales: number;
    notas?: string;
    materialId?: string | null;
    cantidadUsada?: number;
    cantidadScrap?: number;
    motivoConsumo?: string | null;
  }) => Promise<ResultadoOperacion>;
  cerrar: (proceso: ProcesoEspacioOperador, datos: {
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
    itemsIntegrados?: ItemIntegrado[];
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
  /** Sugerencia de este ítem para agruparlo en un lote con otros. */
  sugerenciaLote?: SugerenciaCorrida | null;
  onCrearLote?: (sugerencia: SugerenciaCorrida) => void | Promise<void>;
  creandoLote?: boolean;
  onCerrar: () => void;
  /** C15: refresca el tablero cuando la pausa automática cierra la jornada. */
  onPausaAutomatica?: () => void;

  presentacion?: 'dialogo' | 'integrado';
}

const CLASE_ETIQUETA = 'grid gap-1 text-sm font-medium text-texto-secundario';

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-texto-tenue">{etiqueta}</dt>
      <dd className="break-words text-sm font-medium text-texto-primario">{valor}</dd>
    </div>
  );
}

/**
 * C21: pausa corregible más reciente. Nunca debe caer en una sesión activa:
 * al reanudar, la pausa anterior queda como historial y la sesión activa es la
 * más reciente; corregir el avance sobre ella falla con `sesion_no_pausada`.
 */
function pausaCorregible(
  proceso: ProcesoEspacioOperador | null,
): ProcesoEspacioOperador['sesiones'][number] | null {
  if (!proceso) return null;
  return [...proceso.sesiones]
    .filter((sesion) => sesion.estadoSesion === 'pausada'
      && !sesion.sesionInvalida
      && !sesion.recursoLiberado)
    .sort((primera, segunda) => segunda.fechaInicio.localeCompare(primera.fechaInicio)
      || segunda.id.localeCompare(primera.id))[0] ?? null;
}

/** C10: ficha completa de la operación con las acciones que permite su estado. */
function nombreMotivoPausa(
  codigo: string | null | undefined,
  motivos: readonly { codigo: string; nombre: string }[],
): string | null {
  if (!codigo) return null;
  return motivos.find((motivo) => motivo.codigo === codigo)?.nombre
    ?? etiquetaMotivoPausa(codigo)
    ?? codigo;
}

export function DetalleProcesoOperador({
  proceso,
  hoy,
  soloLectura,
  procesando,
  motivosPausa,
  acciones,
  materiales,
  consumos,
  sugerenciaLote = null,
  onCrearLote,
  creandoLote = false,
  onCerrar,
  onPausaAutomatica,
  presentacion = 'dialogo',
}: PropsDetalleProceso) {
  // Un proceso reclamado por otro operador se consulta, pero no se opera: solo
  // quien lo reclamó puede actualizar avance, iniciar, reanudar o cerrar. El
  // aviso nombra al reclamante para que el operador sepa a quién pedirlo.
  const procesoAjeno = proceso !== null && proceso.reclamo !== null && !proceso.reclamadoPorMi;
  const soloDetalle = soloLectura || procesoAjeno;
  // C21: el día de la jornada es siempre el día operativo actual, no el de la
  // programación original con la que se reclamó el proceso.
  const [fecha, setFecha] = useState(hoy);
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
  // C31/A12: motivo cuando la sesión supera el tiempo estimado de la operación.
  const [demoraAbierta, setDemoraAbierta] = useState(false);
  const [opcionDemora, setOpcionDemora] = useState<'OLVIDE_CERRAR' | 'OTRO'>('OLVIDE_CERRAR');
  const [detalleDemora, setDetalleDemora] = useState('');
  const [horaRealDemora, setHoraRealDemora] = useState('');
  const [errorDemora, setErrorDemora] = useState<string | null>(null);
  const demoraConfirmada = useRef(false);
  const demoraPayload = useRef<{ motivo: 'OLVIDE_CERRAR' | 'OTRO'; detalle: string } | null>(null);
  const materialElegido = materiales.find((material) => material.id === materialId) ?? null;
  const [cantidadUsada, setCantidadUsada] = useState('0');
  const [cantidadMerma, setCantidadMerma] = useState('0');
  // B7: el consumo real exige motivo y el setup se identifica sin duplicar costo.
  const [motivoConsumo, setMotivoConsumo] = useState('');
  const [estadoDestino, setEstadoDestino] = useState<'pausada' | 'finalizada'>('finalizada');
  const [motivoPausa, setMotivoPausa] = useState('');
  const [notas, setNotas] = useState('');
  // C27: hora real de conclusión en hora del taller (America/Tijuana), no del
  // dispositivo. Solo viaja al servidor si el operador la corrige, para que un
  // cierre normal siga tomando la hora del servidor. Se precarga con un callback
  // ref porque en la ficha el input vive dentro de un Portal y en el primer
  // render del efecto todavía no está en el DOM.
  const horaFinRef = useRef<HTMLInputElement | null>(null);
  const horaFinEditada = useRef(false);
  const sesionHoraFinPrellenada = useRef<string | null>(null);
  const asignarHoraFin = useCallback((campo: HTMLInputElement | null) => {
    horaFinRef.current = campo;
    const idSesion = proceso?.sesionActiva?.id ?? null;
    if (!campo || idSesion === null || sesionHoraFinPrellenada.current === idSesion) return;
    campo.value = ahoraHoraInputNegocio();
    horaFinEditada.current = false;
    sesionHoraFinPrellenada.current = idSesion;
  }, [proceso?.sesionActiva?.id]);
  // C20/C21: corrección de la pausa (piezas, horas y notas). Se prefija con la
  // pausa corregible más reciente (nunca la sesión activa) para no restar
  // producción ni enviar la corrección a la sesión equivocada.
  // C31/A14: solo una pausa que aún necesita avance abre el formulario. Una
  // pausa manual con piezas declaradas se continúa, no se vuelve a declarar.
  const sesionesPausadasValidas = (proceso?.sesiones ?? []).filter(
    (sesion) => sesion.estadoSesion === 'pausada'
      && !sesion.sesionInvalida
      && !sesion.recursoLiberado,
  );
  // C31/A20: una pausa declarada no abre el formulario por el simple hecho de
  // existir. Solo se abre cuando falta avance, o cuando la operación completa
  // todavía necesita asentar consumo de material (C30). Corregir una pausa ya
  // declarada es una acción explícita del operador.
  const avanceConConsumoPendiente = proceso !== null
    && typeof proceso.piezasDisponibles !== 'number'
    && materiales.length > 0
    && !consumos.some((consumo) => consumo.partidaId === proceso.partidaId)
    && proceso.procesoCompleto === true;
  const sesionesParaAvance = sesionesPausadasValidas
    .filter((sesion) => sesion.pendienteActualizacionAvance
      || sesion.piezasProducidas === 0
      || avanceConConsumoPendiente)
    // La pausa más reciente es la que el operador acaba de vivir.
    .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio)
      || b.id.localeCompare(a.id));
  const sesionAvanceInicial = sesionesParaAvance[0] ?? pausaCorregible(proceso);
  const [avancePiezas, setAvancePiezas] = useState(
    () => (sesionAvanceInicial ? String(sesionAvanceInicial.piezasProducidas) : '0'),
  );
  const [avanceHoras, setAvanceHoras] = useState(
    () => (sesionAvanceInicial ? String(sesionAvanceInicial.horasNetas) : '0'),
  );
  const [avanceNotas, setAvanceNotas] = useState('');
  // C21: corrección de cualquier sesión pausada y consumo opcional.
  const [sesionCorreccionId, setSesionCorreccionId] = useState<string | null>(
    () => sesionAvanceInicial?.id ?? null,
  );
  const [avanceMaterialId, setAvanceMaterialId] = useState('');
  const [avanceUsada, setAvanceUsada] = useState('0');
  const [avanceScrap, setAvanceScrap] = useState('0');
  const [avanceMotivoConsumo, setAvanceMotivoConsumo] = useState('');
  // El formulario de avance se cierra en cuanto el servidor confirma el guardado.
  const [avanceGuardado, setAvanceGuardado] = useState(false);
  // A20: corregir una pausa declarada es intencional; no reabre el formulario
  // automáticamente al volver a entrar en la ficha.
  const [corregirAvanceManual, setCorregirAvanceManual] = useState(false);
  // C30: la operación quedó completa pero la sesión sigue pausada porque falta
  // asentar el consumo de materia prima. El formulario se repliega a un único
  // bloque con el consumo, sin repetir piezas ni horas.
  const [consumoPendienteAvance, setConsumoPendienteAvance] = useState(false);
  const [errorAvance, setErrorAvance] = useState<DatosErrorCierre | null>(null);
  const [sesionAnteriorAbierta, setSesionAnteriorAbierta] = useState(false);
  const [mensaje, setMensaje] = useState<ResultadoOperacion | null>(null);
  // C17: el cierre fallido se muestra en un diálogo modal para que el operador
  // lo vea aunque el formulario esté muy abajo; guarda el motivo exacto.
  const [errorCierre, setErrorCierre] = useState<DatosErrorCierre | null>(null);
  const [resumenCierre, setResumenCierre] = useState<ResumenCierreSesion | null>(null);
  const [archivoAbriendo, setArchivoAbriendo] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [primeraPiezaAbierta, setPrimeraPiezaAbierta] = useState(false);
  // C3: la aprobación se registra para el ítem elegido, no siempre para el
  // ítem principal de la sesión.
  const [itemPrimeraPieza, setItemPrimeraPieza] = useState('');
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

  // C27: al cumplirse la jornada acumulada del día, el servidor pausa la
  // sesión. El cliente ya no mide el reloj bruto contra 8 h: esa comparación
  // era la que dejaba correr el proceso sin que la pausa se disparara.
  useEffect(() => {
    const sesion = proceso?.sesionActiva;
    if (!sesion || soloDetalle) return;
    let cancelado = false;
    let falloAvisado = false;
    const revisar = async () => {
      // No interrumpir una captura de cierre en curso.
      if (cierreAbierto) return;
      const respuesta = await pausarSesionJornadaAccion({ sesionId: sesion.id });
      if (cancelado) return;
      if (!respuesta.exito) {
        if (!falloAvisado) {
          falloAvisado = true;
          setMensaje({
            exito: false,
            codigo: 'pausa_automatica_error',
            error: `No se pudo verificar la jornada del turno: ${respuesta.error}`,
          });
        }
        return;
      }
      falloAvisado = false;
      if ((respuesta.datos?.sesionesPausadas ?? 0) === 0) return;
      setMensaje({
        exito: false,
        codigo: 'pausa_automatica_jornada',
        error: 'Se cumplió la jornada acumulada del día: la sesión se pausó automáticamente. '
          + 'Actualiza el avance y la hora real, o justifica horas extra si debes terminarla hoy.',
      });
      onPausaAutomatica?.();
    };
    void revisar();
    const temporizador = window.setInterval(() => void revisar(), 60_000);
    return () => {
      cancelado = true;
      window.clearInterval(temporizador);
    };
  }, [proceso?.sesionActiva, soloDetalle, cierreAbierto, onPausaAutomatica]);

  if (!proceso) return null;

  const consumosDePartida = resumirConsumosMateriales(consumos).filter(
    (consumo) => consumo.partidaId === proceso.partidaId,
  );

  const motivoSeleccionado = motivosPausa.find((motivo) => motivo.codigo === motivoPausa)
    ?? motivosPausa[0]
    ?? null;
  // Obs. cliente: el operador ya no reclama; la reserva la crea la acción de inicio.
  const puedeReclamar = false;
  const puedeMover = !soloDetalle && proceso.reclamadoPorMi === true
    && proceso.sesionActiva === null
    && proceso.programacion?.estadoPlaneacion !== 'en_proceso'
    && proceso.programacion?.estadoPlaneacion !== 'bloqueada';
  const puedeLiberar = !soloDetalle && proceso.reclamadoPorMi === true
    && proceso.sesionActiva === null
    && proceso.programacion?.estadoPlaneacion !== 'en_proceso'
    && proceso.programacion?.estadoPlaneacion !== 'bloqueada';
  const abrirHoja = proceso.estadoOrden === 'en_proceso'
    && (proceso.reclamadoPorMi || (soloLectura && proceso.sesionActiva !== null));
  const horasSesion = proceso.sesionActiva
    ? horasTranscurridasSesion(proceso.sesionActiva.fechaInicio, ahoraAviso)
    : 0;
  // C27: horas netas ya registradas en las sesiones de esta operación. La
  // sesión en marcha se sumará cuando el servidor la cierre.
  const horasNetasOperacion = proceso.sesiones.reduce(
    (total, sesion) => total
      + (sesion.estadoSesion === 'activa' ? 0 : sesion.horasNetas),
    0,
  );
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
  // El consumo de materia prima solo puede valorizarse con un costo confirmado.
  // Avisar antes evita que el operador descubra el bloqueo al intentar cerrar.
  const materialSinCosto = estadoDestino === 'finalizada'
    && !esProcesoPosterior
    && materialElegido?.costoVigente === null;
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
  const partidasPrimeraPiezaPendientes = proceso.sesionActiva?.primeraPiezaPendientePartidas ?? [];
  const codigosPrimeraPiezaPendientes = partidasPrimeraPiezaPendientes.map((partidaId) =>
    itemsCorrida.find((item) => item.partidaId === partidaId)?.codigoPieza ?? 'Ítem de la corrida');
  const opcionesPrimeraPieza = itemsCorrida.length > 0
    ? itemsCorrida
    : [{ partidaId: proceso.partidaId, codigoPieza: proceso.codigoPieza }];
  function abrirPrimeraPieza(): void {
    setItemPrimeraPieza(partidasPrimeraPiezaPendientes[0] ?? proceso?.partidaId ?? '');
    setPrimeraPiezaAbierta(true);
  }
  // C15: la pausa (manual o automática) deja motivo, operador, corte y horas
  // netas. Se muestran juntos para que el operador sepa qué retomar.
  const sesionPausada = proceso.columna === 'pausada'
    && proceso.ultimaSesion?.estadoSesion === 'pausada'
    && !proceso.ultimaSesion.recursoLiberado
    ? proceso.ultimaSesion
    : null;
  // C29: la pausa se puede cerrar aunque no haya piezas para reanudar; de otro
  // modo la operación quedaría atrapada esperando al proceso anterior.
  const puedeCerrarPausa = sesionPausada !== null
    && !proceso.pendienteActualizacionAvance
    && !proceso.procesoCompleto;
  // C31/A16: se explica junto a las horas registradas, no solo dentro del
  // formulario, porque una pausa manual declarada ya no abre ese formulario.
  const avisoComidaPausa = sesionPausada ? avisoHorasComida(sesionPausada) : null;
  const sinPiezasParaReanudar = sesionPausada !== null
    && !proceso.pendienteActualizacionAvance
    && !proceso.procesoCompleto
    && proceso.piezasDisponibles === 0;
  const haySesionPausada = proceso.sesiones.some(
    (sesion) => sesion.estadoSesion === 'pausada' && !sesion.sesionInvalida && !sesion.recursoLiberado,
  );
  // C30: una operación que queda completa en este mismo avance ya no puede
  // "dejar el consumo para el cierre": el cierre requiere el consumo y la
  // sesión quedaría pausada. En la primera operación se pide aquí mismo.
  const sesionAvanceActual = sesionesParaAvance.find(
    (item) => item.id === sesionCorreccionId,
  ) ?? sesionAvanceInicial ?? null;
  // El tiempo real declarado pertenece al bloque de pausa seleccionado, no al
  // proceso completo. El servidor lo limita a la duración real del bloque;
  // mostrar el máximo evita que el operador caiga en el error una y otra vez.
  const maximoHorasBloque = sesionAvanceActual
    ? horasBloquePausa(sesionAvanceActual)
    : null;
  const avanceCompletaOperacion = proceso.metaPiezas > 0
    && proceso.hechoPiezas
      + ((Number(avancePiezas) || 0) - (sesionAvanceActual?.piezasProducidas ?? 0))
      >= proceso.metaPiezas;
  const requiereConsumoEnAvance = !esProcesoPosterior
    && materiales.length > 0
    // Si la partida ya registró consumo, el servidor no lo vuelve a exigir.
    && consumosDePartida.length === 0
    && (proceso.procesoCompleto || avanceCompletaOperacion);
  // Si el consumo es obligatorio para cerrar, se usa el material del ítem sin
  // obligar al operador a elegirlo otra vez.
  const materialConsumoAvanceId = avanceMaterialId !== ''
    ? avanceMaterialId
    : requiereConsumoEnAvance
      ? (materiales[0]?.id ?? '')
      : '';
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

  /** C21: declara piezas y tiempo real de cualquier sesión pausada. */
  async function actualizarAvance(): Promise<void> {
    const sesionId = sesionCorreccionId ?? pausaCorregible(proceso)?.id;
    if (!proceso || !sesionId) return;
    const sesionActual = proceso.sesiones.find((item) => item.id === sesionId);
    const piezasDeclaradas = Number(avancePiezas) || 0;
    // El tiempo real es del bloque pausado, no del proceso completo. Se valida
    // aquí con el mismo límite del servidor para no gastar el viaje ni caer en
    // un bucle de «ajustar y volver a fallar».
    const horasDeclaradas = Number(avanceHoras) || 0;
    const maximoBloque = sesionActual ? horasBloquePausa(sesionActual) : null;
    if (!Number.isFinite(horasDeclaradas) || horasDeclaradas < 0) {
      setErrorAvance({
        titulo: 'Tiempo real inválido',
        mensaje: 'Indica cuántas horas reales tardó este bloque (cero o más).',
      });
      return;
    }
    if (maximoBloque !== null && horasDeclaradas > maximoBloque) {
      mostrarErrorAvance({
        error: 'El tiempo real no puede ser mayor al que duró el bloque de pausa',
        codigo: 'horas_reales_exceden_sesion',
      });
      return;
    }
    // ¿Este avance deja la operación completa? El servidor solo mantiene la
    // pausa cuando falta el consumo de material; en ese caso el formulario debe
    // seguir visible para asentarlo. Un avance parcial sí cierra el formulario.
    const hechoEsperado = proceso.hechoPiezas
      + (piezasDeclaradas - (sesionActual?.piezasProducidas ?? 0));
    const operacionCompleta = proceso.metaPiezas > 0 && hechoEsperado >= proceso.metaPiezas;
    const materialConsumo = materialConsumoAvanceId;
    const usadaConsumo = Number(avanceUsada) || 0;
    const scrapConsumo = Number(avanceScrap) || 0;
    // Sin cantidades no hay consumo que registrar: no se envía material_id para
    // no finalizar la sesión dejando el consumo sin asentar.
    const registrarConsumo = materialConsumo !== ''
      && !esProcesoPosterior
      && usadaConsumo + scrapConsumo > 0;
    if (requiereConsumoEnAvance && !registrarConsumo) {
      setErrorAvance({
        titulo: 'Falta el consumo de material',
        mensaje: 'La operación queda completa con este avance. Indica cuánto material usaste (o la merma) para poder cerrar la pausa.',
      });
      return;
    }
    const resultado = await acciones.actualizarAvance(proceso, {
      sesionId,
      piezasProducidas: piezasDeclaradas,
      horasReales: Number(avanceHoras) || 0,
      ...(avanceNotas.trim() ? { notas: avanceNotas.trim() } : {}),
      ...(registrarConsumo
        ? {
            materialId: materialConsumo,
            cantidadUsada: usadaConsumo,
            cantidadScrap: scrapConsumo,
            motivoConsumo: avanceMotivoConsumo.trim() || 'Consumo al actualizar avance',
          }
        : {}),
    });
    if (!resultado.exito) {
      mostrarErrorAvance(resultado);
      return;
    }
    // C30: solo la falta de consumo de materia prima deja la operación completa
    // en pausa. Ese caso no es un error: se repliega el formulario a un único
    // bloque para registrar el consumo y cerrar. El aviso genérico de éxito sobra.
    setMensaje(null);
    const estadoFinal = resultado.estadoSesion ?? resultado.datos?.estadoSesion;
    const faltaConsumo = estadoFinal === 'pausada' && operacionCompleta;
    setConsumoPendienteAvance(faltaConsumo);
    setAvanceGuardado(!faltaConsumo);
    setCorregirAvanceManual(false);
    if (faltaConsumo) {
      if (avanceMaterialId === '' && materiales[0]) setAvanceMaterialId(materiales[0].id);
      return;
    }
    setAvancePiezas('0');
    setAvanceHoras('0');
    setAvanceMaterialId('');
  }

  /** C30: campos de consumo de materia prima, compartidos por el formulario
   *  de avance y por el bloque que cierra la pausa con consumo pendiente. */
  function camposConsumoAvance() {
    const materialIdActual = materialConsumoAvanceId || (materiales[0]?.id ?? '');
    return (
      <div className="grid gap-2 rounded-md border border-borde bg-superficie p-2">
        <label className={CLASE_ETIQUETA}>
          Material consumido
          <Select
            value={materialIdActual}
            onChange={(evento) => setAvanceMaterialId(evento.target.value)}
            data-testid="avance-material"
          >
            {materiales.map((material) => (
              <option key={material.id} value={material.id}>{material.nombre}</option>
            ))}
          </Select>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={CLASE_ETIQUETA}>
            Cantidad usada
            <Input
              value={avanceUsada}
              onChange={(evento) => setAvanceUsada(evento.target.value)}
              inputMode="decimal"
              data-testid="avance-material-usada"
            />
          </label>
          <label className={CLASE_ETIQUETA}>
            Merma
            <Input
              value={avanceScrap}
              onChange={(evento) => setAvanceScrap(evento.target.value)}
              inputMode="decimal"
              data-testid="avance-material-merma"
            />
          </label>
        </div>
        <label className={CLASE_ETIQUETA}>
          Motivo del consumo
          <Input
            value={avanceMotivoConsumo}
            onChange={(evento) => setAvanceMotivoConsumo(evento.target.value)}
            data-testid="avance-material-motivo"
          />
        </label>
      </div>
    );
  }

  /** Errores de avance con salidas accionables, no callejones sin salida. */
  function mostrarErrorAvance(resultado: { error: string; codigo?: string }): void {
    const sesionIdElegida = sesionCorreccionId ?? pausaCorregible(proceso)?.id ?? null;
    const sesion = proceso?.sesiones.find((item) => item.id === sesionIdElegida)
      ?? pausaCorregible(proceso);
    // Se trunca a minutos completos: un máximo redondeado hacia arriba supera
    // la duración real y el reintento vuelve a fallar (bucle de O-1126_09).
    const maximo = sesion ? horasBloquePausa(sesion) : null;
    const horasDeclaradas = Number(avanceHoras) || 0;
    const acciones: DatosErrorCierre['acciones'] = [];
    let mensaje = resultado.error;
    if (resultado.codigo === 'horas_reales_exceden_sesion') {
      const otrasPausas = (proceso?.sesiones ?? []).filter(
        (item) => item.estadoSesion === 'pausada'
          && !item.sesionInvalida
          && !item.recursoLiberado
          && item.id !== sesion?.id,
      );
      const alternativa = otrasPausas.find(
        (item) => (horasBloquePausa(item) ?? 0) >= horasDeclaradas,
      );
      if (maximo !== null) {
        const duracion = duracionLegible(maximo);
        mensaje = `Este bloque de pausa duró ${duracion}. El tiempo real que declares no puede ser mayor a esa duración.`
          + (otrasPausas.length > 0
            ? ' Si trabajaste más tiempo, cambia en «Sesión a actualizar» al bloque donde estuvo ese tiempo.'
            : ' Si seguiste trabajando después de la pausa, continúa la sesión para que el reloj cuente ese tiempo.');
        acciones.push({
          etiqueta: `Ajustar a ${duracion}`,
          alElegir: () => setAvanceHoras(String(maximo)),
        });
      }
      if (alternativa) {
        acciones.push({
          etiqueta: `Usar el bloque del ${etiquetaFechaHora(alternativa.fechaInicio)}`,
          alElegir: () => {
            setSesionCorreccionId(alternativa.id);
            setAvancePiezas(String(alternativa.piezasProducidas));
            setAvanceHoras(String(alternativa.horasNetas));
          },
        });
      }
    }
    if (resultado.codigo === 'horas_a_restar_exceden_sesion') {
      if (maximo !== null) {
        acciones.push({
          etiqueta: `Ajustar a ${duracionLegible(maximo)}`,
          alElegir: () => setAvanceHoras(String(maximo)),
        });
      }
    }
    if (resultado.codigo === 'sesion_antigua_pendiente') {
      const antigua = [...(proceso?.sesiones ?? [])]
        .filter((item) => item.estadoSesion === 'pausada' && item.pendienteActualizacionAvance && !item.sesionInvalida)
        .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))[0];
      if (antigua) {
        acciones.push({
          etiqueta: 'Ir a la sesión más antigua',
          alElegir: () => setSesionCorreccionId(antigua.id),
        });
      }
    }
    if (resultado.codigo === 'consumo_material_requerido') {
      acciones.push({
        etiqueta: 'Registrar consumo aquí',
        alElegir: () => setAvanceMaterialId(materiales[0]?.id ?? ''),
      });
      acciones.push({
        etiqueta: 'Dejarlo para el cierre',
        alElegir: () => setAvanceMaterialId(''),
      });
    }
    if (resultado.codigo === 'cantidad_excede_meta_proceso' || resultado.codigo === 'cantidad_producida_excede_solicitada') {
      acciones.push({
        etiqueta: 'Ajustar piezas al máximo permitido',
        alElegir: () => setAvancePiezas(String(maximoPiezas)),
      });
    }
    if (resultado.codigo === 'actualizacion_avance_invalida') {
      acciones.push({
        etiqueta: 'Poner horas en cero',
        alElegir: () => setAvanceHoras('0'),
      });
    }
    if (resultado.codigo === 'sesion_no_pausada' || resultado.codigo === 'orden_no_reanudable') {
      acciones.push({
        etiqueta: 'Cerrar ficha y actualizar tablero',
        alElegir: () => onCerrar(),
      });
    }
    setErrorAvance({
      titulo: 'No se pudo actualizar el avance',
      mensaje,
      acciones,
    });
  }

  /** Muestra el fallo del cierre en el diálogo modal y en el aviso inline. */
  function fallarCierre(resultado: {
    exito?: boolean;
    error: string;
    codigo?: string;
    titulo?: string;
    etiquetaCerrar?: string;
    accion?: DatosErrorCierre['accion'];
  }): void {
    setMensaje({
      exito: false,
      error: resultado.error,
      ...(resultado.codigo ? { codigo: resultado.codigo } : {}),
    });
    setErrorCierre({
      titulo: resultado.titulo ?? 'No se pudo cerrar la sesión',
      mensaje: resultado.error,
      ...(resultado.etiquetaCerrar ? { etiquetaCerrar: resultado.etiquetaCerrar } : {}),
      ...(resultado.accion ? { accion: resultado.accion } : {}),
    });
  }

  /** Hora local por defecto: inicio de la sesión + tiempo estimado. */
  function horaEstimadaLocal(): string {
    const inicio = new Date(proceso!.sesionActiva!.fechaInicio);
    const estimada = new Date(inicio.getTime() + proceso!.horasEstimadas * 3_600_000);
    return ahoraHoraInputNegocio(estimada);
  }

  /** C31/A12: abre el paso obligatorio cuando el tiempo real supera el estimado. */
  function requireMotivoDemora(): boolean {
    if (estadoDestino !== 'finalizada' || demoraConfirmada.current) return false;
    if (horasSesion <= proceso!.horasEstimadas + 10 / 60) return false;
    setOpcionDemora('OLVIDE_CERRAR');
    setDetalleDemora('');
    setHoraRealDemora(horaEstimadaLocal());
    setErrorDemora(null);
    setDemoraAbierta(true);
    return true;
  }

  /** C31/A12: guarda la elección del modal y reintenta el cierre con la captura intacta. */
  function confirmarDemora(): void {
    const texto = detalleDemora.trim();
    if (opcionDemora === 'OTRO') {
      if (texto.length < 10) {
        setErrorDemora('Escribe al menos 10 caracteres para explicar la demora.');
        return;
      }
    } else {
      if (!/^\d{2}:\d{2}$/u.test(horaRealDemora)) {
        setErrorDemora('Indica la hora real en que terminaste.');
        return;
      }
      // Misma interpretación que el cierre y la RPC: hora mural de Tijuana,
      // nunca la zona del dispositivo, con la tolerancia de dos minutos.
      const fechaNegocio = fechaLocalNegocio(new Date(proceso!.sesionActiva!.fechaInicio));
      const fin = new Date(fechaHoraLocalTallerAIso(
        `${fechaNegocio}T${horaRealDemora}`,
      )).getTime();
      const inicio = new Date(proceso!.sesionActiva!.fechaInicio).getTime();
      if (!Number.isFinite(fin) || fin <= inicio
        || horaFinEsFutura(horaRealDemora, fechaNegocio)) {
        setErrorDemora('La hora real debe estar entre el inicio de la sesión y ahora.');
        return;
      }
      if (horaFinRef.current) horaFinRef.current.value = horaRealDemora;
      horaFinEditada.current = true;
    }
    const detalle = opcionDemora === 'OTRO'
      ? texto
      : `Hora real declarada: ${horaRealDemora}`;
    demoraPayload.current = { motivo: opcionDemora, detalle };
    setDetalleDemora(detalle);
    demoraConfirmada.current = true;
    setErrorDemora(null);
    setDemoraAbierta(false);
    void ejecutarCierre();
  }

  async function ejecutarCierre(): Promise<void> {
    if (!proceso?.sesionActiva) return;
    setErrorCierre(null);
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
    if (requireMotivoDemora()) return;
    const valorHoraFin = horaFinRef.current?.value ?? '';
    if (horaFinEditada.current && !/^\d{2}:\d{2}$/u.test(valorHoraFin)) {
      fallarCierre({ exito: false, error: 'Indica la hora real de conclusión.' });
      return;
    }
    // A20: se comprueba antes de la RPC con la misma tolerancia del servidor.
    if (horaFinEditada.current
      && horaFinEsFutura(
        valorHoraFin,
        fechaLocalNegocio(new Date(proceso.sesionActiva.fechaInicio)),
      )) {
      const guiaHora = describirErrorProduccion('fecha_fin_futura');
      fallarCierre({
        exito: false,
        titulo: guiaHora.accion,
        error: guiaHora.mensaje,
        etiquetaCerrar: 'Volver a revisar',
        accion: {
          etiqueta: guiaHora.accion,
          alElegir: () => {
            setMensaje(null);
            window.requestAnimationFrame(() => {
              document.querySelector<HTMLElement>(`[data-testid="${guiaHora.campo}"]`)?.focus();
            });
          },
        },
      });
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
        titulo: 'Falta el motivo del consumo',
        error: 'Escribe por qué consumiste ese material. Necesitamos al menos 3 caracteres.',
        etiquetaCerrar: 'Volver a revisar',
      });
      return;
    }
    if (incluirConsumoPiezas) {
      const fallo = validarConsumoPiezasCierre({
        usada: usadaConsumoPiezas,
        merma,
        producidas: piezasCapturadas,
        disponibles: piezasDisponibles,
        procesoPrevio: nombreProcesoPrevio,
        procesoActual: proceso.procesoNombre,
      });
      if (fallo) {
        fallarCierre({
          exito: false,
          titulo: fallo.titulo,
          error: fallo.mensaje,
          etiquetaCerrar: 'Volver a revisar',
          ...(fallo.sugerirUsarProducidas
            ? {
                accion: {
                  etiqueta: `Usar ${formatearNumero(piezasCapturadas, 0)} piezas de ${nombreProcesoPrevio}`,
                  alElegir: () => {
                    setCantidadUsada(String(piezasCapturadas));
                    setMensaje(null);
                  },
                },
              }
            : {}),
        });
        return;
      }
      const totalPiezas = usadaConsumoPiezas + merma;
      if (totalPiezas > 0 && motivoConsumo.trim().length < 3) {
        fallarCierre({
          exito: false,
          titulo: 'Falta el motivo del consumo',
          error: mensajeMotivoConsumoPiezas(nombreProcesoPrevio, totalPiezas),
          etiquetaCerrar: 'Volver a revisar',
        });
        return;
      }
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
      ...(horaFinEditada.current && valorHoraFin
        ? {
            horaFin: fechaHoraNegocioDesdeHora(
              valorHoraFin,
              fechaLocalNegocio(new Date(proceso.sesionActiva.fechaInicio)),
            ),
          }
        : {}),
      ...(demoraPayload.current
        ? { motivoExceso: demoraPayload.current.motivo, detalleExceso: demoraPayload.current.detalle }
        : {}),
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
    });
    setMensaje(resultado);
    if (!resultado.exito) {
      // C15: el exceso de jornada ya no crea una solicitud a ciegas. El panel
      // muestra dos salidas: justificar el exceso o pedir aprobación.
      // El fallo se muestra además en el diálogo fijo, salvo que tenga su
      // propio diálogo de resolución (primera pieza).
      if (resultado.codigo === 'costo_material_no_configurado') {
        // El costo es una regla de negocio del servidor: no se inventa ni se
        // omite. La salida es pausar la sesión y avisar, sin perder la captura.
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
                exito: false,
                error: `${aviso}. La sesión quedó lista para pausar: revisa los datos y confirma.`,
              });
            },
          }],
        });
      } else if (resultado.codigo === 'consumo_material_requerido') {
        setErrorCierre({
          titulo: 'Falta registrar el consumo',
          mensaje: resultado.error,
          acciones: [{
            etiqueta: 'Registrar consumo aquí',
            alElegir: () => {
              if (!materialId && materiales[0]) setMaterialId(materiales[0].id);
              setCantidadUsada(String(Math.max(Number(piezas) || 0, 1)));
              setMensaje(null);
            },
          }],
        });
      } else if (resultado.codigo !== 'primera_pieza_pendiente') {
        const guia = describirErrorProduccion(resultado.codigo ?? 'desconocido');
        setErrorCierre({
          titulo: guia.accion,
          mensaje: resultado.error,
          etiquetaCerrar: 'Volver a revisar',
          acciones: [{
            etiqueta: guia.accion,
            alElegir: () => {
              setMensaje(null);
              if (guia.campo) {
                window.requestAnimationFrame(() => {
                  document.querySelector<HTMLElement>(`[data-testid="${guia.campo}"]`)?.focus();
                });
              }
            },
          }],
        });
      }
      setMensajeJustificacion(null);
      return;
    }
    if (resultado.exito) {
      demoraConfirmada.current = false;
      demoraPayload.current = null;
      setDetalleDemora('');
      setNotas('');
      setMotivoConsumo('');
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
                texto: [
                  `Piezas consumidas: ${formatearNumero(usadaConsumoPiezas, 0)}`,
                  ...(merma > 0 ? [`merma: ${formatearNumero(merma, 0)}`] : []),
                ].join(' · ') + '.',
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
        partidaId: itemPrimeraPieza || proceso.partidaId,
        codigoItem: itemsCorrida.find((item) => item.partidaId === itemPrimeraPieza)?.codigoPieza
          ?? proceso.codigoPieza,
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
              {proceso.columna === 'lista' ? <Badge variante="exito">Proceso completado</Badge> : null}
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
              {proceso.columna === 'lista' ? <Badge variante="exito">Proceso completado</Badge> : null}
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
          <Dato etiqueta="Estado" valor={etiquetaEstadoOrden(proceso.estadoOrden)} />
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
        {sugerenciaLote && onCrearLote && !soloDetalle ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-acento/40 bg-acento-suave p-2"
            data-testid={`sugerencia-lote-detalle-${sugerenciaLote.clave}`}
          >
            <p className="min-w-0 flex-1 text-xs text-texto-primario">{sugerenciaLote.mensaje}</p>
            <Button
              type="button"
              tamano="sm"
              disabled={creandoLote || procesando}
              onClick={() => void onCrearLote(sugerenciaLote)}
              data-testid={`crear-lote-detalle-${sugerenciaLote.clave}`}
            >
              {creandoLote ? 'Creando…' : 'Crear Lote'}
            </Button>
          </div>
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
              ? `${proceso.procesoNombre} · ${turnoLegible(proceso.programacion.turno)} · ${
                [proceso.programacion.recursoCodigo, proceso.programacion.recursoNombre]
                  .filter(Boolean)
                  .join(' · ') || 'recurso'
              }`
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
        {proceso.sesionActiva ? (
          <div
            className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-borde bg-superficie-2/60 px-3 py-2 text-sm"
            data-testid="sesion-en-curso-detalle"
          >
            <span
              className="font-medium text-texto-primario"
              data-testid="tiempo-acumulado-detalle"
            >
              Tiempo acumulado: {tiempoAcumuladoLegible(proceso.horasAcumuladas ?? 0)}
            </span>
            <span className="text-texto-tenue">Bloque actual</span>
            <ContadorSesionVivo
              fechaInicio={proceso.sesionActiva.fechaInicio}
              limiteHoras={proceso.horasEstimadas}
              testId="contador-sesion-detalle"
            />
            <span className="text-texto-secundario">
              Sesión iniciada {etiquetaFechaHora(proceso.sesionActiva.fechaInicio)}
            </span>
            <span className="text-xs text-texto-tenue">
              Estimado de la orden: {horasLegibles(proceso.horasEstimadas)}. Si ya se superó,
              cierra la sesión igual: se registra el tiempo real.
            </span>
          </div>
        ) : null}
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
                          {etiquetaEstado(sesion.estadoSesion)}
                        </Badge>
                      </div>
                      <p className="text-xs text-texto-secundario">
                        {etiquetaFechaHora(sesion.fechaInicio)} → {etiquetaFechaHora(sesion.fechaFin)}
                        {' . '}{formatearNumero(sesion.piezasProducidas, 0)} piezas
                        {' . '}{horasLegibles(sesion.horasNetas)} netas
                      </p>
                      {sesion.motivoPausa ? (
                        <p className="text-xs text-advertencia-texto">
                          Motivo: {nombreMotivoPausa(sesion.motivoPausa, motivosPausa)}
                        </p>
                      ) : null}
                      {sesion.notas ? (
                        <p className="whitespace-pre-wrap text-xs text-texto-secundario">{sesion.notas}</p>
                      ) : null}
                      {sesion.estadoSesion === 'pausada' ? (
                        sesion.sesionInvalida ? (
                          <Badge variante="neutro" data-testid={`sesion-invalida-${sesion.id}`}>No válida</Badge>
                        ) : (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-texto-secundario">
                              {sesion.pendienteActualizacionAvance
                                ? 'Pausa automática: declara piezas y tiempo real.'
                                : 'Pausa registrada: puedes actualizar su estado.'}
                            </span>
                            {!soloDetalle ? (
                              <button
                                type="button"
                                className="text-xs text-acento-texto underline underline-offset-2"
                                onClick={() => setSesionCorreccionId(sesion.id)}
                                data-testid={`actualizar-estado-${sesion.id}`}
                              >
                                Actualizar estado
                              </button>
                            ) : null}
                          </div>
                        )
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

        {proceso.avisoSupervision ? (
          <p
            role="status"
            data-testid={`aviso-supervision-${proceso.id}`}
            className="rounded-md bg-acento-suave p-3 text-sm text-acento-texto"
          >
            {mensajeAvisoSupervision(proceso.avisoSupervision)}
          </p>
        ) : null}

        {proceso.ultimaSesion?.motivoExceso ? (
          <p
            role="status"
            data-testid="aviso-motivo-demora"
            className="rounded-md bg-superficie-2 p-3 text-xs text-texto-secundario"
          >
            Demora registrada: {proceso.ultimaSesion.motivoExceso === 'OLVIDE_CERRAR'
              ? 'olvidó cerrar la sesión'
              : proceso.ultimaSesion.motivoExcesoDetalle}.
            {' '}{proceso.ultimaSesion.motivoExcesoDetalle ?? ''}
          </p>
        ) : null}

        {procesoAjeno ? (
          <p
            role="status"
            data-testid="aviso-proceso-tomado"
            className="rounded-md bg-advertencia-suave p-3 text-sm text-advertencia-texto"
          >
            Este proceso lo tiene {proceso.nombreReclamante ?? 'otro operador'}. Puedes consultar
            los detalles, pero solo quien lo reclamó puede registrar avance, iniciar, reanudar o
            cerrar.
          </p>
        ) : soloLectura ? (
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
                El día ya acumuló más de la jornada
              </p>
              <p className="text-xs text-texto-secundario">
                La jornada son {HORAS_JORNADA_PREDETERMINADA} h netas del día y suma todas tus
                sesiones (la comida de 12 a 13 no se cuenta). Este cierre agregaría el tiempo de
                la sesión en marcha y superaría el límite del turno. Si el proceso terminó antes y
                la sesión quedó abierta por olvido, corrige la <strong>hora real de conclusión</strong>
                {' '}en el formulario y vuelve a intentar. Si de verdad trabajaste de más, justifica
                el exceso o pide aprobación a un responsable.
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
                onClick={() => {
                  setCierreAbierto(true);
                  window.setTimeout(() => {
                    const campo = document.getElementById('hora-fin-cierre');
                    if (campo instanceof HTMLInputElement) {
                      campo.focus();
                      campo.scrollIntoView({ block: 'center' });
                    }
                  }, 350);
                }}
                data-testid="corregir-hora-fin"
              >
                Corregir hora real
              </Button>
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

        {sesionPausada ? (
          <section
            aria-label="Sesión pausada"
            data-testid="pausa-sesion-detalle"
            className="grid gap-1 rounded-lg border border-advertencia/50 bg-advertencia-suave p-3 text-sm"
          >
            <p className="font-semibold text-advertencia-texto">
              Sesión pausada:{' '}
              {nombreMotivoPausa(sesionPausada.motivoPausa, motivosPausa) ?? 'sin motivo registrado'}
            </p>
            <p className="text-xs text-texto-secundario">
              {sesionPausada.operadorNombre}
              {' · '}{etiquetaFechaHora(sesionPausada.fechaInicio)} → {etiquetaFechaHora(sesionPausada.fechaFin)}
              {' · '}{horasLegibles(sesionPausada.horasNetas)} netas
            </p>
            <p
              className="text-xs text-texto-secundario"
              data-testid="duracion-bloque-pausa"
            >
              Este bloque de pausa duró {duracionLegible(horasBloquePausa(sesionPausada) ?? 0)}.
              El tiempo real que declares al actualizar el avance no puede ser mayor.
            </p>
            {avisoComidaPausa ? (
              <p
                className="rounded-md border border-advertencia/50 bg-superficie p-2 text-xs text-advertencia-texto"
                data-testid="aviso-comida-sin-horas"
              >
                {avisoComidaPausa}
              </p>
            ) : null}
            {sesionPausada.motivoPausaNota ? (
              <p className="text-xs text-texto-secundario">{sesionPausada.motivoPausaNota}</p>
            ) : null}
            {procesoAjeno ? (
              <p className="text-xs text-texto-secundario" data-testid="aviso-pausa-proceso-ajeno">
                Solo quien tiene el proceso ({proceso.nombreReclamante ?? 'otro operador'}) puede
                declarar el avance de esta pausa, reanudarla o cerrarla.
              </p>
            ) : proceso.pendienteActualizacionAvance ? (
              <p className="text-xs text-peligro-texto" data-testid="aviso-avance-pendiente">
                La jornada se cumplió antes de que declararas el avance. Declara las piezas
                producidas y las horas que faltaron para la pausa: con eso se calcula la hora
                real de término y se corrige el tiempo. No puedes continuar hasta hacerlo.
              </p>
            ) : proceso.procesoCompleto ? (
              <p className="text-xs text-advertencia-texto">
                La operación ya está completa. Registra el consumo pendiente para cerrar la pausa.
              </p>
            ) : sinPiezasParaReanudar ? (
              <p className="text-xs text-texto-secundario" data-testid="aviso-sin-piezas-reanudar">
                Todavía no hay piezas de {nombreProcesoPrevio}: espera a que libere más piezas para
                reanudar. Mientras tanto puedes cerrar esta pausa sin producir.
              </p>
            ) : proceso.puedeReanudar ? (
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

        {!soloDetalle && primeraPiezaPendiente ? (
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
                abrirPrimeraPieza();
              }}
              data-testid="alerta-liberar-primera-pieza"
            >
              Liberar primera pieza
            </Button>
          </section>
        ) : null}

        {!soloDetalle ? (
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
                  <div className="grid min-h-0 gap-3 overflow-clip">
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
                <details className="rounded-md bg-superficie-2 px-3 py-2">
                  <summary className="cursor-pointer list-none text-xs text-texto-secundario marker:content-none">
                    Jornada y horas de esta sesión
                  </summary>
                  <div className="mt-2 grid gap-1 text-xs text-texto-secundario">
                    <p>
                      La jornada es de {HORAS_JORNADA_PREDETERMINADA} h netas acumuladas del día
                      (la comida de 12 a 13 no se cuenta). {AYUDA_HORAS_EXTRA}
                    </p>
                    <p data-testid="horas-netas-operacion">
                      {horasNetasOperacion > 0
                        ? `Este proceso ya registró ${horasNetasOperacion.toFixed(2)} h netas en sesiones cerradas. `
                        : 'Este proceso aún no tiene horas netas cerradas. '}
                      Llevas {horasSesion.toFixed(1)} h de reloj en la sesión en marcha.
                    </p>
                  </div>
                </details>
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
                    <Select
                      value={estadoDestino}
                      onChange={(evento) => setEstadoDestino(evento.target.value as 'pausada' | 'finalizada')}
                      data-testid="resultado-cierre"
                    >
                      <option value="finalizada">Finalizar sesión de trabajo</option>
                      <option value="pausada">Pausar sesión de trabajo</option>
                    </Select>
                  </label>
                  <label className={`${CLASE_ETIQUETA} sm:col-span-2`}>
                    Hora real de conclusión
                    <Input
                      ref={asignarHoraFin}
                      id="hora-fin-cierre"
                      type="time"
                      defaultValue=""
                      required
                      onChange={() => {
                        horaFinEditada.current = true;
                      }}
                      data-testid="hora-fin-cierre"
                    />
                    <span className="text-xs font-normal text-texto-tenue">
                      Solo la hora: la fecha se toma del día de negocio del taller. Se usa para
                      calcular el tiempo real del proceso. Si terminó antes y olvidaste cerrar la
                      sesión, corrige esta hora para no cargar horas de más.
                    </span>
                  </label>
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
                            Piezas de {nombreProcesoPrevio} que consumiste. Usado + merma descuenta del inventario de piezas (disponibles: {formatearNumero(piezasDisponibles, 0)}). Debe ser al menos lo producido aquí; si dejas «Usado» en 0, se toma 1:1.
                          </span>
                          {consumoAutomatico ? (
                            <span
                              data-testid="aviso-consumo-automatico"
                              className="text-xs font-normal text-acento-texto"
                            >
                              Se consumirán {formatearNumero(usadaVista, 0)} piezas de {nombreProcesoPrevio} (igual que las producidas) y {formatearNumero(Number(cantidadMerma) || 0, 0)} de merma.
                            </span>
                          ) : null}
                          {!consumoAutomatico
                            && Number(cantidadUsada) > 0
                            && usadaVista < piezasCapturadasVista ? (
                              <span
                                data-testid="aviso-consumo-insuficiente"
                                className="text-xs font-normal text-advertencia-texto"
                              >
                                Capturaste {formatearNumero(usadaVista, 0)} en «Usado» y declaras {formatearNumero(piezasCapturadasVista, 0)} producidas: faltan {formatearNumero(piezasCapturadasVista - usadaVista, 0)}. Bórralo (0) para consumir 1:1 o captura al menos las producidas.
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
                                <option
                                  key={material.id}
                                  value={material.id}
                                  title={detalleMaterial(material.codigo, material.nombre, material.unidadBase)}
                                >
                                  {etiquetaMaterial(material.codigo, material.nombre)}
                                </option>
                              ))}
                            </Select>
                          </label>
                          {proceso.material && materialId === proceso.material.id ? (
                            <span className="text-xs font-normal text-texto-tenue">
                              Preseleccionado desde el material del ítem.
                            </span>
                          ) : null}
                          {materialSinCosto && materialElegido ? (
                            <span
                              data-testid="aviso-material-sin-costo"
                              className="text-xs font-normal text-advertencia-texto"
                            >
                              {materialElegido.nombre} no tiene costo confirmado. No puedes
                              finalizar mientras falte; pide a administración que lo registre en
                              Materiales y costos o pausa la sesión.
                            </span>
                          ) : null}
                          {materialElegido ? (
                            <span className="text-xs font-normal text-texto-tenue">
                              Unidad del material: {materialElegido.unidadBase}.
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
                        <details className="rounded-lg border border-borde p-3">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-texto-primario marker:content-none">
                            Material del cliente
                          </summary>
                          <div className="mt-3 grid gap-3">
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
                                    <option
                                      key={material.materialId}
                                      value={material.materialId}
                                      title={detalleMaterial(material.materialCodigo, material.materialNombre, material.unidadBase)}
                                    >
                                      {etiquetaMaterial(material.materialCodigo, material.materialNombre)}
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
                        </details>
                      ) : null}

                      <details className="rounded-lg border border-borde p-3">
                        <summary className="cursor-pointer list-none text-sm font-semibold text-texto-primario marker:content-none">
                          Retrabajo
                        </summary>
                        <div className="mt-3 grid gap-3">
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
                                    <option
                                      key={material.id}
                                      value={material.id}
                                      title={detalleMaterial(material.codigo, material.nombre, material.unidadBase)}
                                    >
                                      {etiquetaMaterial(material.codigo, material.nombre)}
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
                      </details>
                    </div>
                  )}
                </div>
                  <label className={CLASE_ETIQUETA}>
                    Notas{estadoDestino === 'pausada' && motivoSeleccionado?.requiereNota
                      ? ' (obligatorias)'
                      : ' (opcional)'}
                    <Textarea
                      maxLength={1000}
                      value={notas}
                      onChange={(evento) => setNotas(evento.target.value)}
                      data-testid="notas-cierre"
                      required={
                        estadoDestino === 'pausada' &&
                        motivoSeleccionado?.requiereNota === true
                      }
                    />
                  </label>

                  {estadoDestino === 'finalizada' && primeraPiezaPendiente ? (
                    <div
                      className="flex flex-col gap-2 rounded-md border border-advertencia/50 bg-advertencia-suave p-3"
                      data-testid="bloqueo-primera-pieza-cierre"
                    >
                      <p className="text-sm font-semibold text-advertencia-texto">
                        Falta liberar la primera pieza para poder finalizar
                      </p>
                      <p className="text-xs text-texto-secundario">
                        La corrida de {proceso.procesoNombre} exige una inspección de primera pieza
                        aprobada. Regístrala aquí: el cierre se reintenta solo con los datos que ya
                        capturaste, sin perder el consumo ni la hora.
                      </p>
                      {codigosPrimeraPiezaPendientes.length > 0 ? (
                        <p data-testid="items-primera-pieza-pendientes" className="text-xs text-advertencia-texto">
                          Faltan: {codigosPrimeraPiezaPendientes.join(', ')}.
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        tamano="sm"
                        data-testid="liberar-primera-pieza-desde-cierre"
                        onClick={() => {
                          setMensaje(null);
                          setMensajePrimeraPieza(null);
                          setReintentarCierreTrasPrimeraPieza(true);
                          abrirPrimeraPieza();
                        }}
                      >
                        Liberar primera pieza y reintentar cierre
                      </Button>
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    tamano="lg"
                    disabled={procesando || (estadoDestino === 'finalizada' && primeraPiezaPendiente)}
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
                    min={hoy}
                    value={fecha}
                    onChange={(evento) => {
                      const nueva = evento.target.value;
                      setFecha(nueva);
                      const permitidos = nueva === '' ? [] : turnosDelDia(nueva);
                      if (permitidos.length > 0 && !permitidos.includes(turno as never)) {
                        setTurno(permitidos[0]!);
                      }
                    }}
                  />
                </label>
                <label className={CLASE_ETIQUETA}>
                  Turno
                  <Select
                    value={turno}
                    onChange={(evento) => setTurno(evento.target.value)}
                  >
                    {(turnosDelDia(fecha).length > 0 ? turnosDelDia(fecha) : (['matutino'] as const)).map((valor) => (
                      <option key={valor} value={valor}>
                        {turnoLegible(valor)}
                        {ventanaTurno(fecha, valor) ? ` · ${ventanaTurno(fecha, valor)}` : ''}
                      </option>
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
                <p className="text-xs text-texto-tenue sm:col-span-3">
                  Jornada corrida de 8 horas. La comida de 12:00 a 13:00 no se cuenta.
                  Matutino y vespertino son el mismo horario de producción. El domingo no se labora.
                </p>
              </div>
            ) : null}

            {sesionesPausadasValidas.length > 0
              && sesionesParaAvance.length === 0
              && !soloDetalle ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-superficie-2 p-3">
                <p
                  className="text-sm text-texto-secundario"
                  data-testid="aviso-pausa-declarada"
                >
                  {proceso.procesoCompleto
                    ? 'El avance de esta pausa ya está declarado y la operación está completa. Corrígelo solo si el dato es incorrecto.'
                    : 'El avance de esta pausa ya está declarado. Puedes continuar la sesión o cerrar la pausa sin producir; no hace falta volver a declararlo.'}
                </p>
                <Button
                  type="button"
                  variante="contorno"
                  tamano="sm"
                  disabled={procesando}
                  onClick={() => setCorregirAvanceManual(true)}
                  data-testid="corregir-avance-pausa"
                >
                  Corregir avance de esta pausa
                </Button>
              </div>
            ) : null}

            {proceso.procesoCompleto && haySesionPausada && !consumoPendienteAvance ? (
              <p
                className="rounded-lg border border-advertencia/50 bg-advertencia-suave p-3 text-sm text-advertencia-texto"
                data-testid="aviso-operacion-completa"
              >
                La operación ya está completa ({formatearNumero(proceso.hechoPiezas, 0)} de{' '}
                {formatearNumero(proceso.metaPiezas, 0)} piezas).{' '}
                {esProcesoPosterior
                  ? 'Actualiza el avance de la pausa para cerrarla; no hace falta continuar la sesión.'
                  : 'Registra el consumo de material para cerrar la pausa.'}
              </p>
            ) : null}
            {avanceGuardado ? (
              <p
                role="status"
                data-testid="avance-actualizado-confirmacion"
                className="rounded-lg border border-exito/40 bg-exito-suave p-3 text-sm font-medium text-exito-texto"
              >
                Avance y hora real actualizados correctamente.
              </p>
            ) : null}
            {consumoPendienteAvance && haySesionPausada && !soloDetalle ? (
              <form
                noValidate
                className="grid gap-3 rounded-lg border border-advertencia/60 bg-advertencia-suave p-3"
                aria-label="Registrar consumo y cerrar pausa"
                data-testid="formulario-actualizar-avance"
                onSubmit={(evento) => {
                  evento.preventDefault();
                  void actualizarAvance();
                }}
              >
                <div>
                  <p className="text-sm font-semibold text-advertencia-texto">
                    Avance guardado: falta el consumo de material
                  </p>
                  <p className="text-xs text-texto-secundario">
                    La operación quedó completa. Registra el material usado para cerrar la pausa.
                  </p>
                </div>
                {camposConsumoAvance()}
                <Button type="submit" disabled={procesando} data-testid="actualizar-avance-detalle">
                  {procesando ? 'Cerrando…' : 'Registrar consumo y cerrar pausa'}
                </Button>
              </form>
            ) : !soloDetalle && !avanceGuardado
              && (sesionesParaAvance.length > 0 || corregirAvanceManual) ? (
              <form
                noValidate
                className="grid gap-3 rounded-lg border border-advertencia/50 bg-superficie p-3"
                aria-label="Actualizar avance de la pausa"
                data-testid="formulario-actualizar-avance"
                onSubmit={(evento) => {
                  evento.preventDefault();
                  void actualizarAvance();
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-texto-primario">
                    Actualizar avance y hora real
                  </p>
                  {proceso.sesiones.filter((sesion) => sesion.estadoSesion === 'pausada' && !sesion.sesionInvalida && !sesion.recursoLiberado).length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-acento-texto underline underline-offset-2"
                      onClick={() => setSesionAnteriorAbierta(true)}
                      data-testid="ver-proceso-anterior"
                    >
                      ver el proceso anterior
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-texto-secundario">
                  Declara cuántas piezas produjiste y cuánto tardó realmente este bloque
                  (no el proceso completo). Ese tiempo se suma al del resto de sesiones del
                  proceso, aunque hayan sido en días distintos.
                </p>
                <label className={CLASE_ETIQUETA}>
                  Sesión a actualizar
                  <Select
                    value={sesionCorreccionId ?? sesionAvanceInicial?.id ?? ''}
                    onChange={(evento) => {
                      const siguienteId = evento.target.value;
                      setSesionCorreccionId(siguienteId);
                      setAvanceGuardado(false);
                      const sesion = proceso.sesiones.find((item) => item.id === siguienteId);
                      if (sesion) {
                        setAvancePiezas(String(sesion.piezasProducidas));
                        setAvanceHoras(String(sesion.horasNetas));
                      }
                    }}
                    data-testid="avance-sesion"
                  >
                    {[...(sesionesParaAvance.length > 0 ? sesionesParaAvance : sesionesPausadasValidas)]
                      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))
                      .map((sesion) => (
                        <option key={sesion.id} value={sesion.id}>
                          {etiquetaFechaHora(sesion.fechaInicio)} · {horasLegibles(sesion.horasNetas)} registradas
                          {' · '}bloque de {duracionLegible(horasBloquePausa(sesion) ?? 0)}
                        </option>
                      ))}
                  </Select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={CLASE_ETIQUETA}>
                    Piezas producidas en este periodo
                    <CampoEntero
                      valor={avancePiezas}
                      onValorCambiar={setAvancePiezas}
                      required
                      data-testid="avance-piezas"
                    />
                  </label>
                  <label className={CLASE_ETIQUETA}>
                    Tiempo real de este bloque
                    <input
                      type="number"
                      min="0"
                      max={maximoHorasVisiblesBloque(maximoHorasBloque) ?? 24}
                      step="any"
                      value={avanceHoras}
                      onChange={(evento) => setAvanceHoras(evento.target.value)}
                      className="rounded-md border border-borde bg-superficie px-2 py-1 text-sm"
                      data-testid="avance-horas"
                    />
                    <span
                      className="text-xs font-normal text-texto-tenue"
                      data-testid="avance-horas-ayuda"
                    >
                      {maximoHorasBloque !== null
                        ? `Este bloque duró ${duracionLegible(maximoHorasBloque)}. Declara como máximo ese tiempo.`
                        : 'Tiempo que tardó este bloque de trabajo.'}
                    </span>
                  </label>
                </div>
                <label className={CLASE_ETIQUETA}>
                  Notas (opcional)
                  <input
                    value={avanceNotas}
                    onChange={(evento) => setAvanceNotas(evento.target.value)}
                    maxLength={1000}
                    className="rounded-md border border-borde bg-superficie px-2 py-1 text-sm"
                    data-testid="avance-notas"
                  />
                </label>
                {esProcesoPosterior ? (
                  <p className="text-xs text-texto-tenue">
                    El consumo de piezas de {nombreProcesoPrevio} se registra al cerrar la operación.
                  </p>
                ) : materiales.length > 0 ? (
                  requiereConsumoEnAvance ? (
                    <div className="grid gap-2 rounded-md border border-advertencia/50 bg-advertencia-suave p-2">
                      <p className="text-xs text-advertencia-texto">
                        Con este avance la operación queda completa. Registra el consumo para poder
                        cerrarla; de lo contrario la pausa no podrá terminar.
                      </p>
                      {camposConsumoAvance()}
                    </div>
                  ) : (
                    <details className="rounded-md border border-borde p-2">
                      <summary className="cursor-pointer list-none text-sm text-texto-secundario marker:content-none">
                        Consumo de material (opcional)
                      </summary>
                      <div className="mt-2 grid gap-2">
                        <label className={CLASE_ETIQUETA}>
                          ¿Registrar consumo ahora?
                          <Select
                            value={avanceMaterialId === '' ? 'despues' : 'aquí'}
                            onChange={(evento) => setAvanceMaterialId(evento.target.value === 'aquí' ? (materiales[0]?.id ?? '') : '')}
                            data-testid="avance-opcion-consumo"
                          >
                            <option value="despues">No, dejarlo para el cierre</option>
                            <option value="aquí">Sí, registrarlo aquí</option>
                          </Select>
                        </label>
                        {avanceMaterialId !== '' ? camposConsumoAvance() : null}
                      </div>
                    </details>
                  )
                ) : null}
                <Button type="submit" disabled={procesando} data-testid="actualizar-avance-detalle">
                  {procesando ? 'Actualizando…' : 'Actualizar avance'}
                </Button>
              </form>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {proceso.puedeIniciar ? (
                <Button type="button" tamano="lg" disabled={procesando} onClick={() => acciones.iniciar(proceso)} data-testid="iniciar-detalle">
                  {proceso.equipoOcupadoPor ? 'Ocupado · Ver detalles' : 'Iniciar proceso'}
                </Button>
              ) : null}
              {proceso.puedeReanudar && !proceso.pendienteActualizacionAvance ? (
                <Button type="button" tamano="lg" variante="secundario" disabled={procesando} onClick={() => void reanudar()} data-testid="reanudar-detalle">
                  Continuar sesión pausada
                </Button>
              ) : null}
              {puedeCerrarPausa ? (
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

            {/* El motivo de «no inicia» solo aporta cuando no lo explica ya el
                aviso de avance pendiente o el bloque de operación completa. */}
            {proceso.motivoNoInicia
              && !proceso.sesionActiva
              && !proceso.pendienteActualizacionAvance
              && !(proceso.procesoCompleto && haySesionPausada) ? (
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
          <Dato etiqueta="Estado de orden" valor={etiquetaEstadoOrden(resumenCierre.resultado.estadoOrden)} />
          <Dato etiqueta="Planeación" valor={etiquetaEstadoPlaneacion(resumenCierre.resultado.estadoPlaneacion)} />
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

  const dialogoDemora = (
    <Dialog open={demoraAbierta} onOpenChange={setDemoraAbierta}>
      <DialogContent data-testid="dialogo-motivo-demora" aria-label="Motivo de la demora">
        <DialogHeader>
          <DialogTitle>La sesión superó el tiempo estimado</DialogTitle>
          <DialogDescription>
            Estimado: {horasLegibles(proceso?.horasEstimadas ?? 0)} · Transcurrido:{' '}
            {duracionLegible(horasSesion)}. Necesitamos saber por qué para el cierre administrativo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className={CLASE_ETIQUETA}>
            ¿Por qué se tardó más?
            <Select
              value={opcionDemora}
              onChange={(evento) => {
                setOpcionDemora(evento.target.value as 'OLVIDE_CERRAR' | 'OTRO');
                setErrorDemora(null);
              }}
              data-testid="opcion-demora"
            >
              <option value="OLVIDE_CERRAR">Olvidé cerrar la sesión</option>
              <option value="OTRO">Otro</option>
            </Select>
          </label>
          {opcionDemora === 'OLVIDE_CERRAR' ? (
            <label className={CLASE_ETIQUETA}>
              Hora real en que terminaste
              <Input
                type="time"
                value={horaRealDemora}
                onChange={(evento) => {
                  setHoraRealDemora(evento.target.value);
                  setErrorDemora(null);
                }}
                data-testid="hora-real-demora"
              />
              <span className="text-xs font-normal text-texto-tenue">
                Se ajustará el tiempo de la sesión a esta hora. Por defecto: inicio + tiempo estimado.
              </span>
            </label>
          ) : (
            <label className={CLASE_ETIQUETA}>
              ¿Qué pasó?
              <Textarea
                maxLength={270}
                value={detalleDemora}
                onChange={(evento) => {
                  setDetalleDemora(evento.target.value);
                  setErrorDemora(null);
                }}
                placeholder="Explica por qué la operación tardó más de lo estimado"
                data-testid="detalle-demora"
              />
              <span className="text-xs font-normal text-texto-tenue">
                Mínimo 10 caracteres. Se guarda con el total de horas de la sesión.
              </span>
            </label>
          )}
          {errorDemora ? (
            <p role="alert" className="text-sm text-peligro-texto">{errorDemora}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variante="contorno" onClick={() => setDemoraAbierta(false)}>
              Volver al cierre
            </Button>
            <Button type="button" onClick={confirmarDemora} data-testid="confirmar-demora">
              Guardar y cerrar sesión
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );

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
            Ítem de la primera pieza
            <Select
              value={itemPrimeraPieza || proceso.partidaId}
              onChange={(evento) => setItemPrimeraPieza(evento.target.value)}
              data-testid="item-primera-pieza"
            >
              {opcionesPrimeraPieza.map((item) => (
                <option key={item.partidaId} value={item.partidaId}>{item.codigoPieza}</option>
              ))}
            </Select>
          </label>
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
            El cierre se bloqueó porque la corrida de {proceso.procesoNombre} exige una inspección de
            primera pieza aprobada. Regístrala aquí y el cierre se reintenta solo con los datos que
            ya capturaste.
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
              abrirPrimeraPieza();
            }}
            data-testid="modal-liberar-primera-pieza"
          >
            Liberar primera pieza y reintentar cierre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const dialogoCierreFallido = (
    <DialogoErrorCierre
      error={errorCierre}
      onCerrar={() => setErrorCierre(null)}
    />
  );

  const dialogoAvanceFallido = (
    <DialogoErrorCierre
      error={errorAvance}
      onCerrar={() => setErrorAvance(null)}
      descripcion={errorAvance?.acciones?.length
        ? 'No se guardó el avance. Elige una de las opciones para seguir con el flujo.'
        : 'No se guardó el avance. Revisa el detalle y corrige lo que se indica.'}
      testId="error-avance-dialogo"
    />
  );

  const pausadasOrdenadas = [...proceso.sesiones]
    .filter((sesion) => sesion.estadoSesion === 'pausada' && !sesion.sesionInvalida && !sesion.recursoLiberado)
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  const indiceSesion = pausadasOrdenadas.findIndex((sesion) => sesion.id === (sesionCorreccionId ?? proceso.ultimaSesion?.id));
  const sesionAnterior = indiceSesion > 0 ? pausadasOrdenadas[indiceSesion - 1] : null;
  const dialogoSesionAnterior = (
    <Dialog open={sesionAnteriorAbierta} onOpenChange={setSesionAnteriorAbierta}>
      <DialogContent className="max-w-md" data-testid="dialogo-sesion-anterior">
        <DialogHeader>
          <DialogTitle>Proceso anterior</DialogTitle>
          <DialogDescription>Solo lectura · {proceso.folioOrden} · {proceso.codigoPieza}</DialogDescription>
        </DialogHeader>
        {sesionAnterior ? (
          <div className="grid gap-2 text-sm">
            <Dato etiqueta="Operador" valor={sesionAnterior.operadorNombre} />
            <Dato etiqueta="Periodo" valor={`${etiquetaFechaHora(sesionAnterior.fechaInicio)} → ${etiquetaFechaHora(sesionAnterior.fechaFin)}`} />
            <Dato etiqueta="Piezas" valor={formatearNumero(sesionAnterior.piezasProducidas, 0)} />
            <Dato etiqueta="Tiempo registrado" valor={horasLegibles(sesionAnterior.horasNetas)} />
          </div>
        ) : (
          <p className="text-sm text-texto-secundario">No hay una sesión anterior para mostrar.</p>
        )}
        <DialogFooter>
          <Button type="button" onClick={() => setSesionAnteriorAbierta(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

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
        {dialogoDemora}
        {dialogoPrimeraPieza}
        {dialogoErrorPrimeraPieza}
        {dialogoCierreFallido}
        {dialogoAvanceFallido}
        {dialogoSesionAnterior}
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
      {dialogoDemora}
        {dialogoPrimeraPieza}
      {dialogoErrorPrimeraPieza}
      {dialogoCierreFallido}
      {dialogoAvanceFallido}
      {dialogoSesionAnterior}
    </>
  );
}

