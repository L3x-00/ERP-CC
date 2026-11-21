// PLAN-3: la pausa administrativa solo la puede hacer un administrador con
// acceso a Producción, y la aprobación llama a la RPC con el actor correcto.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  usuario: { id: 'admin-1', rol: 'admin', activo: true },
  canMock: vi.fn(async () => true),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  cerrarMock: vi.fn(),
  registrarLogMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: async () => hoisted.usuario,
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({ can: hoisted.canMock }));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    rpc: (...args: unknown[]) => hoisted.rpcMock(...args),
    from: (...args: unknown[]) => hoisted.fromMock(...args),
  }),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => hoisted.registrarLogMock(...args),
  nuevoCorrelationId: () => '66666666-6666-4666-8666-666666666666',
}));
vi.mock('@/modulos/produccion/acciones/cerrar-sesion-supervisor', () => ({
  cerrarSesionSupervisorAccion: (...args: unknown[]) => hoisted.cerrarMock(...args),
}));

import {
  aprobarPausaAdministrativaAccion,
  pausarOperacionAdministrativaAccion,
} from '@/modulos/planeacion/acciones/pausa-administrativa';

const PROGRAMACION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function consultaSesion() {
  const enc: Record<string, unknown> = {
    then: (resolver: (v: unknown) => void) => resolver({ data: null, error: null }),
    select: () => enc,
    eq: () => enc,
    maybeSingle: () => enc,
  };
  return enc;
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.usuario.rol = 'admin';
  hoisted.canMock.mockResolvedValue(true);
  hoisted.cerrarMock.mockResolvedValue({ exito: true, datos: { id: SESION } });
  hoisted.rpcMock.mockResolvedValue({ data: true, error: null });
  hoisted.fromMock.mockImplementation((tabla: string) => {
    const base = consultaSesion();
    if (tabla === 'sesiones_trabajo') {
      return {
        ...base,
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: { id: SESION, piezas_producidas: 3, estado_sesion: 'activa' },
            error: null,
          }) }) }),
        }),
      };
    }
    return base;
  });
});

describe('PLAN-3 — pausa administrativa desde Planeación', () => {
  it('rechaza la pausa si el actor no es administrador', async () => {
    hoisted.usuario.rol = 'planeador';
    const respuesta = await pausarOperacionAdministrativaAccion({
      programacionId: PROGRAMACION,
      notas: 'Esperando autorización de cliente',
    });
    expect(respuesta.exito).toBe(false);
    expect('error' in respuesta ? respuesta.error : '').toContain('Solo un administrador');
    expect(hoisted.cerrarMock).not.toHaveBeenCalled();
  });

  it('reutiliza la acción de supervisor con el motivo PAUSA_ADMIN', async () => {
    const respuesta = await pausarOperacionAdministrativaAccion({
      programacionId: PROGRAMACION,
      notas: 'Esperando autorización de cliente',
    });
    expect(respuesta.exito).toBe(true);
    expect(hoisted.cerrarMock).toHaveBeenCalledOnce();
    expect(hoisted.cerrarMock.mock.calls[0][0]).toMatchObject({
      sesionId: SESION,
      piezasProducidas: 3,
      estadoDestino: 'pausada',
      motivoPausa: 'PAUSA_ADMIN',
      notas: 'Esperando autorización de cliente',
    });
  });

  it('aprueba la reanudación con el actor de Planeación', async () => {
    const respuesta = await aprobarPausaAdministrativaAccion({ programacionId: PROGRAMACION });
    expect(respuesta).toEqual({ exito: true, datos: { aprobada: true } });
    expect(hoisted.rpcMock).toHaveBeenCalledWith('aprobar_pausa_administrativa', {
      p_programacion_id: PROGRAMACION,
      p_actor_id: 'admin-1',
    });
  });
});
