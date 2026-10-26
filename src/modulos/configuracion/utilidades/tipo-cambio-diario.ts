/**
 * Vigencia del tipo de cambio diario (ACC-06 / E2E-02).
 *
 * El sistema usa un único TC MXN por USD. Se pide confirmarlo al administrador
 * cuando no hay registro, cuando el último registro fue en otro día del taller
 * (America/Tijuana) o cuando lleva 24 horas o más sin actualizarse. La
 * combinación cubre tanto el cambio de fecha como el ingreso al día siguiente
 * dentro de las primeras 24 horas.
 *
 * Funciones puras: no leen base de datos ni dependen de la zona horaria del
 * servidor, así que se prueban con fechas fijas.
 */

export const ZONA_HORARIA_NEGOCIO = 'America/Tijuana';
export const HORAS_VIGENCIA_TIPO_CAMBIO = 24;

export type MotivoTipoCambioDesactualizado = 'sin_registro' | 'nuevo_dia' | 'mas_de_24_horas';

export interface EstadoTipoCambioDiario {
  /** `true` si debe mostrarse el modal/aviso de captura. */
  requiereActualizacion: boolean;
  motivo: MotivoTipoCambioDesactualizado | null;
  tipoCambioUsd: number;
  /** Última captura explícita; `null` si nunca se registró. */
  actualizadoEn: string | null;
  /** Fecha de hoy en la zona del taller, `YYYY-MM-DD`. */
  fechaLocal: string;
  horasDesdeActualizacion: number | null;
}

export interface EntradaEvaluacionTipoCambio {
  tipoCambioActualizadoEn: string | null | undefined;
  tipoCambioUsd?: number;
  ahora?: Date;
  zonaHoraria?: string;
}

/** Fecha `YYYY-MM-DD` en la zona indicada, sin depender del locale del runtime. */
export function fechaLocalNegocio(
  fecha: Date,
  zonaHoraria: string = ZONA_HORARIA_NEGOCIO,
): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha);
  const valor = (tipo: 'year' | 'month' | 'day'): string =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Fecha y hora legibles en la zona del taller (Tijuana). */
export function formatearFechaHoraNegocio(fechaIso: string): string {
  const fecha = new Date(fechaIso);
  if (!Number.isFinite(fecha.getTime())) return 'fecha desconocida';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA_HORARIA_NEGOCIO,
  }).format(fecha);
}

/**
 * Evalúa si el TC registrado sigue siendo válido para hoy.
 *
 * Prioridad de motivos: sin registro → más de 24 horas → nuevo día. Un
 * registro de ayer a las 23:00 y una consulta a hoy 01:00 exige actualización
 * por `nuevo_dia`, aunque hayan pasado menos de 24 horas; si ya pasaron 24
 * horas o más, el motivo es `mas_de_24_horas`.
 */
export function evaluarTipoCambioDiario(
  entrada: EntradaEvaluacionTipoCambio,
): EstadoTipoCambioDiario {
  const ahora = entrada.ahora ?? new Date();
  const fechaLocal = fechaLocalNegocio(ahora, entrada.zonaHoraria);
  const base = {
    tipoCambioUsd: entrada.tipoCambioUsd ?? 0,
    actualizadoEn: entrada.tipoCambioActualizadoEn ?? null,
    fechaLocal,
  };

  const registro = entrada.tipoCambioActualizadoEn
    ? new Date(entrada.tipoCambioActualizadoEn)
    : null;
  const marcaRegistro = registro ? registro.getTime() : Number.NaN;

  if (!registro || !Number.isFinite(marcaRegistro)) {
    return {
      ...base,
      requiereActualizacion: true,
      motivo: 'sin_registro',
      horasDesdeActualizacion: null,
    };
  }

  const horasDesdeActualizacion = (ahora.getTime() - marcaRegistro) / (60 * 60 * 1000);
  const fechaRegistro = fechaLocalNegocio(registro, entrada.zonaHoraria);

  if (horasDesdeActualizacion >= HORAS_VIGENCIA_TIPO_CAMBIO) {
    return {
      ...base,
      requiereActualizacion: true,
      motivo: 'mas_de_24_horas',
      horasDesdeActualizacion,
    };
  }

  if (fechaRegistro !== fechaLocal) {
    return {
      ...base,
      requiereActualizacion: true,
      motivo: 'nuevo_dia',
      horasDesdeActualizacion,
    };
  }

  return {
    ...base,
    requiereActualizacion: false,
    motivo: null,
    horasDesdeActualizacion,
  };
}
