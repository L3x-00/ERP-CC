// C24: guardar equipos y jornada solo persiste esos dos datos. La jornada es
// continua y el turno es una etiqueta visual, así que la acción ya no crea ni
// modifica filas de `capacidades_recurso_turno`.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

const { usuarioMock, canMock, logMock, admin } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  canMock: vi.fn(),
  logMock: vi.fn(),
  admin: {
    actualizacion: undefined as unknown,
    tablasTocadas: [] as string[],
  },
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => logMock(...args),
  nuevoCorrelationId: () => 'correlacion-prueba',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: (tabla: string) => {
      admin.tablasTocadas.push(tabla);
      const builder: Record<string, unknown> = {};
      builder.update = () => builder;
      builder.eq = () => builder;
      builder.select = () => builder;
      builder.maybeSingle = async () => admin.actualizacion;
      return builder;
    },
  }),
}));

import { actualizarCapacidadRecursoAccion } from '@/modulos/planeacion/acciones/actualizar-capacidad-recurso';

const RECURSO_ID = '44444444-4444-4444-8444-444444444444';

const USUARIO: UsuarioAutenticado = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'planeacion@orca.local',
  nombreCompleto: 'Planeación',
  rol: 'admin',
  activo: true,
  permisos: ['gestionar_planeacion'],
  creadoEn: '2026-11-10T00:00:00.000Z',
  actualizadoEn: '2026-11-10T00:00:00.000Z',
};

const RECURSO_ACTUALIZADO = {
  data: {
    id: RECURSO_ID,
    cantidad_equipos: 1,
    capacidad_jornada_override_horas: null,
  },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  logMock.mockResolvedValue(undefined);
  admin.actualizacion = RECURSO_ACTUALIZADO;
  admin.tablasTocadas = [];
});

const ENTRADA = {
  recursoId: RECURSO_ID,
  cantidadEquipos: 1,
  jornadaOverrideHoras: null,
};

describe('actualizarCapacidadRecursoAccion (D-02/C24)', () => {
  it('solo persiste equipos y jornada, sin registrar turnos', async () => {
    const respuesta = await actualizarCapacidadRecursoAccion(ENTRADA);

    expect(respuesta).toEqual({ exito: true });
    expect(admin.tablasTocadas).toEqual(['recursos_planeacion']);
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'actualizar_capacidad_recurso',
      'planeacion',
      RECURSO_ID,
      {
        cantidadEquipos: 1,
        jornadaOverrideHoras: null,
      },
      'correlacion-prueba',
    );
  });

  it('rechaza una jornada mayor a 8 h de lunes a viernes', async () => {
    const respuesta = await actualizarCapacidadRecursoAccion({
      ...ENTRADA,
      jornadaOverrideHoras: 9,
    });

    expect(respuesta.exito).toBe(false);
    if (!respuesta.exito) expect(respuesta.error).toContain('8 h');
    expect(admin.tablasTocadas).toEqual([]);
  });

  it('informa si el recurso ya no existe', async () => {
    admin.actualizacion = { data: null, error: null };

    const respuesta = await actualizarCapacidadRecursoAccion(ENTRADA);

    expect(respuesta.exito).toBe(false);
    if (!respuesta.exito) expect(respuesta.error).toContain('no existe');
  });

  it('exige permiso para configurar la capacidad', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await actualizarCapacidadRecursoAccion(ENTRADA);

    expect(respuesta.exito).toBe(false);
    expect(admin.tablasTocadas).toEqual([]);
    expect(logMock).not.toHaveBeenCalled();
  });
});
