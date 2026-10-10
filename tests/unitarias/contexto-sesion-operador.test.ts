import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SesionOperador } from '@/modulos/autenticacion/tipos/indice';

const {
  sesionActual,
  obtenerUsuarioMock,
  maybeSingleMock,
  registrarLogMock,
} = vi.hoisted(() => ({
  sesionActual: { valor: null as SesionOperador | null },
  obtenerUsuarioMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  registrarLogMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'cookie-firmada' }) }),
}));
vi.mock('@/nucleo/autenticacion/sesion', () => ({
  deserializarSesionOperador: async () => sesionActual.valor,
  sesionOperadorExpirada: () => false,
  sesionOperadorVencidaAbsoluta: () => false,
  sesionOperadorRevocadaPorPin: () => false,
  sesionOperadorEsDelegada: (sesion: SesionOperador) => sesion.modo === 'delegada',
}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
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

import {
  obtenerContextoSesionOperadorActiva,
  obtenerOperadorParaMutacion,
} from '@/nucleo/autenticacion/obtener-operador-sesion';
import { obtenerActorProduccionParaMutacion } from '@/modulos/produccion/acciones/utilidades-acciones';

const OPERADOR = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'operador@orca.test',
  nombre_completo: 'Operador Uno',
  activo: true,
  ultimo_login_at: null,
  creado_en: '2026-10-01T10:00:00.000Z',
  actualizado_en: '2026-10-01T10:00:00.000Z',
  pin_cambiado_en: null,
};
const ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@orca.test',
  nombreCompleto: 'Admin Real',
  rol: 'admin' as const,
  activo: true,
  creadoEn: '2026-10-01T10:00:00.000Z',
  actualizadoEn: '2026-10-01T10:00:00.000Z',
  permisos: [],
};

function crearSesion(modo: 'pin' | 'delegada'): SesionOperador {
  return {
    usuarioId: OPERADOR.id,
    nombreUsuario: OPERADOR.nombre_completo,
    iniciadaEn: '2026-10-10T12:00:00.000Z',
    ultimaActividadEn: '2026-10-10T12:00:00.000Z',
    timeoutMinutos: 15,
    modo,
    ...(modo === 'delegada' ? {
      administradorId: ADMIN.id,
      nombreAdministrador: ADMIN.nombreCompleto,
      motivoDelegacion: 'Revisar instrucciones',
      expiraEn: '2026-10-10T12:15:00.000Z',
    } : {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sesionActual.valor = crearSesion('pin');
  obtenerUsuarioMock.mockResolvedValue(ADMIN);
  maybeSingleMock.mockResolvedValue({ data: OPERADOR, error: null });
  registrarLogMock.mockResolvedValue(undefined);
});

describe('contexto de sesion de operador', () => {
  it('mantiene el acceso PIN sin exigir una sesion administrativa', async () => {
    obtenerUsuarioMock.mockResolvedValue(null);

    const contexto = await obtenerContextoSesionOperadorActiva();

    expect(contexto?.operador.id).toBe(OPERADOR.id);
    expect(contexto?.administrador).toBeNull();
  });

  it('revalida que la delegacion pertenezca al administrador autenticado', async () => {
    sesionActual.valor = crearSesion('delegada');

    const contexto = await obtenerContextoSesionOperadorActiva();

    expect(contexto?.administrador?.id).toBe(ADMIN.id);
    expect(contexto?.sesion.modo).toBe('delegada');
  });

  it('revoca la delegacion si cambia o desaparece el administrador real', async () => {
    sesionActual.valor = crearSesion('delegada');
    obtenerUsuarioMock.mockResolvedValue({ ...ADMIN, id: '33333333-3333-4333-8333-333333333333' });

    await expect(obtenerContextoSesionOperadorActiva()).resolves.toBeNull();
  });

  it('rechaza y audita cualquier mutacion solicitada desde la vista delegada', async () => {
    sesionActual.valor = crearSesion('delegada');

    await expect(obtenerOperadorParaMutacion('registrar_avance_partida', OPERADOR.id))
      .resolves.toBeNull();
    expect(registrarLogMock).toHaveBeenCalledWith(
      ADMIN,
      'mutacion_vista_operador_rechazada',
      'produccion',
      OPERADOR.id,
      expect.objectContaining({
        accionSolicitada: 'registrar_avance_partida',
        operadorId: OPERADOR.id,
      }),
    );
  });

  it('impide usar los permisos administrativos para mutar mientras la delegacion esta activa', async () => {
    sesionActual.valor = crearSesion('delegada');

    await expect(obtenerActorProduccionParaMutacion('crear_corrida', OPERADOR.id))
      .resolves.toBeNull();
  });
});
