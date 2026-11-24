import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reclamar: vi.fn(),
  iniciar: vi.fn(),
  liberar: vi.fn(),
  notificar: vi.fn(),
  registrarLog: vi.fn(),
}));

vi.mock('@/nucleo/autenticacion/obtener-operador-sesion', () => ({
  obtenerOperadorParaMutacion: vi.fn(async () => ({ id: 'operador-1', nombreCompleto: 'Luis Torres' })),
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => ({}) }));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => mocks.registrarLog(...args),
  nuevoCorrelationId: () => '66666666-6666-4666-8666-666666666666',
}));
vi.mock('@/modulos/produccion/servicios/indice', () => ({
  reclamarProcesoOperadorServicio: (...args: unknown[]) => mocks.reclamar(...args),
  iniciarProcesoReclamadoServicio: (...args: unknown[]) => mocks.iniciar(...args),
  liberarReclamoOperadorServicio: (...args: unknown[]) => mocks.liberar(...args),
  mensajeErrorSesion: (error: unknown) => (error instanceof Error ? error.message : 'Error'),
  ErrorProduccion: class ErrorProduccion extends Error {},
}));
vi.mock('@/modulos/produccion/servicios/notificaciones-produccion-servicio', () => ({
  notificarInicioProcesoServicio: (...args: unknown[]) => mocks.notificar(...args),
}));

import { iniciarProcesoDirectoAccion } from '@/modulos/produccion/acciones/espacio-operador';

const ENTRADA = {
  ordenId: '11111111-1111-4111-8111-111111111111',
  partidaId: '22222222-2222-4222-8222-222222222222',
  metaProcesoId: '33333333-3333-4333-8333-333333333333',
  fecha: '2026-11-24',
  turno: 'matutino',
};

const SESION = {
  id: 'sesion-1',
  ordenId: ENTRADA.ordenId,
  partidaId: ENTRADA.partidaId,
  programacionId: 'programacion-1',
  operadorId: 'operador-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reclamar.mockResolvedValue({ id: 'reclamo-1' });
  mocks.iniciar.mockResolvedValue(SESION);
  mocks.liberar.mockResolvedValue(true);
  mocks.notificar.mockResolvedValue(undefined);
});

describe('iniciarProcesoDirectoAccion — sin paso de reclamo para el operador', () => {
  it('crea la reserva internamente y arranca la sesión', async () => {
    const respuesta = await iniciarProcesoDirectoAccion(ENTRADA);
    expect(respuesta.exito).toBe(true);
    expect(mocks.reclamar).toHaveBeenCalledOnce();
    expect(mocks.iniciar.mock.calls[0][1]).toMatchObject({ reclamoId: 'reclamo-1' });
    expect(mocks.notificar.mock.calls[0][1]).toMatchObject({ reclamoId: 'reclamo-1' });
  });

  it('libera la reserva si el inicio falla', async () => {
    mocks.iniciar.mockRejectedValue(new Error('recurso_ocupado'));
    const respuesta = await iniciarProcesoDirectoAccion(ENTRADA);
    expect(respuesta.exito).toBe(false);
    expect(mocks.liberar.mock.calls[0][1]).toEqual({ reclamoId: 'reclamo-1', operadorId: 'operador-1' });
  });

  it('rechaza datos incompletos', async () => {
    const respuesta = await iniciarProcesoDirectoAccion({ ordenId: ENTRADA.ordenId });
    expect(respuesta.exito).toBe(false);
    expect(mocks.reclamar).not.toHaveBeenCalled();
  });
});
