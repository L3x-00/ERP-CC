import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  usuarioMock,
  puedeMock,
  ordenMock,
  origenMock,
  fromMock,
} = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  puedeMock: vi.fn(),
  ordenMock: vi.fn(),
  origenMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => puedeMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ from: fromMock }),
}));
vi.mock('@/modulos/produccion/servicios/documentos-orden-servicio', () => ({
  obtenerOrdenDocumental: (...argumentos: unknown[]) => ordenMock(...argumentos),
}));
vi.mock('@/modulos/ordenes/servicios/origen-propuesta-ordenes-servicio', () => ({
  obtenerOrigenPropuestaOrdenesServicio: (...argumentos: unknown[]) => origenMock(...argumentos),
}));

import { obtenerAccesosOrdenAccion } from '@/modulos/produccion/acciones/obtener-accesos-orden';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';
const ENTREGA_ID = '44444444-4444-4444-8444-444444444444';
const USUARIO = { id: 'usuario-1', rol: 'admin' };

const ORDEN = {
  id: ORDEN_ID,
  folio: 'OP-001178',
  cotizacionId: '22222222-2222-4222-8222-222222222222',
  cotizacionFolio: 'CNC-1026_01',
  propuestaRevisionId: '33333333-3333-4333-8333-333333333333',
  snapshotJson: null,
};

const FACTURA = {
  id: '55555555-5555-4555-8555-555555555555',
  folio_fiscal: 'F-001028',
  estado: 'EMITIDA',
  total: 25000,
  entrega_id: ENTREGA_ID,
  creado_en: '2026-10-25T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue(USUARIO);
  ordenMock.mockResolvedValue(ORDEN);
  origenMock.mockResolvedValue({
    [ORDEN_ID]: {
      propuestaId: '66666666-6666-4666-8666-666666666666',
      propuestaFolio: 'PRO-1026_01',
      revisionLetra: 'A',
    },
  });
  fromMock.mockImplementation((tabla: string) => {
    if (tabla === 'facturas') {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [FACTURA], error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        in: async () => ({
          data: [{ id: ENTREGA_ID, folio: 'NE-001028', folio_sii: null }],
          error: null,
        }),
      }),
    };
  });
});

function permisos(concedidos: readonly string[]) {
  puedeMock.mockImplementation(async (_usuario: unknown, permiso: string) => concedidos.includes(permiso));
}

describe('accesos rápidos de la orden', () => {
  it('devuelve RFQ, propuesta y facturas para administración con finanzas', async () => {
    permisos(['gestionar_produccion', 'rfq_vista', 'propuesta_vista', 'ver_finanzas', 'orden_vista']);

    const respuesta = await obtenerAccesosOrdenAccion({ ordenId: ORDEN_ID });

    expect(respuesta).toEqual({
      exito: true,
      datos: {
        ordenFolio: 'OP-001178',
        rfq: { id: ORDEN.cotizacionId, folio: 'CNC-1026_01' },
        propuesta: { id: '66666666-6666-4666-8666-666666666666', folio: 'PRO-1026_01' },
        facturas: [{
          id: FACTURA.id,
          folioFiscal: 'F-001028',
          estado: 'EMITIDA',
          total: 25000,
          entregaId: ENTREGA_ID,
          entregaFolio: 'NE-001028',
          creadoEn: FACTURA.creado_en,
        }],
        permisos: { rfq: true, propuesta: true, entregas: true, facturas: true, ficha: true },
      },
    });
  });

  it('no consulta ni expone facturas sin ver_finanzas', async () => {
    permisos(['ver_planeacion']);

    const respuesta = await obtenerAccesosOrdenAccion({ ordenId: ORDEN_ID });

    expect(respuesta.exito).toBe(true);
    if (!respuesta.exito || !respuesta.datos) throw new Error('Se esperaban datos');
    expect(respuesta.datos.facturas).toEqual([]);
    expect(respuesta.datos.permisos).toEqual({
      rfq: false,
      propuesta: false,
      entregas: false,
      facturas: false,
      ficha: false,
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rechaza la consulta sin permiso de Producción ni Planeación', async () => {
    permisos(['rfq_vista']);

    const respuesta = await obtenerAccesosOrdenAccion({ ordenId: ORDEN_ID });

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para consultar la orden' });
    expect(ordenMock).not.toHaveBeenCalled();
  });
});
