import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usuarioMock, clienteMock, oportunidadMock, urlMock, logMock } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  clienteMock: vi.fn(),
  oportunidadMock: vi.fn(),
  urlMock: vi.fn(),
  logMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: () => clienteMock(),
}));
vi.mock('@/modulos/pipeline/servicios/obtener-oportunidad-por-id', () => ({
  obtenerOportunidadPorId: (...argumentos: unknown[]) => oportunidadMock(...argumentos),
}));
vi.mock('@/nucleo/almacenamiento/descargar-archivo', () => ({
  crearUrlDescarga: (...argumentos: unknown[]) => urlMock(...argumentos),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...argumentos: unknown[]) => logMock(...argumentos),
}));

import { listarAdjuntosOportunidad } from '@/modulos/pipeline/servicios/listar-adjuntos';
import { obtenerAdjuntosAccion } from '@/modulos/pipeline/acciones/obtener-adjuntos';
import { obtenerUrlAdjuntoAccion } from '@/modulos/pipeline/acciones/obtener-url-adjunto';
import { eliminarAdjuntoAccion } from '@/modulos/pipeline/acciones/eliminar-adjunto';

const PIPELINE = '11111111-1111-4111-8111-111111111111';

function clienteConLista(objetos: unknown[]) {
  return {
    storage: {
      from: () => ({
        list: async () => ({ data: objetos, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue({ id: 'u1', activo: true, rol: 'vendedor' });
  oportunidadMock.mockResolvedValue({ oportunidad: { id: PIPELINE }, lineas: [] });
});

describe('listarAdjuntosOportunidad', () => {
  it('mapea nombre/tamaño/tipo/fecha y descarta el marcador de carpeta', async () => {
    const cliente = clienteConLista([
      { id: null, name: '.emptyFolderPlaceholder', metadata: null, created_at: null },
      {
        id: 'a1',
        name: '1726000000000-plano-cliente.dxf',
        metadata: { size: 2048, mimetype: 'image/vnd.dxf' },
        created_at: '2026-09-15T00:00:00.000Z',
      },
    ]);
    const adjuntos = await listarAdjuntosOportunidad(cliente as never, PIPELINE);
    expect(adjuntos).toHaveLength(1);
    expect(adjuntos[0]).toMatchObject({
      ruta: `${PIPELINE}/1726000000000-plano-cliente.dxf`,
      nombre: 'plano-cliente.dxf',
      tamano: 2048,
      tipo: 'image/vnd.dxf',
      creadoEn: '2026-09-15T00:00:00.000Z',
    });
  });
});

describe('obtenerAdjuntosAccion', () => {
  it('rechaza sin sesión y con id inválido', async () => {
    usuarioMock.mockResolvedValueOnce(null);
    await expect(obtenerAdjuntosAccion(PIPELINE)).resolves.toMatchObject({ exito: false });
    await expect(obtenerAdjuntosAccion('no-uuid')).resolves.toMatchObject({ exito: false });
  });

  it('devuelve la lista cuando la oportunidad es accesible', async () => {
    clienteMock.mockResolvedValue(clienteConLista([
      { id: 'a1', name: '10-plano.dxf', metadata: { size: 10, mimetype: 'x' }, created_at: '2026-09-15T00:00:00.000Z' },
    ]));
    const resultado = await obtenerAdjuntosAccion(PIPELINE);
    expect(resultado.exito).toBe(true);
    if (resultado.exito) expect(resultado.datos).toHaveLength(1);
  });
});

describe('guardas de ruta de adjuntos', () => {
  it('obtenerUrlAdjuntoAccion rechaza una ruta fuera de la carpeta de la oportunidad', async () => {
    clienteMock.mockResolvedValue(clienteConLista([]));
    urlMock.mockResolvedValue('https://firmada');
    const ajena = await obtenerUrlAdjuntoAccion({ pipelineId: PIPELINE, ruta: '99999999-9999-9999-9999-999999999999/x.dxf' });
    expect(ajena).toMatchObject({ exito: false });
    expect(urlMock).not.toHaveBeenCalled();

    const traversal = await obtenerUrlAdjuntoAccion({ pipelineId: PIPELINE, ruta: `${PIPELINE}/../otro/x.dxf` });
    expect(traversal).toMatchObject({ exito: false });

    const valida = await obtenerUrlAdjuntoAccion({ pipelineId: PIPELINE, ruta: `${PIPELINE}/10-plano.dxf` });
    expect(valida).toMatchObject({ exito: true });
  });

  it('eliminarAdjuntoAccion rechaza ruta ajena y registra al eliminar la propia', async () => {
    clienteMock.mockResolvedValue(clienteConLista([]));
    const ajena = await eliminarAdjuntoAccion({ pipelineId: PIPELINE, ruta: 'otra/x.dxf' });
    expect(ajena).toMatchObject({ exito: false });
    expect(logMock).not.toHaveBeenCalled();

    const propia = await eliminarAdjuntoAccion({ pipelineId: PIPELINE, ruta: `${PIPELINE}/10-plano.dxf` });
    expect(propia).toMatchObject({ exito: true });
    expect(logMock).toHaveBeenCalledOnce();
  });
});
