import { describe, expect, it } from 'vitest';

import {
  agruparPermisosPorModulo,
  hayCambios,
  normalizarSeleccion,
} from '@/modulos/permisos/utilidades/matriz';
import {
  esquemaActualizarPermisosRol,
  esquemaCambiarEstadoUsuario,
  esquemaCambiarRolUsuario,
} from '@/modulos/permisos/validaciones/esquemas-permisos';

describe('utilidades de la matriz de permisos', () => {
  it('agrupa por módulo conservando el orden de entrada', () => {
    const grupos = agruparPermisosPorModulo([
      { codigo: 'rfq_vista', modulo: 'rfq', descripcion: 'Ver RFQ', activo: true },
      { codigo: 'cliente_vista', modulo: 'clientes', descripcion: 'Ver clientes', activo: true },
      { codigo: 'rfq_crear', modulo: 'rfq', descripcion: 'Crear RFQ', activo: true },
    ]);
    expect(grupos.map((grupo) => grupo.modulo)).toEqual(['rfq', 'clientes']);
    expect(grupos[0].permisos.map((permiso) => permiso.codigo)).toEqual(['rfq_vista', 'rfq_crear']);
  });

  it('detecta cambios sin importar el orden', () => {
    expect(hayCambios(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(hayCambios(['a', 'b'], ['b'])).toBe(true);
    expect(hayCambios([], ['a'])).toBe(true);
  });

  it('normaliza la selección sin duplicados y ordenada', () => {
    expect(normalizarSeleccion(['rfq_vista', 'cliente_vista', 'rfq_vista'])).toEqual([
      'cliente_vista',
      'rfq_vista',
    ]);
  });
});

describe('esquemas de administración de accesos', () => {
  it('rechaza el rol admin en la matriz', () => {
    const resultado = esquemaActualizarPermisosRol.safeParse({ rol: 'admin', permisos: [] });
    expect(resultado.success).toBe(false);
  });

  it('acepta un rol editable con permisos del catálogo y el conjunto esperado', () => {
    const resultado = esquemaActualizarPermisosRol.safeParse({
      rol: 'vendedor',
      permisos: ['rfq_vista', 'cliente_vista'],
      permisosEsperados: ['rfq_vista'],
    });
    expect(resultado.success).toBe(true);
  });

  it('exige el conjunto esperado para el control optimista de la matriz', () => {
    const resultado = esquemaActualizarPermisosRol.safeParse({
      rol: 'vendedor',
      permisos: ['rfq_vista'],
    });
    expect(resultado.success).toBe(false);
  });

  it('rechaza permisos fuera del catálogo', () => {
    const resultado = esquemaActualizarPermisosRol.safeParse({
      rol: 'vendedor',
      permisos: ['permiso_inexistente'],
    });
    expect(resultado.success).toBe(false);
  });

  it('exige motivo de al menos 3 caracteres al cambiar rol', () => {
    const base = { usuarioId: '00000000-0000-4000-8000-000000000001', rol: 'gerente' as const };
    expect(esquemaCambiarRolUsuario.safeParse({ ...base, motivo: 'ok' }).success).toBe(false);
    expect(esquemaCambiarRolUsuario.safeParse({ ...base, motivo: 'ascenso' }).success).toBe(true);
  });

  it('exige usuarioId UUID y motivo al cambiar estado', () => {
    expect(
      esquemaCambiarEstadoUsuario.safeParse({ usuarioId: 'no-uuid', activo: false, motivo: 'baja' })
        .success,
    ).toBe(false);
    expect(
      esquemaCambiarEstadoUsuario.safeParse({
        usuarioId: '00000000-0000-4000-8000-000000000002',
        activo: false,
        motivo: 'baja',
      }).success,
    ).toBe(true);
  });
});
