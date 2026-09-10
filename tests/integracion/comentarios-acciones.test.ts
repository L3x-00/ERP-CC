import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  registrarLogMock,
  accesoEntidadMock,
  usuariosMencionablesMock,
  insertarComentarioMock,
  extraerMencionesMock,
  obtenerComentarioMock,
  eliminarComentarioMock,
  marcarNotificacionMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  registrarLogMock: vi.fn(),
  accesoEntidadMock: vi.fn(),
  usuariosMencionablesMock: vi.fn(),
  insertarComentarioMock: vi.fn(),
  extraerMencionesMock: vi.fn(),
  obtenerComentarioMock: vi.fn(),
  eliminarComentarioMock: vi.fn(),
  marcarNotificacionMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ nombre: 'cliente-admin-pruebas' }),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: async () => ({ nombre: 'cliente-sesion-pruebas' }),
}));
vi.mock('@/modulos/comentarios/servicios/indice', () => ({
  usuarioPuedeVerEntidadComentario: (...args: unknown[]) => accesoEntidadMock(...args),
  obtenerUsuariosMencionables: (...args: unknown[]) => usuariosMencionablesMock(...args),
  insertarComentario: (...args: unknown[]) => insertarComentarioMock(...args),
  extraerMencionesYSanitizar: (...args: unknown[]) => extraerMencionesMock(...args),
  obtenerComentarioPorId: (...args: unknown[]) => obtenerComentarioMock(...args),
  eliminarComentario: (...args: unknown[]) => eliminarComentarioMock(...args),
  marcarNotificacionComoLeida: (...args: unknown[]) => marcarNotificacionMock(...args),
  mensajeErrorComentarios: () => 'No se pudo completar la operación de comentarios',
}));

import { agregarComentarioAccion } from '@/modulos/comentarios/acciones/agregar-comentario';
import { eliminarComentarioAccion } from '@/modulos/comentarios/acciones/eliminar-comentario';
import { marcarNotificacionesLeidasAccion } from '@/modulos/comentarios/acciones/marcar-notificaciones-leidas';

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'vendedor@orca.test',
  nombreCompleto: 'Vendedor de pruebas',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-09-10T10:00:00.000Z',
  actualizadoEn: '2026-09-10T10:00:00.000Z',
  permisos: ['ver_clientes'] as const,
};

const GERENTE = {
  id: '22222222-2222-4222-8222-222222222222',
  nombre: 'Gerente de pruebas',
};

const ENTRADA = {
  entidadTipo: 'cliente' as const,
  entidadId: '33333333-3333-4333-8333-333333333333',
  contenido: 'Necesitamos confirmar el material',
};

const COMENTARIO = {
  id: '44444444-4444-4444-8444-444444444444',
  entidadTipo: 'cliente' as const,
  entidadId: ENTRADA.entidadId,
  autorId: USUARIO.id,
  autorNombre: USUARIO.nombreCompleto,
  autorAvatarUrl: null,
  contenido: 'Necesitamos confirmar el material',
  menciones: [],
  archivosAdjuntos: [],
  editado: false,
  eliminado: false,
  creadoEn: '2026-09-10T10:00:00.000Z',
  actualizadoEn: '2026-09-10T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO);
  registrarLogMock.mockResolvedValue(undefined);
  accesoEntidadMock.mockResolvedValue(true);
  usuariosMencionablesMock.mockResolvedValue([GERENTE]);
  extraerMencionesMock.mockReturnValue({
    textoLimpio: '&lt;b&gt;Revisar&lt;/b&gt; @Gerente de pruebas',
    mencionesJson: [GERENTE.id],
  });
  insertarComentarioMock.mockResolvedValue(COMENTARIO);
  obtenerComentarioMock.mockResolvedValue({
    id: COMENTARIO.id,
    autor_id: USUARIO.id,
    entidad_tipo: 'cliente',
    entidad_id: ENTRADA.entidadId,
  });
  eliminarComentarioMock.mockResolvedValue(undefined);
  marcarNotificacionMock.mockResolvedValue(undefined);
});

