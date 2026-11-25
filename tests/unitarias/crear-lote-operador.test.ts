import { beforeEach, describe, expect, it, vi } from 'vitest';

const { actorMock, canMock, adminMock, servicioMock, logMock } = vi.hoisted(() => ({
  actorMock: vi.fn(),
  canMock: vi.fn(),
  adminMock: vi.fn(),
  servicioMock: vi.fn(),
  logMock: vi.fn(),
}));

vi.mock('@/modulos/produccion/acciones/utilidades-acciones', () => ({
  obtenerActorProduccionParaMutacion: () => actorMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => adminMock() }));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => logMock(...args),
  nuevoCorrelationId: () => 'cid-lote',
}));
vi.mock('@/modulos/produccion/servicios/corridas-servicio', () => ({
  crearCorridaServicio: (...args: unknown[]) => servicioMock(...args),
}));

import { crearLoteOperadorAccion } from '@/modulos/produccion/acciones/crear-lote-operador';

const ORDEN = '11111111-1111-4111-8111-111111111111';
const PROCESO = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const P2 = '44444444-4444-4444-8444-444444444444';

const CORRIDA = {
  id: '55555555-5555-4555-8555-555555555555',
  ordenId: ORDEN,
  codigo: 'COR-001',
  procesoId: PROCESO,
  estado: 'PLANIFICADA',
  items: [{ partidaId: P1, codigoItem: 'IT01', cantidad: 10 }, { partidaId: P2, codigoItem: 'IT02', cantidad: 5 }],
};

const ENTRADA = {
  ordenId: ORDEN,
  procesoNombre: 'Corte Láser',
  items: [{ partidaId: P1, cantidad: 10 }, { partidaId: P2, cantidad: 5 }],
};

describe('crearLoteOperadorAccion (C2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actorMock.mockResolvedValue({ id: 'operador-1', rol: 'operador', activo: true });
    canMock.mockImplementation(async (_actor: unknown, permiso: string) => permiso === 'produccion_operar');
    adminMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            ilike: () => ({ maybeSingle: async () => ({ data: { id: PROCESO }, error: null }) }),
          }),
        }),
      }),
    });
    servicioMock.mockResolvedValue(CORRIDA);
  });

  it('crea el lote con el permiso de operar y resuelve el proceso por nombre', async () => {
    const respuesta = await crearLoteOperadorAccion(ENTRADA);
    expect(respuesta.exito).toBe(true);
    expect(servicioMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      ordenId: ORDEN,
      procesoId: PROCESO,
      actorId: 'operador-1',
      items: ENTRADA.items,
    }));
    expect(logMock).toHaveBeenCalled();
  });

  it('rechaza sin permiso de operar con un mensaje concreto', async () => {
    canMock.mockResolvedValue(false);
    const respuesta = await crearLoteOperadorAccion(ENTRADA);
    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para crear lotes' });
    expect(servicioMock).not.toHaveBeenCalled();
  });

  it('exige al menos dos ítems', async () => {
    const respuesta = await crearLoteOperadorAccion({
      ...ENTRADA,
      items: [{ partidaId: P1, cantidad: 10 }],
    });
    expect(respuesta.exito).toBe(false);
    expect(servicioMock).not.toHaveBeenCalled();
  });

  it('explica cuando no se encuentra el proceso sugerido', async () => {
    adminMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
      }),
    });
    const respuesta = await crearLoteOperadorAccion(ENTRADA);
    expect(respuesta.exito).toBe(false);
    expect('error' in respuesta ? respuesta.error : '').toContain('No se encontró el proceso');
  });
});
