type ProcesoRuteo = {
  codigo: string;
  nombre: string;
  grupoEquipoId: string | null;
};

type GrupoEquipoRuteo = { id: string; codigo: string; nombre: string };

/** Compara nombres sin importar mayúsculas, acentos, guiones bajos ni espacios repetidos. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Grupo de equipo que corresponde a un proceso del ruteo. Prioriza el grupo
 * configurado en el catálogo del proceso; si no tiene (o apunta a uno inactivo),
 * busca el grupo que se llama igual por nombre o por código (p. ej. el proceso
 * «CNC Router» y el grupo «CNC Router»), para que el usuario no repita el dato.
 * Devuelve '' cuando no hay correspondencia clara: nunca se adivina.
 */
export function resolverGrupoEquipoDelProceso(
  proceso: ProcesoRuteo,
  grupos: readonly GrupoEquipoRuteo[],
): string {
  if (proceso.grupoEquipoId && grupos.some((grupo) => grupo.id === proceso.grupoEquipoId)) {
    return proceso.grupoEquipoId;
  }

  const nombre = normalizar(proceso.nombre);
  const codigo = normalizar(proceso.codigo);
  const porNombre = grupos.find((grupo) => normalizar(grupo.nombre) === nombre);
  if (porNombre) return porNombre.id;

  const porCodigo = grupos.find(
    (grupo) => normalizar(grupo.codigo) === codigo || normalizar(grupo.nombre) === codigo,
  );
  return porCodigo?.id ?? '';
}
