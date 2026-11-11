import { beforeEach, describe, expect, it, vi } from 'vitest';

// Alta de usuario (Configuración → Personas y accesos → Usuarios): la cuenta se
// crea en Auth, el trigger/upsert deja el perfil y el rechazo también se audita.
const {
  obtenerUsuarioMock,
  registrarLogMock,
  crearAuthMock,
  eliminarAuthMock,
  upsertMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  registrarLogMock: vi.fn(),
  crearAuthMock: vi.fn(),
  eliminarAuthMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
  nuevoCorrelationId: () => 'corr-alta-usuario',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: (...args: unknown[]) => crearAuthMock(...args),
        deleteUser: (...args: unknown[]) => eliminarAuthMock(...args),
      },
    },
    from: () => ({
      upsert: (...args: unknown[]) => upsertMock(...args),
    }),
  }),
}));

import { crearUsuarioAccion } from '@/modulos/permisos/acciones/crear-usuario';

const ADMIN = {
  id: 'u-admin',
  email: 'admin@orca.local',
  nombreCompleto: 'Admin Uno',
  rol: 'admin' as const,
  activo: true,
  creadoEn: '2026-01-01T00:00:00Z',
  actualizadoEn: '2026-01-01T00:00:00Z',
  permisos: [],
};

const ENTRADA = {
  nombreCompleto: 'Nueva Persona',
  email: 'Nueva@Orca.local',
  password: 'ClaveSegura1',
  rol: 'gerente' as const,
};

const ALTA = { data: { user: { id: 'u-nuevo' } }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(ADMIN);
  crearAuthMock.mockResolvedValue(ALTA);
  eliminarAuthMock.mockResolvedValue({ error: null });
  upsertMock.mockResolvedValue({ error: null });
  registrarLogMock.mockResolvedValue(undefined);
});

describe('crearUsuarioAccion', () => {
  it('crea la cuenta con nombre y rol, asegura el perfil y audita el alta', async () => {
    const respuesta = await crearUsuarioAccion(ENTRADA);

    expect(respuesta).toEqual({ exito: true, datos: { id: 'u-nuevo' } });
    expect(crearAuthMock).toHaveBeenCalledWith({
      email: 'nueva@orca.local',
      password: 'ClaveSegura1',
      email_confirm: true,
      user_metadata: { nombre_completo: 'Nueva Persona', rol: 'gerente' },
    });
    expect(upsertMock).toHaveBeenCalledWith(
      {
        id: 'u-nuevo',
        email: 'nueva@orca.local',
        nombre_completo: 'Nueva Persona',
        rol: 'gerente',
        activo: true,
      },
      { onConflict: 'id' },
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      ADMIN,
      'crear_usuario',
      'usuarios',
      'u-nuevo',
      { rol: 'gerente', email: 'nueva@orca.local' },
      'corr-alta-usuario',
    );
  });

  it('solo admite a un administrador activo', async () => {
    obtenerUsuarioMock.mockResolvedValue({ ...ADMIN, rol: 'gerente' });

    const respuesta = await crearUsuarioAccion(ENTRADA);

    expect(respuesta).toEqual({
      exito: false,
      error: 'Solo un administrador activo puede crear usuarios',
    });
    expect(crearAuthMock).not.toHaveBeenCalled();
  });

  it('rechaza datos inválidos sin llamar a Auth', async () => {
    const respuesta = await crearUsuarioAccion({ ...ENTRADA, email: 'no-es-correo', password: 'corta' });

    expect(respuesta.exito).toBe(false);
    if (!respuesta.exito) expect(respuesta.error).toContain('correo');
    expect(crearAuthMock).not.toHaveBeenCalled();
  });

  it('traduce el correo duplicado y audita el rechazo', async () => {
    crearAuthMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    });

    const respuesta = await crearUsuarioAccion(ENTRADA);

    expect(respuesta).toEqual({ exito: false, error: 'Ya existe un usuario con ese correo' });
    expect(registrarLogMock).toHaveBeenCalledWith(
      ADMIN,
      'crear_usuario_rechazado',
      'usuarios',
      'nueva@orca.local',
      expect.objectContaining({ rol: 'gerente' }),
      'corr-alta-usuario',
    );
  });

  it('si el perfil no se puede crear, elimina la cuenta de Auth y avisa', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'fallo de perfil' } });

    const respuesta = await crearUsuarioAccion(ENTRADA);

    expect(respuesta).toEqual({
      exito: false,
      error: 'No se pudo completar el perfil del usuario',
    });
    expect(eliminarAuthMock).toHaveBeenCalledWith('u-nuevo');
  });
});
