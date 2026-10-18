import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  canMock,
  registrarLogMock,
  crearOrdenBasadaMock,
  crearOrdenManualMock,
  cambiarEstadoMock,
  ErrorOrdenMock,
} = vi.hoisted(() => {
  class ErrorOrdenMock extends Error {}

  return {
    obtenerUsuarioMock: vi.fn(),
    canMock: vi.fn(),
    registrarLogMock: vi.fn(),
    crearOrdenBasadaMock: vi.fn(),
    crearOrdenManualMock: vi.fn(),
    cambiarEstadoMock: vi.fn(),
    ErrorOrdenMock,
  };
});

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
  nuevoCorrelationId: () => 'correlacion-prueba',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/servicios/ordenes-servicio', () => ({
  ErrorOrden: ErrorOrdenMock,
  crearOrdenBasadaEnAnteriorServicio: (...args: unknown[]) => crearOrdenBasadaMock(...args),
  crearOrdenManualServicio: (...args: unknown[]) => crearOrdenManualMock(...args),
  cambiarEstadoOrdenServicio: (...args: unknown[]) => cambiarEstadoMock(...args),
}));

import { cambiarEstadoOrdenAccion } from '@/modulos/ordenes/acciones/cambiar-estado-orden';
import { crearOrdenBasadaEnAnteriorAccion } from '@/modulos/ordenes/acciones/crear-orden-basada-anterior';
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
const ENTRADA_BASADA_EN_ANTERIOR = {
  ordenOrigenId: CAMBIO_A_PROGRAMADA.ordenId,
  fechaCompromiso: '2026-11-15T18:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  crearOrdenBasadaMock.mockResolvedValue({
    id: '33333333-3333-4333-8333-333333333333',
    folio: 'OP-001005',
  });
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

describe('crearOrdenBasadaEnAnteriorAccion', () => {
  it('autoriza, conserva el actor en la RPC y audita sin datos comerciales', async () => {
    const respuesta = await crearOrdenBasadaEnAnteriorAccion(ENTRADA_BASADA_EN_ANTERIOR);

    expect(respuesta).toEqual({
      exito: true,
      datos: { id: '33333333-3333-4333-8333-333333333333', folio: 'OP-001005' },
    });
    expect(crearOrdenBasadaMock).toHaveBeenCalledWith(expect.anything(), {
      ...ENTRADA_BASADA_EN_ANTERIOR,
      actorId: USUARIO.id,
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'crear_orden_basada_en_anterior',
      'ordenes',
      '33333333-3333-4333-8333-333333333333',
      { ordenOrigenId: ENTRADA_BASADA_EN_ANTERIOR.ordenOrigenId, folioNuevo: 'OP-001005' },
      expect.anything(),
    );
  });

  it('no llama la base sin aprobar_ordenes', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await crearOrdenBasadaEnAnteriorAccion(ENTRADA_BASADA_EN_ANTERIOR);

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para crear órdenes basadas en otra' });
    expect(crearOrdenBasadaMock).not.toHaveBeenCalled();
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
      expect.anything(),
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
      expect.anything(),
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

  it('exige orden_cancelar para cualquier cancelacion administrativa', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await cambiarEstadoOrdenAccion({
      ...CAMBIO_A_PROGRAMADA,
      estadoActual: 'en_proceso',
      estado: 'cancelada',
      motivoCancelacion: 'Cliente suspendió el proyecto',
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'Sin permiso para cancelar la orden',
    });
    expect(canMock).toHaveBeenCalledWith(USUARIO, 'orden_cancelar');
    expect(cambiarEstadoMock).not.toHaveBeenCalled();
  });

  it('permite cancelar en proceso con su permiso específico y motivo', async () => {
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
