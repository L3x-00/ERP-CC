import { describe, expect, it } from 'vitest';

import {
  obtenerFichaOrdenServicio,
  type ClienteFichaOrden,
} from '@/modulos/ordenes/servicios/ficha-orden-servicio';

const ID_ORDEN = '00000000-0000-4000-8000-0000000c8341';
const ID_REVISION = '00000000-0000-4000-8000-0000000c8342';
const ID_ARCHIVO_RFQ_ITEM = '00000000-0000-4000-8000-0000000c8343';
const ID_ARCHIVO_PDF = '00000000-0000-4000-8000-0000000c8344';
const ID_ARCHIVO_RETIRADO = '00000000-0000-4000-8000-0000000c8345';
const ID_RFQ_ITEM = '00000000-0000-4000-8000-0000000c8346';

const FILA_ORDEN = {
  id: ID_ORDEN,
  folio: 'OP-008341',
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
  notas: 'Embalar por separado',
  creado_en: '2026-10-09T12:00:00.000Z',
  actualizado_en: '2026-10-09T12:00:00.000Z',
  cerrada_admin_en: null,
  cerrada_admin_por: null,
  cliente_id: 'cliente-1',
  propuesta_revision_id: ID_REVISION,
};

function snapshot(archivos: Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    version: 1,
    orden_id: ID_ORDEN,
    origen: { rfq_folio: 'RFQ-1026_05' },
    cabecera: { condicion_pago: 'credito' },
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
      archivos: [],
    }],
    archivos,
    totales: { subtotal: 11111.11, descuento: 222.22, iva: 3333.33, total: 44444.44, moneda: 'USD' },
  };
}

const ARCHIVOS_SNAPSHOT = [
  { archivo_id: ID_ARCHIVO_RFQ_ITEM, entidad: 'rfq_item', clase: 'CAD' },
  { archivo_id: ID_ARCHIVO_PDF, entidad: 'propuesta_revision', clase: 'pdf', revision_letra: 'A' },
  { archivo_id: ID_ARCHIVO_RETIRADO, entidad: 'rfq', clase: 'OTROS' },
];

const FILAS_ARCHIVOS = [
  {
    id: ID_ARCHIVO_RFQ_ITEM, entidad: 'rfq_item', entidad_id: ID_RFQ_ITEM, clase: 'CAD',
    nombre_original: 'pieza.dxf', nombre_erp: 'IT01-pieza.dxf', mime: 'application/dxf', vigente: true, retirado_en: null,
  },
  {
    id: ID_ARCHIVO_PDF, entidad: 'propuesta_revision', entidad_id: ID_REVISION, clase: 'pdf',
    nombre_original: 'CNC-1026_04-A.pdf', nombre_erp: 'CNC-1026_04-A.pdf', mime: 'application/pdf', vigente: true, retirado_en: null,
  },
  {
    id: ID_ARCHIVO_RETIRADO, entidad: 'rfq', entidad_id: 'rfq-1', clase: 'OTROS',
    nombre_original: 'retirado.pdf', nombre_erp: null, mime: 'application/pdf', vigente: true, retirado_en: '2026-10-10T10:00:00.000Z',
  },
];

type Fila = Record<string, unknown>;

/** Cliente Supabase mínimo: responde por tabla, respeta `.in()` y registra lo consultado. */
function crearCliente(snapshotJson: unknown, tablas: Record<string, Fila[]> = {}) {
  const selects: Record<string, string[]> = {};
  const filtrosIn: { tabla: string; columna: string; valores: unknown[] }[] = [];
  const cliente = {
    from(tabla: string) {
      let columnas = '*';
      const filtros: { columna: string; valores: unknown[] }[] = [];
      const constructor: Record<string, unknown> = {};
      constructor.select = (valor: string) => {
        columnas = valor;
        (selects[tabla] ??= []).push(valor);
        return constructor;
      };
      constructor.in = (columna: string, valores: unknown[]) => {
        filtros.push({ columna, valores });
        filtrosIn.push({ tabla, columna, valores });
        return constructor;
      };
      for (const metodo of ['eq', 'order', 'limit']) constructor[metodo] = () => constructor;
      constructor.maybeSingle = async () => {
        if (tabla === 'ordenes_produccion') {
          return {
            data: columnas === 'snapshot_json' ? { snapshot_json: snapshotJson } : FILA_ORDEN,
            error: null,
          };
        }
        if (tabla === 'clientes') return { data: { nombre_comercial: 'Cliente de prueba', razon_social: 'CP SA' }, error: null };
        return { data: null, error: null };
      };
      constructor.then = (
        resolver: (valor: unknown) => unknown,
        rechazar?: (motivo: unknown) => unknown,
      ) => {
        const filas = (tablas[tabla] ?? []).filter((fila) => filtros.every(
          ({ columna, valores }) => valores.includes(fila[columna]),
        ));
        return Promise.resolve({ data: filas, error: null }).then(resolver, rechazar);
      };
      return constructor;
    },
  };
  return { cliente: cliente as unknown as ClienteFichaOrden, selects, filtrosIn };
}

const PROHIBIDOS = [
  '12345.67', '9999.99', '11111.11', '222.22', '3333.33', '44444.44', '987.65', '1357.89',
  'USD', 'precio_unitario', 'costo_unitario', 'tarifa_hora', 'costo_total', 'condicion_pago',
  '"subtotal"', '"iva"', '"total"',
];

