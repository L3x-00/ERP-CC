import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  usuarioMock,
  puedeMock,
  obtenerOrdenMock,
  listarDocumentosMock,
  listarNotasMock,
  firmarMock,
  admin,
} = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  puedeMock: vi.fn(),
  obtenerOrdenMock: vi.fn(),
  listarDocumentosMock: vi.fn(),
  listarNotasMock: vi.fn(),
  firmarMock: vi.fn(),
  admin: { tipo: 'admin' },
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => puedeMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => admin,
}));
vi.mock('@/modulos/produccion/servicios/documentos-orden-servicio', () => ({
  obtenerOrdenDocumental: (...argumentos: unknown[]) => obtenerOrdenMock(...argumentos),
  listarDocumentosOrden: (...argumentos: unknown[]) => listarDocumentosMock(...argumentos),
}));
vi.mock('@/modulos/produccion/servicios/nota-entrega-documento-servicio', () => ({
  listarNotasEntregaOrden: (...argumentos: unknown[]) => listarNotasMock(...argumentos),
}));
vi.mock('@/nucleo/almacenamiento/archivos/servicio', () => ({
  firmarLecturaArchivo: (...argumentos: unknown[]) => firmarMock(...argumentos),
}));

import { obtenerDocumentosOrdenAccion } from '@/modulos/produccion/acciones/obtener-documentos-orden';
import { obtenerUrlDocumentoOrdenAccion } from '@/modulos/produccion/acciones/obtener-url-documento-orden';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';
const ARCHIVO_ID = '22222222-2222-4222-8222-222222222222';
const OTRO_ARCHIVO_ID = '33333333-3333-4333-8333-333333333333';

const ordenInterna = {
  id: ORDEN_ID,
  folio: 'O-1026_01',
  cotizacionId: '44444444-4444-4444-8444-444444444444',
  cotizacionFolio: 'RFQ-1026_01',
  propuestaRevisionId: '55555555-5555-4555-8555-555555555555',
  snapshotJson: {
    version: 1,
    orden_id: ORDEN_ID,
    origen: {},
    cabecera: { total: 75000, moneda: 'MXN' },
    items: [{ precio_unitario: 75000 }],
    archivos: [],
  },
};

const documentoHistorico = {
  id: ARCHIVO_ID,
  ruta: 'rfq_item/plano-v1.dxf',
  nombre: 'plano.dxf',
  tamano: 2_000_000,
  tipo: 'application/dxf',
  creadoEn: '2026-10-08T10:00:00.000Z',
  version: 1,
  vigente: false,
  origen: 'rfq_item',
  itemCodigo: 'IT01',
  congelado: true,
  disponible: true,
  linaje: `rfq_item|${ARCHIVO_ID}`,
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue({ id: 'usuario', rol: 'operador', activo: true });
  puedeMock.mockResolvedValue(true);
  obtenerOrdenMock.mockResolvedValue(ordenInterna);
  listarDocumentosMock.mockResolvedValue([documentoHistorico]);
  listarNotasMock.mockResolvedValue([]);
  firmarMock.mockResolvedValue('https://firmada/documento');
});

describe('entregables de Producción', () => {
  it('no serializa el snapshot comercial ni la revisión interna al navegador', async () => {
    const resultado = await obtenerDocumentosOrdenAccion({ ordenId: ORDEN_ID });

    expect(resultado.exito).toBe(true);
    const ordenPublica = resultado.exito ? resultado.datos?.orden : null;
    expect(ordenPublica).toEqual({
      id: ORDEN_ID,
      folio: 'O-1026_01',
      cotizacionId: ordenInterna.cotizacionId,
      cotizacionFolio: 'RFQ-1026_01',
    });
    expect(ordenPublica).not.toHaveProperty('snapshotJson');
    expect(ordenPublica).not.toHaveProperty('propuestaRevisionId');
  });
});

describe('firma de documentos de Orden', () => {
  it('firma la versión histórica congelada que pertenece a la Orden', async () => {
    const resultado = await obtenerUrlDocumentoOrdenAccion({
      ordenId: ORDEN_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(resultado).toMatchObject({ exito: true, datos: { url: 'https://firmada/documento' } });
    expect(firmarMock).toHaveBeenCalledWith(admin, ARCHIVO_ID, 300);
  });

  it('rechaza un archivo arbitrario de otra Orden', async () => {
    const resultado = await obtenerUrlDocumentoOrdenAccion({
      ordenId: ORDEN_ID,
      archivoId: OTRO_ARCHIVO_ID,
    });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('no intenta firmar una referencia congelada marcada como no disponible', async () => {
    listarDocumentosMock.mockResolvedValue([{ ...documentoHistorico, disponible: false }]);

    const resultado = await obtenerUrlDocumentoOrdenAccion({
      ordenId: ORDEN_ID,
      archivoId: ARCHIVO_ID,
    });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });
});
