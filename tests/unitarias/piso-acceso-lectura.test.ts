import { beforeEach, describe, expect, it, vi } from 'vitest';

// El acceso de LECTURA al piso replica el de la página /produccion-piso: terminal de operador (cookie
// PIN, también la vista delegada de un admin) o administrador con sesión del sistema (solo lectura).

const { cookieMock, sesionMock, usuarioMock, filaOperadorMock, revocadaMock } = vi.hoisted(() => ({
  cookieMock: vi.fn(),
  sesionMock: vi.fn(),
  usuarioMock: vi.fn(),
  filaOperadorMock: vi.fn(),
  revocadaMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => cookieMock() }),
}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/sesion', () => ({
  deserializarSesionOperador: async () => sesionMock(),
  sesionOperadorExpirada: (sesion: { expirada?: boolean }) => sesion.expirada === true,
  sesionOperadorVencidaAbsoluta: () => false,
  sesionOperadorRevocadaPorPin: () => revocadaMock(),
  sesionOperadorEsDelegada: (sesion: { modo?: string }) => sesion.modo === 'delegada',
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({ registrarLog: vi.fn() }));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => {
    const consulta: Record<string, unknown> = {};
    consulta.select = () => consulta;
    consulta.eq = () => consulta;
    consulta.maybeSingle = async () => filaOperadorMock();
    return { from: () => consulta };
  },
}));

import { obtenerAccesoLecturaPiso } from '@/nucleo/autenticacion/obtener-operador-sesion';

const OPERADOR_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const FILA_OPERADOR = {
  id: OPERADOR_ID, email: 'op@orca.test', nombre_completo: 'Operador Uno', activo: true,
  ultimo_login_at: null, creado_en: '2026-10-01T10:00:00.000Z', actualizado_en: '2026-10-01T10:00:00.000Z',
  pin_cambiado_en: null,
};
const ADMIN = { id: ADMIN_ID, rol: 'admin', activo: true, nombreCompleto: 'Admin' };

beforeEach(() => {
  vi.clearAllMocks();
  cookieMock.mockReturnValue({ value: 'cookie-firmada' });
  sesionMock.mockReturnValue({ usuarioId: OPERADOR_ID, modo: 'pin' });
  usuarioMock.mockResolvedValue(null);
  filaOperadorMock.mockResolvedValue({ data: FILA_OPERADOR, error: null });
  revocadaMock.mockReturnValue(false);
});

describe('obtenerAccesoLecturaPiso', () => {
  it('una terminal con PIN vigente accede como ese operador', async () => {
    await expect(obtenerAccesoLecturaPiso()).resolves.toEqual({ operadorId: OPERADOR_ID });
  });

  it('la vista delegada de un admin lee como el operador (la escritura sigue bloqueada aparte)', async () => {
    sesionMock.mockReturnValue({ usuarioId: OPERADOR_ID, modo: 'delegada', administradorId: ADMIN_ID });
    usuarioMock.mockResolvedValue(ADMIN);

    await expect(obtenerAccesoLecturaPiso()).resolves.toEqual({ operadorId: OPERADOR_ID });
  });

  it('un admin con sesión del sistema y sin PIN ve todo el piso (operadorId null)', async () => {
    cookieMock.mockReturnValue(undefined);
    usuarioMock.mockResolvedValue(ADMIN);

    await expect(obtenerAccesoLecturaPiso()).resolves.toEqual({ operadorId: null });
  });

  it('sin cookie ni sesión del sistema no hay acceso', async () => {
    cookieMock.mockReturnValue(undefined);

    await expect(obtenerAccesoLecturaPiso()).resolves.toBeNull();
  });

  it('un usuario del sistema que no es admin no entra al piso', async () => {
    cookieMock.mockReturnValue(undefined);
    usuarioMock.mockResolvedValue({ ...ADMIN, rol: 'gerente' });

    await expect(obtenerAccesoLecturaPiso()).resolves.toBeNull();
  });

  it('una cookie vencida no da acceso', async () => {
    sesionMock.mockReturnValue({ usuarioId: OPERADOR_ID, modo: 'pin', expirada: true });

    await expect(obtenerAccesoLecturaPiso()).resolves.toBeNull();
  });

  it('un operador desactivado o con el PIN cambiado pierde el acceso aunque la cookie siga firmada', async () => {
    filaOperadorMock.mockResolvedValue({ data: null, error: null });
    await expect(obtenerAccesoLecturaPiso()).resolves.toBeNull();

    filaOperadorMock.mockResolvedValue({ data: FILA_OPERADOR, error: null });
    revocadaMock.mockReturnValue(true);
    await expect(obtenerAccesoLecturaPiso()).resolves.toBeNull();
  });

  it('un admin desactivado no entra como vista de administrador', async () => {
    cookieMock.mockReturnValue(undefined);
    usuarioMock.mockResolvedValue({ ...ADMIN, activo: false });

    await expect(obtenerAccesoLecturaPiso()).resolves.toBeNull();
  });
});
