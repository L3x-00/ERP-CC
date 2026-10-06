/** Clave raíz del tablero; Realtime invalida todas sus variantes de filtro. */
export const CLAVE_TABLERO_PRODUCCION = ['produccion', 'tablero'] as const;
export const CLAVE_ARCHIVOS_SESION = ['produccion', 'archivos-sesion'] as const;
/** SII-B6 ola 2: catálogos de piso (motivos de pausa y procesos). */
export const CLAVE_CATALOGOS_PISO = ['produccion', 'catalogos-piso'] as const;
/** SII-B6 ola 2: corridas de una orden (se anexa el ordenId). */
export const CLAVE_CORRIDAS_ORDEN = ['produccion', 'corridas'] as const;
/** SII-B6 ola 2: inspecciones de calidad de una orden (se anexa el ordenId). */
export const CLAVE_INSPECCIONES_ORDEN = ['produccion', 'inspecciones'] as const;
/** SII-B6 ola 2: autorizaciones de horas extra de una orden (se anexa el ordenId). */
export const CLAVE_HORAS_EXTRA_ORDEN = ['produccion', 'horas-extra'] as const;
/** SII-B6 ola 2: máquinas liberadas ≥60 min por motivo liberable. */
export const CLAVE_RECURSOS_LIBERABLES = ['produccion', 'recursos-liberables'] as const;
