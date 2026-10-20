import { etiquetaAccion } from '@/modulos/auditoria/utilidades/actividad';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';

const ESTADO = ETIQUETA_ESTADO_PROPIESTA;

/**
 * Códigos de `propuesta_revision_eventos.accion` que escriben las RPC de
 * Propuestas, en lenguaje de negocio. Donde la acción termina en un estado se
 * reutiliza la etiqueta de ese estado (`ETIQUETA_ESTADO_PROPIESTA`) y los
 * verbos de la ficha de Propuestas («Crear nueva versión», «Validar»,
 * «Registrar seguimiento», «Costear ruteo», «Confirmar venta»…), puestos en
 * participio porque la bitácora narra hechos.
 */
const ETIQUETAS_EVENTO_PROPUESTA = new Map<string, string>([
  ['crear_propuesta', 'Propuesta creada'],
  ['backfill_legacy', 'Propuesta migrada del cotizador anterior'],
  ['crear_nueva_revision', 'Nueva versión creada'],
  ['agregar_item_propuesta', 'Ítem agregado'],
  ['costear_ruteo', 'Ruteo costeado'],
  ['validar_revision', 'Revisión validada'],
  ['reabrir_revision', 'Revisión reabierta'],
  ['enviar_revision', `Revisión ${ESTADO.SENT.toLowerCase()}`],
  ['registrar_seguimiento', 'Seguimiento registrado'],
  ['aceptar_revision', `Revisión ${ESTADO.ACCEPTED.toLowerCase()}`],
  ['confirmar_venta', ESTADO.SALE_CONFIRMED],
  ['confirmar_venta_desde_orden', `${ESTADO.SALE_CONFIRMED} al crear la orden`],
  ['rechazar_propuesta', `Propuesta ${ESTADO.REJECTED.toLowerCase()}`],
  ['cerrar_propuesta', `Propuesta ${ESTADO.CLOSED.toLowerCase()}`],
]);

/**
 * Etiqueta legible de la acción de un evento de revisión. Un código que aún no
 * tiene traducción propia se humaniza con la misma función que usa Actividad
 * (`etiquetaAccion`), de modo que nunca se muestra el identificador técnico.
 */
export function etiquetaAccionEventoPropuesta(accion: string): string {
  return ETIQUETAS_EVENTO_PROPUESTA.get(accion) ?? etiquetaAccion(accion);
}
