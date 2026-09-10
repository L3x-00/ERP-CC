import { beforeEach, describe, expect, it, vi } from 'vitest';

const { obtenerUsuarioMock, canMock, dashboardMock, registrarLogMock } = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  dashboardMock: vi.fn(),
  registrarLogMock: vi.fn(),
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
vi.mock('@/modulos/dashboard/servicios/indice', () => ({
  obtenerDashboardPorRol: (...argumentos: unknown[]) => dashboardMock(...argumentos),
}));

import { obtenerMetricasInicioAccion } from '@/modulos/dashboard/acciones/obtener-metricas-inicio';

const usuarioBase = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'usuario@orca.test',
  nombreCompleto: 'Usuario de prueba',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-09-09T00:00:00.000Z',
  actualizadoEn: '2026-09-09T00:00:00.000Z',
  permisos: ['ver_clientes'],
};
const filtro = {
  fechaInicio: '2026-09-01T00:00:00.000Z',
  fechaFin: '2026-10-01T00:00:00.000Z',
  periodoTipo: 'mes_actual' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(usuarioBase);
  canMock.mockResolvedValue(true);
  registrarLogMock.mockResolvedValue(undefined);
  dashboardMock.mockImplementation(async (_id: string, rol: string, _permisos: string[], filtroRecibido: typeof filtro) => ({
    rol,
    filtro: filtroRecibido,
    tarjetas: [],
    vendedor: rol === 'vendedor' ? { usuarioId: usuarioBase.id } : undefined,
  }));
});

describe('seguridad de métricas del dashboard', () => {
  it('vendedor nunca recibe finanzas globales ni margen', async () => {
    const respuesta = await obtenerMetricasInicioAccion(filtro);

    expect(respuesta.exito).toBe(true);
    if (respuesta.exito) {
      expect(respuesta.datos?.vendedor).toBeDefined();
      expect(respuesta.datos?.ejecutivas).toBeUndefined();
      expect(JSON.stringify(respuesta.datos)).not.toMatch(/finanzas|margen/i);
    }
    expect(dashboardMock).toHaveBeenCalledWith(usuarioBase.id, 'vendedor', usuarioBase.permisos, filtro, expect.anything());
  });

  it('admin recibe la totalidad de bloques autorizados por el servicio', async () => {
    const admin = { ...usuarioBase, rol: 'admin' as const, permisos: [] as string[] };
    obtenerUsuarioMock.mockResolvedValue(admin);
    dashboardMock.mockResolvedValue({ rol: 'admin', filtro, tarjetas: [], ejecutivas: { finanzas: { margenPromedioPorcentaje: 20 } }, contador: {} });

    const respuesta = await obtenerMetricasInicioAccion(filtro);

    expect(respuesta.exito).toBe(true);
    if (respuesta.exito) expect(respuesta.datos?.ejecutivas).toBeDefined();
  });

  it('operador recibe redirección a producción y no métricas financieras', async () => {
    const operador = { ...usuarioBase, rol: 'operador' as const, permisos: [] as string[] };
    obtenerUsuarioMock.mockResolvedValue(operador);
    dashboardMock.mockResolvedValue({ rol: 'operador', filtro, tarjetas: [], redireccion: '/produccion' });

    const respuesta = await obtenerMetricasInicioAccion(filtro);

    expect(respuesta).toEqual({ exito: true, datos: { rol: 'operador', filtro, tarjetas: [], redireccion: '/produccion' } });
    expect(JSON.stringify(respuesta)).not.toMatch(/finanzas|margen/i);
  });
});
