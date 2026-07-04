import type { EtapaPipeline, Oportunidad } from '@/modulos/pipeline/tipos/indice';

/** Alertas inteligentes que puede tener una oportunidad. */
export type AlertaPipeline = 'sin_respuesta' | 'estancada' | 'datos_incompletos';

const ETAPAS_ACTIVAS: readonly EtapaPipeline[] = [
  'prospecto',
  'contactado',
  'cotizado',
  'negociacion',
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
 * Reglas (del documento ORCA):
 * - `sin_respuesta`: cotización enviada hace > 3 días hábiles sin avanzar de
 *   etapa (sigue en cotizado/negociación).
 * - `estancada`: > 7 días (calendario) sin actividad (último contacto o última
 *   actualización).
 * - `datos_incompletos`: en etapa cotizado+ sin correo de contacto (defensivo;
 *   el gate de transición ya lo previene).
 *
 * Las oportunidades ganadas/perdidas no generan alertas.
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
  if (!ETAPAS_ACTIVAS.includes(oportunidad.etapa)) {
    return alertas;
  }

  const enCotizacion =
    oportunidad.etapa === 'cotizado' || oportunidad.etapa === 'negociacion';

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
