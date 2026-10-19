import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import type { ConciliacionCostosOrden } from '@/modulos/gastos/tipos/indice';

const {
  obtenerUsuarioMock,
  canMock,
  crearClienteAdminMock,
  obtenerConciliacionMock,
  mensajeErrorMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  crearClienteAdminMock: vi.fn(),
  obtenerConciliacionMock: vi.fn(),
  mensajeErrorMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => crearClienteAdminMock(),
}));
vi.mock('@/modulos/gastos/servicios/indice', async () => {
  const real = await vi.importActual<typeof import('@/modulos/gastos/servicios/indice')>(
    '@/modulos/gastos/servicios/indice',
  );
  return {
    ...real,
    obtenerConciliacionCostosOrdenServicio: (...argumentos: unknown[]) => (
      obtenerConciliacionMock(...argumentos)
    ),
    mensajeErrorGastos: (...argumentos: unknown[]) => mensajeErrorMock(...argumentos),
  };
});

import { obtenerConciliacionCostosOrdenAccion } from '@/modulos/gastos/acciones/obtener-conciliacion-costos-orden';

const ORDEN = '11111111-1111-4111-8111-111111111111';
const CONTADOR: UsuarioAutenticado = {
  id: '10000000-0000-4000-8000-000000000003',
  email: 'contador@orca.test',
  nombreCompleto: 'Contador',
  rol: 'contador',
  activo: true,
  permisos: ['ver_finanzas'],
  creadoEn: '2026-10-01T00:00:00.000Z',
  actualizadoEn: '2026-10-01T00:00:00.000Z',
};

const DATOS = { ordenId: ORDEN } as ConciliacionCostosOrden;

describe('obtenerConciliacionCostosOrdenAccion (C10.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerUsuarioMock.mockResolvedValue(CONTADOR);
    canMock.mockResolvedValue(true);
    crearClienteAdminMock.mockReturnValue({});
    obtenerConciliacionMock.mockResolvedValue(DATOS);
    mensajeErrorMock.mockReturnValue('No se pudo procesar el gasto');
  });

  it('devuelve la conciliación con permiso financiero', async () => {
    const resultado = await obtenerConciliacionCostosOrdenAccion({ ordenId: ORDEN });

    expect(resultado).toEqual({ exito: true, datos: DATOS });
    expect(canMock).toHaveBeenCalledWith(CONTADOR, 'ver_finanzas');
    expect(obtenerConciliacionMock).toHaveBeenCalledWith(expect.anything(), ORDEN);
  });

  it('no consulta sin sesión', async () => {
    obtenerUsuarioMock.mockResolvedValue(null);

    const resultado = await obtenerConciliacionCostosOrdenAccion({ ordenId: ORDEN });

    expect(resultado).toEqual({ exito: false, error: 'No autorizado' });
    expect(obtenerConciliacionMock).not.toHaveBeenCalled();
  });

  it('no consulta sin ver_finanzas', async () => {
    canMock.mockResolvedValue(false);

    const resultado = await obtenerConciliacionCostosOrdenAccion({ ordenId: ORDEN });

    expect(resultado).toEqual({
      exito: false,
      error: 'Sin permiso para consultar la conciliación',
    });
    expect(obtenerConciliacionMock).not.toHaveBeenCalled();
  });

  it('rechaza un ordenId que no es UUID antes de consultar', async () => {
    const resultado = await obtenerConciliacionCostosOrdenAccion({ ordenId: 'no-es-uuid' });

    expect(resultado.exito).toBe(false);
    expect(obtenerConciliacionMock).not.toHaveBeenCalled();
  });

  it('convierte un fallo del servicio en error genérico', async () => {
    obtenerConciliacionMock.mockRejectedValue(new Error('detalle interno'));

    const resultado = await obtenerConciliacionCostosOrdenAccion({ ordenId: ORDEN });

    expect(resultado).toEqual({ exito: false, error: 'No se pudo procesar el gasto' });
    expect(mensajeErrorMock).toHaveBeenCalled();
  });
});
