import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usuarioMock, clienteMock, adminMock, oportunidadMock, urlMock, logMock } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  clienteMock: vi.fn(),
  adminMock: vi.fn(),
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
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => adminMock(),
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

/** Simula la cadena de PostgREST: select().eq().eq().eq().order().limit(). */
function clienteConArchivos(filas: unknown[]) {
  const cadena: Record<string, unknown> = {};
  const encadenar = (): Record<string, unknown> => cadena;
  Object.assign(cadena, {
    select: encadenar,
    eq: encadenar,
    order: encadenar,
    limit: async () => ({ data: filas, error: null }),
  });
  return {
    from: () => cadena,
    storage: {
      from: () => ({
        remove: async () => ({ data: [], error: null }),
      }),
    },
  };
}

function adminConCatalogo() {
  return {
    from: () => ({
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue({ id: 'u1', activo: true, rol: 'vendedor' });
  oportunidadMock.mockResolvedValue({ oportunidad: { id: PIPELINE }, lineas: [] });
  adminMock.mockReturnValue(adminConCatalogo());
});

describe('listarAdjuntosOportunidad', () => {
  it('mapea los metadatos vigentes del modelo único de archivos', async () => {
    const cliente = clienteConArchivos([
      {
        id: 'a1',
        ruta_storage: `rfq/${PIPELINE}/uuid-plano-cliente.dxf`,
        nombre_original: 'plano-cliente.dxf',
        tamano_bytes: 2048,
        mime: 'image/vnd.dxf',
        creado_en: '2026-09-15T00:00:00.000Z',
      },
    ]);
    const adjuntos = await listarAdjuntosOportunidad(cliente as never, PIPELINE);
    expect(adjuntos).toHaveLength(1);
    expect(adjuntos[0]).toMatchObject({
      id: 'a1',
      ruta: `rfq/${PIPELINE}/uuid-plano-cliente.dxf`,
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
    clienteMock.mockResolvedValue(
      clienteConArchivos([
        {
          id: 'a1',
          ruta_storage: `rfq/${PIPELINE}/uuid-plano.dxf`,
          nombre_original: 'plano.dxf',
          tamano_bytes: 10,
          mime: 'image/vnd.dxf',
          creado_en: '2026-09-15T00:00:00.000Z',
        },
      ]),
    );
    const resultado = await obtenerAdjuntosAccion(PIPELINE);
    expect(resultado.exito).toBe(true);
    if (resultado.exito) expect(resultado.datos).toHaveLength(1);
  });
});

describe('guardas de ruta de adjuntos', () => {
  it('obtenerUrlAdjuntoAccion rechaza una ruta fuera de la carpeta de la oportunidad', async () => {
    clienteMock.mockResolvedValue(clienteConArchivos([]));
    urlMock.mockResolvedValue('https://firmada');
    const ajena = await obtenerUrlAdjuntoAccion({
      pipelineId: PIPELINE,
      ruta: '99999999-9999-9999-9999-999999999999/x.dxf',
    });
    expect(ajena).toMatchObject({ exito: false });
    expect(urlMock).not.toHaveBeenCalled();

    const traversal = await obtenerUrlAdjuntoAccion({
      pipelineId: PIPELINE,
      ruta: `${PIPELINE}/../otro/x.dxf`,
    });
    expect(traversal).toMatchObject({ exito: false });

    const historica = await obtenerUrlAdjuntoAccion({
      pipelineId: PIPELINE,
      ruta: `${PIPELINE}/10-plano.dxf`,
    });
    expect(historica).toMatchObject({ exito: true });

    const nueva = await obtenerUrlAdjuntoAccion({
      pipelineId: PIPELINE,
      ruta: `rfq/${PIPELINE}/uuid-plano.dxf`,
    });
    expect(nueva).toMatchObject({ exito: true });
  });

  it('eliminarAdjuntoAccion rechaza ruta ajena y registra al eliminar la propia', async () => {
    clienteMock.mockResolvedValue(clienteConArchivos([]));
    const ajena = await eliminarAdjuntoAccion({ pipelineId: PIPELINE, ruta: 'otra/x.dxf' });
    expect(ajena).toMatchObject({ exito: false });
    expect(logMock).not.toHaveBeenCalled();

    const propia = await eliminarAdjuntoAccion({
      pipelineId: PIPELINE,
      ruta: `rfq/${PIPELINE}/uuid-plano.dxf`,
    });
    expect(propia).toMatchObject({ exito: true });
    expect(logMock).toHaveBeenCalledOnce();
  });
});
