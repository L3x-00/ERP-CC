/** Contratos de dominio de corridas y calidad — SII-B6 ola 1. */

export const ESTADOS_CORRIDA = [
  'PLANIFICADA',
  'EN_PROCESO',
  'PAUSADA',
  'COMPLETADA',
  'CANCELADA',
] as const;

export type EstadoCorrida = (typeof ESTADOS_CORRIDA)[number];

export const TIPOS_INSPECCION = ['PRIMERA_PIEZA', 'REFERENCIA_LOTE', 'CIERRE'] as const;
export type TipoInspeccion = (typeof TIPOS_INSPECCION)[number];

export const RESULTADOS_INSPECCION = ['APROBADA', 'RECHAZADA'] as const;
export type ResultadoInspeccion = (typeof RESULTADOS_INSPECCION)[number];

export const ESTADOS_AUTORIZACION_HORA_EXTRA = ['VIGENTE', 'USADA', 'REVOCADA'] as const;
export type EstadoAutorizacionHoraExtra = (typeof ESTADOS_AUTORIZACION_HORA_EXTRA)[number];

/** Ítem agrupado en una corrida (código ITxx o pieza legacy). */
export type CorridaItem = {
  id: string | null;
  partidaId: string;
  codigoItem: string;
  cantidad: number;
};

/** Corrida: unidad de ejecución de una orden para un proceso. */
export type Corrida = {
  id: string;
  ordenId: string;
  codigo: string;
  procesoId: string;
  estado: EstadoCorrida;
  cantidadPlanificada: number;
  corridaOrigenId: string | null;
  items: CorridaItem[];
};

/** Inspección de calidad básica (§6.3). */
export type InspeccionCalidad = {
  id: string;
  ordenId: string;
  corridaId: string | null;
  partidaId: string | null;
  codigoItem: string;
  tipo: TipoInspeccion;
  referencia: number | null;
  resultado: ResultadoInspeccion;
  cantidadInspeccionada: number;
  cantidadOk: number;
  cantidadNok: number;
  cantidadRetrabajo: number;
  observaciones: string | null;
  creadoEn: string;
};

/** Autorización de horas extra. */
export type AutorizacionHoraExtra = {
  id: string;
  ordenId: string;
  sesionId: string | null;
  horasAutorizadas: number;
  motivo: string;
  autorizadoPor: string;
  estado: EstadoAutorizacionHoraExtra;
  creadoEn: string;
};

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

/** Mapea defensivamente el jsonb de `crear_corrida`; null si no tiene forma. */
export function corridaDesdeJson(valor: unknown): Corrida | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const fila = valor as Record<string, unknown>;
  if (typeof fila.id !== 'string' || typeof fila.codigo !== 'string') return null;

  const items = Array.isArray(fila.items)
    ? fila.items
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : null,
          partidaId: typeof item.partida_id === 'string' ? item.partida_id : '',
          codigoItem: typeof item.codigo_item === 'string' ? item.codigo_item : '',
          cantidad: numero(item.cantidad),
        }))
    : [];

  const estado = typeof fila.estado === 'string' ? fila.estado : 'PLANIFICADA';

  return {
    id: fila.id,
    ordenId: typeof fila.orden_id === 'string' ? fila.orden_id : '',
    codigo: fila.codigo,
    procesoId: typeof fila.proceso_id === 'string' ? fila.proceso_id : '',
    estado: (ESTADOS_CORRIDA as readonly string[]).includes(estado)
      ? (estado as EstadoCorrida)
      : 'PLANIFICADA',
    cantidadPlanificada: numero(fila.cantidad_planificada),
    corridaOrigenId: typeof fila.corrida_origen_id === 'string' ? fila.corrida_origen_id : null,
    items,
  };
}

/** Mapea defensivamente el jsonb de `registrar_inspeccion`; null si no tiene forma. */
export function inspeccionDesdeJson(valor: unknown): InspeccionCalidad | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const fila = valor as Record<string, unknown>;
  if (typeof fila.id !== 'string' || typeof fila.tipo !== 'string') return null;
  const tipo = (TIPOS_INSPECCION as readonly string[]).includes(fila.tipo)
    ? (fila.tipo as TipoInspeccion)
    : 'CIERRE';
  const resultado = (RESULTADOS_INSPECCION as readonly string[]).includes(String(fila.resultado))
    ? (fila.resultado as ResultadoInspeccion)
    : 'RECHAZADA';
  return {
    id: fila.id,
    ordenId: typeof fila.orden_id === 'string' ? fila.orden_id : '',
    corridaId: typeof fila.corrida_id === 'string' ? fila.corrida_id : null,
    partidaId: typeof fila.partida_id === 'string' ? fila.partida_id : null,
    codigoItem: typeof fila.codigo_item === 'string' ? fila.codigo_item : '',
    tipo,
    referencia: fila.referencia === null || fila.referencia === undefined ? null : numero(fila.referencia),
    resultado,
    cantidadInspeccionada: numero(fila.cantidad_inspeccionada),
    cantidadOk: numero(fila.cantidad_ok),
    cantidadNok: numero(fila.cantidad_nok),
    cantidadRetrabajo: numero(fila.cantidad_retrabajo),
    observaciones: typeof fila.observaciones === 'string' ? fila.observaciones : null,
    creadoEn: typeof fila.creado_en === 'string' ? fila.creado_en : '',
  };
}
