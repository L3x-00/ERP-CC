/** Etiquetas legibles del catálogo de próximas acciones (SII-B1.7). */
const ETIQUETAS_PROXIMA_ACCION: Record<string, string> = {
  FOLLOW_UP: 'Seguimiento',
  CONFIRM_RECEIPT: 'Confirmar recepción',
  WAIT_CUSTOMER_RESPONSE: 'Esperar respuesta del cliente',
  REQUEST_APPROVAL_PO: 'Solicitar aprobación de OC',
  RESOLVE_CUSTOMER_QUESTIONS: 'Resolver dudas del cliente',
  PREPARE_NEW_REVISION: 'Preparar nueva revisión',
  OTHER: 'Otro',
};

function humanizar(codigo: string): string {
  const texto = codigo.replace(/_/g, ' ').trim();
  return texto.length > 0 ? texto.charAt(0).toUpperCase() + texto.slice(1) : codigo;
}

/** Etiqueta legible de una próxima acción; null → "Sin próxima acción". */
export function etiquetaProximaAccion(codigo: string | null): string {
  if (!codigo) return 'Sin próxima acción';
  return ETIQUETAS_PROXIMA_ACCION[codigo] ?? humanizar(codigo);
}
