import type {
  AccionRfq,
  EstadoRfq,
  SeccionValidacionRfq,
  ValidacionRfqListo,
} from '../tipos/indice';
import { SECCIONES_VALIDACION_RFQ } from '../tipos/indice';

/** Etiqueta legible por estado del RFQ. */
export const ETIQUETAS_ESTADO_RFQ: Record<EstadoRfq, string> = {
  NEW: 'Nuevo',
  INCOMPLETE: 'Incompleto',
  WAITING_CUSTOMER: 'En espera del cliente',
  WAITING_TECHNICAL: 'En espera técnica',
  READY_FOR_PROPOSAL: 'Listo para propuesta',
  CONVERTED: 'Convertido',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
};

/** Etiqueta legible por acción de estado. */
export const ETIQUETAS_ACCION_RFQ: Record<AccionRfq, string> = {
  marcar_incompleto: 'Marcar incompleto',
  poner_en_espera_cliente: 'Poner en espera del cliente',
  poner_en_espera_tecnica: 'Poner en espera técnica',
  marcar_listo: 'Marcar listo',
  cerrar: 'Cerrar',
  cancelar: 'Cancelar',
};

const ETAPAS_A_ESTADO: Record<string, EstadoRfq> = {
  prospecto: 'NEW',
  contactado: 'INCOMPLETE',
  cotizado: 'CONVERTED',
  negociacion: 'CONVERTED',
  ganada: 'CONVERTED',
  perdida: 'CLOSED',
};

const ESTADO_A_ETAPA: Record<EstadoRfq, string> = {
  NEW: 'prospecto',
  INCOMPLETE: 'contactado',
  WAITING_CUSTOMER: 'contactado',
  WAITING_TECHNICAL: 'contactado',
  READY_FOR_PROPOSAL: 'negociacion',
  CONVERTED: 'cotizado',
  CLOSED: 'perdida',
  CANCELLED: 'perdida',
};

/**
 * Mapeo del puente de transición etapa → estado_rfq. Es el mismo criterio del
 * backfill y del trigger mientras la ola 2 migra los consumidores de `etapa`.
 */
export function mapearEtapaAEstadoRfq(etapa: string): EstadoRfq {
  return ETAPAS_A_ESTADO[etapa] ?? 'INCOMPLETE';
}

/** Mapeo inverso estado_rfq → etapa del puente de transición. */
export function mapearEstadoRfqAEtapa(estado: EstadoRfq): string {
  return ESTADO_A_ETAPA[estado];
}

/** Permiso requerido por cada acción de estado (admin siempre pasa). */
export function permisoDeAccionRfq(accion: AccionRfq): string {
  if (accion === 'marcar_listo') return 'rfq_marcar_listo';
  if (accion === 'cerrar' || accion === 'cancelar') return 'rfq_cerrar';
  return 'rfq_editar';
}

/** Formatea el número estable de ítem: 1 → IT01, 12 → IT12. */
export function formatearCodigoItem(numero: number): string {
  return `IT${String(numero).padStart(2, '0')}`;
}

/** Siguiente número de ítem considerando cancelados (nunca reutiliza). */
export function siguienteNumeroItem(numeros: readonly number[]): number {
  return numeros.reduce((maximo, numero) => (numero > maximo ? numero : maximo), 0) + 1;
}

function listaDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((elemento): elemento is string => typeof elemento === 'string');
}

/**
 * Normaliza el jsonb de `validar_rfq_listo` a la forma de dominio. Tolera
 * respuestas parciales o inesperadas sin lanzar (defensa en el borde).
 */
export function normalizarValidacionRfq(valor: unknown): ValidacionRfqListo {
  const objeto = valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
  const seccionesCrudas = objeto.secciones !== null
    && typeof objeto.secciones === 'object'
    && !Array.isArray(objeto.secciones)
    ? (objeto.secciones as Record<string, unknown>)
    : {};

  const secciones = {} as Record<SeccionValidacionRfq, string[]>;
  for (const seccion of SECCIONES_VALIDACION_RFQ) {
    secciones[seccion] = listaDeTextos(seccionesCrudas[seccion]);
  }

  const hayFaltantes = SECCIONES_VALIDACION_RFQ.some((seccion) => secciones[seccion].length > 0);

  return {
    listo: objeto.listo === true && !hayFaltantes,
    secciones,
  };
}

/** true si la validación no tiene faltantes (la UI habilita "Marcar listo"). */
export function estaListo(validacion: ValidacionRfqListo): boolean {
  return validacion.listo;
}

/** Secciones que tienen al menos un faltante, en orden canónico. */
export function seccionesConFaltantes(
  validacion: ValidacionRfqListo,
): SeccionValidacionRfq[] {
  return SECCIONES_VALIDACION_RFQ.filter(
    (seccion) => validacion.secciones[seccion].length > 0,
  );
}

/** Resumen plano de faltantes para mensajes de error o checklist. */
export function resumirFaltantes(validacion: ValidacionRfqListo): string[] {
  return SECCIONES_VALIDACION_RFQ.flatMap((seccion) =>
    validacion.secciones[seccion].map((faltante) => `${etiquetaSeccion(seccion)}: ${faltante}`),
  );
}

/** Etiqueta legible de una sección de validación. */
export function etiquetaSeccion(seccion: SeccionValidacionRfq): string {
  const etiquetas: Record<SeccionValidacionRfq, string> = {
    cliente: 'Cliente',
    general: 'General',
    items: 'Ítems',
    archivos: 'Archivos',
    seguimiento: 'Seguimiento',
  };
  return etiquetas[seccion];
}
