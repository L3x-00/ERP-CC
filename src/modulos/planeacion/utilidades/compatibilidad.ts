/**
 * C9.2/P10/P-04: compatibilidad entre los grupos de equipo que exige el ruteo de
 * una partida y el grupo del recurso elegido. El panel la usa para ordenar y
 * marcar opciones; elegir un grupo incompatible impide guardar y PostgreSQL lo
 * rechaza con `recurso_incompatible`. Tolerante: sin ambos lados resueltos el
 * resultado es «sin dato» y no se advierte ni bloquea.
 */

export type CompatibilidadRecurso = 'compatible' | 'incompatible' | 'sin_dato';

/** Grupo de equipo resuelto (id + nombre) para un recurso. */
export interface GrupoEquipoPlaneacion {
  id: string;
  nombre: string;
}

/** Insumos serializables que el servidor entrega al panel para cada partida/recurso. */
export interface CompatibilidadRecursosPlaneacion {
  /** Grupo del recurso por id; null cuando el recurso no tiene grupo asignado. */
  grupoPorRecurso: Record<string, GrupoEquipoPlaneacion | null>;
  /** Grupos exigidos por el ruteo por partida; null cuando no se pudo resolver. */
  gruposRequeridosPorPartida: Record<string, string[] | null>;
}

/** Normaliza texto de catálogos: minúsculas, sin espacios de sobra ni bordes. */
export function normalizarTextoCatalogo(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface EntradaResolverGruposRequeridos {
  procesos: readonly string[];
  /** Equipo/estación del desglose; respaldo cuando el ruteo no resuelve grupo. */
  maquinaAsignada: string | null;
  /** Nombre o código normalizado del proceso → grupo de equipo (o null). */
  grupoPorProceso: ReadonlyMap<string, string | null>;
  /** Código normalizado del recurso → grupo de equipo (o null). */
  grupoPorCodigoRecurso: ReadonlyMap<string, string | null>;
}

/**
 * Grupos de equipo que exige la partida: los de sus procesos; si ninguno
 * resuelve, el del recurso anotado en «Equipo / estación». `null` = sin dato.
 */
export function resolverGruposRequeridos(
  entrada: EntradaResolverGruposRequeridos,
): string[] | null {
  const grupos = new Set<string>();
  for (const proceso of entrada.procesos) {
    const grupo = entrada.grupoPorProceso.get(normalizarTextoCatalogo(proceso));
    if (grupo) grupos.add(grupo);
  }
  if (grupos.size > 0) return [...grupos];

  if (entrada.maquinaAsignada) {
    const grupo = entrada.grupoPorCodigoRecurso.get(
      normalizarTextoCatalogo(entrada.maquinaAsignada),
    );
    if (grupo) return [grupo];
  }
  return null;
}

/**
 * Compatible si el grupo del recurso está entre los requeridos por la partida;
 * incompatible solo cuando ambos lados se conocen y difieren; en cualquier otro
 * caso «sin dato».
 */
export function evaluarCompatibilidadRecurso(
  gruposRequeridos: readonly string[] | null,
  grupoDelRecurso: string | null,
): CompatibilidadRecurso {
  if (!grupoDelRecurso) return 'sin_dato';
  if (!gruposRequeridos || gruposRequeridos.length === 0) return 'sin_dato';
  return gruposRequeridos.includes(grupoDelRecurso) ? 'compatible' : 'incompatible';
}