describe('ficha de Orden C8.3b · sin orden_ver_totales: archivos y hoja de trabajo poblados, sin economía', () => {
  it('devuelve archivos con origen, asociado y tipo, y snapshot/totales/moneda en null', async () => {
    const { cliente } = crearCliente(snapshot(ARCHIVOS_SNAPSHOT), {
      archivos: FILAS_ARCHIVOS,
      propuesta_items: [{ rfq_item_id: ID_RFQ_ITEM, codigo: 'IT01', revision_id: ID_REVISION }],
    });

    const ficha = await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirTotales: false });

    expect(ficha?.snapshot).toBeNull();
    expect(ficha?.totales).toBeNull();
    expect(ficha?.orden.moneda).toBeNull();
    // El retirado no aparece; los demás traen su tabla completa.
    expect(ficha?.archivos).toEqual([
      {
        archivoId: ID_ARCHIVO_RFQ_ITEM, nombreOriginal: 'pieza.dxf', nombreErp: 'IT01-pieza.dxf',
        origen: 'RFQ', asociadoA: 'IT01', tipo: 'CAD', disponible: true,
      },
      {
        archivoId: ID_ARCHIVO_PDF, nombreOriginal: 'CNC-1026_04-A.pdf', nombreErp: 'CNC-1026_04-A.pdf',
        origen: 'Propuesta Rev A', asociadoA: '(general)', tipo: '-', disponible: true,
      },
    ]);
  });

  it('la ficha serializada trae la hoja de trabajo completa y ningún precio, costo, total ni moneda', async () => {
    const { cliente } = crearCliente(snapshot(ARCHIVOS_SNAPSHOT), { archivos: FILAS_ARCHIVOS });

    const ficha = await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirTotales: false });

    expect(ficha?.hojaTrabajo).toMatchObject({
      folio: 'O-1026_01',
      clienteNombre: 'Cliente de prueba',
      observacionesOrden: 'Embalar por separado',
      items: [{
        codigoItem: 'IT01', descripcion: 'Soporte lateral', cantidad: 4, material: 'Acero A36',
        espesor: '3 mm', procesos: ['Corte láser'], observaciones: 'Rebabar bordes',
      }],
    });
    const serializado = JSON.stringify(ficha);
    for (const prohibido of PROHIBIDOS) {
      expect(serializado, `fuga: «${prohibido}»`).not.toContain(prohibido);
    }
    // La ficha conserva la clave `orden.moneda` (en null); la hoja y los archivos no traen moneda alguna.
    expect(ficha?.orden.moneda).toBeNull();
    expect(JSON.stringify([ficha?.hojaTrabajo, ficha?.archivos])).not.toContain('moneda');
  });

  it('la hoja es idéntica con y sin orden_ver_totales (la proyección no depende del permiso)', async () => {
    const { cliente } = crearCliente(snapshot(ARCHIVOS_SNAPSHOT), { archivos: FILAS_ARCHIVOS });

    const sinTotales = await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirTotales: false });
    const conTotales = await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirTotales: true });

    expect(conTotales?.hojaTrabajo).toEqual(sinTotales?.hojaTrabajo);
    expect(conTotales?.archivos).toEqual(sinTotales?.archivos);
    expect(conTotales?.totales?.total).toBe(44444.44);
  });

  it('una orden sin snapshot no tiene archivos ni hoja de trabajo (no cae a la carpeta viva del RFQ)', async () => {
    const { cliente, filtrosIn } = crearCliente(null, { archivos: FILAS_ARCHIVOS });

    const ficha = await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirTotales: false });

    expect(ficha?.archivos).toEqual([]);
    expect(ficha?.hojaTrabajo).toBeNull();
    expect(filtrosIn.filter((filtro) => filtro.tabla === 'archivos')).toEqual([]);
  });
});

describe('ficha de Orden C8.3b · lecturas acotadas', () => {
  it('consulta archivos con .in(id) en lotes de 100 como máximo', async () => {
    const muchos = Array.from({ length: 250 }, (_, indice) => ({
      archivo_id: `00000000-0000-4000-8000-${String(indice).padStart(12, '0')}`,
    }));
    const { cliente, filtrosIn } = crearCliente(snapshot(muchos), {});

    await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirTotales: false });

    const lotes = filtrosIn.filter((filtro) => filtro.tabla === 'archivos' && filtro.columna === 'id');
    expect(lotes.map((lote) => lote.valores.length)).toEqual([100, 100, 50]);
  });

  it('no consulta propuesta_items si ningún archivo es de rfq_item', async () => {
    const { cliente, selects } = crearCliente(snapshot(ARCHIVOS_SNAPSHOT), {
      archivos: FILAS_ARCHIVOS.filter((fila) => fila.entidad !== 'rfq_item'),
    });

    await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirTotales: false });

    expect(selects.propuesta_items).toBeUndefined();
  });

  it('lee la revisión aceptada y consulta propuesta_items solo para los rfq_item presentes', async () => {
    const { cliente, selects, filtrosIn } = crearCliente(snapshot(ARCHIVOS_SNAPSHOT), {
      archivos: FILAS_ARCHIVOS,
      propuesta_items: [{ rfq_item_id: ID_RFQ_ITEM, codigo: 'IT01' }],
    });

    await obtenerFichaOrdenServicio(cliente, ID_ORDEN, { incluirTotales: false });

    expect(selects.ordenes_produccion?.some((seleccion) => seleccion.includes('propuesta_revision_id'))).toBe(true);
    expect(selects.propuesta_items?.length).toBeGreaterThan(0);
    const filtro = filtrosIn.find((f) => f.tabla === 'propuesta_items');
    expect(filtro?.valores).toEqual([ID_RFQ_ITEM]);
    for (const seleccion of selects.archivos ?? []) {
      expect(seleccion).not.toBe('*');
      expect(seleccion).not.toMatch(/ruta_storage|bucket|hash_sha256/u);
    }
  });
});
