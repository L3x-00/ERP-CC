/**
 * Re-export del verificador central de permisos `can(usuario, permiso)`.
 * La implementación vive en el núcleo para poder usarse desde cualquier módulo
 * sin crear dependencias circulares entre módulos de negocio.
 */
export { can } from '@/nucleo/autenticacion/verificar-permiso';
