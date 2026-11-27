import { esAreaEquipo } from '@/modulos/catalogos/utilidades/indice';
import type { AreaEquipo } from '@/modulos/catalogos/validaciones/indice';

/**
 * Bug producción 2026-11-27: cuando el grupo tiene equipos pero ninguno en el
 * área que pide el proceso, el aviso genérico «sin equipo» oculta la causa y
 * manda al operador a buscar donde no está el problema. Esta utilidad decide
 * si la falta es total o solo en el área requerida.
 */
export function clasificarFaltaDeEquipos(
  areaRequerida: string | null,
  areasConEquipos: readonly (string | null)[],
): { motivo: 'sin_equipos' | 'sin_equipos_en_area'; areasConEquipos?: AreaEquipo[] } {
  if (!esAreaEquipo(areaRequerida)) return { motivo: 'sin_equipos' };
  const otras = [...new Set(areasConEquipos.filter(esAreaEquipo))].filter(
    (area) => area !== areaRequerida,
  );
  return otras.length > 0
    ? { motivo: 'sin_equipos_en_area', areasConEquipos: otras }
    : { motivo: 'sin_equipos' };
}
