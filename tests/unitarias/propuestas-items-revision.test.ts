// C3.1: un ítem nuevo nace solo en una revisión B..Z en DRAFT, recibe su `ITxx`
// del servidor (el cliente nunca lo inventa), guarda la revisión de origen y no
// toca el RFQ. Esquema, mapeo de la respuesta, permisos/argumentos de la Server
// Action y traducción de los errores de negocio nuevos.
//
// La UI del corte vive en `propuestas-items-revision-ui.test.ts`: allí la
// Server Action está mockeada, así que no puede coexistir con estas pruebas que
// ejercitan la acción real.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/modulos/propuestas/acciones/utilidades-acciones', async (importarReal) => {
  const real = await importarReal<
    typeof import('@/modulos/propuestas/acciones/utilidades-acciones')
  >();
  return { ...real, ejecutarRpcPropuesta: (...argumentos: unknown[]) => rpcMock(...argumentos) };
});

import { agregarItemPropuestaAccion } from '@/modulos/propuestas/acciones/agregar-item-propuesta';
import { traducirErrorPropuesta } from '@/modulos/propuestas/servicios/errores-propuesta';
import { jsonAItemPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaAgregarItemPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';

const REV_B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_NUEVO_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MATERIAL_ACERO_ID = '11111111-1111-4111-8111-111111111111';
const ESPESOR_ACERO_3_ID = '33333333-3333-4333-8333-333333333333';

function entradaValida(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { revisionId: REV_B_ID, descripcion: 'Placa base', cantidad: 4, ...extra };
}

describe('esquemaAgregarItemPropuesta — alta estricta sin ITxx de cliente', () => {
  it('acepta el mínimo (revisión, descripción y cantidad) sin precio', () => {
    const analisis = esquemaAgregarItemPropuesta.safeParse(entradaValida());
    expect(analisis.success).toBe(true);
    if (analisis.success) {
      expect(analisis.data.precioUnitario).toBeUndefined();
    }
  });

  it('exige revisionId con formato uuid', () => {
    expect(esquemaAgregarItemPropuesta.safeParse(entradaValida({ revisionId: 'x' })).success).toBe(
      false,
    );
    const sinRevision = { descripcion: 'Placa base', cantidad: 4 };
    expect(esquemaAgregarItemPropuesta.safeParse(sinRevision).success).toBe(false);
  });

  it('rechaza descripción vacía o mayor a 300 caracteres', () => {
    expect(esquemaAgregarItemPropuesta.safeParse(entradaValida({ descripcion: '   ' })).success).toBe(
      false,
    );
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ descripcion: 'a'.repeat(301) })).success,
    ).toBe(false);
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ descripcion: 'a'.repeat(300) })).success,
    ).toBe(true);
  });

  it('rechaza cantidad no positiva, con más de 2 decimales o sobre 1e9', () => {
    for (const cantidad of [0, -1, 1.005, 1_000_000_001, Number.NaN]) {
      expect(esquemaAgregarItemPropuesta.safeParse(entradaValida({ cantidad })).success).toBe(false);
    }
    expect(esquemaAgregarItemPropuesta.safeParse(entradaValida({ cantidad: 1.25 })).success).toBe(
      true,
    );
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ cantidad: 1_000_000_000 })).success,
    ).toBe(true);
  });

  it('rechaza precio negativo o sobre 1e9 y acepta 0', () => {
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ precioUnitario: -1 })).success,
    ).toBe(false);
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ precioUnitario: 1_000_000_001 })).success,
    ).toBe(false);
    expect(esquemaAgregarItemPropuesta.safeParse(entradaValida({ precioUnitario: 0 })).success).toBe(
      true,
    );
  });

  it('acepta acabado 120 y notas 2000, rechaza más', () => {
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ acabado: 'a'.repeat(120) })).success,
    ).toBe(true);
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ acabado: 'a'.repeat(121) })).success,
    ).toBe(false);
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ notas: 'a'.repeat(2000) })).success,
    ).toBe(true);
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ notas: 'a'.repeat(2001) })).success,
    ).toBe(false);
  });

  it('no admite espesor sin material', () => {
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ espesorId: ESPESOR_ACERO_3_ID })).success,
    ).toBe(false);
    expect(
      esquemaAgregarItemPropuesta.safeParse(
        entradaValida({ materialId: MATERIAL_ACERO_ID, espesorId: ESPESOR_ACERO_3_ID }),
      ).success,
    ).toBe(true);
  });

  it('rechaza que el cliente invente id, código o revisión de origen', () => {
    expect(esquemaAgregarItemPropuesta.safeParse(entradaValida({ codigo: 'IT09' })).success).toBe(
      false,
    );
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ id: ITEM_NUEVO_ID })).success,
    ).toBe(false);
    expect(
      esquemaAgregarItemPropuesta.safeParse(entradaValida({ revisionOrigenId: REV_B_ID })).success,
    ).toBe(false);
  });
});

