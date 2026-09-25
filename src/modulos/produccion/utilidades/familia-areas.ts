/**
 * A06/OBS-14: resolución de la familia de áreas del catálogo de taller.
 *
 * Módulo hoja, sin imports de servidor ni de Supabase: el tablero (servidor) y
 * la terminal de piso (cliente) comparten exactamente la misma regla que
 * `privado.area_planeacion_catalogo` en SQL, incluido el control de ciclos.
 */

/** Entrada mínima del catálogo necesaria para resolver ancestros. */
export interface AreaFamiliaTaller {
  codigo: string;
  padreCodigo: string | null;
  areaPlaneacion: string | null;
  nombre?: string;
}

export interface OpcionFamiliaArea {
  codigo: string;
  nombre: string;
}

/** Tope de ancestros: corta cadenas absurdas además de los ciclos. */
const LIMITE_ANCESTROS = 32;

function indexarCatalogo(
  catalogo: readonly AreaFamiliaTaller[],
): Map<string, AreaFamiliaTaller> {
  return new Map(catalogo.map((area) => [area.codigo, area]));
}

/**
 * Primer ancestro con área macro. Devuelve `null` si el código no está en el
 * catálogo, si ningún ancestro declara macro o si la cadena forma un ciclo.
 */
function macroDesdeIndice(
  indice: ReadonlyMap<string, AreaFamiliaTaller>,
  codigo: string,
): string | null {
  const visitados = new Set<string>();
  let actual = indice.get(codigo);
  while (actual !== undefined && visitados.size < LIMITE_ANCESTROS) {
    if (visitados.has(actual.codigo)) return null;
    visitados.add(actual.codigo);
    if (actual.areaPlaneacion) return actual.areaPlaneacion;
    actual = actual.padreCodigo === null ? undefined : indice.get(actual.padreCodigo);
  }
  return null;
}

/** Área macro efectiva de un código del catálogo (propia o de sus ancestros). */
export function resolverAreaMacro(
  catalogo: readonly AreaFamiliaTaller[],
  codigo: string | null,
): string | null {
  if (!codigo) return null;
  return macroDesdeIndice(indexarCatalogo(catalogo), codigo);
}

/**
 * Códigos aceptados al filtrar por un área: la familia completa de su macro
 * (p. ej. "Metal mecánica" incluye subáreas y procesos de cualquier nivel). Si
 * el código no resuelve macro, se acepta solo el código exacto: un catálogo
 * incompleto no puede ensanchar el filtro.
 */
export function codigosFamiliaArea(
  catalogo: readonly AreaFamiliaTaller[],
  areaCodigo: string,
): Set<string> {
  const indice = indexarCatalogo(catalogo);
  const macro = macroDesdeIndice(indice, areaCodigo);
  if (macro === null) return new Set([areaCodigo]);
  const familia = catalogo
    .filter((area) => macroDesdeIndice(indice, area.codigo) === macro)
    .map((area) => area.codigo);
  return new Set([areaCodigo, ...familia]);
}

/**
 * Opciones de un filtro de área: una entrada por familia presente en los
 * códigos dados, representada por su área raíz cuando el catálogo la resuelve.
 * Evita ofrecer "Corte láser" y "Soldadura" como filtros distintos cuando
 * ambos seleccionan la misma familia.
 */
export function opcionesFamiliaArea(
  catalogo: readonly AreaFamiliaTaller[],
  codigos: readonly string[],
): OpcionFamiliaArea[] {
  const indice = indexarCatalogo(catalogo);
  const opciones = new Map<string, string>();
  for (const codigo of codigos) {
    const macro = macroDesdeIndice(indice, codigo);
    const raiz = macro === null
      ? undefined
      : catalogo.find(
          (area) => area.padreCodigo === null && macroDesdeIndice(indice, area.codigo) === macro,
        );
    const elegida = raiz ?? indice.get(codigo);
    const clave = elegida?.codigo ?? codigo;
    opciones.set(clave, elegida?.nombre ?? clave);
  }
  return [...opciones]
    .map(([codigo, nombre]) => ({ codigo, nombre }))
    .sort((primera, segunda) => primera.nombre.localeCompare(segunda.nombre));
}
