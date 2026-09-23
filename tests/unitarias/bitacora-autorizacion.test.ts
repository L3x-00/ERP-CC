import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ usuario: vi.fn(), cliente: vi.fn() }));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => mocks.usuario(),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: () => mocks.cliente(),
}));

import { obtenerLogsAccion } from '@/modulos/auditoria/acciones/obtener-logs';
import { esquemaFiltrosLog } from '@/modulos/auditoria/validaciones/esquemas-logs';

const admin = { id: '10000000-0000-4000-8000-000000000001', rol: 'admin', activo: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.usuario.mockResolvedValue(admin);
});

describe('bitácora administrativa', () => {
  it.each([
    null,
    { ...admin, rol: 'gerente', permisos: ['configuracion'] },
    { ...admin, activo: false },
  ])('rechaza quien no es administrador activo antes de consultar datos', async (usuario) => {
    mocks.usuario.mockResolvedValue(usuario);
    expect((await obtenerLogsAccion({ pagina: 1 })).exito).toBe(false);
    expect(mocks.cliente).not.toHaveBeenCalled();
  });

  it('limita tamaño, fechas y campos extra antes de consultar', async () => {
    for (const filtros of [
      { porPagina: 61 },
      { desde: '2026-09-24T00:00:00Z', hasta: '2026-09-23T00:00:00Z' },
      { columna: 'detalles' },
    ]) {
      expect(await obtenerLogsAccion(filtros)).toEqual({ exito: false, error: 'Filtros inválidos' });
    }
    expect(mocks.cliente).not.toHaveBeenCalled();
  });

  it('acepta el corte de Postgres con zona horaria y compara instantes reales', () => {
    expect(esquemaFiltrosLog.safeParse({ corte: '2026-09-23T23:25:00.123456+00:00' }).success).toBe(true);
    expect(esquemaFiltrosLog.safeParse({
      desde: '2026-09-23T20:00:00-05:00', hasta: '2026-09-24T00:30:00Z',
    }).success).toBe(false);
  });
});
