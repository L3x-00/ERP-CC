import { describe, expect, it } from 'vitest';

import {
  leerHojaTrabajoOrden,
  ordenEstaEnPiso,
} from '@/modulos/ordenes/servicios/hoja-trabajo-lectura-servicio';
import type { ClienteFichaOrden } from '@/modulos/ordenes/servicios/ficha-orden-servicio';

const ORDEN_ID = '00000000-0000-4000-8000-0000000c8361';
const OTRA_ORDEN_ID = '00000000-0000-4000-8000-0000000c8362';
const OPERADOR_ID = '00000000-0000-4000-8000-0000000c8363';
const OTRO_OPERADOR_ID = '00000000-0000-4000-8000-0000000c8364';
const ARCHIVO_ID = '00000000-0000-4000-8000-0000000c8365';

type Fila = Record<string, unknown>;

/** Cliente Supabase mínimo: aplica eq/in sobre filas por tabla y registra los select. */
function crearCliente(tablas: Record<string, Fila[]>) {
  const selects: Record<string, string[]> = {};
  const cliente = {
    from(tabla: string) {
      const filtros: { columna: string; valores: unknown[] }[] = [];
      const constructor: Record<string, unknown> = {};
      constructor.select = (valor: string) => {
        (selects[tabla] ??= []).push(valor);
        return constructor;
      };
      constructor.eq = (columna: string, valor: unknown) => {
        filtros.push({ columna, valores: [valor] });
        return constructor;
      };
      constructor.in = (columna: string, valores: unknown[]) => {
        filtros.push({ columna, valores });
        return constructor;
      };
      for (const metodo of ['order', 'limit']) constructor[metodo] = () => constructor;
      const filas = () => (tablas[tabla] ?? []).filter((fila) => filtros.every(
        ({ columna, valores }) => valores.includes(fila[columna]),
      ));
      constructor.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null });
      constructor.then = (
        resolver: (valor: unknown) => unknown,
        rechazar?: (motivo: unknown) => unknown,
      ) => Promise.resolve({ data: filas(), error: null }).then(resolver, rechazar);
      return constructor;
    },
  };
  return { cliente: cliente as unknown as ClienteFichaOrden, selects };
}

const SNAPSHOT_CON_ECONOMIA = {
  version: 1,
  orden_id: ORDEN_ID,
  origen: { precio_origen: 5151.51 },
  cabecera: { total: 88888.88, iva: 14222.22, moneda: 'USD', condicion_pago: 'credito', margen: 0.42 },
  items: [{
    codigo: 'IT01',
    descripcion: 'Soporte lateral',
    cantidad: 4,
    precio_unitario: 12345.67,
    costo_unitario: 9999.99,
    es_descuento: false,
    material: 'Acero A36',
    espesor: '3 mm',
    notas: 'Rebabar bordes',
    ruteo: [{ secuencia: 1, proceso_nombre: 'Corte láser', tarifa_hora: 987.65, costo_total: 1357.89 }],
    archivos: [{ archivo_id: ARCHIVO_ID, nombre_original: 'plano.dxf' }],
  }],
  archivos: [],
  totales: { subtotal: 11111.11, descuento: 222.22, iva: 3333.33, total: 44444.44, moneda: 'USD' },
};

function tablasBase(): Record<string, Fila[]> {
  return {
    ordenes_produccion: [{
      id: ORDEN_ID, folio: 'OP-008361', folio_sii: 'O-1026_01', notas: 'Embalar por separado',
      cliente_id: 'c1', snapshot_json: SNAPSHOT_CON_ECONOMIA, propuesta_revision_id: null, estado: 'en_proceso',
    }, {
      id: OTRA_ORDEN_ID, folio: 'OP-008362', estado: 'completada',
    }],
    clientes: [{ id: 'c1', nombre_comercial: 'Cliente Uno', razon_social: 'CU SA' }],
    archivos: [{
      id: ARCHIVO_ID, entidad: 'propuesta_item', entidad_id: 'item-1', clase: 'DIBUJO',
      nombre_original: 'plano.dxf', nombre_erp: 'IT01-plano.dxf', vigente: true, retirado_en: null,
    }],
    partidas_orden_produccion: [
      { id: 'p1', orden_id: ORDEN_ID, operador_asignado_id: OPERADOR_ID },
      { id: 'p2', orden_id: OTRA_ORDEN_ID, operador_asignado_id: OPERADOR_ID },
    ],
  };
}

