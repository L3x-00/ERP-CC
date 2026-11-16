import { beforeEach, describe, expect, it, vi } from 'vitest';

const { asignaciones, catalogo } = vi.hoisted(() => ({
  asignaciones: { valor: [{ permiso: 'calidad_inspeccionar' }] as { permiso: string }[] },
  catalogo: { valor: [{ codigo: 'calidad_inspeccionar' }] as { codigo: string }[] },
}));

vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: (tabla: string) => ({
      select: () => ({
        eq: (_columna: string, primerValor: string) => ({
          eq: (_segundaColumna: string, segundoValor: string) => ({
            limit: async () => (tabla === 'permisos_rol'
              ? { data: asignaciones.valor.filter((fila) => fila.permiso === segundoValor), error: null }
              : { data: catalogo.valor.filter((fila) => fila.codigo === primerValor), error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import { can } from '@/nucleo/autenticacion/verificar-permiso';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

const OPERADOR: UsuarioAutenticado = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'operador@orca.test',
  nombreCompleto: 'Operador',
  rol: 'operador',
  activo: true,
  permisos: [],
  creadoEn: '2026-11-01T10:00:00.000Z',
  actualizadoEn: '2026-11-01T10:00:00.000Z',
};

beforeEach(() => {
  asignaciones.valor = [{ permiso: 'calidad_inspeccionar' }];
  catalogo.valor = [{ codigo: 'calidad_inspeccionar' }];
});

describe('can() — operador de piso sin permisos resueltos', () => {
  it('consulta permisos_rol con service role y concede el permiso del rol (regresión QA)', async () => {
    await expect(can(OPERADOR, 'calidad_inspeccionar')).resolves.toBe(true);
  });

  it('niega un permiso que el rol no tiene', async () => {
    await expect(can(OPERADOR, 'aprobar_ordenes')).resolves.toBe(false);
  });

  it('niega un permiso desactivado en el catálogo', async () => {
    catalogo.valor = [];
    await expect(can(OPERADOR, 'calidad_inspeccionar')).resolves.toBe(false);
  });

  it('niega a un usuario inactivo aunque tenga el permiso', async () => {
    await expect(can({ ...OPERADOR, activo: false }, 'calidad_inspeccionar')).resolves.toBe(false);
  });
});
