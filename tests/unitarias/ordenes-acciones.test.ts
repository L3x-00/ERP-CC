import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  canMock,
  registrarLogMock,
  crearOrdenManualMock,
  cambiarEstadoMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  crearOrdenManualMock: vi.fn(),
  cambiarEstadoMock: vi.fn(),
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
  crearClienteSupabaseAdmin: () => ({ rpc: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/servicios/ordenes-servicio', () => ({
  crearOrdenManualServicio: (...args: unknown[]) => crearOrdenManualMock(...args),
  cambiarEstadoOrdenServicio: (...args: unknown[]) => cambiarEstadoMock(...args),
  mensajeErrorOrden: () => 'No se pudo actualizar la orden',
}));

import { cambiarEstadoOrdenAccion } from '@/modulos/ordenes/acciones/cambiar-estado-orden';
import { crearOrdenManualAccion } from '@/modulos/ordenes/acciones/crear-orden-manual';

const USUARIO = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@orca.test',
  nombreCompleto: 'Admin ORCA',
  rol: 'admin' as const,
  activo: true,
  creadoEn: '2026-08-01T00:00:00.000Z',
  actualizadoEn: '2026-08-01T00:00:00.000Z',
  permisos: [],
};
const ENTRADA_ORDEN = {
  clienteId: '11111111-1111-4111-8111-111111111111',
  fechaCompromiso: '2026-09-15T18:00:00.000Z',
  prioridad: 'alta',
  partidas: [
    {
      codigoPieza: 'PLACA-01',
      cantidadSolicitada: 4,
      unidadMedida: 'pieza',
    },
  ],
};
const CAMBIO_A_PROGRAMADA = {
  ordenId: '22222222-2222-4222-8222-222222222222',
  estadoActual: 'borrador',
  estado: 'programada',
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  crearOrdenManualMock.mockResolvedValue({
    id: CAMBIO_A_PROGRAMADA.ordenId,
    folio: 'OP-001003',
  });
  cambiarEstadoMock.mockResolvedValue({
    id: CAMBIO_A_PROGRAMADA.ordenId,
    estado: 'programada',
    fechaInicio: null,
    fechaFin: null,
  });
});

describe('crearOrdenManualAccion', () => {
  it('autoriza, crea por servicio transaccional y audita', async () => {
    const respuesta = await crearOrdenManualAccion(ENTRADA_ORDEN);

    expect(respuesta).toEqual({
      exito: true,
      datos: { id: CAMBIO_A_PROGRAMADA.ordenId, folio: 'OP-001003' },
    });
    expect(crearOrdenManualMock).toHaveBeenCalledTimes(1);
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'crear_orden_manual',
      'ordenes',
      CAMBIO_A_PROGRAMADA.ordenId,
      expect.objectContaining({ folio: 'OP-001003' }),
    );
  });

  it('rechaza una orden manual que intenta asociar una cotización', async () => {
    const respuesta = await crearOrdenManualAccion({
      ...ENTRADA_ORDEN,
      cotizacionId: '33333333-3333-4333-8333-333333333333',
    });

    expect(respuesta.exito).toBe(false);
    expect(crearOrdenManualMock).not.toHaveBeenCalled();
  });

  it('no crea sin permiso de aprobación', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await crearOrdenManualAccion(ENTRADA_ORDEN);

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para crear órdenes' });
    expect(crearOrdenManualMock).not.toHaveBeenCalled();
  });
});

describe('cambiarEstadoOrdenAccion', () => {
  it('delegada la transición válida al servicio con bloqueo y audita', async () => {
    const respuesta = await cambiarEstadoOrdenAccion(CAMBIO_A_PROGRAMADA);

    expect(respuesta.exito).toBe(true);
    expect(cambiarEstadoMock).toHaveBeenCalledTimes(1);
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'cambiar_estado_orden',
      'ordenes',
      CAMBIO_A_PROGRAMADA.ordenId,
      expect.objectContaining({ estadoAnterior: 'borrador', estadoNuevo: 'programada' }),
    );
  });

  it('no permite saltar de borrador a completada antes de tocar la base', async () => {
    const respuesta = await cambiarEstadoOrdenAccion({
      ...CAMBIO_A_PROGRAMADA,
      estado: 'completada',
    });

    expect(respuesta).toEqual({ exito: false, error: 'La transición de estado no está permitida' });
    expect(cambiarEstadoMock).not.toHaveBeenCalled();
  });

  it('exige permiso extra al cancelar una orden en proceso', async () => {
    canMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const respuesta = await cambiarEstadoOrdenAccion({
      ...CAMBIO_A_PROGRAMADA,
      estadoActual: 'en_proceso',
      estado: 'cancelada',
      motivoCancelacion: 'Cliente suspendió el proyecto',
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'Sin permiso para cancelar una orden en proceso',
    });
    expect(cambiarEstadoMock).not.toHaveBeenCalled();
  });

  it('permite cancelar en proceso solo con ambos permisos y motivo', async () => {
    canMock.mockResolvedValue(true);
    cambiarEstadoMock.mockResolvedValue({
      id: CAMBIO_A_PROGRAMADA.ordenId,
      estado: 'cancelada',
      fechaInicio: '2026-08-12T10:00:00.000Z',
      fechaFin: null,
    });

    const respuesta = await cambiarEstadoOrdenAccion({
      ...CAMBIO_A_PROGRAMADA,
      estadoActual: 'en_proceso',
      estado: 'cancelada',
      motivoCancelacion: 'Cliente suspendió el proyecto',
    });

    expect(respuesta.exito).toBe(true);
    expect(cambiarEstadoMock).toHaveBeenCalledTimes(1);
  });
});
