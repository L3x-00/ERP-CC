// C2.3 / H-2: la firma de un archivo de Propuesta queda ligada a la propuesta
// abierta. El permiso plano de `archivos` (RLS por entidad) no basta: hay que
// comprobar primero que el usuario ve esa propuesta concreta y después que el
// archivo pertenece a su árbol documental (propuesta, revisiones, ítems, RFQ de
// origen o ítems del RFQ).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clienteMock, adminMock, firmarLecturaMock } = vi.hoisted(() => ({
  clienteMock: vi.fn(),
  adminMock: vi.fn(),
  firmarLecturaMock: vi.fn(),
}));

vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: () => clienteMock(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => adminMock(),
}));
vi.mock('@/nucleo/almacenamiento/archivos/servicio', () => ({
  firmarLecturaArchivo: (...argumentos: unknown[]) => firmarLecturaMock(...argumentos),
}));

import { firmarArchivoPropuestaAccion } from '@/modulos/propuestas/acciones/firmar-archivo-propuesta';
import { esquemaFirmarArchivoPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';

const PROPUESTA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROPUESTA_OTRA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REVISION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REVISION_OTRA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ITEM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ITEM_OTRO_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const RFQ_ID = '11111111-1111-4111-8111-111111111111';
const RFQ_OTRO_ID = '22222222-2222-4222-8222-222222222222';
const RFQ_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const RFQ_ITEM_OTRO_ID = '44444444-4444-4444-8444-444444444444';
const ARCHIVO_ID = '55555555-5555-4555-8555-555555555555';
const ORDEN_ID = '66666666-6666-4666-8666-666666666666';

type Fila = Record<string, unknown>;

/**
 * Cadena mínima de PostgREST: `from(tabla).select().eq()…maybeSingle()`.
 * `fallos` simula un error de consulta por tabla (p. ej. RLS que revienta).
 */
function clienteFalso(tablas: Record<string, Fila[]>, fallos: Record<string, string> = {}) {
  const consultas: { tabla: string; filtros: Fila }[] = [];
  const cliente = {
    from(tabla: string) {
      const filtros: Fila = {};
      const cadena = {
        select: () => cadena,
        eq: (columna: string, valor: unknown) => {
          filtros[columna] = valor;
          return cadena;
        },
        maybeSingle: async () => {
          consultas.push({ tabla, filtros });
          const fallo = fallos[tabla];
          if (fallo) return { data: null, error: { message: fallo } };
          const fila = (tablas[tabla] ?? []).find((candidata) =>
            Object.entries(filtros).every(([columna, valor]) => candidata[columna] === valor),
          );
          return { data: fila ?? null, error: null };
        },
      };
      return cadena;
    },
  };
  return { cliente, consultas };
}

/** Árbol documental completo de la propuesta abierta y de una propuesta ajena. */
function tablasBase(archivo: Fila): Record<string, Fila[]> {
  return {
    propuestas: [
      { id: PROPUESTA_ID, rfq_id: RFQ_ID },
      { id: PROPUESTA_OTRA_ID, rfq_id: RFQ_OTRO_ID },
    ],
    propuesta_revisiones: [
      { id: REVISION_ID, propuesta_id: PROPUESTA_ID },
      { id: REVISION_OTRA_ID, propuesta_id: PROPUESTA_OTRA_ID },
    ],
    propuesta_items: [
      { id: ITEM_ID, revision_id: REVISION_ID },
      { id: ITEM_OTRO_ID, revision_id: REVISION_OTRA_ID },
    ],
    rfq_items: [
      { id: RFQ_ITEM_ID, rfq_id: RFQ_ID },
      { id: RFQ_ITEM_OTRO_ID, rfq_id: RFQ_OTRO_ID },
    ],
    archivos: [archivo],
  };
}

function archivoDe(entidad: string, entidadId: string, extra: Fila = {}): Fila {
  return { id: ARCHIVO_ID, entidad, entidad_id: entidadId, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.mockReturnValue({ admin: true });
  firmarLecturaMock.mockResolvedValue('https://firmada/propuesta');
});

describe('esquemaFirmarArchivoPropuesta — contexto obligatorio', () => {
  it('exige propuestaId y archivoId', () => {
    expect(esquemaFirmarArchivoPropuesta.safeParse({ archivoId: ARCHIVO_ID }).success).toBe(false);
    expect(
      esquemaFirmarArchivoPropuesta.safeParse({ propuestaId: PROPUESTA_ID }).success,
    ).toBe(false);
    expect(
      esquemaFirmarArchivoPropuesta.safeParse({
        propuestaId: PROPUESTA_ID,
        archivoId: ARCHIVO_ID,
      }).success,
    ).toBe(true);
  });

  it('rechaza campos extra', () => {
    expect(
      esquemaFirmarArchivoPropuesta.safeParse({
        propuestaId: PROPUESTA_ID,
        archivoId: ARCHIVO_ID,
        revisionId: REVISION_ID,
      }).success,
    ).toBe(false);
  });
});

describe('firmarArchivoPropuestaAccion — archivos del árbol de la propuesta', () => {
  it('firma un archivo de la propuesta por 120 s', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('propuesta', PROPUESTA_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta).toEqual({ exito: true, datos: { url: 'https://firmada/propuesta' } });
    expect(firmarLecturaMock).toHaveBeenCalledWith({ admin: true }, ARCHIVO_ID, 120);
  });

  it('firma un archivo propio de una revisión de la propuesta', async () => {
    const { cliente } = clienteFalso(
      tablasBase(archivoDe('propuesta_revision', REVISION_ID)),
    );
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(true);
  });

  it('firma una versión histórica (no vigente) de la revisión', async () => {
    const { cliente } = clienteFalso(
      tablasBase(archivoDe('propuesta_revision', REVISION_ID, { vigente: false, version: 1 })),
    );
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(true);
  });

  it('firma un archivo de un ítem de una revisión de la propuesta', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('propuesta_item', ITEM_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(true);
  });

  it('firma un archivo heredado del RFQ de origen', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('rfq', RFQ_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(true);
  });

  it('firma un archivo heredado de un ítem del RFQ de origen', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('rfq_item', RFQ_ITEM_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(true);
  });
});

