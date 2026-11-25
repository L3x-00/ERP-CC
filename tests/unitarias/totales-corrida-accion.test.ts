import { beforeEach, describe, expect, it, vi } from 'vitest';

const { actorMock, canMock, servicioMock } = vi.hoisted(() => ({
  actorMock: vi.fn(),
  canMock: vi.fn(),
  servicioMock: vi.fn(),
}));

vi.mock('@/modulos/produccion/acciones/utilidades-acciones', () => ({
  obtenerActorProduccion: () => actorMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => ({}) }));
vi.mock('@/modulos/produccion/servicios/totales-corrida-servicio', () => ({
  obtenerTotalesCorridasOrdenServicio: (...args: unknown[]) => servicioMock(...args),
}));

import { obtenerTotalesCorridasOrdenAccion } from '@/modulos/produccion/acciones/totales-corrida';

const ORDEN = '11111111-1111-4111-8111-111111111111';

describe('obtenerTotalesCorridasOrdenAccion (C4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actorMock.mockResolvedValue({ id: 'operador-1', rol: 'operador', activo: true });
    servicioMock.mockResolvedValue({ corridas: [], costoTotalOrdenMxn: null, ordenSinDesglose: false });
  });

  it('el operador ve tiempos y material pero no costos', async () => {
    canMock.mockImplementation(async (_actor: unknown, permiso: string) => permiso === 'produccion_operar');
    const respuesta = await obtenerTotalesCorridasOrdenAccion({ ordenId: ORDEN });
    expect(respuesta.exito).toBe(true);
    expect(servicioMock).toHaveBeenCalledWith(expect.anything(), {
      ordenId: ORDEN,
      incluirCostos: false,
    });
  });

  it('quien ve finanzas recibe también los costos', async () => {
    canMock.mockImplementation(async (_actor: unknown, permiso: string) => permiso === 'ver_finanzas');
    await obtenerTotalesCorridasOrdenAccion({ ordenId: ORDEN });
    expect(servicioMock).toHaveBeenCalledWith(expect.anything(), {
      ordenId: ORDEN,
      incluirCostos: true,
    });
  });

  it('rechaza a un actor sin permisos de producción ni finanzas', async () => {
    canMock.mockResolvedValue(false);
    const respuesta = await obtenerTotalesCorridasOrdenAccion({ ordenId: ORDEN });
    expect(respuesta.exito).toBe(false);
    expect(servicioMock).not.toHaveBeenCalled();
  });
});
