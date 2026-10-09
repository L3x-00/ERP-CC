// C3.1 / C2.3: un ítem nacido en una revisión B..Z debe poder recibir archivos
// propios (`entidad='propuesta_item'`). La acción revalida sesión, permiso,
// revisión DRAFT y pertenencia exacta del ítem a esa revisión en los dos pasos
// (preparar y confirmar): la revisión puede enviarse —y congelarse— entre ambos.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  adminMock,
  usuarioMock,
  canMock,
  prepararMock,
  confirmarMock,
  descartarMock,
  registrarArchivoMock,
  registrarLogMock,
} = vi.hoisted(() => ({
  adminMock: vi.fn(),
  usuarioMock: vi.fn(),
  canMock: vi.fn(),
  prepararMock: vi.fn(),
  confirmarMock: vi.fn(),
  descartarMock: vi.fn(),
  registrarArchivoMock: vi.fn(),
  registrarLogMock: vi.fn(),
}));

vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => adminMock(),
}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/almacenamiento/archivos/subida-directa', () => ({
  prepararSubidaDirecta: (...argumentos: unknown[]) => prepararMock(...argumentos),
  confirmarSubidaDirecta: (...argumentos: unknown[]) => confirmarMock(...argumentos),
  descartarSubidaDirecta: (...argumentos: unknown[]) => descartarMock(...argumentos),
}));
vi.mock('@/nucleo/almacenamiento/archivos/servicio', () => ({
  registrarArchivo: (...argumentos: unknown[]) => registrarArchivoMock(...argumentos),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  nuevoCorrelationId: () => 'correlacion-fija',
  registrarLog: (...argumentos: unknown[]) => registrarLogMock(...argumentos),
}));

import {
  confirmarArchivoPropuestaAccion,
  prepararSubidaArchivoPropuestaAccion,
} from '@/modulos/propuestas/acciones/subir-archivo-propuesta';
import {
  esquemaConfirmarSubidaArchivoPropuesta,
  esquemaPrepararSubidaArchivoPropuesta,
} from '@/modulos/propuestas/validaciones/esquemas-archivos-propuesta';

const REVISION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REVISION_ENVIADA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_OTRA_REVISION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ITEM_INACTIVO_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ITEM_FANTASMA_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const ARCHIVO_ID = '22222222-2222-4222-8222-222222222222';
const BUCKET = 'propuestas-archivos';
const RUTA_ITEM = `propuesta_item/${ITEM_ID}/${USUARIO_ID}/33333333-3333-4333-8333-333333333333.dxf`;
const RUTA_REVISION = `propuesta_revision/${REVISION_ID}/${USUARIO_ID}/44444444-4444-4444-8444-444444444444.pdf`;

type Fila = Record<string, unknown>;

/** Cadena mínima de PostgREST: `from(tabla).select().eq()…maybeSingle()`. */
function clienteFalso(tablas: Record<string, Fila[]>) {
  const consultas: { tabla: string; columnas: string; filtros: Fila }[] = [];
  return {
    from(tabla: string) {
      const filtros: Fila = {};
      let columnas = '';
      const cadena = {
        select: (seleccion: string) => {
          columnas = seleccion;
          return cadena;
        },
        eq: (columna: string, valor: unknown) => {
          filtros[columna] = valor;
          return cadena;
        },
        maybeSingle: async () => {
          consultas.push({ tabla, columnas, filtros });
          const fila = (tablas[tabla] ?? []).find((candidata) =>
            Object.entries(filtros).every(([columna, valor]) => candidata[columna] === valor),
          );
          return { data: fila ?? null, error: null };
        },
      };
      return cadena;
    },
    consultas,
  };
}

function tablasBase(): Record<string, Fila[]> {
  return {
    propuesta_revisiones: [
      { id: REVISION_ID, estado: 'DRAFT' },
      { id: REVISION_ENVIADA_ID, estado: 'SENT' },
    ],
    propuesta_items: [
      { id: ITEM_ID, revision_id: REVISION_ID, activo: true },
      { id: ITEM_OTRA_REVISION_ID, revision_id: REVISION_ENVIADA_ID, activo: true },
      { id: ITEM_INACTIVO_ID, revision_id: REVISION_ID, activo: false },
    ],
  };
}

function conTablas(tablas: Record<string, Fila[]> = tablasBase()) {
  const cliente = clienteFalso(tablas);
  adminMock.mockReturnValue(cliente);
  return cliente;
}

const METADATOS_ITEM = {
  revisionId: REVISION_ID,
  itemId: ITEM_ID,
  tema: 'tecnico' as const,
  nombreArchivo: 'brida.dxf',
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue({ id: USUARIO_ID, rol: 'vendedor', activo: true });
  canMock.mockResolvedValue(true);
  prepararMock.mockResolvedValue({
    ok: true,
    datos: { bucket: BUCKET, ruta: RUTA_ITEM, token: 'token', mime: 'application/octet-stream' },
  });
  confirmarMock.mockImplementation(
    async (
      _admin: unknown,
      _carga: unknown,
      vincular: (objeto: { tamano: number; mime: string }) => Promise<unknown>,
    ) => ({ ok: true, datos: await vincular({ tamano: 4096, mime: 'application/octet-stream' }) }),
  );
  registrarArchivoMock.mockResolvedValue({ id: ARCHIVO_ID, version: 2 });
  registrarLogMock.mockResolvedValue(undefined);
});

