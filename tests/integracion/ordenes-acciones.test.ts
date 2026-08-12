import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  obtenerOperadorMock,
  canMock,
  registrarLogMock,
  cambiarEstadoMock,
  registrarConsumoMock,
  registrarTiempoMock,
  ErrorOrdenMock,
} = vi.hoisted(() => {
  class ErrorOrdenMock extends Error {}

  return {
    obtenerUsuarioMock: vi.fn(),
    obtenerOperadorMock: vi.fn(),
    canMock: vi.fn(),
    registrarLogMock: vi.fn(),
    cambiarEstadoMock: vi.fn(),
    registrarConsumoMock: vi.fn(),
    registrarTiempoMock: vi.fn(),
    ErrorOrdenMock,
  };
});

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/obtener-operador-sesion', () => ({
  obtenerOperadorConSesionActiva: () => obtenerOperadorMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: vi.fn(), from: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/servicios/ordenes-servicio', () => ({
  ErrorOrden: ErrorOrdenMock,
  cambiarEstadoOrdenServicio: (...args: unknown[]) => cambiarEstadoMock(...args),
  registrarConsumoMaterialServicio: (...args: unknown[]) => registrarConsumoMock(...args),
  registrarTiempoOperadorServicio: (...args: unknown[]) => registrarTiempoMock(...args),
  mensajeErrorOrden: () => 'No se pudo actualizar la orden',
}));

import { cambiarEstadoOrdenAccion } from '@/modulos/ordenes/acciones/cambiar-estado-orden';
import { registrarConsumoAccion } from '@/modulos/ordenes/acciones/registrar-consumo';
import { registrarTiempoOperadorAccion } from '@/modulos/ordenes/acciones/registrar-tiempo-operador';

const USUARIO_SIN_PERMISOS = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'vendedor@orca.test',
  nombreCompleto: 'Vendedor sin permisos',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-08-12T10:00:00.000Z',
  actualizadoEn: '2026-08-12T10:00:00.000Z',
  permisos: [],
};

const OPERADOR = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'operador@orca.test',
  nombreCompleto: 'Operador de piso',
  rol: 'operador' as const,
  activo: true,
  creadoEn: '2026-08-12T10:00:00.000Z',
  actualizadoEn: '2026-08-12T10:00:00.000Z',
  permisos: [],
};

const CAMBIO_ESTADO = {
  ordenId: '33333333-3333-4333-8333-333333333333',
  estadoActual: 'programada',
  estado: 'en_proceso',
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO_SIN_PERMISOS);
  obtenerOperadorMock.mockResolvedValue(OPERADOR);
  canMock.mockResolvedValue(false);
  registrarLogMock.mockResolvedValue(undefined);
  cambiarEstadoMock.mockResolvedValue({
    id: CAMBIO_ESTADO.ordenId,
    estado: 'en_proceso',
    fechaInicio: '2026-08-12T10:00:00.000Z',
    fechaFin: null,
  });
  registrarConsumoMock.mockResolvedValue({
    id: '44444444-4444-4444-8444-444444444444',
    costoUnitarioMomento: 25,
    cantidadTotal: 3,
    movimientoInventarioId: '55555555-5555-4555-8555-555555555555',
  });
  registrarTiempoMock.mockResolvedValue({
    id: '66666666-6666-4666-8666-666666666666',
    partidaId: '77777777-7777-4777-8777-777777777777',
    operadorId: OPERADOR.id,
    accion: 'inicio',
    fechaRegistro: '2026-08-12T11:00:00.000Z',
    notas: null,
    creadoEn: '2026-08-12T11:00:00.000Z',
    actualizadoEn: '2026-08-12T11:00:00.000Z',
  });
});

describe('seguridad de acciones de órdenes', () => {
  it('un usuario sin aprobar_ordenes no puede cambiar el estado de una OP', async () => {
    const respuesta = await cambiarEstadoOrdenAccion(CAMBIO_ESTADO);

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para actualizar órdenes' });
    expect(cambiarEstadoMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('un usuario sin permiso adicional no puede cancelar una OP en proceso', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await cambiarEstadoOrdenAccion({
      ...CAMBIO_ESTADO,
      estadoActual: 'en_proceso',
      estado: 'cancelada',
      motivoCancelacion: 'Cancelación solicitada por cliente',
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'Sin permiso para cancelar una orden en proceso',
    });
    expect(cambiarEstadoMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('no permite invocar el consumo atómico sin aprobar_ordenes', async () => {
    const respuesta = await registrarConsumoAccion({
      partidaId: '77777777-7777-4777-8777-777777777777',
      materialId: '88888888-8888-4888-8888-888888888888',
      cantidadUsada: 3,
      cantidadScrap: 0,
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'Sin permiso para registrar consumo de material',
    });
    expect(registrarConsumoMock).not.toHaveBeenCalled();
  });

  it('rechaza una marca de tiempo cuyo operador no coincide con la sesión PIN', async () => {
    const respuesta = await registrarTiempoOperadorAccion({
      partidaId: '77777777-7777-4777-8777-777777777777',
      operadorId: '99999999-9999-4999-8999-999999999999',
      accion: 'inicio',
    });

    expect(respuesta).toEqual({ exito: false, error: 'Sesión de operador no válida' });
    expect(registrarTiempoMock).not.toHaveBeenCalled();
  });

  it('registra tiempo solo después de validar la sesión PIN vigente y audita', async () => {
    const respuesta = await registrarTiempoOperadorAccion({
      partidaId: '77777777-7777-4777-8777-777777777777',
      operadorId: OPERADOR.id,
      accion: 'inicio',
      fechaRegistro: '2099-01-01T00:00:00.000Z',
    });

    expect(respuesta.exito).toBe(true);
    expect(registrarTiempoMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        partidaId: '77777777-7777-4777-8777-777777777777',
        operadorId: OPERADOR.id,
        accion: 'inicio',
      },
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      OPERADOR,
      'registrar_tiempo_operador',
      'ordenes',
      '66666666-6666-4666-8666-666666666666',
      expect.objectContaining({ partidaId: '77777777-7777-4777-8777-777777777777' }),
    );
  });
});
