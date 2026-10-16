import { describe, expect, it } from 'vitest';

import {
  derivarArchivosFicha,
  type FilaArchivoFicha,
  type VinculoItemFicha,
} from '@/modulos/ordenes/utilidades/derivar-archivos-ficha';
import type { SnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';

const ID = (n: number) => `00000000-0000-4000-8000-0000000c83${String(n).padStart(2, '0')}`;
const ID_RFQ_ITEM = ID(41);

function snapshot(partes: Partial<SnapshotOrdenSii>): SnapshotOrdenSii {
  return { version: 1, orden_id: 'o-1', origen: {}, cabecera: {}, items: [], archivos: [], ...partes };
}

function fila(id: string, cambios: Partial<FilaArchivoFicha> = {}): FilaArchivoFicha {
  return {
    id,
    entidad: 'rfq',
    entidad_id: ID(99),
    clase: 'OTROS',
    nombre_original: `original-${id.slice(-2)}.dxf`,
    nombre_erp: `erp-${id.slice(-2)}.dxf`,
    vigente: true,
    retirado_en: null,
    ...cambios,
  };
}

const SIN_VINCULOS: readonly VinculoItemFicha[] = [];

describe('derivarArchivosFicha (R09) · origen, asociado y tipo', () => {
  it('un archivo rfq_item de clase CAD sale como RFQ / IT01 / CAD (vía propuesta_items.rfq_item_id)', () => {
    const lista = derivarArchivosFicha(
      snapshot({ archivos: [{ archivo_id: ID(1), entidad: 'rfq_item', clase: 'CAD' }] }),
      [fila(ID(1), { entidad: 'rfq_item', entidad_id: ID_RFQ_ITEM, clase: 'CAD', nombre_original: 'pieza.dxf' })],
      [{ rfq_item_id: ID_RFQ_ITEM, codigo: 'IT01' }],
    );

    expect(lista).toEqual([{
      archivoId: ID(1),
      nombreOriginal: 'pieza.dxf',
      nombreErp: 'erp-01.dxf',
      origen: 'RFQ',
      asociadoA: 'IT01',
      tipo: 'CAD',
      disponible: true,
    }]);
  });

  it('el PDF de una revisión con letra A sale como «Propuesta Rev A» / (general) / «-» (ejemplo del cliente)', () => {
    const [archivo] = derivarArchivosFicha(
      snapshot({
        archivos: [{ archivo_id: ID(2), entidad: 'propuesta_revision', clase: 'pdf', revision_letra: 'A' }],
      }),
      [fila(ID(2), {
        entidad: 'propuesta_revision', clase: 'pdf', nombre_original: 'CNC-1026_04-A.pdf', nombre_erp: 'CNC-1026_04-A.pdf',
      })],
      SIN_VINCULOS,
    );

    expect(archivo).toMatchObject({
      nombreOriginal: 'CNC-1026_04-A.pdf', origen: 'Propuesta Rev A', asociadoA: '(general)', tipo: '-',
    });
  });

  it('un archivo de la entidad propuesta, sin letra, sale como «Propuesta»', () => {
    const [archivo] = derivarArchivosFicha(
      snapshot({ archivos: [{ archivo_id: ID(3), entidad: 'propuesta', clase: 'tecnico' }] }),
      [fila(ID(3), { entidad: 'propuesta', clase: 'tecnico' })],
      SIN_VINCULOS,
    );

    expect(archivo).toMatchObject({ origen: 'Propuesta', asociadoA: '(general)', tipo: 'Técnico' });
  });

  it('un archivo del RFQ (entidad rfq) sale como RFQ / (general)', () => {
    const [archivo] = derivarArchivosFicha(
      snapshot({ archivos: [{ archivo_id: ID(4), entidad: 'rfq' }] }),
      [fila(ID(4), { entidad: 'rfq', clase: 'ESPECIFICACIONES' })],
      SIN_VINCULOS,
    );

    expect(archivo).toMatchObject({ origen: 'RFQ', asociadoA: '(general)', tipo: 'Especificaciones' });
  });

  it('un rfq_item sin ítem de propuesta vinculado queda como (general)', () => {
    const [archivo] = derivarArchivosFicha(
      snapshot({ archivos: [{ archivo_id: ID(5) }] }),
      [fila(ID(5), { entidad: 'rfq_item', entidad_id: ID_RFQ_ITEM })],
      [{ rfq_item_id: ID(77), codigo: 'IT09' }],
    );

    expect(archivo).toMatchObject({ origen: 'RFQ', asociadoA: '(general)' });
  });

  // Caso que Producción pierde: la orden nace de Rev B pero el archivo es de un ítem de Rev A.
  it('un propuesta_item de Rev A en una orden creada desde Rev B conserva el ITxx del contenedor del snapshot', () => {
    const [archivo] = derivarArchivosFicha(
      snapshot({
        items: [{
          codigo: 'IT02',
          archivos: [{
            archivo_id: ID(6), entidad: 'propuesta_item', clase: 'DIBUJO', revision_letra: 'A', item_id: ID(70),
          }],
        }],
      }),
      [fila(ID(6), { entidad: 'propuesta_item', entidad_id: ID(70), clase: 'DIBUJO' })],
      // El ítem ID(70) es de la Rev A: la revisión aceptada (B) no lo conoce.
      [{ rfq_item_id: null, codigo: 'IT05' }],
    );

    expect(archivo).toMatchObject({ origen: 'Propuesta Rev A', asociadoA: 'IT02', tipo: 'Plano' });
  });

  it('el contenedor toma codigo_item cuando el ítem no trae codigo', () => {
    const [archivo] = derivarArchivosFicha(
      snapshot({ items: [{ codigo_item: 'IT07', archivos: [{ archivo_id: ID(7) }] }] }),
      [fila(ID(7), { entidad: 'propuesta_item' })],
      SIN_VINCULOS,
    );

    expect(archivo?.asociadoA).toBe('IT07');
  });
});

describe('derivarArchivosFicha (R09) · tipo solo por clase, sin heurística de extensión', () => {
  it.each([
    ['CAD', 'CAD'],
    ['DIBUJO', 'Plano'],
    ['IMAGEN', 'Imagen'],
    ['ESPECIFICACIONES', 'Especificaciones'],
    ['OTROS', 'Otro'],
    ['tecnico', 'Técnico'],
    ['cad', 'CAD'],
    ['pdf', '-'],
    ['general', '-'],
    ['clase-inventada', '-'],
    [null, '-'],
    ['', '-'],
  ])('clase %j → tipo %j', (clase, esperado) => {
    const [archivo] = derivarArchivosFicha(
      snapshot({ archivos: [{ archivo_id: ID(8) }] }),
      // La extensión del nombre NO debe influir: un .dxf con clase pdf sigue siendo «-».
      [fila(ID(8), { clase, nombre_original: 'plano.dxf' })],
      SIN_VINCULOS,
    );

    expect(archivo?.tipo).toBe(esperado);
  });
});

describe('derivarArchivosFicha (R09) · exclusiones y datos faltantes', () => {
  it('excluye los archivos retirados (retirado_en no nulo)', () => {
    const lista = derivarArchivosFicha(
      snapshot({ archivos: [{ archivo_id: ID(9) }, { archivo_id: ID(10) }] }),
      [fila(ID(9), { retirado_en: '2026-10-10T10:00:00.000Z' }), fila(ID(10))],
      SIN_VINCULOS,
    );

    expect(lista.map((archivo) => archivo.archivoId)).toEqual([ID(10)]);
  });

  it('excluye los archivos que ya no están vigentes', () => {
    const lista = derivarArchivosFicha(
      snapshot({ archivos: [{ archivo_id: ID(11) }, { archivo_id: ID(12) }] }),
      [fila(ID(11), { vigente: false }), fila(ID(12))],
      SIN_VINCULOS,
    );

    expect(lista.map((archivo) => archivo.archivoId)).toEqual([ID(12)]);
  });

  it('un id del snapshot sin fila se muestra como no disponible, sin lanzar', () => {
    const lista = derivarArchivosFicha(
      snapshot({
        archivos: [{
          archivo_id: ID(13), entidad: 'rfq', nombre_original: 'del-snapshot.dxf', nombre_erp: 'erp-snapshot.dxf', clase: 'CAD',
        }],
      }),
      [],
      SIN_VINCULOS,
    );

    expect(lista).toEqual([{
      archivoId: ID(13),
      nombreOriginal: 'del-snapshot.dxf',
      nombreErp: 'erp-snapshot.dxf',
      origen: 'RFQ',
      asociadoA: '(general)',
      tipo: 'CAD',
      disponible: false,
    }]);
  });

  it('un id sin fila y sin metadatos degrada a «-» sin inventar nada', () => {
    const [archivo] = derivarArchivosFicha(snapshot({ archivos: [{ archivo_id: ID(14) }] }), [], SIN_VINCULOS);

    expect(archivo).toEqual({
      archivoId: ID(14), nombreOriginal: null, nombreErp: null, origen: '-', asociadoA: '(general)', tipo: '-',
      disponible: false,
    });
  });

  it('un snapshot sin entidad ni revision_letra (órdenes previas) toma la entidad de la fila', () => {
    const [archivo] = derivarArchivosFicha(
      snapshot({ archivos: [{ archivo_id: ID(15), clase: 'pdf' }] }),
      [fila(ID(15), { entidad: 'propuesta_revision', clase: 'pdf' })],
      SIN_VINCULOS,
    );

    expect(archivo).toMatchObject({ origen: 'Propuesta', asociadoA: '(general)', tipo: '-' });
  });

  it('los nombres de la fila mandan sobre los del snapshot', () => {
    const [archivo] = derivarArchivosFicha(
      snapshot({ archivos: [{ archivo_id: ID(16), nombre_original: 'viejo.dxf', nombre_erp: 'viejo-erp.dxf' }] }),
      [fila(ID(16), { nombre_original: 'actual.dxf', nombre_erp: null })],
      SIN_VINCULOS,
    );

    expect(archivo).toMatchObject({ nombreOriginal: 'actual.dxf', nombreErp: null });
  });

  it('un id repetido en cabecera e ítem aparece una sola vez', () => {
    const lista = derivarArchivosFicha(
      snapshot({
        archivos: [{ archivo_id: ID(17) }],
        items: [{ codigo: 'IT01', archivos: [{ archivo_id: ID(17) }] }],
      }),
      [fila(ID(17), { entidad: 'propuesta_item' })],
      SIN_VINCULOS,
    );

    expect(lista).toHaveLength(1);
    expect(lista[0]?.asociadoA).toBe('IT01');
  });

  it('sin snapshot no hay archivos', () => {
    expect(derivarArchivosFicha(null, [fila(ID(18))], SIN_VINCULOS)).toEqual([]);
  });

  it('conserva el orden del snapshot: primero la cabecera y luego los ítems', () => {
    const lista = derivarArchivosFicha(
      snapshot({
        archivos: [{ archivo_id: ID(20) }],
        items: [
          { codigo: 'IT01', archivos: [{ archivo_id: ID(21) }] },
          { codigo: 'IT02', archivos: [{ archivo_id: ID(22) }] },
        ],
      }),
      [ID(22), ID(20), ID(21)].map((id) => fila(id)),
      SIN_VINCULOS,
    );

    expect(lista.map((archivo) => archivo.archivoId)).toEqual([ID(20), ID(21), ID(22)]);
  });
});
