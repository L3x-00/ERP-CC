/**
 * Frases sencillas para la bitácora de la propuesta. La base guarda un código
 * interno por evento (`enviar_revision`); el usuario nunca debe leerlo.
 */
const ETIQUETA_EVENTO_PROPUESTA: Record<string, string> = {
  crear_propuesta: 'Propuesta creada',
  crear_nueva_revision: 'Nueva versión creada',
  agregar_item_propuesta: 'Ítem agregado',
  costear_ruteo: 'Ruteo costeado',
  validar_revision: 'Versión validada y lista para enviar',
  reabrir_revision: 'Versión reabierta para editarla',
  enviar_revision: 'Propuesta enviada al cliente',
  registrar_seguimiento: 'Seguimiento registrado',
  aceptar_revision: 'El cliente aceptó esta versión',
  confirmar_venta: 'Venta confirmada',
  confirmar_venta_desde_orden: 'Venta confirmada al crear la orden',
  rechazar_propuesta: 'Propuesta rechazada',
  cerrar_propuesta: 'Propuesta cerrada',
  backfill_legacy: 'Propuesta histórica importada',
};

/** Texto del evento; un código nuevo sin traducción se muestra sin guiones bajos. */
export function etiquetaEventoPropuesta(accion: string): string {
  const conocida = ETIQUETA_EVENTO_PROPUESTA[accion];
  if (conocida) return conocida;
  const texto = accion.replace(/_/g, ' ').trim();
  return texto === '' ? 'Actividad registrada' : texto.charAt(0).toUpperCase() + texto.slice(1);
}
