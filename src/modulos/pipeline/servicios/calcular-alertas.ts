import type { EstadoRfq, Oportunidad } from '@/modulos/pipeline/tipos/indice';

/** Alertas inteligentes que puede tener una oportunidad. */
export type AlertaPipeline = 'sin_respuesta' | 'estancada' | 'datos_incompletos';

/** Estados donde la oportunidad sigue viva (alertables). */
const ESTADOS_ACTIVOS: readonly EstadoRfq[] = [
  'NEW',
  'INCOMPLETE',
  'WAITING_CUSTOMER',
  'WAITING_TECHNICAL',
  'READY_FOR_PROPOSAL',
  'CONVERTED',
];

/**
 * Cuenta días hábiles completos (lunes a viernes) transcurridos entre dos
 * fechas, en UTC. No descuenta feriados (fuera de alcance de Fase 2).
 * Función pura.
 */
export function contarDiasHabiles(desde: Date, hasta: Date): number {
  const cursor = new Date(desde);
  cursor.setUTCHours(0, 0, 0, 0);
  const fin = new Date(hasta);
  fin.setUTCHours(0, 0, 0, 0);

  let cuenta = 0;
  while (cursor < fin) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dia = cursor.getUTCDay();
    if (dia !== 0 && dia !== 6) {
      cuenta += 1;
    }
  }
  return cuenta;
}

/**
 * Calcula las alertas visuales de una oportunidad. Función pura (recibe `ahora`
 * para poder probarse con fechas controladas).
 *
 * Reglas (del documento ORCA, buckets adaptados al estado del RFQ en ola 2):
 * - `sin_respuesta`: cotización enviada hace > 3 días hábiles sin avanzar de
 *   estado (sigue en READY_FOR_PROPOSAL/CONVERTED).
 * - `estancada`: > 7 días (calendario) sin actividad (último contacto o última
 *   actualización).
 * - `datos_incompletos`: en READY_FOR_PROPOSAL/CONVERTED sin correo de contacto
 *   (defensivo; el gate de LISTO ya lo previene).
 *
 * Los RFQ cerrados/cancelados (y los ya convertidos en orden) no generan
 * alertas.
 *
 * @param oportunidad Oportunidad a evaluar.
 * @param ahora Momento de referencia (default: ahora).
 * @returns Lista de alertas activas (vacía si ninguna).
 */
export function calcularAlertas(
  oportunidad: Oportunidad,
  ahora: Date = new Date(),
): AlertaPipeline[] {
  const alertas: AlertaPipeline[] = [];
  if (!ESTADOS_ACTIVOS.includes(oportunidad.estadoRfq) || oportunidad.ordenVinculada) {
    return alertas;
  }

  const enCotizacion =
    oportunidad.estadoRfq === 'READY_FOR_PROPOSAL' || oportunidad.estadoRfq === 'CONVERTED';

  if (enCotizacion && oportunidad.fechaEnvioCotizacion) {
    const diasHabiles = contarDiasHabiles(new Date(oportunidad.fechaEnvioCotizacion), ahora);
    if (diasHabiles > 3) {
      alertas.push('sin_respuesta');
    }
  }

  const referencia = oportunidad.fechaUltimoContacto ?? oportunidad.actualizadoEn;
  const diasSinActividad =
    (ahora.getTime() - new Date(referencia).getTime()) / (1000 * 60 * 60 * 24);
  if (diasSinActividad > 7) {
    alertas.push('estancada');
  }

  if (enCotizacion && !oportunidad.correo) {
    alertas.push('datos_incompletos');
  }

  return alertas;
}
