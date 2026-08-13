import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  canMock,
  registrarLogMock,
  programarMock,
  reprogramarMock,
  activarPreparacionMock,
  obtenerCalendarioMock,
  ErrorPlaneacionMock,
} = vi.hoisted(() => {
  class ErrorPlaneacionMock extends Error {
    constructor(public readonly codigo: string) {
      super(codigo);
    }
  }

  return {
    obtenerUsuarioMock: vi.fn(),
    canMock: vi.fn(),
    registrarLogMock: vi.fn(),
    programarMock: vi.fn(),
    reprogramarMock: vi.fn(),
    activarPreparacionMock: vi.fn(),
    obtenerCalendarioMock: vi.fn(),
    ErrorPlaneacionMock,
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
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: vi.fn(), from: vi.fn() }),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: () => Promise.resolve({ from: vi.fn() }),
}));
vi.mock('@/modulos/planeacion/servicios/indice', () => ({
  ErrorPlaneacion: ErrorPlaneacionMock,
  mensajeErrorPlaneacion: (error: Error) =>
    error.message === 'programacion_conflicto'
      ? 'La programación fue modificada por otro usuario. Recarga e inténtalo de nuevo'
      : 'No se pudo actualizar la programación',
  programarPartidaRecursoServicio: (...args: unknown[]) => programarMock(...args),
  reprogramarPartidaRecursoServicio: (...args: unknown[]) => reprogramarMock(...args),
  activarModoPreparacionServicio: (...args: unknown[]) => activarPreparacionMock(...args),
  obtenerDatosCalendarioPlaneacionServicio: (...args: unknown[]) => obtenerCalendarioMock(...args),
}));

import {
  activarModoPreparacionAccion,
  obtenerCalendarioPlaneacionAccion,
  programarPartidaRecursoAccion,
  reprogramarPartidaRecursoAccion,
} from '@/modulos/planeacion/acciones/indice';

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'planeador@orca.test',
  nombreCompleto: 'Planeador ORCA',
  rol: 'gerente' as const,
  activo: true,
  creadoEn: '2026-08-13T12:00:00.000Z',
  actualizadoEn: '2026-08-13T12:00:00.000Z',
  permisos: ['ver_planeacion', 'gestionar_planeacion'],
};

const PROGRAMACION = {
  id: '22222222-2222-4222-8222-222222222222',
  estadoPlaneacion: 'programada' as const,
  actualizadoEn: '2026-09-15T12:00:00.000Z',
};

const ENTRADA_PROGRAMAR = {
  ordenId: '33333333-3333-4333-8333-333333333333',
  partidaId: '44444444-4444-4444-8444-444444444444',
  recursoId: '55555555-5555-4555-8555-555555555555',
  secuencia: 1,
  fechaProgramada: '2026-09-15',
  turno: 'matutino',
  horasEstimadas: 4,
  ordenPrioridad: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  registrarLogMock.mockResolvedValue(undefined);
  programarMock.mockResolvedValue(PROGRAMACION);
  reprogramarMock.mockResolvedValue(PROGRAMACION);
  activarPreparacionMock.mockResolvedValue({ ...PROGRAMACION, estadoPlaneacion: 'en_preparacion' });
  obtenerCalendarioMock.mockResolvedValue({ recursos: [], cargas: [], programaciones: [] });
});

describe('acciones seguras de Planeación', () => {
  it('programa solo con gestionar_planeacion y deja auditoría', async () => {
    const respuesta = await programarPartidaRecursoAccion(ENTRADA_PROGRAMAR);

    expect(respuesta).toEqual({ exito: true, datos: PROGRAMACION });
    expect(programarMock).toHaveBeenCalledTimes(1);
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'programar_partida_recurso',
      'planeacion',
      PROGRAMACION.id,
      expect.objectContaining({ partidaId: ENTRADA_PROGRAMAR.partidaId }),
    );
  });

  it('no llega a la RPC de programación sin permiso', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await programarPartidaRecursoAccion(ENTRADA_PROGRAMAR);

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para programar recursos' });
    expect(programarMock).not.toHaveBeenCalled();
  });

  it('rechaza una reprogramación con entrada malformada antes de tocar servicios', async () => {
    const respuesta = await reprogramarPartidaRecursoAccion({
      ...ENTRADA_PROGRAMAR,
      programacionId: 'no-es-uuid',
      actualizadoEnEsperado: PROGRAMACION.actualizadoEn,
    });

    expect(respuesta.exito).toBe(false);
    expect(reprogramarMock).not.toHaveBeenCalled();
  });

  it('normaliza un conflicto de compare-and-set y registra solo su código', async () => {
    reprogramarMock.mockRejectedValue(new ErrorPlaneacionMock('programacion_conflicto'));

    const respuesta = await reprogramarPartidaRecursoAccion({
      programacionId: PROGRAMACION.id,
      recursoId: ENTRADA_PROGRAMAR.recursoId,
      fechaProgramada: '2026-09-16',
      turno: 'vespertino',
      horasEstimadas: 3,
      ordenPrioridad: 2,
      actualizadoEnEsperado: PROGRAMACION.actualizadoEn,
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'La programación fue modificada por otro usuario. Recarga e inténtalo de nuevo',
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'reprogramacion_partida_rechazada',
      'planeacion',
      PROGRAMACION.id,
      expect.objectContaining({ codigo: 'programacion_conflicto' }),
    );
  });

  it('activa preparación con permiso y sin actor controlado por el cliente', async () => {
    const respuesta = await activarModoPreparacionAccion({
      programacionId: PROGRAMACION.id,
      actualizadoEnEsperado: PROGRAMACION.actualizadoEn,
      actorId: '99999999-9999-4999-8999-999999999999',
    });

    expect(respuesta.exito).toBe(false);
    expect(activarPreparacionMock).not.toHaveBeenCalled();
  });

  it('permite consultar el calendario al permiso de lectura sin escribir auditoría', async () => {
    canMock.mockResolvedValueOnce(true);

    const respuesta = await obtenerCalendarioPlaneacionAccion({
      fechaInicio: '2026-09-15',
      fechaFin: '2026-09-21',
    });

    expect(respuesta).toEqual({ exito: true, datos: { recursos: [], cargas: [], programaciones: [] } });
    expect(obtenerCalendarioMock).toHaveBeenCalledTimes(1);
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('no permite consultar un calendario fuera del rango acotado', async () => {
    const respuesta = await obtenerCalendarioPlaneacionAccion({
      fechaInicio: '2026-09-01',
      fechaFin: '2026-11-01',
    });

    expect(respuesta.exito).toBe(false);
    expect(obtenerCalendarioMock).not.toHaveBeenCalled();
  });
});
