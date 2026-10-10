import { can } from '@/nucleo/autenticacion/verificar-permiso';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

/**
 * ¿El usuario puede gestionar inventario/compras? El permiso dedicado evita que
 * una facultad comercial para aprobar órdenes permita modificar el kardex.
 * `admin` pasa siempre porque `can()` le concede todos los permisos.
 */
export async function puedeGestionarInventario(usuario: UsuarioAutenticado): Promise<boolean> {
  return can(usuario, 'gestionar_inventario');
}

/**
 * ¿El usuario puede ver materiales y costos (C6.1)? Lectura financiera: la
 * gestión de costos exige `gestionar_inventario`, pero finanzas también puede
 * consultar sin proponer ni confirmar.
 */
export async function puedeVerMaterialesCostos(usuario: UsuarioAutenticado): Promise<boolean> {
  return (
    (await can(usuario, 'gestionar_inventario')) || (await can(usuario, 'ver_finanzas'))
  );
}
