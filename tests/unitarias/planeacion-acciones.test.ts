import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

const {
  canMock,
  crearClienteAdminMock,
  crearClienteServidorMock,
  ErrorPlaneacionMock,
  obtenerUsuarioMock,
  obtenerCalendarioMock,
  obtenerDetalleMock,
  programarMock,
  reprogramarMock,
  activarPreparacionMock,
  registrarLogMock,
} = vi.hoisted(() => {
  class ErrorPlaneacionMock extends Error {
    constructor(public readonly codigo: string) {
      super(codigo);
    }
  }

  return {
    canMock: vi.fn(),
    crearClienteAdminMock: vi.fn(),
    crearClienteServidorMock: vi.fn(),
    ErrorPlaneacionMock,
    obtenerUsuarioMock: vi.fn(),
    obtenerCalendarioMock: vi.fn(),
    obtenerDetalleMock: vi.fn(),
    programarMock: vi.fn(),
    reprogramarMock: vi.fn(),
    activarPreparacionMock: vi.fn(),
    registrarLogMock: vi.fn(),
  };
});

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...argumentos: unknown[]) => registrarLogMock(...argumentos),
  nuevoCorrelationId: () => 'correlacion-prueba',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => crearClienteAdminMock(),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: () => crearClienteServidorMock(),
}));
vi.mock('@/modulos/planeacion/servicios/indice', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/modulos/planeacion/servicios/indice')>();
  return {
    ...original,
    ErrorPlaneacion: ErrorPlaneacionMock,
    mensajeErrorPlaneacion: (error: Error) => (
      error.message === 'programacion_conflicto'
        ? 'La programación fue modificada por otro usuario. Recarga e inténtalo de nuevo'
        : 'No se pudo actualizar la programación'
    ),
    programarPartidaRecursoServicio: (...argumentos: unknown[]) => programarMock(...argumentos),
    reprogramarPartidaRecursoServicio: (...argumentos: unknown[]) => reprogramarMock(...argumentos),
    activarModoPreparacionServicio: (...argumentos: unknown[]) => activarPreparacionMock(...argumentos),
    obtenerDatosCalendarioPlaneacionServicio: (...argumentos: unknown[]) => (
      obtenerCalendarioMock(...argumentos)
    ),
    obtenerDetalleProgramacionServicio: (...argumentos: unknown[]) => obtenerDetalleMock(...argumentos),
  };
});

import {
  activarModoPreparacionAccion,
  obtenerCalendarioPlaneacionAccion,
  obtenerDetalleProgramacionAccion,
  programarPartidaRecursoAccion,
  reprogramarPartidaRecursoAccion,
} from '@/modulos/planeacion/acciones/indice';
import { proponerHuecoReprogramacionAccion } from '@/modulos/planeacion/acciones/proponer-hueco-reprogramacion';

type RespuestaLectura = { data: unknown; error: null };

interface ConsultaDeSoloLectura extends PromiseLike<RespuestaLectura> {
  select(columnas: string): ConsultaDeSoloLectura;
  eq(campo: string, valor: string | boolean): ConsultaDeSoloLectura;
  maybeSingle(): ConsultaDeSoloLectura;
  insert(datos: unknown): never;
  update(datos: unknown): never;
  upsert(datos: unknown): never;
  delete(): never;
}

function crearClienteDeLectura(
  operaciones: string[],
): SupabaseClient<Database> {
  const respuesta: RespuestaLectura = { data: { id: '33333333-3333-4333-8333-333333333333' }, error: null };
  const promesa = Promise.resolve(respuesta);
  const mutacionProhibida = (operacion: string): never => {
    operaciones.push(operacion);
    throw new Error(`Buscar hueco no puede ejecutar ${operacion}`);
  };
  const consulta: ConsultaDeSoloLectura = {
    select() {
      operaciones.push('select');
      return consulta;
    },
    eq() {
      operaciones.push('eq');
      return consulta;
    },
    maybeSingle() {
      operaciones.push('maybeSingle');
      return consulta;
    },
    insert() {
      return mutacionProhibida('insert');
    },
    update() {
      return mutacionProhibida('update');
    },
    upsert() {
      return mutacionProhibida('upsert');
    },
    delete() {
      return mutacionProhibida('delete');
    },
    then: promesa.then.bind(promesa),
  };

  return {
    from() {
      operaciones.push('from');
      return consulta;
    },
  } as unknown as SupabaseClient<Database>;
}

