import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  obtenerOperadorMock,
  canMock,
  registrarLogMock,
  cambiarEstadoMock,
  registrarConsumoMock,
  registrarConsumoOperadorMock,
  registrarTiempoMock,
  ajustarOrdenMock,
  ErrorOrdenMock,
  ErrorOrdenSiiMock,
} = vi.hoisted(() => {
  class ErrorOrdenMock extends Error {
    constructor(public readonly codigo: string) {
      super(codigo);
    }
  }
  class ErrorOrdenSiiMock extends Error {
    constructor(public readonly codigo: string) {
      super(codigo);
    }
  }

  return {
    obtenerUsuarioMock: vi.fn(),
    obtenerOperadorMock: vi.fn(),
    canMock: vi.fn(),
    registrarLogMock: vi.fn(),
    cambiarEstadoMock: vi.fn(),
    registrarConsumoMock: vi.fn(),
    registrarConsumoOperadorMock: vi.fn(),
    registrarTiempoMock: vi.fn(),
    ajustarOrdenMock: vi.fn(),
    ErrorOrdenMock,
    ErrorOrdenSiiMock,
  };
});

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/obtener-operador-sesion', () => ({
  obtenerOperadorConSesionActiva: () => obtenerOperadorMock(),
  obtenerOperadorParaMutacion: () => obtenerOperadorMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
  nuevoCorrelationId: () => 'correlacion-prueba',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: vi.fn(), from: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/servicios/ordenes-servicio', () => ({
  ErrorOrden: ErrorOrdenMock,
  cambiarEstadoOrdenServicio: (...args: unknown[]) => cambiarEstadoMock(...args),
  registrarConsumoMaterialServicio: (...args: unknown[]) => registrarConsumoMock(...args),
  registrarConsumoMaterialOperadorServicio: (...args: unknown[]) =>
    registrarConsumoOperadorMock(...args),
  registrarTiempoOperadorServicio: (...args: unknown[]) => registrarTiempoMock(...args),
  mensajeErrorOrden: () => 'No se pudo actualizar la orden',
}));
vi.mock('@/modulos/ordenes/servicios/orden-sii-servicio', () => ({
  ErrorOrdenSii: ErrorOrdenSiiMock,
  ajustarOrdenPostAceptacionServicio: (...args: unknown[]) => ajustarOrdenMock(...args),
  codigoErrorOrdenSii: () => 'desconocido',
}));

import { cambiarEstadoOrdenAccion } from '@/modulos/ordenes/acciones/cambiar-estado-orden';
import { ajustarOrdenPostAceptacionAccion } from '@/modulos/ordenes/acciones/ajustar-orden-post-aceptacion';
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
    movimientoInventarioId: null,
  });
  registrarConsumoOperadorMock.mockResolvedValue({
    id: '44444444-4444-4444-8444-444444444444',
    costoUnitarioMomento: 25,
    cantidadTotal: 3,
    movimientoInventarioId: null,
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
  ajustarOrdenMock.mockResolvedValue({
    id: CAMBIO_ESTADO.ordenId,
    estadoSii: 'PLANIFICADA',
    actualizadoEn: '2026-08-12T12:00:00.000Z',
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
      error: 'Sin permiso para cancelar la orden',
    });
    expect(cambiarEstadoMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('no permite invocar el consumo atómico sin gestionar_inventario', async () => {
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

  it('envía el actor autorizado al servicio de consumo canónico y audita sin movimiento', async () => {
    canMock.mockResolvedValue(true);

    const entrada = {
      partidaId: '77777777-7777-4777-8777-777777777777',
      materialId: '88888888-8888-4888-8888-888888888888',
      cantidadUsada: 3,
      cantidadScrap: 0,
    };
    const respuesta = await registrarConsumoAccion(entrada);

    expect(respuesta.exito).toBe(true);
    expect(registrarConsumoMock).toHaveBeenCalledWith(expect.anything(), entrada, USUARIO_SIN_PERMISOS.id);
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO_SIN_PERMISOS,
      'registrar_consumo_material',
      'ordenes',
      '44444444-4444-4444-8444-444444444444',
      expect.objectContaining({ movimientoInventarioId: null }),
      'correlacion-prueba',
    );
  });

  it('explica cómo corregir un consumo sin costo confirmado', async () => {
    canMock.mockResolvedValue(true);
    registrarConsumoMock.mockRejectedValue(new ErrorOrdenMock('costo_material_no_configurado'));

    const respuesta = await registrarConsumoAccion({
      partidaId: '77777777-7777-4777-8777-777777777777',
      materialId: '88888888-8888-4888-8888-888888888888',
      cantidadUsada: 3,
      cantidadScrap: 0,
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'El material no tiene un costo confirmado. Configúralo en Materiales y costos.',
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO_SIN_PERMISOS,
      'consumo_material_rechazado',
      'ordenes',
      '77777777-7777-4777-8777-777777777777',
      expect.objectContaining({ codigo: 'costo_material_no_configurado' }),
      'correlacion-prueba',
    );
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
      expect.anything(),
    );
  });

  it('rechaza cambios comerciales antes de invocar el ajuste operativo', async () => {
    const respuesta = await ajustarOrdenPostAceptacionAccion({
      ordenId: CAMBIO_ESTADO.ordenId,
      actualizadoEn: '2026-08-12T10:00:00.000Z',
      motivo: 'Cambio solicitado',
      cambios: { fechaCompromiso: '2026-09-20T18:00:00.000Z' },
    });

    expect(respuesta.exito).toBe(false);
    expect(ajustarOrdenMock).not.toHaveBeenCalled();
  });

  it('autoriza el ajuste operativo y fija actor y correlación del servidor', async () => {
    canMock.mockResolvedValue(true);

    const respuesta = await ajustarOrdenPostAceptacionAccion({
      ordenId: CAMBIO_ESTADO.ordenId,
      actualizadoEn: '2026-08-12T10:00:00.000Z',
      motivo: 'Reprogramación confirmada',
      cambios: { fechaOperativa: '2026-09-20T18:00:00.000Z' },
    });

    expect(respuesta.exito).toBe(true);
    expect(ajustarOrdenMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: USUARIO_SIN_PERMISOS.id,
        correlationId: 'correlacion-prueba',
        cambios: { fechaOperativa: '2026-09-20T18:00:00.000Z' },
      }),
    );
  });
});
