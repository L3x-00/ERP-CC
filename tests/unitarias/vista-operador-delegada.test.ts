import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  serializarMock,
  registrarLogMock,
  cookiesSetMock,
  maybeSingleMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  serializarMock: vi.fn(),
  registrarLogMock: vi.fn(),
  cookiesSetMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookiesSetMock }),
}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/sesion', () => ({
  serializarSesionOperador: (...args: unknown[]) => serializarMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: () => {
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        maybeSingle: () => maybeSingleMock(),
      };
      return consulta;
    },
  }),
}));

import { iniciarVistaOperadorAccion } from '@/modulos/autenticacion/acciones/iniciar-vista-operador';

const ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@orca.test',
  nombreCompleto: 'Admin Real',
  rol: 'admin' as const,
  activo: true,
  creadoEn: '2026-10-10T10:00:00.000Z',
  actualizadoEn: '2026-10-10T10:00:00.000Z',
  permisos: [],
};
const OPERADOR_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  obtenerUsuarioMock.mockResolvedValue(ADMIN);
  serializarMock.mockResolvedValue('cookie-firmada');
  registrarLogMock.mockResolvedValue(undefined);
  maybeSingleMock.mockResolvedValue({
    data: {
      id: OPERADOR_ID,
      nombre_completo: 'Operador Uno',
      pin_cambiado_en: '2026-10-01T10:00:00.000Z',
    },
    error: null,
  });
});

describe('iniciarVistaOperadorAccion', () => {
  it('rechaza a un usuario que no es administrador', async () => {
    obtenerUsuarioMock.mockResolvedValue({ ...ADMIN, rol: 'gerente' });

    await expect(iniciarVistaOperadorAccion({
      operadorId: OPERADOR_ID,
      motivo: 'Revisar instrucciones',
    })).resolves.toEqual({ exito: false, error: 'Sin permiso para ver como operador' });
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(cookiesSetMock).not.toHaveBeenCalled();
  });

  it('exige un motivo no vacio', async () => {
    const respuesta = await iniciarVistaOperadorAccion({
      operadorId: OPERADOR_ID,
      motivo: '   ',
    });

    expect(respuesta.exito).toBe(false);
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('crea una delegacion fija de 15 minutos y audita al administrador real', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'));

    const respuesta = await iniciarVistaOperadorAccion({
      operadorId: OPERADOR_ID,
      motivo: '  Revisar instrucciones del trabajo  ',
    });

    expect(respuesta).toEqual({ exito: true, datos: { ruta: '/produccion-piso' } });
    expect(serializarMock).toHaveBeenCalledWith(expect.objectContaining({
      usuarioId: OPERADOR_ID,
      nombreUsuario: 'Operador Uno',
      modo: 'delegada',
      administradorId: ADMIN.id,
      nombreAdministrador: ADMIN.nombreCompleto,
      motivoDelegacion: 'Revisar instrucciones del trabajo',
      iniciadaEn: '2026-10-10T12:00:00.000Z',
      ultimaActividadEn: '2026-10-10T12:00:00.000Z',
      expiraEn: '2026-10-10T12:15:00.000Z',
      timeoutMinutos: 15,
    }));
    expect(cookiesSetMock).toHaveBeenCalledWith('sesion_operador', 'cookie-firmada',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 900 }));
    expect(registrarLogMock).toHaveBeenCalledWith(
      ADMIN,
      'iniciar_vista_operador',
      'autenticacion',
      OPERADOR_ID,
      expect.objectContaining({
        operadorNombre: 'Operador Uno',
        motivo: 'Revisar instrucciones del trabajo',
        expiraEn: '2026-10-10T12:15:00.000Z',
      }),
    );
  });
});
