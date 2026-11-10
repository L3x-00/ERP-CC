// Cliente 2026-11-10: guardar equipos/jornada de un recurso sin turnos debe
// registrar el turno base para que la consulta diaria y el calendario muestren
// las horas. La acción no debe tocar los turnos de un recurso ya configurado.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

const { usuarioMock, canMock, logMock, admin } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  canMock: vi.fn(),
  logMock: vi.fn(),
  admin: {
    actualizacion: undefined as unknown,
    turnos: [] as { turno: string }[],
    errorLectura: null as { message: string } | null,
    errorUpsert: null as { message: string } | null,
    upserts: [] as unknown[],
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
      if (tabla === 'recursos_planeacion') {
        const builder: Record<string, unknown> = {};
        builder.update = () => builder;
        builder.eq = () => builder;
        builder.select = () => builder;
        builder.maybeSingle = async () => admin.actualizacion;
        return builder;
      }
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.limit = async () => ({ data: admin.turnos, error: admin.errorLectura });
      builder.upsert = async (valores: unknown) => {
        admin.upserts.push(valores);
        return { error: admin.errorUpsert };
      };
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
  admin.turnos = [];
  admin.errorLectura = null;
  admin.errorUpsert = null;
  admin.upserts = [];
});

const ENTRADA = {
  recursoId: RECURSO_ID,
  cantidadEquipos: 1,
  jornadaOverrideHoras: null,
};

describe('actualizarCapacidadRecursoAccion (D-02)', () => {
  it('registra el turno matutino base de 8 h cuando el recurso no tiene turnos', async () => {
    const respuesta = await actualizarCapacidadRecursoAccion(ENTRADA);

    expect(respuesta).toEqual({ exito: true });
    expect(admin.upserts).toEqual([
      { recurso_id: RECURSO_ID, turno: 'matutino', horas_capacidad: 8 },
    ]);
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'actualizar_capacidad_recurso',
      'planeacion',
      RECURSO_ID,
      expect.objectContaining({ turnoBaseCreado: true }),
      'correlacion-prueba',
    );
  });

  it('no toca los turnos cuando el recurso ya tiene uno configurado', async () => {
    admin.turnos = [{ turno: 'vespertino' }];

    const respuesta = await actualizarCapacidadRecursoAccion(ENTRADA);

    expect(respuesta).toEqual({ exito: true });
    expect(admin.upserts).toEqual([]);
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'actualizar_capacidad_recurso',
      'planeacion',
      RECURSO_ID,
      expect.objectContaining({ turnoBaseCreado: false }),
      'correlacion-prueba',
    );
  });

  it('informa si no pudo registrar el turno base', async () => {
    admin.errorUpsert = { message: 'fallo' };

    const respuesta = await actualizarCapacidadRecursoAccion(ENTRADA);

    expect(respuesta.exito).toBe(false);
    if (!respuesta.exito) expect(respuesta.error).toContain('turno base');
  });

  it('exige permiso para configurar la capacidad', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await actualizarCapacidadRecursoAccion(ENTRADA);

    expect(respuesta.exito).toBe(false);
    expect(admin.upserts).toEqual([]);
    expect(logMock).not.toHaveBeenCalled();
  });
});
