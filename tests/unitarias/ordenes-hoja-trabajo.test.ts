import { describe, expect, it } from 'vitest';

import { proyectarHojaTrabajo } from '@/modulos/ordenes/servicios/hoja-trabajo-orden-servicio';
import type { ArchivoFicha } from '@/modulos/ordenes/tipos/ficha-orden';
import type { SnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';

const ARCHIVO: ArchivoFicha = {
  archivoId: '00000000-0000-4000-8000-0000000c8331',
  nombreOriginal: 'pieza.dxf',
  nombreErp: 'IT01-pieza.dxf',
  origen: 'RFQ',
  asociadoA: 'IT01',
  tipo: 'CAD',
  disponible: true,
};

/** Snapshot con TODA la economía posible: nada de esto puede llegar a la hoja de trabajo. */
function snapshotConEconomia(): SnapshotOrdenSii {
  return {
    version: 1,
    orden_id: 'o-1',
    origen: { rfq_folio: 'RFQ-1026_05', precio_origen_secreto: 5151.51 },
    cabecera: { total: 88888.88, iva: 14222.22, moneda: 'USD', condicion_pago: 'credito', margen: 0.42 },
    items: [
      {
        item_id: 'item-1',
        codigo: 'IT01',
        descripcion: 'Soporte lateral',
        cantidad: 4,
        precio_unitario: 12345.67,
        es_descuento: false,
        material: 'Acero A36',
        espesor: '3 mm',
        notas: 'Rebabar bordes',
        operaciones: [{ nombre: 'Corte láser', costo: 777.77 }],
        ruteo: [
          {
            secuencia: 2, proceso_nombre: 'Doblez', setup_horas: 0.5, run_horas: 1,
            tarifa_hora: 987.65, costo_total: 1357.89,
          },
          { secuencia: 1, proceso_nombre: 'Corte láser', tarifa_hora: 987.65, costo_total: 2468.13 },
        ],
        archivos: [],
        // Campo ajeno a la lista blanca: jamás debe propagarse.
        costo_unitario: 9999.99,
        margen_item: 0.31,
      } as SnapshotOrdenSii['items'][number],
      { codigo: 'DESC', descripcion: 'Descuento comercial', es_descuento: true, precio_unitario: -500.5 },
    ],
    archivos: [],
  };
}

const PROHIBIDOS = [
  'precio_unitario', 'es_descuento', 'subtotal', 'iva', 'total', 'costo', 'margen', 'moneda',
  'tarifa', 'condicion_pago', 'USD',
  '12345.67', '9999.99', '88888.88', '14222.22', '987.65', '1357.89', '2468.13', '777.77', '5151.51',
  '500.5', 'Descuento comercial',
];

describe('hoja de trabajo de la orden (R17) · no-fuga de economía', () => {
  it('la hoja serializada no contiene precios, costos, IVA, margen, total ni moneda', () => {
    const hoja = proyectarHojaTrabajo({
      snapshot: snapshotConEconomia(),
      folio: 'O-1026_01',
      clienteNombre: 'Cliente de prueba',
      observacionesOrden: 'Entregar con empaque',
      archivos: [ARCHIVO],
    });

    expect(hoja).not.toBeNull();
    const serializado = JSON.stringify(hoja);
    for (const prohibido of PROHIBIDOS) {
      expect(serializado, `fuga: «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it('la lista blanca ignora cualquier campo extra del snapshot', () => {
    const snapshot = snapshotConEconomia();
    (snapshot.items[0] as Record<string, unknown>).campo_futuro_con_precio = 31415.92;
    (snapshot.items[0] as Record<string, unknown>).material_costo = 'caro';

    const hoja = proyectarHojaTrabajo({
      snapshot, folio: 'O-1026_01', clienteNombre: null, observacionesOrden: null, archivos: [],
    });

    const serializado = JSON.stringify(hoja);
    expect(serializado).not.toContain('31415.92');
    expect(serializado).not.toContain('campo_futuro_con_precio');
    expect(serializado).not.toContain('material_costo');
    // Las claves de cada ítem son EXACTAMENTE las de la lista blanca.
    expect(Object.keys(hoja?.items[0] ?? {}).sort()).toEqual([
      'cantidad', 'codigoItem', 'descripcion', 'espesor', 'material', 'observaciones', 'procesos',
    ]);
    expect(Object.keys(hoja ?? {}).sort()).toEqual([
      'archivos', 'clienteNombre', 'folio', 'items', 'observacionesOrden',
    ]);
  });
});

describe('hoja de trabajo de la orden (R17) · contenido', () => {
  it('trae cliente, folio, ITxx, descripción, cantidad, material, espesor, procesos, observaciones y archivos', () => {
    const hoja = proyectarHojaTrabajo({
      snapshot: snapshotConEconomia(),
      folio: 'O-1026_01',
      clienteNombre: 'Cliente de prueba',
      observacionesOrden: 'Entregar con empaque',
      archivos: [ARCHIVO],
    });

    expect(hoja).toEqual({
      folio: 'O-1026_01',
      clienteNombre: 'Cliente de prueba',
      observacionesOrden: 'Entregar con empaque',
      items: [{
        codigoItem: 'IT01',
        descripcion: 'Soporte lateral',
        cantidad: 4,
        material: 'Acero A36',
        espesor: '3 mm',
        // Los procesos salen en el orden de la ruta, no en el del JSON.
        procesos: ['Corte láser', 'Doblez'],
        observaciones: 'Rebabar bordes',
      }],
      archivos: [ARCHIVO],
    });
  });

  it('excluye las líneas de descuento', () => {
    const hoja = proyectarHojaTrabajo({
      snapshot: snapshotConEconomia(), folio: 'F', clienteNombre: null, observacionesOrden: null, archivos: [],
    });
    expect(hoja?.items.map((item) => item.codigoItem)).toEqual(['IT01']);
  });

  it('ordena los ítems por ITxx numéricamente', () => {
    const snapshot = snapshotConEconomia();
    snapshot.items = [
      { codigo: 'IT10', descripcion: 'Diez' },
      { codigo: 'IT02', descripcion: 'Dos' },
    ];
    const hoja = proyectarHojaTrabajo({
      snapshot, folio: 'F', clienteNombre: null, observacionesOrden: null, archivos: [],
    });
    expect(hoja?.items.map((item) => item.codigoItem)).toEqual(['IT02', 'IT10']);
  });

  it('un snapshot antiguo sin ruteo toma los procesos de la lista de operaciones', () => {
    const snapshot = snapshotConEconomia();
    snapshot.items = [{ codigo: 'IT01', operaciones: [{ nombre: 'Corte' }, { codigo: 'DOB' }] }];
    const hoja = proyectarHojaTrabajo({
      snapshot, folio: 'F', clienteNombre: null, observacionesOrden: null, archivos: [],
    });
    expect(hoja?.items[0]?.procesos).toEqual(['Corte', 'DOB']);
  });

  it('sin snapshot no hay hoja (el documento cae a las partidas)', () => {
    expect(proyectarHojaTrabajo({
      snapshot: null, folio: 'F', clienteNombre: null, observacionesOrden: null, archivos: [],
    })).toBeNull();
  });

  it('un valor no numérico en cantidad queda en null y un texto vacío en null', () => {
    const snapshot = snapshotConEconomia();
    snapshot.items = [{
      codigo: 'IT01', cantidad: Number.NaN, material: '  ', espesor: '', notas: '   ',
    }];
    const hoja = proyectarHojaTrabajo({
      snapshot, folio: 'F', clienteNombre: null, observacionesOrden: null, archivos: [],
    });
    expect(hoja?.items[0]).toMatchObject({
      cantidad: null, material: null, espesor: null, observaciones: null, procesos: [],
    });
  });
});