function crearAdministradorDeCapacidad(operaciones: string[]): SupabaseClient<Database> {
  return {
    rpc(nombre: string) {
      operaciones.push(`rpc:${nombre}`);
      if (nombre !== 'obtener_carga_capacidad_diaria') {
        throw new Error(`Buscar hueco no puede invocar ${nombre}`);
      }
      return Promise.resolve({
        data: [{
          recurso_id: '33333333-3333-4333-8333-333333333333',
          area: 'taller',
          fecha_programada: '2026-10-19',
          turno: 'matutino',
          horas_capacidad: 8,
          horas_programadas: 4,
          horas_reales: 0,
          horas_exceso: 0,
          horas_disponibles: 4,
          porcentaje_ocupacion: 50,
          sobrecargado: false,
        }],
        error: null,
      });
    },
  } as unknown as SupabaseClient<Database>;
}

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
  turno: 'matutino' as const,
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
  obtenerDetalleMock.mockResolvedValue({
    responsableNombre: 'Planeador ORCA',
    recursoNombre: 'LAS-01 · Láser',
    grupoEquipoNombre: 'LAS · Láser',
    horasEstimadas: 8,
    horasReales: 3,
    horasExceso: 0,
    recursoLiberado: false,
    historial: [],
  });
  crearClienteAdminMock.mockReturnValue({ rpc: vi.fn(), from: vi.fn() });
  crearClienteServidorMock.mockResolvedValue({ from: vi.fn() });
});

describe('acciones seguras de Planeación', () => {
  it('programa solo con gestionar_planeacion y deja auditoría', async () => {
    const respuesta = await programarPartidaRecursoAccion(ENTRADA_PROGRAMAR);

    expect(respuesta).toEqual({ exito: true, datos: PROGRAMACION });
    expect(programarMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: USUARIO.id,
        correlationId: 'correlacion-prueba',
      }),
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'programar_partida_recurso',
      'planeacion',
      PROGRAMACION.id,
      expect.objectContaining({ partidaId: ENTRADA_PROGRAMAR.partidaId }),
      expect.anything(),
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
      motivo: 'Cambio de turno',
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
      motivo: 'Cambio de turno',
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'La programación fue modificada por otro usuario. Recarga e inténtalo de nuevo',
    });
    expect(reprogramarMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        motivo: 'Cambio de turno',
        actorId: USUARIO.id,
        correlationId: 'correlacion-prueba',
      }),
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'reprogramacion_partida_rechazada',
      'planeacion',
      PROGRAMACION.id,
      expect.objectContaining({ codigo: 'programacion_conflicto' }),
      expect.anything(),
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

  it('consulta el detalle con permiso de lectura y sin auditoría de lectura', async () => {
    const respuesta = await obtenerDetalleProgramacionAccion({
      programacionId: PROGRAMACION.id,
    });

    expect(respuesta.exito).toBe(true);
    expect(obtenerDetalleMock).toHaveBeenCalledTimes(1);
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('rechaza el detalle antes del servicio cuando el UUID es inválido', async () => {
    const respuesta = await obtenerDetalleProgramacionAccion({ programacionId: 'no-es-uuid' });

    expect(respuesta.exito).toBe(false);
    expect(obtenerDetalleMock).not.toHaveBeenCalled();
  });

  it('no permite consultar el detalle sin ver ni gestionar Planeación', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await obtenerDetalleProgramacionAccion({
      programacionId: PROGRAMACION.id,
    });

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para consultar Planeación' });
    expect(obtenerDetalleMock).not.toHaveBeenCalled();
  });

  it('normaliza fallos internos del detalle sin filtrar mensajes técnicos', async () => {
    const errorInterno = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    obtenerDetalleMock.mockRejectedValue(new Error('detalle SQL sensible'));

    const respuesta = await obtenerDetalleProgramacionAccion({
      programacionId: PROGRAMACION.id,
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'No se pudo consultar el detalle de la programación',
    });
    expect(JSON.stringify(respuesta)).not.toContain('SQL sensible');
    errorInterno.mockRestore();
  });
});

describe('proponerHuecoReprogramacionAccion', () => {
  it('solo consulta el recurso y la RPC de capacidad al previsualizar (C9.4/P-18)', async () => {
    const operacionesCliente: string[] = [];
    const operacionesAdmin: string[] = [];
    obtenerUsuarioMock.mockResolvedValue({ id: 'actor-planeacion' });
    canMock.mockResolvedValue(true);
    crearClienteServidorMock.mockResolvedValue(crearClienteDeLectura(operacionesCliente));
    crearClienteAdminMock.mockReturnValue(crearAdministradorDeCapacidad(operacionesAdmin));

    const resultado = await proponerHuecoReprogramacionAccion({
      recursoId: '33333333-3333-4333-8333-333333333333',
      turno: 'matutino',
      horasEstimadas: 2,
      desdeFecha: '2026-10-19',
    });

    expect(resultado).toEqual({
      exito: true,
      datos: expect.objectContaining({ fecha: '2026-10-19', horasDisponibles: 4 }),
    });
    expect(operacionesCliente).toEqual(['from', 'select', 'eq', 'eq', 'maybeSingle']);
    expect(operacionesAdmin).toEqual(['rpc:obtener_carga_capacidad_diaria']);
  });
});
