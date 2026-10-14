// Obs. cliente 2026-10-13: guardar el ruteo devuelve el token CAS vigente de la
// revisión para poder guardar varios ítems seguidos (y costear) en un solo clic.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, tokenMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), tokenMock: vi.fn() }));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: async () => ({ id: 'usuario-1', activo: true }),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({ can: async () => true }));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  nuevoCorrelationId: () => 'correlacion-1',
  registrarLog: vi.fn(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    rpc: (...argumentos: unknown[]) => rpcMock(...argumentos),
    from: (tabla: string) => {
      const cadena = {
        select: () => cadena,
        eq: () => cadena,
        maybeSingle: async () => tokenMock(tabla),
      };
      return cadena;
    },
  }),
}));

import { editarRuteoItemAccion } from '@/modulos/propuestas/acciones/editar-ruteo-item';

const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROCESO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ENTRADA = {
  itemId: ITEM_ID,
  actualizadoEn: '2026-10-13T00:00:00+00:00',
  filas: [{ procesoId: PROCESO_ID, grupoEquipoId: null, setupHoras: 0, runHoras: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({
    data: { itemId: ITEM_ID, filas: 1, requiereRevisionRuteo: false },
    error: null,
  });
  tokenMock.mockImplementation(async (tabla: string) =>
    tabla === 'propuesta_items'
      ? { data: { revision_id: 'rev-1' }, error: null }
      : { data: { actualizado_en: '2026-10-13T00:05:00+00:00' }, error: null },
  );
});

describe('editarRuteoItemAccion — token para encadenar guardados', () => {
  it('devuelve el actualizado_en vigente de la revisión tras guardar', async () => {
    const respuesta = await editarRuteoItemAccion(ENTRADA);

    expect(respuesta).toEqual({
      exito: true,
      datos: {
        itemId: ITEM_ID,
        filas: 1,
        requiereRevisionRuteo: false,
        actualizadoEn: '2026-10-13T00:05:00+00:00',
      },
    });
  });

  it('si no se puede leer el token, el guardado ya hecho no se rompe', async () => {
    tokenMock.mockRejectedValue(new Error('sin conexión'));

    const respuesta = await editarRuteoItemAccion(ENTRADA);

    expect(respuesta.exito).toBe(true);
    expect(respuesta.exito && respuesta.datos?.actualizadoEn).toBeUndefined();
  });

  it('si la RPC rechaza, no lee ningún token', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'revision_desactualizada' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const respuesta = await editarRuteoItemAccion(ENTRADA);

    expect(respuesta.exito).toBe(false);
    expect(tokenMock).not.toHaveBeenCalled();
  });
});
