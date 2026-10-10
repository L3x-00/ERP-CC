import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usuarioMock, permisoMock, servicioMock, adminMock, servidorMock } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  permisoMock: vi.fn(),
  servicioMock: vi.fn(),
  adminMock: vi.fn(() => ({ tipo: 'admin' })),
  servidorMock: vi.fn(() => ({ tipo: 'servidor' })),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => permisoMock(...args),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => adminMock(),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: () => servidorMock(),
}));
vi.mock('@/modulos/ordenes/servicios/documento-orden-servicio', () => ({
  obtenerDocumentoOrdenServicio: (...args: unknown[]) => servicioMock(...args),
}));

import { obtenerDocumentoOrdenAccion } from '@/modulos/ordenes/acciones/obtener-documento-orden';

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  rol: 'contador',
  activo: true,
  permisos: [],
};
const ORDEN_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue(USUARIO);
  permisoMock.mockImplementation(async (_usuario: unknown, permiso: string) => permiso === 'orden_vista');
  servicioMock.mockResolvedValue({ orden: { folio: 'O-1026_01' } });
});

describe('C4.3 documento comercial de Orden', () => {
  it('rechaza a quien tiene finanzas pero no puede ver Ordenes', async () => {
    permisoMock.mockImplementation(
      async (_usuario: unknown, permiso: string) => permiso === 'ver_finanzas',
    );

    await expect(obtenerDocumentoOrdenAccion(ORDEN_ID)).resolves.toEqual({
      exito: false,
      error: 'Sin permiso para ver información financiera de la orden',
    });
    expect(permisoMock).toHaveBeenCalledTimes(1);
    expect(permisoMock).toHaveBeenCalledWith(USUARIO, 'orden_vista');
    expect(servicioMock).not.toHaveBeenCalled();
    expect(adminMock).not.toHaveBeenCalled();
  });

  it('rechaza antes de consultar datos si falta ver_finanzas', async () => {
    await expect(obtenerDocumentoOrdenAccion(ORDEN_ID)).resolves.toEqual({
      exito: false,
      error: 'Sin permiso para ver información financiera de la orden',
    });
    expect(permisoMock).toHaveBeenNthCalledWith(1, USUARIO, 'orden_vista');
    expect(permisoMock).toHaveBeenNthCalledWith(2, USUARIO, 'ver_finanzas');
    expect(servicioMock).not.toHaveBeenCalled();
    expect(adminMock).not.toHaveBeenCalled();
    expect(servidorMock).not.toHaveBeenCalled();
  });

  it('lee con cliente de servidor privilegiado solo despues de autorizar finanzas', async () => {
    permisoMock.mockResolvedValue(true);

    const respuesta = await obtenerDocumentoOrdenAccion(ORDEN_ID);

    expect(respuesta.exito).toBe(true);
    expect(permisoMock).toHaveBeenNthCalledWith(1, USUARIO, 'orden_vista');
    expect(permisoMock).toHaveBeenNthCalledWith(2, USUARIO, 'ver_finanzas');
    expect(servicioMock).toHaveBeenCalledWith({ tipo: 'admin' }, ORDEN_ID);
    expect(servidorMock).not.toHaveBeenCalled();
  });
});
