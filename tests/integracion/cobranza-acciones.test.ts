import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  canMock,
  registrarLogMock,
  registrarPagoMock,
  aplicarSaldoMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  registrarPagoMock: vi.fn(),
  aplicarSaldoMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...argumentos: unknown[]) => registrarLogMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: vi.fn(), from: vi.fn() }),
}));
vi.mock('@/modulos/cobranza/servicios/cobranza-servicio', () => ({
  registrarPagoServicio: (...argumentos: unknown[]) => registrarPagoMock(...argumentos),
  aplicarSaldoFavorServicio: (...argumentos: unknown[]) => aplicarSaldoMock(...argumentos),
  mensajeErrorCobranza: () => 'No se pudo completar la operación de cobranza',
}));

import { aplicarSaldoFavorAccion } from '@/modulos/cobranza/acciones/aplicar-saldo-favor';
import { registrarPagoAccion } from '@/modulos/cobranza/acciones/registrar-pago';

const IDS = {
  cuenta: '10000000-0000-4000-8000-000000000001',
  cliente: '10000000-0000-4000-8000-000000000002',
  solicitudPago: '10000000-0000-4000-8000-000000000003',
  solicitudSaldo: '10000000-0000-4000-8000-000000000004',
  pago: '10000000-0000-4000-8000-000000000005',
};

const VENDEDOR = {
  id: '10000000-0000-4000-8000-000000000010',
  email: 'vendedor@orca.test',
  nombreCompleto: 'Vendedor de prueba',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-08-14T12:00:00.000Z',
  actualizadoEn: '2026-08-14T12:00:00.000Z',
  permisos: [],
};

const OPERADOR = { ...VENDEDOR, id: '10000000-0000-4000-8000-000000000011', rol: 'operador' as const };
const CONTADOR = {
  ...VENDEDOR,
  id: '10000000-0000-4000-8000-000000000012',
  email: 'contador@orca.test',
  rol: 'contador' as const,
  permisos: ['registrar_pagos', 'aplicar_saldos', 'ver_finanzas'],
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(VENDEDOR);
  canMock.mockResolvedValue(false);
  registrarLogMock.mockResolvedValue(undefined);
  registrarPagoMock.mockResolvedValue({
    pagoId: IDS.pago,
    folioRecibo: 'REC-001001',
    arId: IDS.cuenta,
    saldoPendiente: 60,
    estadoAr: 'parcial',
    montoAplicadoAr: 40,
    montoSobrepagoAr: 0,
    saldoAFavorMxn: 0,
    idempotente: false,
  });
  aplicarSaldoMock.mockResolvedValue({
    pagoId: IDS.pago,
    folioRecibo: 'REC-001002',
    arId: IDS.cuenta,
    saldoPendiente: 40,
    estadoAr: 'parcial',
    montoAplicadoAr: 20,
    saldoAFavorMxn: 80,
    idempotente: false,
  });
});

describe('acciones seguras de Cobranza', () => {
  it.each([
    ['vendedor', VENDEDOR],
    ['operador', OPERADOR],
  ])('%s no puede registrar pagos', async (_rol, usuario) => {
    obtenerUsuarioMock.mockResolvedValue(usuario);

    await expect(registrarPagoAccion({
      arId: IDS.cuenta,
      montoPagado: 40,
      monedaPago: 'USD',
      tipoCambioPago: 18.5,
      metodoPago: 'transferencia',
      solicitudId: IDS.solicitudPago,
    })).resolves.toEqual({ exito: false, error: 'Sin permiso para registrar pagos' });
    expect(registrarPagoMock).not.toHaveBeenCalled();
  });

  it.each([
    ['vendedor', VENDEDOR],
    ['operador', OPERADOR],
  ])('%s no puede aplicar saldo a favor', async (_rol, usuario) => {
    obtenerUsuarioMock.mockResolvedValue(usuario);

    await expect(aplicarSaldoFavorAccion({
      clienteId: IDS.cliente,
      arId: IDS.cuenta,
      montoAAplicar: 20,
      solicitudId: IDS.solicitudSaldo,
    })).resolves.toEqual({ exito: false, error: 'Sin permiso para aplicar saldos a favor' });
    expect(aplicarSaldoMock).not.toHaveBeenCalled();
  });

  it('contador registra un pago mediante la transacción de servicio y lo audita', async () => {
    obtenerUsuarioMock.mockResolvedValue(CONTADOR);
    canMock.mockResolvedValue(true);

    const respuesta = await registrarPagoAccion({
      arId: IDS.cuenta,
      montoPagado: 40,
      monedaPago: 'USD',
      tipoCambioPago: 18.5,
      metodoPago: 'transferencia',
      solicitudId: IDS.solicitudPago,
    });

    expect(respuesta.exito).toBe(true);
    expect(registrarPagoMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      arId: IDS.cuenta,
      usuarioId: CONTADOR.id,
      solicitudId: IDS.solicitudPago,
    }));
    expect(registrarLogMock).toHaveBeenCalledWith(
      CONTADOR,
      'registrar_pago_ar',
      'cobranza',
      IDS.pago,
      expect.objectContaining({ folioRecibo: 'REC-001001' }),
    );
  });

  it('contador aplica monedero mediante la transacción y lo audita', async () => {
    obtenerUsuarioMock.mockResolvedValue(CONTADOR);
    canMock.mockResolvedValue(true);

    const respuesta = await aplicarSaldoFavorAccion({
      clienteId: IDS.cliente,
      arId: IDS.cuenta,
      montoAAplicar: 20,
      solicitudId: IDS.solicitudSaldo,
    });

    expect(respuesta.exito).toBe(true);
    expect(aplicarSaldoMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      clienteId: IDS.cliente,
      arId: IDS.cuenta,
      usuarioId: CONTADOR.id,
    }));
    expect(registrarLogMock).toHaveBeenCalledWith(
      CONTADOR,
      'aplicar_saldo_favor',
      'cobranza',
      IDS.pago,
      expect.objectContaining({ folioRecibo: 'REC-001002' }),
    );
  });
});
