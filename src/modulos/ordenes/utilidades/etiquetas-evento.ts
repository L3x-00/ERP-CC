/** Etiquetas en español de los eventos de `orden_eventos_cambio` (Actividad de la ficha, R10 Fase 1). */
export const ETIQUETAS_EVENTO: Readonly<Record<string, string>> = {
  orden_creada: 'Orden creada',
  orden_interna_creada: 'Orden interna creada',
  orden_liberada: 'Orden liberada',
  orden_planificada: 'Orden planificada',
  produccion_iniciada: 'Producción iniciada',
  produccion_completada: 'Producción completada',
  orden_cancelada: 'Orden cancelada',
  orden_entregada: 'Orden entregada',
  cierre_administrativo: 'Cierre administrativo',
  ajuste_post_aceptacion: 'Ajuste posterior a la aceptación',
  ajuste_operativo: 'Ajuste operativo',
  programacion_inicial: 'Planeación inicial',
  reprogramacion_operativa: 'Reprogramación operativa',
};

/** «clave_en_snake_case» → «Clave en snake case»: el identificador técnico nunca se muestra. */
export function humanizarClave(clave: string): string {
  const texto = clave.replace(/[_\-\s]+/gu, ' ').trim();
  return texto === '' ? '' : texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

/** Etiqueta del evento; un tipo nuevo sin entrada cae en una versión legible, no en snake_case. */
export function etiquetaEvento(tipo: string): string {
  if (Object.prototype.hasOwnProperty.call(ETIQUETAS_EVENTO, tipo)) return ETIQUETAS_EVENTO[tipo];
  return humanizarClave(tipo) || 'Evento';
}

/** Los cambios que son solo identificadores (recurso_id, partida_id…) no se listan al usuario. */
export function esClaveIdentificador(clave: string): boolean {
  return /(^|_)id$/u.test(clave);
}

/** Los eventos disparados por triggers no traen actor: se atribuyen al Sistema. */
export function nombreActorEvento(actorNombre: string | null): string {
  return actorNombre !== null && actorNombre.trim() !== '' ? actorNombre : 'Sistema';
}
