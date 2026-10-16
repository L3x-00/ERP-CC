import { beforeEach, describe, expect, it, vi } from 'vitest';

// Caracterización (R17, criterio 11): el camino REAL del operador es Producción. Su payload no
// debe traer precios, subtotal, IVA, total, moneda, tarifa ni costo. No se toca Producción: esta
// prueba solo congela ese comportamiento para que un cambio futuro no lo rompa en silencio.

const { usuarioMock, puedeMock, firmarMock, tablas, admin } = vi.hoisted(() => {
  const tablas: Record<string, Record<string, unknown>[]> = {};
  const admin = {
    from(tabla: string) {
      const filtros: { columna: string; valores: unknown[] }[] = [];
      const constructor: Record<string, unknown> = {};
      constructor.select = () => constructor;
      for (const metodo of ['order', 'limit']) constructor[metodo] = () => constructor;
      constructor.eq = (columna: string, valor: unknown) => {
        filtros.push({ columna, valores: [valor] });
        return constructor;
      };
      constructor.in = (columna: string, valores: unknown[]) => {
        filtros.push({ columna, valores });
        return constructor;
      };
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
  return { usuarioMock: vi.fn(), puedeMock: vi.fn(), firmarMock: vi.fn(), tablas, admin };
});

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => puedeMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => admin }));
vi.mock('@/nucleo/almacenamiento/archivos/servicio', () => ({
  firmarLecturaArchivo: (...argumentos: unknown[]) => firmarMock(...argumentos),
}));
vi.mock('@/modulos/produccion/servicios/nota-entrega-documento-servicio', () => ({
  listarNotasEntregaOrden: async () => [],
}));

import { obtenerDocumentosOrdenAccion } from '@/modulos/produccion/acciones/obtener-documentos-orden';
import { construirDocumentosCongelados } from '@/modulos/produccion/servicios/documentos-orden-servicio';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';
const ARCHIVO_ID = '22222222-2222-4222-8222-222222222222';

const SNAPSHOT_CON_ECONOMIA = {
  version: 1,
  orden_id: ORDEN_ID,
  origen: { rfq_folio: 'RFQ-1026_01', precio_origen: 5151.51 },
  cabecera: { total: 75000.75, iva: 12000.12, moneda: 'USD', condicion_pago: 'credito', margen: 0.42 },
  items: [{
    codigo: 'IT01',
    precio_unitario: 12345.67,
    costo_unitario: 9999.99,
    es_descuento: false,
    ruteo: [{ secuencia: 1, proceso_nombre: 'Corte', tarifa_hora: 987.65, costo_total: 1357.89 }],
    archivos: [{ archivo_id: ARCHIVO_ID, nombre_original: 'plano.dxf' }],
  }],
  archivos: [],
  totales: { subtotal: 11111.11, descuento: 222.22, iva: 3333.33, total: 44444.44, moneda: 'USD' },
};

const PROHIBIDOS = [
  'precio_unitario', 'costo_unitario', 'es_descuento', 'subtotal', 'iva', 'total', 'moneda', 'margen',
  'tarifa', 'costo', 'condicion_pago', 'snapshot_json', 'snapshotJson',
  '75000.75', '12000.12', '12345.67', '9999.99', '987.65', '1357.89', '11111.11', '222.22', '3333.33',
  '44444.44', '5151.51',
];

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue({ id: 'operador', rol: 'operador', activo: true });
  puedeMock.mockImplementation(async (_usuario: unknown, permiso: string) => permiso === 'gestionar_produccion');
  firmarMock.mockResolvedValue('https://firmada/documento');
  tablas.ordenes_produccion = [{
    id: ORDEN_ID,
    folio: 'O-1026_01',
    cotizacion_id: null,
    propuesta_revision_id: null,
    snapshot_json: SNAPSHOT_CON_ECONOMIA,
    pipeline: null,
  }];
  tablas.archivos = [{
    id: ARCHIVO_ID, entidad: 'propuesta_item', entidad_id: 'item-1', nombre_original: 'plano.dxf', nombre_erp: null,
    tema_codigo: null, reemplaza_a: null, ruta_storage: 'ruta/plano.dxf', bucket: 'archivos', mime: 'application/dxf',
    tamano_bytes: 2048, version: 1, vigente: true, creado_en: '2026-10-08T10:00:00.000Z',
  }];
  tablas.propuesta_items = [];
  tablas.logs = [];
});

describe('payload de Producción para el operador (caracterización R17)', () => {
  it('los entregables de la orden no traen ningún precio, costo, total ni moneda', async () => {
    const resultado = await obtenerDocumentosOrdenAccion({ ordenId: ORDEN_ID });

    expect(resultado.exito).toBe(true);
    const documentos = resultado.exito ? resultado.datos?.documentos ?? [] : [];
    expect(documentos.map((documento) => documento.id)).toEqual([ARCHIVO_ID]);
    const serializado = JSON.stringify(resultado);
    for (const prohibido of PROHIBIDOS) {
      expect(serializado, `fuga en Producción: «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it('la lista de documentos congelados nunca copia campos económicos del snapshot', () => {
    const documentos = construirDocumentosCongelados(SNAPSHOT_CON_ECONOMIA, [{
      id: ARCHIVO_ID, entidad: 'propuesta_item', entidad_id: 'item-1', nombre_original: 'plano.dxf',
      ruta_storage: 'ruta/plano.dxf', bucket: 'archivos', mime: 'application/dxf', tamano_bytes: 2048,
      version: 1, vigente: true, creado_en: '2026-10-08T10:00:00.000Z',
    }], []);

    const serializado = JSON.stringify(documentos);
    for (const prohibido of PROHIBIDOS) {
      expect(serializado, `fuga en documentos congelados: «${prohibido}»`).not.toContain(prohibido);
    }
  });
});
