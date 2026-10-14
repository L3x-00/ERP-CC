import { obtenerCatalogosBaseAccion } from '@/modulos/catalogos/acciones/indice';
import type { CatalogosBase } from '@/modulos/catalogos/tipos/indice';

/** Clave de la proyección de catálogos base; la comparten Catálogos base y Tarifas / TC. */
export const CLAVE_CATALOGOS_BASE = ['configuracion', 'catalogos-base'] as const;

/** Lee todos los catálogos base (incluidos los inactivos) o lanza con el motivo. */
export async function consultarCatalogosBase(): Promise<CatalogosBase> {
  const respuesta = await obtenerCatalogosBaseAccion({ soloActivos: false });
  if (!respuesta.exito || !respuesta.datos) {
    throw new Error(respuesta.exito ? 'Catálogos ausentes' : respuesta.error);
  }
  return respuesta.datos;
}
