import { describe, expect, it } from 'vitest';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import type {
  Permiso,
  RolUsuario,
  UsuarioAutenticado,
} from '@/modulos/autenticacion/tipos/indice';
import { PERMISOS } from '@/compartido/constantes/indice';

/**
 * Construye un UsuarioAutenticado completo para pruebas (sin `any`).
 * Solo varían rol y permisos; el resto son valores fijos válidos.
 */
function crearUsuarioAutenticado(rol: RolUsuario, permisos: Permiso[]): UsuarioAutenticado {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'usuario@pruebas.mx',
    nombreCompleto: 'Usuario de Pruebas',
    rol,
    pinOperador: null,
    activo: true,
    ultimoLoginEn: null,
    creadoEn: '2026-07-03T00:00:00.000Z',
    actualizadoEn: '2026-07-03T00:00:00.000Z',
    permisos,
  };
}

describe('can() — verificación de permisos (fast-path, sin BD)', () => {
  it('admin tiene cualquier permiso aunque su lista de permisos esté vacía', async () => {
    const admin = crearUsuarioAutenticado('admin', []);

    for (const permiso of PERMISOS) {
      expect(await can(admin, permiso)).toBe(true);
    }
  });

  it('admin tiene permisos arbitrarios no listados', async () => {
    const admin = crearUsuarioAutenticado('admin', []);

    expect(await can(admin, 'permiso-inventado')).toBe(true);
  });

  it('vendedor con permisos resueltos: true para los que tiene en la lista', async () => {
    const vendedor = crearUsuarioAutenticado('vendedor', ['ver_clientes', 'aprobar_ordenes']);

    expect(await can(vendedor, 'ver_clientes')).toBe(true);
    expect(await can(vendedor, 'aprobar_ordenes')).toBe(true);
  });

  it('vendedor con permisos resueltos: false para los que NO tiene en la lista', async () => {
    const vendedor = crearUsuarioAutenticado('vendedor', ['ver_clientes', 'aprobar_ordenes']);

    expect(await can(vendedor, 'eliminar')).toBe(false);
    expect(await can(vendedor, 'configuracion')).toBe(false);
    expect(await can(vendedor, 'ver_finanzas')).toBe(false);
    expect(await can(vendedor, 'registrar_pagos')).toBe(false);
  });

  it('operador con un solo permiso: true solo para ese permiso', async () => {
    const operador = crearUsuarioAutenticado('operador', ['ver_clientes']);

    expect(await can(operador, 'ver_clientes')).toBe(true);
    expect(await can(operador, 'aplicar_saldos')).toBe(false);
    expect(await can(operador, 'cancelar_ordenes_en_proceso')).toBe(false);
  });
});