describe('esquemas de archivo de propuesta — destino opcional por ítem', () => {
  const destino = { revisionId: REVISION_ID, nombreArchivo: 'brida.dxf', tema: 'tecnico' };

  it('acepta la cabecera de la revisión sin itemId', () => {
    expect(
      esquemaPrepararSubidaArchivoPropuesta.safeParse({ ...destino, tamano: 10, mime: '' }).success,
    ).toBe(true);
    expect(
      esquemaConfirmarSubidaArchivoPropuesta.safeParse({ ...destino, ruta: RUTA_REVISION }).success,
    ).toBe(true);
  });

  it('acepta un ítem de la revisión como destino', () => {
    expect(
      esquemaPrepararSubidaArchivoPropuesta.safeParse({
        ...destino,
        itemId: ITEM_ID,
        tamano: 10,
        mime: '',
      }).success,
    ).toBe(true);
    expect(
      esquemaConfirmarSubidaArchivoPropuesta.safeParse({
        ...destino,
        itemId: ITEM_ID,
        ruta: RUTA_ITEM,
      }).success,
    ).toBe(true);
  });

  it('rechaza un itemId que no es UUID y los campos extra', () => {
    expect(
      esquemaPrepararSubidaArchivoPropuesta.safeParse({
        ...destino,
        itemId: 'IT01',
        tamano: 10,
        mime: '',
      }).success,
    ).toBe(false);
    expect(
      esquemaConfirmarSubidaArchivoPropuesta.safeParse({
        ...destino,
        ruta: RUTA_ITEM,
        archivo: 'binario',
      }).success,
    ).toBe(false);
  });

  it('aplica el tema general por omisión', () => {
    const analisis = esquemaPrepararSubidaArchivoPropuesta.safeParse({
      revisionId: REVISION_ID,
      nombreArchivo: 'brida.dxf',
      tamano: 10,
      mime: '',
    });
    expect(analisis.success && analisis.data.tema).toBe('general');
  });
});

describe('prepararSubidaArchivoPropuestaAccion — destino del ítem', () => {
  it('firma la subida bajo el perfil y la ruta del ítem', async () => {
    conTablas();

    const respuesta = await prepararSubidaArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      tamano: 4096,
      mime: 'application/octet-stream',
    });

    expect(respuesta.exito).toBe(true);
    expect(prepararMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bucket: BUCKET,
        entidad: 'propuesta_item',
        entidadId: ITEM_ID,
        usuarioId: USUARIO_ID,
        solicitud: { nombre: 'brida.dxf', tamano: 4096, mime: 'application/octet-stream' },
      }),
    );
  });

  it('conserva el contrato de la cabecera cuando no hay ítem', async () => {
    const cliente = conTablas();

    const respuesta = await prepararSubidaArchivoPropuestaAccion({
      revisionId: REVISION_ID,
      tema: 'general',
      nombreArchivo: 'cotizacion.pdf',
      tamano: 1024,
      mime: 'application/pdf',
    });

    expect(respuesta.exito).toBe(true);
    expect(prepararMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entidad: 'propuesta_revision', entidadId: REVISION_ID }),
    );
    expect(cliente.consultas.some((consulta) => consulta.tabla === 'propuesta_items')).toBe(false);
  });

  it('rechaza un ítem de otra revisión', async () => {
    conTablas();

    const respuesta = await prepararSubidaArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      itemId: ITEM_OTRA_REVISION_ID,
      tamano: 4096,
      mime: '',
    });

    expect(respuesta).toEqual({ exito: false, error: 'El ítem no pertenece a esta revisión' });
    expect(prepararMock).not.toHaveBeenCalled();
  });

  it('rechaza un ítem inexistente', async () => {
    conTablas();

    const respuesta = await prepararSubidaArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      itemId: ITEM_FANTASMA_ID,
      tamano: 4096,
      mime: '',
    });

    expect(respuesta).toEqual({ exito: false, error: 'El ítem no pertenece a esta revisión' });
    expect(prepararMock).not.toHaveBeenCalled();
  });

  it('rechaza un ítem dado de baja como destino nuevo', async () => {
    conTablas();

    const respuesta = await prepararSubidaArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      itemId: ITEM_INACTIVO_ID,
      tamano: 4096,
      mime: '',
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'No se adjuntan archivos a un ítem dado de baja',
    });
    expect(prepararMock).not.toHaveBeenCalled();
  });

  it('rechaza una revisión ya enviada', async () => {
    conTablas();

    const respuesta = await prepararSubidaArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      revisionId: REVISION_ENVIADA_ID,
      itemId: ITEM_OTRA_REVISION_ID,
      tamano: 4096,
      mime: '',
    });

    expect(respuesta.exito).toBe(false);
    expect(prepararMock).not.toHaveBeenCalled();
  });

  it('exige sesión y permiso antes de mirar el ítem', async () => {
    const cliente = conTablas();
    usuarioMock.mockResolvedValue(null);

    expect(
      await prepararSubidaArchivoPropuestaAccion({ ...METADATOS_ITEM, tamano: 1, mime: '' }),
    ).toEqual({ exito: false, error: 'No autorizado' });

    usuarioMock.mockResolvedValue({ id: USUARIO_ID, rol: 'vendedor', activo: true });
    canMock.mockResolvedValue(false);
    const sinPermiso = await prepararSubidaArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      tamano: 1,
      mime: '',
    });

    expect(sinPermiso.exito).toBe(false);
    expect(canMock).toHaveBeenCalledWith(expect.anything(), 'propuesta_editar_articulo');
    expect(cliente.consultas.some((consulta) => consulta.tabla === 'propuesta_items')).toBe(false);
    expect(prepararMock).not.toHaveBeenCalled();
  });
});

