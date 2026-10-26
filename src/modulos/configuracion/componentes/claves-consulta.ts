/** Clave única para invalidar la proyección autorizada de configuración. */
export const CLAVE_CONFIGURACION = ['configuracion'] as const;

/** Catálogos comerciales públicos (tiers CFG-08 y categorías de gasto CFG-09). */
export const CLAVE_CATALOGOS_COMERCIALES = ['configuracion', 'catalogos-comerciales'] as const;

/** TC USD→MXN vigente para prellenar formularios que capturan en USD. */
export const CLAVE_TIPO_CAMBIO_VIGENTE = ['configuracion', 'tipo-cambio-vigente'] as const;