const PROHIBIDOS = [
  'precio_unitario', 'costo_unitario', 'es_descuento', 'subtotal', 'iva', 'total', 'moneda', 'margen',
  'tarifa', 'costo', 'condicion_pago', 'snapshot',
  '12345.67', '9999.99', '88888.88', '14222.22', '987.65', '1357.89', '11111.11', '222.22', '3333.33',
  '44444.44', '5151.51',
];

describe('leerHojaTrabajoOrden (C8.3c) · no-fuga de economía hacia el piso', () => {
  it('la hoja serializada no contiene ningún precio, costo, total ni moneda', async () => {
    const { cliente } = crearCliente(tablasBase());

    const hoja = await leerHojaTrabajoOrden(cliente, ORDEN_ID);

    expect(hoja).not.toBeNull();
    const serializado = JSON.stringify(hoja);
    for (const prohibido of PROHIBIDOS) {
      expect(serializado, `fuga hacia el piso: «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it('no pide columnas de montos ni select(*) a ordenes_produccion', async () => {
    const { cliente, selects } = crearCliente(tablasBase());

    await leerHojaTrabajoOrden(cliente, ORDEN_ID);

    for (const seleccion of selects.ordenes_produccion ?? []) {
      expect(seleccion).not.toBe('*');
      expect(seleccion).not.toMatch(/monto|condicion_pago|precio|costo/u);
    }
  });

  it('trae folio, cliente, observaciones de la orden, ITxx con material y espesor, procesos y archivos', async () => {
    const { cliente } = crearCliente(tablasBase());

    const hoja = await leerHojaTrabajoOrden(cliente, ORDEN_ID);

    expect(hoja).toEqual({
      folio: 'O-1026_01',
      clienteNombre: 'Cliente Uno',
      observacionesOrden: 'Embalar por separado',
      items: [{
        codigoItem: 'IT01', descripcion: 'Soporte lateral', cantidad: 4, material: 'Acero A36',
        espesor: '3 mm', procesos: ['Corte láser'], observaciones: 'Rebabar bordes',
      }],
      archivos: [{
        archivoId: ARCHIVO_ID, nombreOriginal: 'plano.dxf', nombreErp: 'IT01-plano.dxf',
        origen: 'Propuesta', asociadoA: 'IT01', tipo: 'Plano', disponible: true,
      }],
    });
  });

  it('una orden sin snapshot válido no tiene hoja', async () => {
    const tablas = tablasBase();
    (tablas.ordenes_produccion?.[0] as Fila).snapshot_json = null;
    const { cliente } = crearCliente(tablas);

    await expect(leerHojaTrabajoOrden(cliente, ORDEN_ID)).resolves.toBeNull();
  });

  it('una orden inexistente no tiene hoja', async () => {
    const { cliente } = crearCliente(tablasBase());

    await expect(leerHojaTrabajoOrden(cliente, '00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
  });
});

describe('ordenEstaEnPiso (C8.3c) · pertenencia de la orden al piso', () => {
  it('el operador ve una orden en proceso con una partida asignada a él', async () => {
    const { cliente } = crearCliente(tablasBase());

    await expect(ordenEstaEnPiso(cliente, ORDEN_ID, OPERADOR_ID)).resolves.toBe(true);
  });

  it('otro operador no ve la orden de un compañero', async () => {
    const { cliente } = crearCliente(tablasBase());

    await expect(ordenEstaEnPiso(cliente, ORDEN_ID, OTRO_OPERADOR_ID)).resolves.toBe(false);
  });

  it('una orden que ya no está en proceso sale del piso', async () => {
    const { cliente } = crearCliente(tablasBase());

    await expect(ordenEstaEnPiso(cliente, OTRA_ORDEN_ID, OPERADOR_ID)).resolves.toBe(false);
  });

  it('la vista de administrador (sin operador) ve cualquier orden en proceso con partidas', async () => {
    const { cliente } = crearCliente(tablasBase());

    await expect(ordenEstaEnPiso(cliente, ORDEN_ID, null)).resolves.toBe(true);
    await expect(ordenEstaEnPiso(cliente, OTRA_ORDEN_ID, null)).resolves.toBe(false);
  });

  it('una orden en proceso sin partidas no está en el piso', async () => {
    const tablas = tablasBase();
    tablas.partidas_orden_produccion = [];
    const { cliente } = crearCliente(tablas);

    await expect(ordenEstaEnPiso(cliente, ORDEN_ID, null)).resolves.toBe(false);
  });
});