const FILA_RPC = {
  id: ITEM_NUEVO_ID,
  revision_id: REV_B_ID,
  revision_origen_id: REV_B_ID,
  rfq_item_id: null,
  codigo: 'IT05',
  descripcion: 'Placa base',
  cantidad: 4,
  material_id: MATERIAL_ACERO_ID,
  espesor_id: ESPESOR_ACERO_3_ID,
  acabado: null,
  notas: null,
  precio_unitario: 0,
  es_descuento: false,
  activo: true,
  creado_en: '2026-10-08T19:00:00.000Z',
  actualizado_en: '2026-10-08T19:00:00.000Z',
};

describe('jsonAItemPropuesta — mapeo de la fila devuelta por la RPC', () => {
  it('mapea la fila completa incluida la revisión de origen', () => {
    expect(jsonAItemPropuesta(FILA_RPC)).toEqual({
      id: ITEM_NUEVO_ID,
      revisionId: REV_B_ID,
      revisionOrigenId: REV_B_ID,
      rfqItemId: null,
      codigo: 'IT05',
      descripcion: 'Placa base',
      cantidad: 4,
      materialId: MATERIAL_ACERO_ID,
      espesorId: ESPESOR_ACERO_3_ID,
      acabado: null,
      notas: null,
      precioUnitario: 0,
      esDescuento: false,
      activo: true,
      creadoEn: '2026-10-08T19:00:00.000Z',
      actualizadoEn: '2026-10-08T19:00:00.000Z',
    });
  });

  it('acepta numéricos serializados como texto', () => {
    const item = jsonAItemPropuesta({ ...FILA_RPC, cantidad: '4.50', precio_unitario: '120.25' });
    expect(item?.cantidad).toBe(4.5);
    expect(item?.precioUnitario).toBe(120.25);
  });

  it('devuelve null si falta cualquier campo obligatorio o no es un objeto', () => {
    for (const clave of [
      'id',
      'revision_id',
      'revision_origen_id',
      'codigo',
      'descripcion',
      'actualizado_en',
    ]) {
      const parcial: Record<string, unknown> = { ...FILA_RPC };
      delete parcial[clave];
      expect(jsonAItemPropuesta(parcial)).toBeNull();
    }
    expect(jsonAItemPropuesta(null)).toBeNull();
    expect(jsonAItemPropuesta([FILA_RPC])).toBeNull();
    expect(jsonAItemPropuesta({ ...FILA_RPC, cantidad: 'cuatro' })).toBeNull();
  });

});

