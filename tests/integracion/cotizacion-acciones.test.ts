import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  registrarLogMock,
  guardarCotizacionMock,
  mensajeErrorMock,
  ErrorCotizacionMock,
} = vi.hoisted(() => {
  class ErrorCotizacionMock extends Error {
    constructor(public readonly codigo: string) {
      super(codigo);
    }
  }

  return {
    obtenerUsuarioMock: vi.fn(),
    registrarLogMock: vi.fn(),
    guardarCotizacionMock: vi.fn(),
    mensajeErrorMock: vi.fn(),
    ErrorCotizacionMock,
  };
});

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: async () => ({ rpc: vi.fn() }),
}));
vi.mock('@/modulos/pipeline/servicios/cotizacion-servicio', () => ({
  ErrorCotizacion: ErrorCotizacionMock,
  guardarCotizacionServicio: (...args: unknown[]) => guardarCotizacionMock(...args),
  mensajeErrorCotizacion: (...args: unknown[]) => mensajeErrorMock(...args),
}));

import { actualizarCotizacionAccion } from '@/modulos/pipeline/acciones/actualizar-cotizacion';
import { crearCotizacionAccion } from '@/modulos/pipeline/acciones/crear-cotizacion';

const PIPELINE_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '2026-09-13T10:00:00.000Z';

const USUARIO = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'vendedor@orca.test',
  nombreCompleto: 'Vendedor',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-09-01T10:00:00.000Z',
  actualizadoEn: '2026-09-01T10:00:00.000Z',
  permisos: [],
};

function entradaValida(extra: Record<string, unknown> = {}) {
  return {
    pipelineId: PIPELINE_ID,
    lineas: [
      {
        descripcion: 'Placa base',
        cantidad: 4,
        precioUnitario: 320.5,
        material: 'Acero A36',
        espesor: '1/8"',
        area: 0.75,
        procesos: ['corte'],
      },
    ],
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO);
  guardarCotizacionMock.mockResolvedValue({
    pipelineId: PIPELINE_ID,
    lineasGuardadas: 1,
    actualizadoEn: '2026-09-13T11:00:00.000Z',
  });
  mensajeErrorMock.mockReturnValue('No se pudo guardar la cotización');
});

describe.each([
  ['crearCotizacionAccion', crearCotizacionAccion],
  ['actualizarCotizacionAccion', actualizarCotizacionAccion],
])('%s', (_nombre, accion) => {
  it('sin sesión no toca el servicio', async () => {
    obtenerUsuarioMock.mockResolvedValue(null);

    const respuesta = await accion(entradaValida());

    expect(respuesta).toEqual({ exito: false, error: 'No autorizado' });
    expect(guardarCotizacionMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('rechaza datos inválidos antes de escribir', async () => {
    const respuesta = await accion({ pipelineId: PIPELINE_ID, lineas: [] });

    expect(respuesta.exito).toBe(false);
    expect(guardarCotizacionMock).not.toHaveBeenCalled();
  });

  it('rechaza campos desconocidos en la entrada', async () => {
    const respuesta = await accion(entradaValida({ vendedorId: USUARIO.id }));

    expect(respuesta.exito).toBe(false);
    expect(guardarCotizacionMock).not.toHaveBeenCalled();
  });

  it('delega en el servicio transaccional y audita el guardado', async () => {
    const respuesta = await accion(entradaValida({ actualizadoEnEsperado: TOKEN }));

    expect(respuesta).toEqual({
      exito: true,
      datos: { actualizadoEn: '2026-09-13T11:00:00.000Z', lineasGuardadas: 1 },
    });
    expect(guardarCotizacionMock).toHaveBeenCalledTimes(1);
    expect(guardarCotizacionMock.mock.calls[0]?.[1]).toMatchObject({
      pipelineId: PIPELINE_ID,
      actualizadoEnEsperado: TOKEN,
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'guardar_cotizacion',
      'pipeline',
      PIPELINE_ID,
      { lineas: 1 },
    );
  });

  it('traduce el error de negocio y no audita un guardado que no ocurrió', async () => {
    guardarCotizacionMock.mockRejectedValue(new ErrorCotizacionMock('cotizacion_conflicto'));
    mensajeErrorMock.mockReturnValue('La oportunidad cambió mientras editabas');

    const respuesta = await accion(entradaValida({ actualizadoEnEsperado: TOKEN }));

    expect(respuesta).toEqual({
      exito: false,
      error: 'La oportunidad cambió mientras editabas',
    });
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('un error inesperado del servicio no filtra detalle interno', async () => {
    guardarCotizacionMock.mockRejectedValue(new Error('permission denied for table pipeline'));

    const respuesta = await accion(entradaValida());

    expect(respuesta).toEqual({ exito: false, error: 'No se pudo guardar la cotización' });
    expect(registrarLogMock).not.toHaveBeenCalled();
  });
});
