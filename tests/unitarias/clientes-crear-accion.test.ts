import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spies compartidos, creados con vi.hoisted para poder referenciarlos dentro de
// los factories de vi.mock (que se elevan por encima de los imports).
const { obtenerUsuarioMock, canMock, registrarLogMock, singleMock } = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  singleMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({ single: () => singleMock() }),
      }),
    }),
  }),
}));

import { crearClienteAccion } from '@/modulos/clientes/acciones/crear-cliente';

const USUARIO = {
  id: 'u-1',
  email: 'a@b.com',
  nombreCompleto: 'Admin Uno',
  rol: 'admin' as const,
  activo: true,
  creadoEn: '2026-01-01T00:00:00Z',
  actualizadoEn: '2026-01-01T00:00:00Z',
  permisos: ['ver_clientes'],
};

const ENTRADA_VALIDA = {
  razonSocial: 'ACME Manufactura SA',
  nombreComercial: 'ACME',
  rfc: '',
  correo: '',
  limiteCredito: 100_000,
  estado: 'activo' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  singleMock.mockResolvedValue({ data: { id: 'c-1' }, error: null });
});

describe('crearClienteAccion', () => {
  it('crea el cliente y registra la mutación en la bitácora', async () => {
    const respuesta = await crearClienteAccion(ENTRADA_VALIDA);

    expect(respuesta).toEqual({ exito: true, datos: { id: 'c-1' } });
    expect(registrarLogMock).toHaveBeenCalledTimes(1);
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'crear',
      'clientes',
      'c-1',
      expect.objectContaining({ razonSocial: 'ACME Manufactura SA' }),
    );
  });

  it('sin permiso ver_clientes: no crea ni registra', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await crearClienteAccion(ENTRADA_VALIDA);

    expect(respuesta.exito).toBe(false);
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('sin sesión: rechaza antes de tocar la base de datos', async () => {
    obtenerUsuarioMock.mockResolvedValue(null);

    const respuesta = await crearClienteAccion(ENTRADA_VALIDA);

    expect(respuesta).toEqual({ exito: false, error: 'No autorizado' });
    expect(singleMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('entrada inválida (razón social vacía): error de validación', async () => {
    const respuesta = await crearClienteAccion({ ...ENTRADA_VALIDA, razonSocial: '' });

    expect(respuesta.exito).toBe(false);
    expect(registrarLogMock).not.toHaveBeenCalled();
  });
});
