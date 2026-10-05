import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import type {
  CatalogosBase,
  EspesorCatalogo,
  MaterialCatalogo,
} from '@/modulos/catalogos/tipos/indice';

/** Secciones visibles de la pestaña Configuración → Catálogos base. */
export const SECCIONES_CATALOGOS_BASE = [
  { id: 'materiales', titulo: 'Materiales', descripcion: 'Base de RFQ, propuesta y orden.' },
  { id: 'espesores', titulo: 'Espesores por material', descripcion: 'El espesor depende del material elegido.' },
  { id: 'procesos', titulo: 'Procesos', descripcion: 'Operación solicitada, ruteo y prefijo de corridas.' },
  { id: 'gruposEquipo', titulo: 'Grupos de equipo', descripcion: 'Categorías de recursos de planeación.' },
  { id: 'gruposPlaneados', titulo: 'Grupos planeados', descripcion: 'Etapas macro de planeación.' },
  { id: 'proximasAcciones', titulo: 'Próximas acciones', descripcion: 'Seguimiento comercial controlado.' },
] as const;

export type SeccionCatalogosBase = (typeof SECCIONES_CATALOGOS_BASE)[number]['id'];

export interface ConteoSeccion {
  total: number;
  activos: number;
  inactivos: number;
}

/**
 * Conteo por sección para cabeceras y accesibilidad. Los inactivos siguen
 * visibles (valores históricos), pero se contabilizan aparte.
 */
export function contarRegistrosPorSeccion(datos: CatalogosBase): Record<SeccionCatalogosBase, ConteoSeccion> {
  const contar = (items: readonly { activo: boolean }[]): ConteoSeccion => {
    const activos = items.filter((item) => item.activo).length;
    return { total: items.length, activos, inactivos: items.length - activos };
  };
  return {
    materiales: contar(datos.materiales),
    espesores: contar(datos.espesores),
    procesos: contar(datos.procesos),
    gruposEquipo: contar(datos.gruposEquipo),
    gruposPlaneados: contar(datos.gruposPlaneados),
    proximasAcciones: contar(datos.proximasAcciones),
  };
}

/**
 * Espesores de un material: en registros nuevos solo se ofrecen los activos;
 * el historial conserva también los inactivos (documento §15.1).
 */
export function espesoresDeMaterial(
  espesores: readonly EspesorCatalogo[],
  materialId: string,
  incluirInactivos = true,
): EspesorCatalogo[] {
  return espesores
    .filter((espesor) => espesor.materialId === materialId)
    .filter((espesor) => incluirInactivos || espesor.activo)
    .sort((a, b) => a.orden - b.orden || a.espesorMm - b.espesorMm || a.etiqueta.localeCompare(b.etiqueta));
}

/** Opciones para registros nuevos: nunca ofrecen códigos inactivos. */
export function soloActivos<T extends { activo: boolean }>(items: readonly T[]): T[] {
  return items.filter((item) => item.activo);
}

/** Material al que pertenece un espesor (para agrupar el historial). */
export function materialDeEspesor(
  materiales: readonly MaterialCatalogo[],
  espesor: EspesorCatalogo,
): MaterialCatalogo | null {
  return materiales.find((material) => material.id === espesor.materialId) ?? null;
}

/** `catalogo_ver` (o admin) habilita ver la pestaña. */
export function puedeVerCatalogos(usuario: UsuarioAutenticado): boolean {
  if (!usuario.activo) return false;
  return usuario.rol === 'admin' || usuario.permisos.includes('catalogo_ver');
}

/** `catalogo_editar` (o admin) habilita mutaciones; la UI desactiva formularios. */
export function puedeEditarCatalogos(usuario: UsuarioAutenticado): boolean {
  if (!usuario.activo) return false;
  return usuario.rol === 'admin' || usuario.permisos.includes('catalogo_editar');
}