describe('agregarItemPropuestaAccion — permisos, argumentos y respuesta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ exito: true, datos: FILA_RPC });
  });

  it('no llama a la RPC con una entrada inválida', async () => {
    const respuesta = await agregarItemPropuestaAccion({ revisionId: REV_B_ID, cantidad: 4 });

    expect(respuesta.exito).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('exige solo propuesta_editar_articulo cuando no se envía precio', async () => {
    await agregarItemPropuestaAccion(entradaValida());

    const solicitud = rpcMock.mock.calls[0]?.[0] as { permiso: string[]; rpc: string };
    expect(solicitud.permiso).toEqual(['propuesta_editar_articulo']);
    expect(solicitud.rpc).toBe('agregar_item_propuesta');
  });

  it('añade propuesta_editar_precio solo si se envía precio', async () => {
    await agregarItemPropuestaAccion(entradaValida({ precioUnitario: 150 }));

    const solicitud = rpcMock.mock.calls[0]?.[0] as { permiso: string[] };
    expect(solicitud.permiso).toEqual(['propuesta_editar_articulo', 'propuesta_editar_precio']);
  });

  it('envía p_revision_id y p_datos en snake_case, sin claves ausentes', async () => {
    await agregarItemPropuestaAccion(
      entradaValida({
        materialId: MATERIAL_ACERO_ID,
        espesorId: ESPESOR_ACERO_3_ID,
        acabado: 'Pintura',
        esDescuento: true,
      }),
    );

    const solicitud = rpcMock.mock.calls[0]?.[0] as {
      args: { p_revision_id: string; p_datos: Record<string, unknown> };
    };
    expect(solicitud.args.p_revision_id).toBe(REV_B_ID);
    expect(solicitud.args.p_datos).toEqual({
      descripcion: 'Placa base',
      cantidad: 4,
      material_id: MATERIAL_ACERO_ID,
      espesor_id: ESPESOR_ACERO_3_ID,
      acabado: 'Pintura',
      es_descuento: true,
    });
    // El cliente no manda ITxx, id ni revisión de origen: los fija el servidor.
    expect(Object.keys(solicitud.args.p_datos)).not.toContain('codigo');
    expect(Object.keys(solicitud.args.p_datos)).not.toContain('revision_origen_id');
  });

  it('audita contra la revisión y devuelve el ítem mapeado', async () => {
    const respuesta = await agregarItemPropuestaAccion(entradaValida());

    expect(rpcMock.mock.calls[0]?.[1]).toBe(REV_B_ID);
    expect(respuesta.exito).toBe(true);
    if (respuesta.exito) {
      expect(respuesta.datos?.codigo).toBe('IT05');
      expect(respuesta.datos?.revisionOrigenId).toBe(REV_B_ID);
    }
  });

  it('propaga el error del servidor sin inventar un ítem', async () => {
    rpcMock.mockResolvedValue({ exito: false, error: 'Solo se pueden editar revisiones en borrador' });

    const respuesta = await agregarItemPropuestaAccion(entradaValida());

    expect(respuesta).toEqual({
      exito: false,
      error: 'Solo se pueden editar revisiones en borrador',
    });
  });

  it('rechaza una respuesta incompleta del servidor', async () => {
    rpcMock.mockResolvedValue({ exito: true, datos: { id: ITEM_NUEVO_ID } });

    const respuesta = await agregarItemPropuestaAccion(entradaValida());

    expect(respuesta).toEqual({ exito: false, error: 'Respuesta inválida del servidor' });
  });
});

describe('traducirErrorPropuesta — códigos nuevos de C3.1', () => {
  const casos: [string, RegExp][] = [
    ['item_nuevo_solo_revision', /revisi[oó]n B/i],
    ['item_descripcion_invalida', /descripci[oó]n/i],
    ['item_cantidad_invalida', /cantidad/i],
    ['item_precio_invalido', /precio/i],
    ['material_invalido', /material/i],
    ['espesor_requerido', /espesor/i],
    ['espesor_invalido', /espesor/i],
    ['espesor_sin_material', /material/i],
    ['item_acabado_invalido', /acabado/i],
    ['item_notas_invalidas', /notas/i],
    ['revision_origen_invalida', /origen/i],
    ['revision_origen_inmutable', /no se puede modificar/i],
  ];

  it.each(casos)('traduce %s a un mensaje específico', (codigo, patron) => {
    const mensaje = traducirErrorPropuesta(`error: ${codigo}`);
    expect(mensaje).toMatch(patron);
    expect(mensaje).not.toBe('No se pudo completar la acción sobre la propuesta');
    expect(mensaje).not.toContain(codigo);
  });

  it('mantiene revision_no_editable para una revisión congelada', () => {
    expect(traducirErrorPropuesta('error: revision_no_editable')).toMatch(/borrador/i);
  });
});
