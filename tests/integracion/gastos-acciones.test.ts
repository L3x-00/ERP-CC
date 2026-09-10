import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  canMock,
  registrarLogMock,
  registrarGastoMock,
  cambiarEstadoMock,
  obtenerRentabilidadMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  registrarGastoMock: vi.fn(),
  cambiarEstadoMock: vi.fn(),
  obtenerRentabilidadMock: vi.fn(),
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
  crearClienteSupabaseAdmin: () => ({ rpc: vi.fn() }),
}));
vi.mock('@/modulos/gastos/servicios/indice', async () => {
  const real = await vi.importActual<typeof import('@/modulos/gastos/servicios/indice')>('@/modulos/gastos/servicios/indice');
  return {
    ...real,
    registrarGastoServicio: (...argumentos: unknown[]) => registrarGastoMock(...argumentos),
    cambiarEstadoGastoServicio: (...argumentos: unknown[]) => cambiarEstadoMock(...argumentos),
    obtenerRentabilidadOrdenServicio: (...argumentos: unknown[]) => obtenerRentabilidadMock(...argumentos),
    mensajeErrorGastos: () => 'No se pudo procesar el gasto',
  };
});

import { cambiarEstadoGastoAccion } from '@/modulos/gastos/acciones/cambiar-estado-gasto';
import { obtenerRentabilidadOrdenAccion } from '@/modulos/gastos/acciones/obtener-rentabilidad-orden';
import { registrarGastoAccion } from '@/modulos/gastos/acciones/registrar-gasto';

const USUARIO_BASE = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'usuario@orca.test',
  nombreCompleto: 'Usuario de prueba',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-09-09T00:00:00.000Z',
  actualizadoEn: '2026-09-09T00:00:00.000Z',
  permisos: [] as string[],
};
const OPERADOR = { ...USUARIO_BASE, rol: 'operador' as const, id: '10000000-0000-4000-8000-000000000002' };
const CONTADOR = { ...USUARIO_BASE, rol: 'contador' as const, id: '10000000-0000-4000-8000-000000000003', permisos: ['registrar_gastos', 'ver_finanzas'] };
const GASTO = {
  id: '20000000-0000-4000-8000-000000000001',
  folio: 'GTO-001001',
  ordenId: null,
  proveedorId: null,
  categoria: 'servicios_generales' as const,
  descripcion: 'Servicio de prueba',
  montoSubtotal: 100,
  montoIva: 16,
  montoTotal: 116,
  moneda: 'MXN' as const,
  tipoCambio: 1,
  estadoPago: 'pendiente' as const,
  fechaGasto: '2026-09-09',
  fechaVencimiento: null,
  comprobanteUrl: null,
  folioComprobante: null,
  metodoPago: 'transferencia' as const,
  datosOcrJson: null,
  notas: null,
  creadoPor: CONTADOR.id,
  creadoEn: '2026-09-09T00:00:00.000Z',
  actualizadoEn: '2026-09-09T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO_BASE);
  canMock.mockResolvedValue(false);
  registrarLogMock.mockResolvedValue(undefined);
  registrarGastoMock.mockResolvedValue(GASTO);
  cambiarEstadoMock.mockResolvedValue({ ...GASTO, estadoPago: 'pagado' });
  obtenerRentabilidadMock.mockResolvedValue({ ordenId: '11111111-1111-4111-8111-111111111111' });
});

const entrada = {
  categoria: 'servicios_generales',
  descripcion: 'Servicio de prueba',
  montoSubtotal: 100,
  montoIva: 16,
  montoTotal: 116,
  moneda: 'MXN',
  tipoCambio: 1,
  fechaGasto: '2026-09-09',
};

describe('acciones seguras de Gastos', () => {
  it.each([['operador', OPERADOR], ['vendedor', USUARIO_BASE]])('%s no puede registrar gastos', async (_rol, usuario) => {
    obtenerUsuarioMock.mockResolvedValue(usuario);
    await expect(registrarGastoAccion(entrada)).resolves.toEqual({
      exito: false,
      error: 'Sin permiso para registrar gastos',
    });
    expect(registrarGastoMock).not.toHaveBeenCalled();
  });

  it('contador registra un gasto mediante servicio y auditoría', async () => {
    obtenerUsuarioMock.mockResolvedValue(CONTADOR);
    canMock.mockResolvedValue(true);
    const respuesta = await registrarGastoAccion(entrada);
    expect(respuesta).toEqual({ exito: true, datos: GASTO });
    expect(registrarGastoMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(entrada), CONTADOR.id);
    expect(registrarLogMock).toHaveBeenCalledWith(CONTADOR, 'registrar_gasto', 'gastos', GASTO.id, expect.anything());
  });

  it('usuario sin permiso no puede cambiar el estado', async () => {
    const respuesta = await cambiarEstadoGastoAccion({
      gastoId: GASTO.id,
      nuevoEstado: 'pagado',
      estadoEsperado: 'pendiente',
    });
    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para cambiar estados de gastos' });
    expect(cambiarEstadoMock).not.toHaveBeenCalled();
  });

  it('operador y vendedor no pueden consultar rentabilidad', async () => {
    for (const usuario of [OPERADOR, USUARIO_BASE]) {
      obtenerUsuarioMock.mockResolvedValue(usuario);
      canMock.mockResolvedValue(false);
      await expect(obtenerRentabilidadOrdenAccion({ ordenId: GASTO.id }))
        .resolves.toEqual({ exito: false, error: 'Sin permiso para consultar rentabilidad' });
    }
    expect(obtenerRentabilidadMock).not.toHaveBeenCalled();
  });

  it('contador cambia estado con compare-and-set y auditoría', async () => {
    obtenerUsuarioMock.mockResolvedValue(CONTADOR);
    canMock.mockResolvedValue(true);
    const respuesta = await cambiarEstadoGastoAccion({
      gastoId: GASTO.id,
      nuevoEstado: 'pagado',
      estadoEsperado: 'pendiente',
    });
    expect(respuesta.exito).toBe(true);
    expect(cambiarEstadoMock).toHaveBeenCalledWith(expect.anything(), {
      gastoId: GASTO.id,
      nuevoEstado: 'pagado',
      estadoEsperado: 'pendiente',
    }, CONTADOR.id);
    expect(registrarLogMock).toHaveBeenCalledWith(CONTADOR, 'cambiar_estado_gasto', 'gastos', GASTO.id, expect.anything());
  });
});
