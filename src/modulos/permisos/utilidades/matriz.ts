import type { RolUsuario } from '@/modulos/autenticacion/tipos/indice';

import type { PermisoCatalogo } from '../tipos/indice';

/** Nombre legible de cada rol para la UI administrativa. */
export const NOMBRE_ROL: Record<RolUsuario, string> = {
  operador: 'Operator (piso)',
  vendedor: 'Customer Service',
  gerente: 'Management',
  contador: 'Administrative',
  admin: 'Admin',
};

/** Roles cuya matriz es editable (admin siempre tiene todo por diseño). */
export const ROLES_EDITABLES: RolUsuario[] = ['vendedor', 'gerente', 'contador', 'operador'];

/** Agrupa el catálogo por módulo conservando el orden de entrada. */
export function agruparPermisosPorModulo(
  permisos: PermisoCatalogo[],
): Array<{ modulo: string; permisos: PermisoCatalogo[] }> {
  const grupos = new Map<string, PermisoCatalogo[]>();
  for (const permiso of permisos) {
    const actuales = grupos.get(permiso.modulo) ?? [];
    actuales.push(permiso);
    grupos.set(permiso.modulo, actuales);
  }
  return Array.from(grupos, ([modulo, items]) => ({ modulo, permisos: items }));
}

/** ¿La selección editada difiere de la original? (comparación sin orden). */
export function hayCambios(original: string[], editado: string[]): boolean {
  if (original.length !== editado.length) return true;
  const referencia = new Set(original);
  return editado.some((codigo) => !referencia.has(codigo));
}

/** Normaliza una selección para guardar: sin duplicados y ordenada. */
export function normalizarSeleccion(codigos: string[]): string[] {
  return Array.from(new Set(codigos)).sort();
}
