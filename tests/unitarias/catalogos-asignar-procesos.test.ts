// Aclaración cliente 2026-11-06 (punto 11): el alta guiada del grupo vincula
// procesos compatibles con una RPC. Este test fija el nombre real de la RPC y
// sus argumentos, como exige la convención del repo para Server Actions.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, canMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  canMock: vi.fn(async () => true),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: async () => ({ id: 'usuario-1', activo: true }),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({ can: canMock }));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: (...argumentos: unknown[]) => rpcMock(...argumentos) }),
}));

import { asignarProcesosAGrupoAccion } from '@/modulos/catalogos/acciones/asignar-procesos-grupo';

const GRUPO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROCESO_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROCESO_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

beforeEach(() => {
  vi.clearAllMocks();
  canMock.mockResolvedValue(true);
  rpcMock.mockResolvedValue({ data: 2, error: null });
});

describe('asignarProcesosAGrupoAccion', () => {
  it('llama a la RPC con el grupo, los procesos y el actor', async () => {
    const respuesta = await asignarProcesosAGrupoAccion({
      grupoId: GRUPO_ID,
      procesoIds: [PROCESO_1, PROCESO_2],
    });

    expect(respuesta).toEqual({ exito: true, datos: { procesos: 2 } });
    expect(rpcMock).toHaveBeenCalledWith('asignar_procesos_a_grupo_equipo', {
      p_grupo_id: GRUPO_ID,
      p_proceso_ids: [PROCESO_1, PROCESO_2],
      p_actor_id: 'usuario-1',
    });
  });

  it('rechaza entradas inválidas sin llamar a la RPC', async () => {
    const respuesta = await asignarProcesosAGrupoAccion({
      grupoId: 'no-uuid',
      procesoIds: [],
    });

    expect(respuesta.exito).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('exige permiso de catálogos', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await asignarProcesosAGrupoAccion({
      grupoId: GRUPO_ID,
      procesoIds: [PROCESO_1],
    });

    expect(respuesta).toMatchObject({ exito: false, error: 'Sin permiso para editar catálogos' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('traduce el error de la RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'sin_permiso_catalogo' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const respuesta = await asignarProcesosAGrupoAccion({
      grupoId: GRUPO_ID,
      procesoIds: [PROCESO_1],
    });

    expect(respuesta).toMatchObject({ exito: false });
  });
});
