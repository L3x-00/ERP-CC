/**
 * Clave raíz del calendario de Planeación en TanStack Query. El sincronizador
 * Realtime invalida exactamente esta clave; las consultas añaden los filtros como
 * segmentos adicionales para que la invalidación por prefijo las alcance a todas.
 */
export const CLAVE_CALENDARIO_PLANEACION = ['planeacion', 'calendario'] as const;

/** Raíz compartida para invalidar cualquier detalle tras una mutación o evento. */
export const CLAVE_DETALLE_PROGRAMACION = ['planeacion', 'detalle-programacion'] as const;

export function claveDetalleProgramacion(programacionId: string, actualizadoEn: string) {
  return [...CLAVE_DETALLE_PROGRAMACION, programacionId, actualizadoEn] as const;
}
