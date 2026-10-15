import { describe, expect, it } from 'vitest';

import {
  obtenerFichaOrdenServicio,
  type ClienteFichaOrden,
} from '@/modulos/ordenes/servicios/ficha-orden-servicio';

const ID_ORDEN = '00000000-0000-4000-8000-0000000c8301';
const ID_RFQ = '00000000-0000-4000-8000-0000000c8302';
const ID_PROPUESTA = '00000000-0000-4000-8000-0000000c8303';
const ID_REVISION = '00000000-0000-4000-8000-0000000c8304';
const ID_ARCHIVO = '00000000-0000-4000-8000-0000000c8305';

const FILA_ORDEN = {
  id: ID_ORDEN,
  folio: 'OP-008301',
  folio_sii: 'O-1026_01',
  estado_sii: 'PLANIFICADA',
  estado: 'programada',
  prioridad: 'normal',
  fecha_compromiso_comercial: '2026-11-15',
  fecha_operativa: '2026-11-17T18:00:00.000Z',
  archivada_en: null,
  es_interna: false,
  id_historico: null,
  referencia_externa: null,
  notas: null,
  creado_en: '2026-10-09T12:00:00.000Z',
  actualizado_en: '2026-10-09T12:00:00.000Z',
  cerrada_admin_en: null,
  cerrada_admin_por: null,
  cliente_id: null,
};

function snapshot(origen: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    orden_id: ID_ORDEN,
    origen,
    cabecera: { condicion_pago: 'credito', rfc_cliente: 'XAXX010101000' },
    items: [{
      codigo: 'IT01',
      precio_unitario: 12345.67,
      costo_unitario: 9999.99,
      es_descuento: false,
      ruteo: [],
      archivos: [{ archivo_id: ID_ARCHIVO, nombre_original: 'plano-secreto.dxf' }],
    }],
    archivos: [],
    totales: { subtotal: 11111.11, descuento: 222.22, iva: 3333.33, total: 44444.44, moneda: 'USD' },
  };
}

const ORIGEN_COMPLETO = {
  rfq_id: ID_RFQ,
  rfq_folio: 'RFQ-1026_05',
  propuesta_id: ID_PROPUESTA,
  propuesta_folio: 'CNC-1026_07',
  revision_id: ID_REVISION,
  revision_folio: 'CNC-1026_07-B',
  letra: 'B',
  // Claves ajenas a la lista blanca: jamás deben llegar a la ficha.
  precio_total_secreto: 777.77,
  vendedor_comision: 'COMISION-OCULTA',
};

/** Cliente Supabase mínimo: cada tabla responde vacío salvo la orden y su snapshot. */
function crearCliente(snapshotJson: unknown) {
  const columnasOrden: string[] = [];
  const cliente = {
    from(tabla: string) {
      let columnas = '*';
      const constructor: Record<string, unknown> = {};
      constructor.select = (valor: string) => {
        columnas = valor;
        if (tabla === 'ordenes_produccion') columnasOrden.push(valor);
        return constructor;
      };
      for (const metodo of ['eq', 'order', 'limit', 'in']) constructor[metodo] = () => constructor;
      constructor.maybeSingle = async () => {
        if (tabla !== 'ordenes_produccion') return { data: null, error: null };
        return {
          data: columnas === 'snapshot_json' ? { snapshot_json: snapshotJson } : FILA_ORDEN,
          error: null,
        };
      };
      constructor.then = (
        resolver: (valor: unknown) => unknown,
        rechazar?: (motivo: unknown) => unknown,
      ) => Promise.resolve({ data: [], error: null }).then(resolver, rechazar);
      return constructor;
    },
  };
  return { cliente: cliente as unknown as ClienteFichaOrden, columnasOrden };
}

describe('ficha de Orden C8.2 · el servicio lee el snapshot sin filtrar finanzas', () => {
  it('sin ver_finanzas: el snapshot se lee en servidor pero no sale ningún precio, costo ni total', async () => {
    const { cliente, columnasOrden } = crearCliente(snapshot(ORIGEN_COMPLETO));

    const ficha = await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirFinanzas: false });
    expect(ficha).not.toBeNull();
    const serializado = JSON.stringify(ficha);

    // El snapshot SÍ se consulta (para extraer el origen), nunca con select('*').
    expect(columnasOrden).toContain('snapshot_json');
    expect(columnasOrden).not.toContain('*');

    expect(ficha?.snapshot).toBeNull();
    expect(ficha?.totales).toBeNull();
    expect(ficha?.orden.moneda).toBeNull();
    expect(ficha?.archivos).toEqual([]);
    for (const secreto of [
      '12345.67', '9999.99', '11111.11', '222.22', '3333.33', '44444.44', '777.77',
      'USD', 'precio_unitario', 'costo_unitario', 'condicion_pago', 'XAXX010101000',
      'COMISION-OCULTA', 'plano-secreto.dxf', '"subtotal"', '"iva"', '"total"',
    ]) {
      expect(serializado).not.toContain(secreto);
    }
  });

  it('el origen sale campo a campo (lista blanca) y a cualquier rol con orden_vista', async () => {
    const { cliente } = crearCliente(snapshot(ORIGEN_COMPLETO));

    const ficha = await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirFinanzas: false });

    expect(ficha?.origen).toEqual({
      rfqId: ID_RFQ,
      rfqFolio: 'RFQ-1026_05',
      propuestaId: ID_PROPUESTA,
      propuestaFolio: 'CNC-1026_07',
      revisionFolio: 'CNC-1026_07-B',
      revisionLetra: 'B',
    });
    expect(Object.keys(ficha?.origen ?? {}).sort()).toEqual([
      'propuestaFolio', 'propuestaId', 'revisionFolio', 'revisionLetra', 'rfqFolio', 'rfqId',
    ]);
  });

  it('con ver_finanzas conserva snapshot, totales, moneda y archivos como antes', async () => {
    const { cliente } = crearCliente(snapshot(ORIGEN_COMPLETO));

    const ficha = await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirFinanzas: true });

    expect(ficha?.snapshot).not.toBeNull();
    expect(ficha?.totales?.total).toBe(44444.44);
    expect(ficha?.orden.moneda).toBe('USD');
    expect(ficha?.archivos.map((archivo) => archivo.nombreOriginal)).toEqual(['plano-secreto.dxf']);
    expect(ficha?.origen?.rfqFolio).toBe('RFQ-1026_05');
  });

  it.each([
    ['una orden histórica sin snapshot', null],
    ['una orden interna', snapshot({ tipo: 'ORDEN_INTERNA', rfq_id: null, propuesta_id: null })],
    ['un snapshot antiguo sin folios', snapshot({ rfq_id: ID_RFQ, propuesta_id: ID_PROPUESTA })],
  ])('%s no tiene origen comercial', async (_caso, snapshotJson) => {
    const { cliente } = crearCliente(snapshotJson);

    const ficha = await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirFinanzas: false });
    expect(ficha?.origen).toBeNull();
  });
});