describe('confirmarArchivoPropuestaAccion — metadata del ítem', () => {
  it('registra el archivo contra el ítem y audita el destino', async () => {
    conTablas();

    const respuesta = await confirmarArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      ruta: RUTA_ITEM,
    });

    expect(respuesta).toEqual({ exito: true, datos: { id: ARCHIVO_ID, version: 2 } });
    expect(confirmarMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bucket: BUCKET,
        entidad: 'propuesta_item',
        entidadId: ITEM_ID,
        usuarioId: USUARIO_ID,
        ruta: RUTA_ITEM,
        nombre: 'brida.dxf',
      }),
      expect.any(Function),
    );
    expect(registrarArchivoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entidad: 'propuesta_item',
        entidadId: ITEM_ID,
        temaCodigo: 'tecnico',
        clase: 'tecnico',
        nombreOriginal: 'brida.dxf',
        nombreErp: 'brida.dxf',
        bucket: BUCKET,
        rutaStorage: RUTA_ITEM,
        subidoPor: USUARIO_ID,
      }),
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      expect.anything(),
      'subir_archivo_propuesta',
      'propuestas',
      REVISION_ID,
      { archivoId: ARCHIVO_ID, tema: 'tecnico', version: 2, itemId: ITEM_ID },
      'correlacion-fija',
    );
  });

  it('conserva el contrato de la cabecera', async () => {
    conTablas();

    const respuesta = await confirmarArchivoPropuestaAccion({
      revisionId: REVISION_ID,
      tema: 'general',
      nombreArchivo: 'cotizacion.pdf',
      ruta: RUTA_REVISION,
    });

    expect(respuesta.exito).toBe(true);
    expect(registrarArchivoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entidad: 'propuesta_revision', entidadId: REVISION_ID }),
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      expect.anything(),
      'subir_archivo_propuesta',
      'propuestas',
      REVISION_ID,
      { archivoId: ARCHIVO_ID, tema: 'general', version: 2 },
      'correlacion-fija',
    );
  });

  it('revalida el estado de la revisión al confirmar', async () => {
    const tablas = tablasBase();
    tablas.propuesta_revisiones = [{ id: REVISION_ID, estado: 'SENT' }];
    conTablas(tablas);

    const respuesta = await confirmarArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      ruta: RUTA_ITEM,
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'Solo se adjuntan archivos a revisiones en borrador',
    });
    expect(confirmarMock).not.toHaveBeenCalled();
    expect(registrarArchivoMock).not.toHaveBeenCalled();
  });

  it('revalida la pertenencia del ítem al confirmar', async () => {
    const tablas = tablasBase();
    tablas.propuesta_items = [{ id: ITEM_ID, revision_id: REVISION_ENVIADA_ID, activo: true }];
    conTablas(tablas);

    const respuesta = await confirmarArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      ruta: RUTA_ITEM,
    });

    expect(respuesta).toEqual({ exito: false, error: 'El ítem no pertenece a esta revisión' });
    expect(confirmarMock).not.toHaveBeenCalled();
    expect(registrarArchivoMock).not.toHaveBeenCalled();
  });

  it('propaga el fallo de la verificación sin registrar metadata', async () => {
    conTablas();
    confirmarMock.mockResolvedValue({ ok: false, error: 'El archivo no se subió completo' });

    const respuesta = await confirmarArchivoPropuestaAccion({
      ...METADATOS_ITEM,
      ruta: RUTA_ITEM,
    });

    expect(respuesta).toEqual({ exito: false, error: 'El archivo no se subió completo' });
    expect(registrarLogMock).not.toHaveBeenCalled();
  });
});
