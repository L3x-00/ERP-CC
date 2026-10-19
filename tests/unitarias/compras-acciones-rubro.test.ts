import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

const {
  canMock,
  crearClienteAdminMock,
  obtenerUsuarioMock,
  registrarLogMock,
  rpcMock,
} = vi.hoisted(() => ({
  canMock: vi.fn(),
  crearClienteAdminMock: vi.fn(),
  obtenerUsuarioMock: vi.fn(),
  registrarLogMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...argumentos: unknown[]) => registrarLogMock(...argumentos),
  nuevoCorrelationId: () => 'correlacion-rubro',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => crearClienteAdminMock(),
}));

import { asignarRubroCostoCompraAccion } from '@/modulos/compras/acciones/asignar-rubro-costo-compra';

const USUARIO: UsuarioAutenticado = {
  id: '00000000-0000-4000-8000-0000000f0601',
  email: 'compras@orca.local',
  nombreCompleto: 'Gestor de compras',
  rol: 'contador',
  activo: true,
  permisos: ['registrar_gastos'],
  creadoEn: '2026-10-01T00:00:00.000Z',
  actualizadoEn: '2026-10-01T00:00:00.000Z',
};

const COMPRA = '00000000-0000-4000-8000-0000000f0602';

describe('asignarRubroCostoCompraAccion (C10.1/F09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerUsuarioMock.mockResolvedValue(USUARIO);
    canMock.mockResolvedValue(true);
    rpcMock.mockResolvedValue({
      data: [{ id: COMPRA, rubro_costo: 'material', actualizado_en: '2026-10-18T10:00:00.000Z' }],
      error: null,
    });
    crearClienteAdminMock.mockReturnValue({ rpc: rpcMock });
    registrarLogMock.mockResolvedValue(undefined);
  });

  it('clasifica una compra histórica y audita el cambio', async () => {
    const resultado = await asignarRubroCostoCompraAccion({ compraId: COMPRA, rubroCosto: 'material' });

    expect(resultado).toEqual({ exito: true, datos: { compraId: COMPRA } });
    expect(canMock).toHaveBeenCalledWith(USUARIO, 'registrar_gastos');
    expect(rpcMock).toHaveBeenCalledWith('asignar_rubro_costo_compra', {
      p_compra_id: COMPRA,
      p_rubro_costo: 'material',
      p_actor_id: USUARIO.id,
      p_correlation_id: 'correlacion-rubro',
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'asignar_rubro_costo_compra',
      'compras',
      COMPRA,
      { rubroCosto: 'material' },
      'correlacion-rubro',
    );
  });

  it('no llega a la RPC sin permiso de gastos', async () => {
    canMock.mockResolvedValue(false);

    const resultado = await asignarRubroCostoCompraAccion({ compraId: COMPRA, rubroCosto: 'material' });

    expect(resultado).toEqual({ exito: false, error: 'Sin permiso para clasificar compras' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rechaza un rubro fuera del catálogo antes de consultar la base', async () => {
    const resultado = await asignarRubroCostoCompraAccion({ compraId: COMPRA, rubroCosto: 'otro' });

    expect(resultado.exito).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('traduce el rechazo del motor sin filtrar detalles internos', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rubro_ya_asignado', details: null } });

    const resultado = await asignarRubroCostoCompraAccion({ compraId: COMPRA, rubroCosto: 'material' });

    expect(resultado).toEqual({
      exito: false,
      error: 'La compra ya tiene un rubro asignado; recarga para ver el valor actual',
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'asignar_rubro_costo_compra_rechazado',
      'compras',
      COMPRA,
      { codigo: 'rubro_ya_asignado' },
      'correlacion-rubro',
    );
  });
});
