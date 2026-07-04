/**
 * Parsea JSON seguro (retorna defecto o null si falla).
 */
export function parsearJSON<T>(json: string, defecto?: T): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defecto ?? null;
  }
}

/**
 * Obtiene valor anidado seguro.
 * Ej: obtenerAnidado(obj, 'usuario.perfil.nombre')
 */
export function obtenerAnidado(objeto: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((actual, clave) => {
    if (actual !== null && typeof actual === 'object') {
      return (actual as Record<string, unknown>)[clave];
    }
    return undefined;
  }, objeto);
}
