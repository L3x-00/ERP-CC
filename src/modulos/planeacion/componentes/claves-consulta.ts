/**
 * Clave raíz del calendario de Planeación en TanStack Query. El sincronizador
 * Realtime invalida exactamente esta clave; las consultas añaden los filtros como
 * segmentos adicionales para que la invalidación por prefijo las alcance a todas.
 */
export const CLAVE_CALENDARIO_PLANEACION = ['planeacion', 'calendario'] as const;