describe('firmarArchivoPropuestaAccion — aislamiento', () => {
  it('rechaza un archivo de otra propuesta', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('propuesta', PROPUESTA_OTRA_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo de una revisión de otra propuesta', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('propuesta_revision', REVISION_OTRA_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo de un ítem de otra propuesta', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('propuesta_item', ITEM_OTRO_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo del RFQ de otra propuesta', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('rfq', RFQ_OTRO_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo de un ítem del RFQ de otra propuesta', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('rfq_item', RFQ_ITEM_OTRO_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo de otra entidad del sistema', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('orden', ORDEN_ID)));
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza cuando la propuesta no es visible para el usuario', async () => {
    const tablas = tablasBase(archivoDe('propuesta_revision', REVISION_ID));
    tablas.propuestas = [];
    const { cliente, consultas } = clienteFalso(tablas);
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
    // La visibilidad de la propuesta se comprueba antes de mirar el archivo.
    expect(consultas[0]?.tabla).toBe('propuestas');
    expect(consultas.some((consulta) => consulta.tabla === 'archivos')).toBe(false);
  });

  it('rechaza cuando la lectura de la propuesta falla', async () => {
    const { cliente } = clienteFalso(tablasBase(archivoDe('propuesta_revision', REVISION_ID)), {
      propuestas: 'permission denied',
    });
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza cuando el archivo no es visible', async () => {
    const tablas = tablasBase(archivoDe('propuesta_revision', REVISION_ID));
    tablas.archivos = [];
    const { cliente } = clienteFalso(tablas);
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });

  it('rechaza una entrada sin contexto de propuesta sin tocar la base', async () => {
    const { cliente, consultas } = clienteFalso(
      tablasBase(archivoDe('propuesta_revision', REVISION_ID)),
    );
    clienteMock.mockResolvedValue(cliente);

    const respuesta = await firmarArchivoPropuestaAccion({ archivoId: ARCHIVO_ID });

    expect(respuesta.exito).toBe(false);
    expect(consultas).toHaveLength(0);
    expect(clienteMock).not.toHaveBeenCalled();
    expect(firmarLecturaMock).not.toHaveBeenCalled();
  });
});
