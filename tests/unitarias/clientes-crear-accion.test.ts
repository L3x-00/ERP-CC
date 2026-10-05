import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spies compartidos, creados con vi.hoisted para poder referenciarlos dentro de
// los factories de vi.mock (que se elevan por encima de los imports).
const { obtenerUsuarioMock, canMock, registrarLogMock, rpcMock } = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
  nuevoCorrelationId: () => 'corr-prueba',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }),
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

const RESPUESTA_RPC = {
  data: { clienteId: 'c-1', folio: 'CLI-0007', contactoId: null },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  rpcMock.mockResolvedValue(RESPUESTA_RPC);
});

describe('crearClienteAccion', () => {
  it('crea el cliente por la RPC atómica y registra la mutación en la bitácora', async () => {
    const respuesta = await crearClienteAccion(ENTRADA_VALIDA);

    expect(respuesta).toEqual({ exito: true, datos: { id: 'c-1', folio: 'CLI-0007' } });
    expect(rpcMock).toHaveBeenCalledWith(
      'crear_cliente_con_contacto',
      expect.objectContaining({
        p_actor: 'u-1',
        p_datos: expect.objectContaining({ razon_social: 'ACME Manufactura SA' }),
      }),
    );
    expect(registrarLogMock).toHaveBeenCalledTimes(1);
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'crear',
      'clientes',
      'c-1',
      expect.objectContaining({ razonSocial: 'ACME Manufactura SA', folio: 'CLI-0007' }),
      expect.any(String),
    );
  });

  it('traduce el duplicado con el folio existente', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'cliente_duplicado', details: 'CLI-0003' },
    });

    const respuesta = await crearClienteAccion(ENTRADA_VALIDA);

    expect(respuesta.exito).toBe(false);
    if (!respuesta.exito) expect(respuesta.error).toContain('CLI-0003');
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('convierte el contacto legado (texto) en contacto principal atómico', async () => {
    await crearClienteAccion({ ...ENTRADA_VALIDA, contacto: 'Laura Compras' });

    const [, argumentos] = rpcMock.mock.calls[0] as [string, { p_datos: Record<string, unknown> }];
    expect(argumentos.p_datos.contacto).toEqual({ nombre: 'Laura Compras' });
    expect(argumentos.p_datos.contacto_cabecera).toBe('Laura Compras');
  });

  it('sin permiso cliente_editar: no llama a la RPC ni registra', async () => {
    canMock.mockImplementation(async (_usuario: unknown, permiso: string) =>
      permiso !== 'cliente_editar',
    );

    const respuesta = await crearClienteAccion(ENTRADA_VALIDA);

    expect(respuesta.exito).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('habilitar crédito exige cliente_comercial', async () => {
    canMock.mockImplementation(async (_usuario: unknown, permiso: string) =>
      permiso !== 'cliente_comercial',
    );

    const respuesta = await crearClienteAccion({
      ...ENTRADA_VALIDA,
      limiteCredito: 0,
      creditoHabilitado: true,
      diasCredito: 30,
    });

    expect(respuesta.exito).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sin sesión: rechaza antes de tocar la base de datos', async () => {
    obtenerUsuarioMock.mockResolvedValue(null);

    const respuesta = await crearClienteAccion(ENTRADA_VALIDA);

    expect(respuesta).toEqual({ exito: false, error: 'No autorizado' });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('entrada inválida (razón social vacía): error de validación', async () => {
    const respuesta = await crearClienteAccion({ ...ENTRADA_VALIDA, razonSocial: '' });

    expect(respuesta.exito).toBe(false);
    expect(registrarLogMock).not.toHaveBeenCalled();
  });
});
