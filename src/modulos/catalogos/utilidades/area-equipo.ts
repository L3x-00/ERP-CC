import type {
  AreaTrabajoOpcion,
  GrupoEquipoCatalogo,
  ProcesoCatalogo,
} from '@/modulos/catalogos/tipos/indice';
import { AREAS_EQUIPO, type AreaEquipo } from '@/modulos/catalogos/validaciones/indice';

/**
 * Bug producción 2026-11-27: las máquinas del grupo CL1 se dieron de alta con
 * `area = 'taller'` mientras su proceso exige `sheet_metal`. La validación de
 * inicio de lote no encontraba equipos y el operador veía un mensaje genérico.
 *
 * La regla —el área de planeación de un equipo la define el proceso de su
 * grupo— vive aquí, en un solo lugar, para que la UI, la acción de servidor y
 * (más adelante) el diagnóstico de capacidad usen exactamente el mismo cálculo.
 */

/** Etiqueta visible de cada área macro de Planeación. */
export const ETIQUETA_AREA_EQUIPO: Record<AreaEquipo, string> = {
  sheet_metal: 'Corte y lámina',
  taller: 'Taller',
  acabados: 'Acabados',
  ext: 'Proveedor externo',
};

export function esAreaEquipo(valor: string | null | undefined): valor is AreaEquipo {
  return typeof valor === 'string' && (AREAS_EQUIPO as readonly string[]).includes(valor);
}

/** Datos mínimos de un proceso para derivar el área de su grupo. */
export type ProcesoParaArea = Pick<
  ProcesoCatalogo,
  'grupoEquipoId' | 'areaTrabajoCodigo' | 'activo'
>;

/** Datos mínimos de un área de trabajo para recorrer su jerarquía. */
export type AreaParaJerarquia = Pick<
  AreaTrabajoOpcion,
  'codigo' | 'padreCodigo' | 'areaPlaneacion'
>;

/** Código visible del grupo: el usuario distingue duplicados por el código. */
export function etiquetaGrupoEquipo(grupo: Pick<GrupoEquipoCatalogo, 'codigo' | 'nombre'>): string {
  return `${grupo.codigo} · ${grupo.nombre}`;
}

/**
 * Área macro de un área de trabajo. Recorre la jerarquía porque un área de
 * proceso puede no tener `area_planeacion` propia y heredarla de su ancestro.
 */
export function areaMacroDeCodigo(
  codigo: string | null | undefined,
  areas: readonly AreaParaJerarquia[],
): AreaEquipo | null {
  if (!codigo) return null;
  const areaPorCodigo = new Map(areas.map((area) => [area.codigo, area] as const));
  const visitados = new Set<string>();
  let actual = areaPorCodigo.get(codigo);
  while (actual && !visitados.has(actual.codigo)) {
    visitados.add(actual.codigo);
    if (esAreaEquipo(actual.areaPlaneacion)) return actual.areaPlaneacion;
    actual = actual.padreCodigo ? areaPorCodigo.get(actual.padreCodigo) : undefined;
  }
  return null;
}

/**
 * Áreas de planeación que exigen los procesos activos de un grupo. Un mismo
 * grupo puede usarse en más de un área: en ese caso se devuelven todas y la UI
 * pide elegir. Sin procesos no se puede deducir y se devuelve una lista vacía.
 */
export function areasEsperadasGrupo(
  grupoId: string | null | undefined,
  procesos: readonly ProcesoParaArea[],
  areas: readonly AreaParaJerarquia[],
): AreaEquipo[] {
  if (!grupoId) return [];
  const encontradas = new Set<AreaEquipo>();
  for (const proceso of procesos) {
    if (!proceso.activo || proceso.grupoEquipoId !== grupoId) continue;
    const macro = areaMacroDeCodigo(proceso.areaTrabajoCodigo, areas);
    if (macro) encontradas.add(macro);
  }
  return [...encontradas];
}

/** ¿El área de la máquina coincide con alguna de las que exige su grupo? */
export function areaCompatibleConGrupo(
  area: string | null | undefined,
  areasEsperadas: readonly AreaEquipo[],
): boolean {
  // Un grupo sin procesos no impone área: no se bloquea una configuración que
  // el catálogo todavía no define.
  if (areasEsperadas.length === 0) return true;
  return esAreaEquipo(area) && areasEsperadas.includes(area);
}
