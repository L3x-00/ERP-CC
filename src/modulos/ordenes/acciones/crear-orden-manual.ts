'use server';

/**
 * Alias de compatibilidad para los consumidores previos de la acción manual.
 * La implementación y su frontera de seguridad viven en `crear-orden.ts`.
 */
export { crearOrdenAccion as crearOrdenManualAccion } from './crear-orden';
