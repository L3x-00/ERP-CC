import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  canMock,
  obtenerOportunidadMock,
  promoverClienteMock,
  aprobarOportunidadMock,
  registrarLogMock,
  clienteConsultaMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  obtenerOportunidadMock: vi.fn(),
  promoverClienteMock: vi.fn(),
  aprobarOportunidadMock: vi.fn(),
  registrarLogMock: vi.fn(),
  clienteConsultaMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: () => ({ from: vi.fn() }),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    rpc: vi.fn(),
    // RFQ-16: la lectura de límite de crédito usa el cliente admin; sin límite
    // (null) el gate no consulta cartera ni líneas.
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => clienteConsultaMock(),
        }),
      }),
    }),
  }),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
}));
vi.mock('@/modulos/pipeline/servicios/obtener-oportunidad-por-id', () => ({
  obtenerOportunidadPorId: (...args: unknown[]) => obtenerOportunidadMock(...args),
}));
vi.mock('@/modulos/pipeline/servicios/promover-a-cliente', () => ({
  promoverAClienteSiNoExiste: (...args: unknown[]) => promoverClienteMock(...args),
}));
vi.mock('@/modulos/ordenes/servicios/ordenes-servicio', () => ({
  aprobarOportunidadYCrearOrdenServicio: (...args: unknown[]) => aprobarOportunidadMock(...args),
  mensajeErrorOrden: () => 'No se pudo aprobar la oportunidad',
}));

import { marcarGanadaAccion } from '@/modulos/pipeline/acciones/marcar-ganada';

const USUARIO = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@orca.test',
  nombreCompleto: 'Admin ORCA',
  rol: 'admin' as const,
  activo: true,
  creadoEn: '2026-08-01T00:00:00.000Z',
  actualizadoEn: '2026-08-01T00:00:00.000Z',
  permisos: [],
};
const OPORTUNIDAD_ID = '11111111-1111-4111-8111-111111111111';
const CLIENTE_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  obtenerOportunidadMock.mockResolvedValue({
    oportunidad: {
      id: OPORTUNIDAD_ID,
      empresa: 'ACME Manufactura',
      nombreContacto: 'Ana López',
      correo: 'ana@acme.test',
      telefono: '6640000000',
      etapa: 'negociacion',
    },
    lineas: [],
  });
  promoverClienteMock.mockResolvedValue(CLIENTE_ID);
  clienteConsultaMock.mockResolvedValue({
    data: { id: CLIENTE_ID, estado: 'activo', limite_credito: null },
    error: null,
  });
  aprobarOportunidadMock.mockResolvedValue({
    id: '33333333-3333-4333-8333-333333333333',
    folio: 'OP-001005',
    yaExistia: false,
  });
});

describe('marcarGanadaAccion', () => {
  it('bloquea la aprobación si no se puede verificar el cliente elegido', async () => {
    obtenerOportunidadMock.mockResolvedValue({
      oportunidad: {
        id: OPORTUNIDAD_ID,
        clienteId: CLIENTE_ID,
        empresa: 'Proyecto distinto',
        etapa: 'negociacion',
      },
      lineas: [],
    });
    clienteConsultaMock.mockResolvedValue({ data: null, error: { message: 'lectura fallida' } });
    const respuesta = await marcarGanadaAccion({
      id: OPORTUNIDAD_ID,
      fechaCompromiso: '2026-09-15T18:00:00.000Z',
    });
    expect(respuesta).toEqual({ exito: false, error: 'No se pudo verificar el cliente de la oportunidad' });
    expect(promoverClienteMock).not.toHaveBeenCalled();
    expect(aprobarOportunidadMock).not.toHaveBeenCalled();
  });

  it('conserva el cliente elegido aunque el nombre comercial sea distinto', async () => {
    obtenerOportunidadMock.mockResolvedValue({
      oportunidad: {
        id: OPORTUNIDAD_ID,
        clienteId: CLIENTE_ID,
        empresa: 'Nombre de proyecto diferente',
        nombreContacto: 'Ana López',
        correo: 'otra-cuenta@orca.test',
        etapa: 'negociacion',
      },
      lineas: [],
    });
    const respuesta = await marcarGanadaAccion({
      id: OPORTUNIDAD_ID,
      fechaCompromiso: '2026-09-15T18:00:00.000Z',
    });
    expect(respuesta.exito).toBe(true);
    expect(promoverClienteMock).not.toHaveBeenCalled();
    expect(aprobarOportunidadMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      clienteId: CLIENTE_ID,
    }));
  });

  it('aprueba la oportunidad y genera su OP por la RPC atómica', async () => {
    const respuesta = await marcarGanadaAccion({
      id: OPORTUNIDAD_ID,
      fechaCompromiso: '2026-09-15T18:00:00.000Z',
    });

    expect(respuesta).toEqual({
      exito: true,
      datos: {
        clienteId: CLIENTE_ID,
        ordenId: '33333333-3333-4333-8333-333333333333',
        folioOrden: 'OP-001005',
      },
    });
    expect(aprobarOportunidadMock).toHaveBeenCalledWith(expect.anything(), {
      pipelineId: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      fechaCompromiso: '2026-09-15T18:00:00.000Z',
      actorId: USUARIO.id,
      autorizarSobregiro: false,
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'marcar_ganada',
      'pipeline',
      OPORTUNIDAD_ID,
      expect.objectContaining({ folioOrden: 'OP-001005' }),
    );
  });

  it('rechaza la aprobación sin fecha de compromiso', async () => {
    const respuesta = await marcarGanadaAccion({ id: OPORTUNIDAD_ID });

    expect(respuesta.exito).toBe(false);
    expect(aprobarOportunidadMock).not.toHaveBeenCalled();
  });

  it('no crea una OP si el usuario no puede aprobar órdenes', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await marcarGanadaAccion({
      id: OPORTUNIDAD_ID,
      fechaCompromiso: '2026-09-15T18:00:00.000Z',
    });

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para marcar como ganada' });
    expect(aprobarOportunidadMock).not.toHaveBeenCalled();
  });
});
