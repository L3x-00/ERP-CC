import type { Tables } from '@/compartido/tipos/supabase';
import type { EstadoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import type { EstadoOrden, PrioridadOrden } from '@/modulos/ordenes/tipos/ordenes';
import type { EstadoSiiOrden } from '@/modulos/ordenes/tipos/orden-sii';

/** C10: contratos del espacio de operador en piso. */

export const VISTAS_ESPACIO_OPERADOR = ['kanban', 'calendario', 'areas'] as const;
export const COLUMNAS_ESPACIO_OPERADOR = [
  'aprobada',
  'bandeja',
  'en_proceso',
  'pausada',
  'lista',
] as const;
export const URGENCIAS_PROCESO = ['vencida', 'urgente', 'proxima', 'normal'] as const;

/** Jornada diaria del operador; el calendario y el reclamo comparten el límite. */
export const HORAS_JORNADA_OPERADOR = 8;

export type VistaEspacioOperador = (typeof VISTAS_ESPACIO_OPERADOR)[number];
export type ColumnaEspacioOperador = (typeof COLUMNAS_ESPACIO_OPERADOR)[number];
export type UrgenciaProceso = (typeof URGENCIAS_PROCESO)[number];

export const ETIQUETAS_COLUMNA: Record<ColumnaEspacioOperador, string> = {
  aprobada: 'Aprobada',
  bandeja: 'Bandeja',
  en_proceso: 'En proceso',
  pausada: 'Pausada',
  lista: 'Lista',
};

export const ETIQUETAS_URGENCIA: Record<UrgenciaProceso, string> = {
  vencida: 'Vencida',
  urgente: 'Urgente',
  proxima: 'Próxima',
  normal: 'Normal',
};

export type FilaReclamoProcesoOperador = Tables<'reclamos_proceso_operador'>;

export interface ReclamoProcesoOperador {
  id: string;
  ordenId: string;
  partidaId: string;
  metaProcesoId: string | null;
  programacionId: string | null;
  operadorId: string;
  fecha: string;
  turno: string;
  horasEstimadas: number;
  estado: string;
  creadoEn: string;
  actualizadoEn: string;
}

export function filaAReclamoProceso(
  fila: FilaReclamoProcesoOperador,
): ReclamoProcesoOperador {
  return {
    id: fila.id,
    ordenId: fila.orden_id,
    partidaId: fila.partida_id,
    metaProcesoId: fila.meta_proceso_id,
    programacionId: fila.programacion_id,
    operadorId: fila.operador_id,
    fecha: fila.fecha,
    turno: fila.turno,
    horasEstimadas: Number(fila.horas_estimadas),
    estado: fila.estado,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export interface MaterialProceso {
  id: string;
  codigo: string;
  nombre: string;
  unidadBase: string;
  anchoMm: number | null;
  largoMm: number | null;
}

export interface ArchivoProceso {
  id: string;
  nombre: string;
  mime: string;
  tamanoBytes: number;
  clase: string;
  creadoEn: string;
}

export interface SesionProceso {
  id: string;
  /** Corrida de producción asociada; permite liberar la primera pieza desde el cierre. */
  corridaId?: string | null;
  operadorId: string;
  operadorNombre: string;
  estadoSesion: 'activa' | 'pausada' | 'finalizada';
  fechaInicio: string;
  fechaFin: string | null;
  piezasProducidas: number;
  horasNetas: number;
  motivoPausa: string | null;
  motivoPausaNota: string | null;
  notas: string | null;
  verificacionCompleta: boolean;
}

export interface ProcesoRuteoResumen {
  id: string;
  secuencia: number;
  nombre: string;
  metaPiezas: number;
  hechoPiezas: number;
  completado: boolean;
}

/** Piezas del proceso previo que la operación todavía puede trabajar. */
export interface DisponibilidadProcesoRuteo {
  /** null cuando no hay restricción: primera operación del ruteo o sin metas. */
  disponiblePiezas: number | null;
  procesoPrevioNombre: string | null;
}

/**
 * Calcula la disponibilidad parcial de cada operación del ruteo: las piezas
 * terminadas por el proceso inmediato anterior menos las ya consumidas por la
 * propia operación. Permite avanzar sin esperar el lote completo, pero bloquea
 * el arranque mientras el proceso previo no haya terminado ninguna pieza.
 */
export function calcularDisponibilidadProcesos(
  procesos: readonly Pick<ProcesoRuteoResumen, 'id' | 'secuencia' | 'nombre' | 'hechoPiezas'>[],
): Map<string, DisponibilidadProcesoRuteo> {
  const ordenados = [...procesos].sort((primero, segundo) => primero.secuencia - segundo.secuencia);
  const resultado = new Map<string, DisponibilidadProcesoRuteo>();

  ordenados.forEach((proceso, indice) => {
    const previo = indice > 0 ? ordenados[indice - 1] : null;
    resultado.set(
      proceso.id,
      previo
        ? {
          disponiblePiezas: Math.max(previo.hechoPiezas - proceso.hechoPiezas, 0),
          procesoPrevioNombre: previo.nombre,
        }
        : { disponiblePiezas: null, procesoPrevioNombre: null },
    );
  });

  return resultado;
}

export interface ProgramacionProceso {
  id: string;
  fecha: string;
  turno: string;
  estadoPlaneacion: EstadoPlaneacion;
  horasEstimadas: number;
  recursoId: string;
  recursoCodigo: string | null;
  recursoNombre: string | null;
  actualizadoEn: string;
}

/** Tarjeta atómica del espacio: una operación del ruteo o la partida sin ruteo. */
export interface ProcesoEspacioOperador {
  id: string;
  ordenId: string;
  folioOrden: string;
  folioSii: string | null;
  estadoOrden: EstadoOrden;
  estadoSii: EstadoSiiOrden;
  prioridad: PrioridadOrden;
  clienteNombre: string;
  fechaCompromiso: string;
  fechaOperativa: string;
  notas: string | null;

  partidaId: string;
  codigoPieza: string;
  descripcion: string | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
  unidadMedida: string;
  esExterno: boolean;
  proveedorExterno: string | null;
  material: MaterialProceso | null;

  areaCodigo: string | null;
  areaNombre: string;
  areaMacro: string | null;
  areaColor: string | null;

  metaProcesoId: string | null;
  procesoNombre: string;
  secuencia: number;
  metaPiezas: number;
  hechoPiezas: number;
  pendientePiezas: number;
  porcentaje: number;
  esFinal: boolean;
  /** Piezas del proceso previo aún disponibles; null si es la primera operación. */
  piezasDisponibles: number | null;
  procesoPrevioNombre: string | null;

  horasEstimadas: number;
  programacion: ProgramacionProceso | null;
  reclamo: ReclamoProcesoOperador | null;
  reclamadoPorMi: boolean;
  nombreReclamante: string | null;
  sesionActiva: SesionProceso | null;
  ultimaSesion: SesionProceso | null;
  sesiones: SesionProceso[];
  procesosRuteo: ProcesoRuteoResumen[];
  archivos: ArchivoProceso[];

  columna: ColumnaEspacioOperador;
  urgencia: UrgenciaProceso;
  etiquetas: string[];
  puedeIniciar: boolean;
  puedeReanudar: boolean;
  motivoNoInicia: string | null;
}

/** Ítem de la orden con las operaciones visibles de ese ítem. */
export interface ItemOrdenEspacioOperador {
  partidaId: string;
  codigoPieza: string;
  descripcion: string | null;
  unidadMedida: string;
  cantidadProducida: number;
  cantidadSolicitada: number;
  porcentaje: number;
  material: MaterialProceso | null;
  procesos: ProcesoEspacioOperador[];
}

/** Orden agrupada: evita una tarjeta por operación en el tablero de piso. */
export interface GrupoOrdenEspacioOperador {
  ordenId: string;
  folioOrden: string;
  folioSii: string | null;
  clienteNombre: string;
  fechaCompromiso: string;
  urgencia: UrgenciaProceso;
  prioridad: PrioridadOrden;
  notas: string | null;
  /** Columna única de la orden según el estado de sus procesos. */
  columna: ColumnaEspacioOperador;
  /** Solo los ítems que tienen al menos una operación en el conjunto recibido. */
  items: ItemOrdenEspacioOperador[];
  procesos: ProcesoEspacioOperador[];
  horas: number;
  cantidadProducida: number;
  cantidadSolicitada: number;
  porcentaje: number;
}

const RANGO_URGENCIA = new Map<UrgenciaProceso, number>(
  URGENCIAS_PROCESO.map((urgencia, indice) => [urgencia, indice]),
);

/**
 * Columna única para una orden con procesos en distintos estados. Así la orden
 * viaja completa y no se duplica en varias columnas por tener ítems en etapas
 * distintas.
 */
export function derivarColumnaOrden(
  procesos: readonly Pick<ProcesoEspacioOperador, 'columna'>[],
): ColumnaEspacioOperador {
  if (procesos.length === 0) return 'bandeja';
  if (procesos.every((proceso) => proceso.columna === 'lista')) return 'lista';
  if (procesos.some((proceso) => proceso.columna === 'en_proceso')) return 'en_proceso';
  if (procesos.some((proceso) => proceso.columna === 'pausada')) return 'pausada';
  if (procesos.some((proceso) => proceso.columna === 'aprobada')) return 'aprobada';
  return 'bandeja';
}

/** Proceso del ítem que conviene abrir: sesión activa, pausa o siguiente pendiente. */
export function procesoRepresentativoItem(
  item: ItemOrdenEspacioOperador,
): ProcesoEspacioOperador {
  return item.procesos.find((proceso) => proceso.sesionActiva !== null)
    ?? item.procesos.find((proceso) => proceso.columna === 'pausada')
    ?? item.procesos.find((proceso) => proceso.columna !== 'lista')
    ?? item.procesos[0];
}

/**
 * Agrupa operaciones por orden y, dentro de ella, por ítem. Mantiene cada
 * operación con sus acciones para no perder el flujo de piso, pero evita que
 * una orden con varios ítems/procesos se pinte como tarjetas independientes.
 */
export function agruparProcesosPorOrden(
  procesos: readonly ProcesoEspacioOperador[],
): GrupoOrdenEspacioOperador[] {
  const porOrden = new Map<string, ProcesoEspacioOperador[]>();
  for (const proceso of procesos) {
    const actuales = porOrden.get(proceso.ordenId);
    if (actuales) actuales.push(proceso);
    else porOrden.set(proceso.ordenId, [proceso]);
  }

  const grupos = [...porOrden.values()].map((delOrden) => {
    const primero = delOrden[0];
    const porPartida = new Map<string, ProcesoEspacioOperador[]>();
    for (const proceso of delOrden) {
      const delItem = porPartida.get(proceso.partidaId);
      if (delItem) delItem.push(proceso);
      else porPartida.set(proceso.partidaId, [proceso]);
    }

    const items: ItemOrdenEspacioOperador[] = [...porPartida.values()]
      .map((delItem) => {
        const referencia = delItem[0];
        const porcentaje = referencia.cantidadSolicitada > 0
          ? Math.min((referencia.cantidadProducida / referencia.cantidadSolicitada) * 100, 100)
          : 0;
        return {
          partidaId: referencia.partidaId,
          codigoPieza: referencia.codigoPieza,
          descripcion: referencia.descripcion,
          unidadMedida: referencia.unidadMedida,
          cantidadProducida: referencia.cantidadProducida,
          cantidadSolicitada: referencia.cantidadSolicitada,
          porcentaje,
          material: referencia.material,
          procesos: [...delItem].sort((a, b) => a.secuencia - b.secuencia),
        };
      })
      .sort((a, b) => a.codigoPieza.localeCompare(b.codigoPieza, 'es'));

    const cantidadProducida = items.reduce((total, item) => total + item.cantidadProducida, 0);
    const cantidadSolicitada = items.reduce((total, item) => total + item.cantidadSolicitada, 0);
    const urgencia = delOrden.reduce<UrgenciaProceso>(
      (peor, proceso) => (
        (RANGO_URGENCIA.get(proceso.urgencia) ?? 99) < (RANGO_URGENCIA.get(peor) ?? 99)
          ? proceso.urgencia
          : peor
      ),
      primero.urgencia,
    );
    const fechaCompromiso = delOrden.reduce(
      (fecha, proceso) => (proceso.fechaCompromiso < fecha ? proceso.fechaCompromiso : fecha),
      primero.fechaCompromiso,
    );
    const horas = delOrden.reduce((total, proceso) => total + proceso.horasEstimadas, 0);

    return {
      ordenId: primero.ordenId,
      folioOrden: primero.folioOrden,
      folioSii: primero.folioSii,
      clienteNombre: primero.clienteNombre,
      fechaCompromiso,
      urgencia,
      prioridad: primero.prioridad,
      notas: primero.notas,
      columna: derivarColumnaOrden(delOrden),
      items,
      procesos: [...delOrden].sort((a, b) => (
        a.codigoPieza.localeCompare(b.codigoPieza, 'es') || a.secuencia - b.secuencia
      )),
      horas,
      cantidadProducida,
      cantidadSolicitada,
      porcentaje: cantidadSolicitada > 0
        ? Math.min((cantidadProducida / cantidadSolicitada) * 100, 100)
        : 0,
    };
  });

  return grupos.sort((a, b) => (
    (RANGO_URGENCIA.get(a.urgencia) ?? 99) - (RANGO_URGENCIA.get(b.urgencia) ?? 99)
    || a.fechaCompromiso.localeCompare(b.fechaCompromiso)
    || a.folioOrden.localeCompare(b.folioOrden, 'es')
  ));
}

export interface AreaEspacioOperador {
  codigo: string;
  nombre: string;
  padreCodigo: string | null;
  areaPlaneacion: string | null;
  colorHex: string | null;
}

export interface GrupoAreaEspacioOperador {
  codigo: string | null;
  nombre: string;
  colorHex: string | null;
  procesos: ProcesoEspacioOperador[];
  horas: number;
  urgentes: number;
}

export interface DiaCalendarioOperador {
  fecha: string;
  esHoy: boolean;
  horasReclamadas: number;
  horasLibres: number;
  procesos: ProcesoEspacioOperador[];
}

export interface ResumenEspacioOperador {
  total: number;
  aprobadas: number;
  enBandeja: number;
  enProceso: number;
  pausadas: number;
  listas: number;
  urgentes: number;
  horasReclamadasHoy: number;
}

export type TipoAccionTarjeta =
  | 'reclamar'
  | 'iniciar'
  | 'reanudar'
  | 'sesion'
  | 'bloqueada';

export interface AccionTarjeta {
  tipo: TipoAccionTarjeta;
  etiqueta: string;
  deshabilitada: boolean;
}

/**
 * Acción principal coherente con el estado persistido: nunca ofrece iniciar
 * una orden que aún no se libera, ni reclamar un proceso ya tomado.
 */
export function accionPrincipal(proceso: ProcesoEspacioOperador): AccionTarjeta {
  if (proceso.sesionActiva) {
    return { tipo: 'sesion', etiqueta: 'Registrar cierre', deshabilitada: false };
  }
  if (proceso.puedeReanudar) {
    return { tipo: 'reanudar', etiqueta: 'Continuar', deshabilitada: false };
  }
  if (proceso.puedeIniciar) {
    return { tipo: 'iniciar', etiqueta: 'Iniciar', deshabilitada: false };
  }
  if (proceso.reclamo) {
    return {
      tipo: 'bloqueada',
      etiqueta: proceso.reclamadoPorMi ? 'Reservado' : 'Tomado',
      deshabilitada: true,
    };
  }
  if (proceso.columna === 'lista') {
    return { tipo: 'bloqueada', etiqueta: 'Completado', deshabilitada: true };
  }
  return { tipo: 'reclamar', etiqueta: 'Reclamar', deshabilitada: false };
}

type EntradaColumnaProceso = {
  estadoOrden: EstadoOrden;
  estadoSii: EstadoSiiOrden;
  procesoCompleto: boolean;
  sesionActiva: boolean;
  sesionPausada: boolean;
  programacionEstado: EstadoPlaneacion | null;
};

/**
 * Deriva la columna del Kanban desde hechos persistidos. El estado de la orden
 * solo desempata cuando la operación no tiene programación ni sesión propia
 * (partidas históricas sin ruteo).
 */
export function derivarColumnaProceso(
  entrada: EntradaColumnaProceso,
): ColumnaEspacioOperador {
  if (entrada.procesoCompleto || entrada.estadoOrden === 'completada') return 'lista';
  if (entrada.sesionActiva || entrada.programacionEstado === 'en_proceso') return 'en_proceso';
  if (
    entrada.sesionPausada
    || entrada.programacionEstado === 'bloqueada'
    || (entrada.programacionEstado === null && entrada.estadoOrden === 'pausada')
  ) {
    return 'pausada';
  }
  if (entrada.estadoOrden === 'borrador' || entrada.estadoSii === 'CONFIRMADA') return 'aprobada';
  return 'bandeja';
}

/** Días de diferencia entre dos fechas ISO `YYYY-MM-DD`, sin zona horaria. */
export function diasEntreFechas(desde: string, hasta: string): number {
  const inicio = Date.UTC(
    Number(desde.slice(0, 4)),
    Number(desde.slice(5, 7)) - 1,
    Number(desde.slice(8, 10)),
  );
  const fin = Date.UTC(
    Number(hasta.slice(0, 4)),
    Number(hasta.slice(5, 7)) - 1,
    Number(hasta.slice(8, 10)),
  );
  return Math.round((fin - inicio) / 86_400_000);
}

/** Suma días a una fecha ISO `YYYY-MM-DD` sin cruzar zonas horarias. */
export function sumarDias(fecha: string, dias: number): string {
  const base = new Date(`${fecha}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Lunes de la semana de la fecha indicada. */
export function inicioSemana(fecha: string): string {
  const base = new Date(`${fecha}T12:00:00Z`);
  const dia = base.getUTCDay();
  const desplazamiento = dia === 0 ? -6 : 1 - dia;
  return sumarDias(fecha, desplazamiento);
}

/** Saldo de horas de un día respecto a la jornada de 8 h. */
export function capacidadRestanteDia(horasReclamadas: number): number {
  return Math.max(Math.round((HORAS_JORNADA_OPERADOR - horasReclamadas) * 100) / 100, 0);
}

/**
 * Urgencia semántica de la tarjeta: vencida (fecha pasada), urgente
 * (prioridad urgente o compromiso hoy/mañana), próxima (≤3 días) o normal.
 */
export function derivarUrgenciaProceso(
  fechaCompromiso: string,
  prioridad: PrioridadOrden,
  hoy: string,
): UrgenciaProceso {
  const dias = diasEntreFechas(hoy, fechaCompromiso);
  if (dias < 0) return 'vencida';
  if (prioridad === 'urgente' || dias <= 1) return 'urgente';
  if (dias <= 3 || prioridad === 'alta') return 'proxima';
  return 'normal';
}

/** Etiquetas visibles de la tarjeta, sin duplicar la urgencia. */
export function etiquetasProceso(proceso: ProcesoEspacioOperador): string[] {
  const etiquetas: string[] = [];
  if (proceso.urgencia === 'vencida') etiquetas.push('Vencida');
  else if (proceso.urgencia === 'urgente') etiquetas.push('Urgente');
  else if (proceso.urgencia === 'proxima') etiquetas.push('Próxima');
  if (proceso.prioridad === 'alta' && proceso.urgencia !== 'urgente') etiquetas.push('Alta');
  if (proceso.esExterno) etiquetas.push('Externo');
  if (proceso.piezasDisponibles === 0 && proceso.hechoPiezas < proceso.metaPiezas) {
    etiquetas.push('Sin piezas previas');
  }
  if (proceso.reclamo && !proceso.reclamadoPorMi) etiquetas.push('Tomado');
  return etiquetas;
}

/**
 * Resuelve el área raíz (macro) de un código del catálogo caminando toda la
 * cadena de ancestros. Devuelve null si el código no existe.
 */
export function resolverAreaRaiz(
  areas: readonly AreaEspacioOperador[],
  codigo: string | null,
): AreaEspacioOperador | null {
  if (!codigo) return null;
  const catalogo = new Map(areas.map((area) => [area.codigo, area]));
  const visitadas = new Set<string>();
  let actual = catalogo.get(codigo) ?? null;

  while (actual?.padreCodigo && !visitadas.has(actual.codigo)) {
    visitadas.add(actual.codigo);
    const padre = catalogo.get(actual.padreCodigo) ?? null;
    if (!padre) break;
    actual = padre;
  }

  return actual;
}

/** Agrupa por área macro para la vista «Por área», incluyendo «Sin área». */
export function agruparProcesosPorArea(
  procesos: readonly ProcesoEspacioOperador[],
  areas: readonly AreaEspacioOperador[],
): GrupoAreaEspacioOperador[] {
  const catalogo = new Map(areas.map((area) => [area.codigo, area]));
  const grupos = new Map<string, GrupoAreaEspacioOperador>();

  for (const proceso of procesos) {
    const clave = proceso.areaMacro ?? proceso.areaCodigo ?? '__sin_area__';
    const area = proceso.areaMacro ? catalogo.get(proceso.areaMacro) : null;
    const grupo = grupos.get(clave) ?? {
      codigo: proceso.areaMacro,
      nombre: area?.nombre ?? (proceso.areaCodigo ? proceso.areaNombre : 'Sin área'),
      colorHex: area?.colorHex ?? proceso.areaColor,
      procesos: [],
      horas: 0,
      urgentes: 0,
    };
    grupo.procesos.push(proceso);
    grupo.horas += proceso.horasEstimadas;
    if (proceso.urgencia === 'urgente' || proceso.urgencia === 'vencida') grupo.urgentes += 1;
    grupos.set(clave, grupo);
  }

  return [...grupos.values()].sort((primero, segundo) => {
    if (primero.codigo === null) return 1;
    if (segundo.codigo === null) return -1;
    return primero.nombre.localeCompare(segundo.nombre, 'es');
  });
}

/** Construye los días del calendario con la carga reclamada y el saldo de 8 h. */
export function construirDiasCalendario(
  fechas: readonly string[],
  procesos: readonly ProcesoEspacioOperador[],
  hoy: string,
): DiaCalendarioOperador[] {
  const porFecha = new Map<string, ProcesoEspacioOperador[]>();
  for (const proceso of procesos) {
    if (!proceso.reclamo) continue;
    const actuales = porFecha.get(proceso.reclamo.fecha) ?? [];
    actuales.push(proceso);
    porFecha.set(proceso.reclamo.fecha, actuales);
  }

  return fechas.map((fecha) => {
    const delDia = (porFecha.get(fecha) ?? []).sort((primero, segundo) => (
      primero.ordenId.localeCompare(segundo.ordenId)
      || primero.secuencia - segundo.secuencia
    ));
    const horasReclamadas = delDia.reduce(
      (total, proceso) => total + (proceso.reclamo?.horasEstimadas ?? 0),
      0,
    );
    return {
      fecha,
      esHoy: fecha === hoy,
      horasReclamadas: Math.round(horasReclamadas * 100) / 100,
      horasLibres: Math.max(Math.round((HORAS_JORNADA_OPERADOR - horasReclamadas) * 100) / 100, 0),
      procesos: delDia,
    };
  });
}

export function resumirEspacioOperador(
  procesos: readonly ProcesoEspacioOperador[],
  hoy: string,
): ResumenEspacioOperador {
  const resumen: ResumenEspacioOperador = {
    total: procesos.length,
    aprobadas: 0,
    enBandeja: 0,
    enProceso: 0,
    pausadas: 0,
    listas: 0,
    urgentes: 0,
    horasReclamadasHoy: 0,
  };

  for (const proceso of procesos) {
    if (proceso.columna === 'aprobada') resumen.aprobadas += 1;
    else if (proceso.columna === 'bandeja') resumen.enBandeja += 1;
    else if (proceso.columna === 'en_proceso') resumen.enProceso += 1;
    else if (proceso.columna === 'pausada') resumen.pausadas += 1;
    else resumen.listas += 1;

    if (proceso.urgencia === 'urgente' || proceso.urgencia === 'vencida') resumen.urgentes += 1;
    if (proceso.reclamo?.fecha === hoy) {
      resumen.horasReclamadasHoy += proceso.reclamo.horasEstimadas;
    }
  }

  resumen.horasReclamadasHoy = Math.round(resumen.horasReclamadasHoy * 100) / 100;
  return resumen;
}