describe('seguridad de acciones de comentarios', () => {
  it('rechaza crear un comentario cuando la entidad no es accesible', async () => {
    accesoEntidadMock.mockResolvedValue(false);

    const respuesta = await agregarComentarioAccion(ENTRADA);

    expect(respuesta).toEqual({ exito: false, error: 'No tienes acceso a este registro' });
    expect(usuariosMencionablesMock).not.toHaveBeenCalled();
    expect(insertarComentarioMock).not.toHaveBeenCalled();
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'agregar_comentario_rechazado',
      'comentarios',
      ENTRADA.entidadId,
      expect.objectContaining({ motivo: 'entidad_no_disponible' }),
    );
  });

  it('sanitiza el contenido y limita las menciones a usuarios activos', async () => {
    const respuesta = await agregarComentarioAccion({
      ...ENTRADA,
      contenido: '<b>Revisar</b> @Gerente de pruebas',
      menciones: [GERENTE.id, '99999999-9999-4999-8999-999999999999'],
    });

    expect(respuesta).toEqual({ exito: true, datos: COMENTARIO });
    expect(extraerMencionesMock).toHaveBeenCalledWith(
      '<b>Revisar</b> @Gerente de pruebas',
      [GERENTE],
    );
    expect(insertarComentarioMock).toHaveBeenCalledWith(
      { nombre: 'cliente-admin-pruebas' },
      expect.objectContaining({ entidadId: ENTRADA.entidadId }),
      '&lt;b&gt;Revisar&lt;/b&gt; @Gerente de pruebas',
      [GERENTE.id],
      USUARIO.id,
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'agregar_comentario',
      'comentarios',
      COMENTARIO.id,
      expect.objectContaining({ menciones: 1 }),
    );
  });

  it('impide eliminar un comentario ajeno sin permiso administrativo', async () => {
    obtenerComentarioMock.mockResolvedValue({
      id: COMENTARIO.id,
      autor_id: GERENTE.id,
      entidad_tipo: 'cliente',
      entidad_id: ENTRADA.entidadId,
    });

    const respuesta = await eliminarComentarioAccion({ comentarioId: COMENTARIO.id });

    expect(respuesta).toEqual({ exito: false, error: 'No puedes eliminar este comentario' });
    expect(eliminarComentarioMock).not.toHaveBeenCalled();
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'eliminar_comentario_rechazado',
      'comentarios',
      COMENTARIO.id,
      expect.objectContaining({ motivo: 'autoría' }),
    );
  });

  it('permite al autor eliminar de forma lógica un comentario propio y audita', async () => {
    const respuesta = await eliminarComentarioAccion({ comentarioId: COMENTARIO.id });

    expect(respuesta).toEqual({ exito: true });
    expect(eliminarComentarioMock).toHaveBeenCalledWith(
      { nombre: 'cliente-admin-pruebas' },
      COMENTARIO.id,
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'eliminar_comentario',
      'comentarios',
      COMENTARIO.id,
      expect.objectContaining({ entidadTipo: 'cliente' }),
    );
  });

  it('permite al administrador moderar un comentario ajeno', async () => {
    obtenerUsuarioMock.mockResolvedValue({ ...USUARIO, rol: 'admin', permisos: [] });
    obtenerComentarioMock.mockResolvedValue({
      id: COMENTARIO.id,
      autor_id: GERENTE.id,
      entidad_tipo: 'cliente',
      entidad_id: ENTRADA.entidadId,
    });

    const respuesta = await eliminarComentarioAccion({ comentarioId: COMENTARIO.id });

    expect(respuesta).toEqual({ exito: true });
    expect(eliminarComentarioMock).toHaveBeenCalledTimes(1);
  });

  it('marca únicamente la notificación del usuario de sesión', async () => {
    const notificacionId = '55555555-5555-4555-8555-555555555555';

    const respuesta = await marcarNotificacionesLeidasAccion({ notificacionId });

    expect(respuesta).toEqual({ exito: true });
    expect(marcarNotificacionMock).toHaveBeenCalledWith(
      { nombre: 'cliente-admin-pruebas' },
      notificacionId,
      USUARIO.id,
    );
  });
});
