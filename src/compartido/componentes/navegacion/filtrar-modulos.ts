import { MODULOS_NAVEGACION, type ModuloNavegacion } from './modulos-navegacion';

/**
 * Filtra el menú lateral por permisos del usuario (el admin ve todo). Función
 * pura: puede ejecutarse en el servidor antes de montar el chasis.
 */
export function obtenerModulosPermitidos(usuario: {
  rol: string;
  permisos: readonly string[];
}): readonly ModuloNavegacion[] {
  if (usuario.rol === 'admin') {
    return MODULOS_NAVEGACION;
  }

  return MODULOS_NAVEGACION.filter(
    (modulo) =>
      modulo.permisos.length === 0 ||
      modulo.permisos.some((permiso) => usuario.permisos.includes(permiso)),
  );
}
