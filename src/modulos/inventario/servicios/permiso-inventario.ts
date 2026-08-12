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
