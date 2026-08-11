import { can } from '@/nucleo/autenticacion/verificar-permiso';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

/**
 * ¿El usuario puede gestionar inventario/compras? Se acepta `configuracion`
 * (administración de catálogo/almacén) o `aprobar_ordenes` (compras/producción).
 * `admin` pasa siempre (can() devuelve true para admin). No existe un permiso
 * granular de inventario en el seed; si se agrega, se centraliza aquí.
 */
export async function puedeGestionarInventario(usuario: UsuarioAutenticado): Promise<boolean> {
  if (await can(usuario, 'configuracion')) {
    return true;
  }
  return can(usuario, 'aprobar_ordenes');
}
