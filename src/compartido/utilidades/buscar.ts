/**
 * Sanea un término de búsqueda para usarlo dentro de un `.or(...)` de PostgREST.
 *
 * PostgREST interpreta `, ( ) " % *` (y `\`) como sintaxis del filtro; sin
 * neutralizarlos, un término del usuario podría inyectar condiciones. Devuelve el
 * término limpio y recortado (cadena vacía si no queda nada útil). La RLS ya acota
 * el alcance, pero esto cierra además la inyección de filtros.
 *
 * @param texto Texto crudo del buscador.
 * @returns Término neutralizado y recortado.
 */
export function sanitizarTerminoBusqueda(texto: string): string {
  return texto.replace(/[%,()"*\\]/g, ' ').trim();
}
