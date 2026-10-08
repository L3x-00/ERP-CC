import { describe, expect, it } from 'vitest';
import {
  construirDocumentosCongelados,
  nombreDocumentoSeguro,
  validarRutaDocumento,
} from '@/modulos/produccion/servicios/documentos-orden-servicio';
import { resumirLineasNota } from '@/modulos/produccion/servicios/nota-entrega-documento-servicio';

const COTIZACION = '22222222-2222-4222-8222-222222222222';

describe('construirDocumentosCongelados (C2.3)', () => {
  const ARCHIVO_GENERAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const ARCHIVO_ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const ARCHIVO_AJENO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  const ARCHIVO_FALTANTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  const RFQ_ITEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

  it('devuelve solo los IDs del snapshot y conserva una versión histórica del ITxx', () => {
    const documentos = construirDocumentosCongelados(
      {
        version: 1,
        orden_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        origen: {},
        cabecera: {},
        items: [],
        archivos: [
          { archivo_id: ARCHIVO_GENERAL },
          { archivo_id: ARCHIVO_ITEM },
          { archivo_id: ARCHIVO_FALTANTE, nombre_original: 'faltante.step' },
        ],
      },
      [
        {
          id: ARCHIVO_GENERAL,
          entidad: 'rfq',
          entidad_id: COTIZACION,
          nombre_original: 'especificacion.pdf',
          ruta_storage: 'rfq/general.pdf',
          bucket: 'adjuntos-cotizacion',
          mime: 'application/pdf',
          tamano_bytes: 120,
          version: 1,
          vigente: true,
          creado_en: '2026-10-08T10:00:00.000Z',
        },
        {
          id: ARCHIVO_ITEM,
          entidad: 'rfq_item',
          entidad_id: RFQ_ITEM,
          nombre_original: 'pieza.dxf',
          ruta_storage: 'rfq_item/pieza-v1.dxf',
          bucket: 'adjuntos-cotizacion',
          mime: 'application/dxf',
          tamano_bytes: 2_000_000,
          version: 1,
          vigente: false,
          creado_en: '2026-10-08T10:01:00.000Z',
        },
        {
          id: ARCHIVO_AJENO,
          entidad: 'rfq_item',
          entidad_id: RFQ_ITEM,
          nombre_original: 'ajeno.dwg',
          ruta_storage: 'rfq_item/ajeno.dwg',
          bucket: 'adjuntos-cotizacion',
          mime: 'image/vnd.dwg',
          tamano_bytes: 300,
          version: 1,
          vigente: true,
          creado_en: '2026-10-08T10:02:00.000Z',
        },
      ],
      [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', rfq_item_id: RFQ_ITEM, codigo: 'IT01' }],
    );

    expect(documentos.map((documento) => documento.id)).toEqual(
      expect.arrayContaining([ARCHIVO_ITEM, ARCHIVO_GENERAL, ARCHIVO_FALTANTE]),
    );
    expect(documentos.find((documento) => documento.id === ARCHIVO_ITEM)).toMatchObject({
      nombre: 'pieza.dxf',
      itemCodigo: 'IT01',
      origen: 'rfq_item',
      version: 1,
      vigente: false,
      congelado: true,
      disponible: true,
    });
    expect(documentos.find((documento) => documento.id === ARCHIVO_FALTANTE)).toMatchObject({
      nombre: 'faltante.step',
      congelado: true,
      disponible: false,
    });
  });

  it('conserva el código ITxx para un archivo de propuesta_item', () => {
    const propuestaItemId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const archivoPropuesta = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const documentos = construirDocumentosCongelados(
      {
        version: 1,
        orden_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        origen: {},
        cabecera: {},
        archivos: [],
        items: [{
          codigo: 'IT02',
          archivos: [{ archivo_id: archivoPropuesta, nombre_original: 'proceso.step' }],
        }],
      },
      [{
        id: archivoPropuesta,
        entidad: 'propuesta_item',
        entidad_id: propuestaItemId,
        nombre_original: 'proceso.step',
        nombre_erp: 'proceso.step',
        tema_codigo: 'tecnico',
        reemplaza_a: null,
        ruta_storage: 'propuesta_item/proceso.step',
        bucket: 'adjuntos-cotizacion',
        mime: 'model/step',
        tamano_bytes: 100,
        version: 1,
        vigente: true,
        creado_en: '2026-10-08T11:00:00.000Z',
      }],
      [{ id: propuestaItemId, rfq_item_id: null, codigo: 'IT02' }],
    );

    expect(documentos[0]).toMatchObject({
      id: archivoPropuesta,
      origen: 'propuesta_item',
      itemCodigo: 'IT02',
      disponible: true,
    });
  });

  it('falla cerrado cuando el snapshot no tiene la forma SII', () => {
    expect(construirDocumentosCongelados({}, [], [])).toEqual([]);
    expect(construirDocumentosCongelados({
      version: 1,
      orden_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      origen: {},
      cabecera: {},
      archivos: [],
      items: [{ archivos: {} }],
    }, [], [])).toEqual([]);
    expect(construirDocumentosCongelados({
      version: 1,
      orden_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      origen: {},
      cabecera: {},
      archivos: [{ archivo_id: 123 }],
      items: [],
    }, [], [])).toEqual([]);
    expect(construirDocumentosCongelados({
      version: 1,
      orden_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      origen: {},
      cabecera: {},
      archivos: [],
      items: [{ archivos: [{ nombre_original: 'sin-id.dxf' }] }],
    }, [], [])).toEqual([]);
  });
});

describe('validarRutaDocumento (OBS-06/ORD-09)', () => {
  it('acepta rutas dentro de la carpeta de la cotización de la orden', () => {
    expect(validarRutaDocumento(`${COTIZACION}/171234-plano.pdf`, COTIZACION)).toBe(true);
    expect(validarRutaDocumento(`${COTIZACION}/171234-cara.dxf`, COTIZACION)).toBe(true);
    expect(validarRutaDocumento(`rfq/${COTIZACION}/uuid-plano.step`, COTIZACION)).toBe(true);
  });

  it('rechaza rutas ajenas, ambiguas o sin cotización', () => {
    expect(validarRutaDocumento('33333333-3333-4333-8333-333333333333/x.pdf', COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}/../secreto.pdf`, COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}\\x.pdf`, COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}/`, COTIZACION)).toBe(false);
    expect(validarRutaDocumento('', COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}/${'a'.repeat(500)}.pdf`, COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}/x.pdf`, null)).toBe(false);
  });
});

describe('nombreDocumentoSeguro', () => {
  it('sanea separadores y elimina puntos suspensivos', () => {
    expect(nombreDocumentoSeguro('carpeta/plano..v2.dxf')).toBe('carpeta_plano_v2.dxf');
    expect(nombreDocumentoSeguro('..\\..\\etc\\passwd')).toBe('____etc_passwd');
  });

  it('cae a "archivo" y acota nombres enormes', () => {
    expect(nombreDocumentoSeguro('   ')).toBe('archivo');
    const enorme = `${'x'.repeat(400)}.pdf`;
    const recortado = nombreDocumentoSeguro(enorme);
    expect(recortado.length).toBe(180);
    expect(recortado.endsWith('.pdf')).toBe(true);
  });
});

describe('resumirLineasNota (OBS-13)', () => {
  const renglon = {
    partidaId: 'partida-1',
    cantidadEntregada: 3,
    codigoPieza: 'COT-001',
    descripcion: 'Pieza QA',
    unidadMedida: 'pieza',
    cantidadSolicitada: 10,
  };

  it('usa el acumulado por partida y conserva los datos de la pieza', () => {
    const lineas = resumirLineasNota([renglon], new Map([['partida-1', 7]]));
    expect(lineas).toEqual([
      {
        codigoPieza: 'COT-001',
        descripcion: 'Pieza QA',
        unidadMedida: 'pieza',
        cantidadNota: 3,
        entregadoAcumulado: 7,
        cantidadSolicitada: 10,
      },
    ]);
  });

  it('sin historial acumulado usa la cantidad de la propia nota', () => {
    const lineas = resumirLineasNota([renglon], new Map());
    expect(lineas[0]?.entregadoAcumulado).toBe(3);
  });
});
