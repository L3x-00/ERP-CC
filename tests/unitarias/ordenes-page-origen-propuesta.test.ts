import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  permisosConcedidos, usuarioMock, ordenesMock, comparativaMock, origenMock, tablaMock, clienteAdmin,
} = vi.hoisted(() => ({
  permisosConcedidos: new Set<string>(),
  usuarioMock: vi.fn(),
  ordenesMock: vi.fn(),
  comparativaMock: vi.fn(),
  origenMock: vi.fn(),
  tablaMock: () => null,
  clienteAdmin: { __cliente: 'admin' },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: usuarioMock,
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: vi.fn(async (_usuario: unknown, permiso: string) => permisosConcedidos.has(permiso)),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({ crearClienteSupabaseServidor: vi.fn(async () => ({})) }));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: vi.fn(() => clienteAdmin) }));
vi.mock('@/modulos/ordenes/servicios/ordenes-servicio', () => ({
  obtenerOrdenesConPartidasServicio: ordenesMock,
}));
vi.mock('@/modulos/ordenes/servicios/datos-comparativa-servicio', () => ({
  obtenerDatosComparativaServicio: comparativaMock,
}));
vi.mock('@/modulos/ordenes/servicios/origen-propuesta-ordenes-servicio', () => ({
  obtenerOrigenPropuestaOrdenesServicio: origenMock,
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({ obtenerCatalogosRfqAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/componentes/panel-orden-interna', () => ({ PanelOrdenInterna: () => null }));
vi.mock('@/modulos/ordenes/componentes/comparativa-ordenes', () => ({ ComparativaOrdenes: () => null }));
vi.mock('@/modulos/ordenes/componentes/sincronizador-ordenes-realtime', () => ({
  SincronizadorOrdenesRealtime: () => null,
}));
vi.mock('@/modulos/ordenes/componentes/tabla-ordenes', () => ({ TablaOrdenes: tablaMock }));

import PaginaOrdenes from '@/app/(privado)/ordenes/page';
import type { OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';

const ID_COMERCIAL = '00000000-0000-4000-8000-0000000d3001';
const ID_INTERNA = '00000000-0000-4000-8000-0000000d3002';
const ID_HISTORICA = '00000000-0000-4000-8000-0000000d3003';
const ID_PROPUESTA = '00000000-0000-4000-8000-0000000d3004';

function entrada(id: string, folio: string, extra: Record<string, unknown> = {}) {
  return {
    orden: {
      id,
      folio: `OP-${folio}`,
      folioSii: `O-${folio}`,
      folioCotizacionCnc: null,
      estado: 'programada',
      estadoSii: 'PLANIFICADA',
      prioridad: 'normal',
      fechaCompromiso: '2099-12-31T18:00:00.000Z',
      fechaCompromisoComercial: null,
      fechaOperativa: '2099-12-31T18:00:00.000Z',
      actualizadoEn: '2026-10-10T01:00:00.000Z',
      creadoEn: '2026-10-10T01:00:00.000Z',
      archivadaEn: null,
      esInterna: false,
      idHistorico: null,
      ...extra,
    },
    partidas: [],
  };
}

function buscar(nodo: ReactNode, tipo: unknown): ReactElement | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const encontrado = buscar(hijo, tipo);
      if (encontrado) return encontrado;
    }
    return null;
  }
  if (!isValidElement(nodo)) return null;
  if (nodo.type === tipo) return nodo;
  return buscar((nodo.props as { children?: ReactNode }).children, tipo);
}

async function propsDeLaTabla() {
  const pagina = await PaginaOrdenes({ searchParams: Promise.resolve({}) });
  const tabla = buscar(pagina, tablaMock);
  expect(tabla).not.toBeNull();
  return (tabla as ReactElement).props as {
    ordenes: OrdenTabla[];
    puedeLiberar: boolean;
    puedeVerPropuesta: boolean;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permisosConcedidos.clear();
  permisosConcedidos.add('orden_vista');
  usuarioMock.mockResolvedValue({ id: 'u-origen', rol: 'vendedor', activo: true });
  ordenesMock.mockResolvedValue([
    entrada(ID_COMERCIAL, '0101'),
    entrada(ID_INTERNA, '0102', { esInterna: true }),
    entrada(ID_HISTORICA, '0103', { idHistorico: 'LEGACY-1', folioSii: null }),
  ]);
  comparativaMock.mockResolvedValue({
    sesiones: [], entregas: [], cuentas: null, entregadaPorPartida: {}, entregadaPorOrden: {},
  });
  origenMock.mockResolvedValue({
    [ID_COMERCIAL]: { propuestaId: ID_PROPUESTA, propuestaFolio: 'CNC-1026_07', revisionLetra: 'B' },
  });
});

describe('/ordenes · propuesta de origen en la cola', () => {
  it('lee el origen con el cliente de servicio y los ids exactos de la lectura del usuario', async () => {
    await propsDeLaTabla();

    expect(origenMock).toHaveBeenCalledTimes(1);
    expect(origenMock).toHaveBeenCalledWith(clienteAdmin, [ID_COMERCIAL, ID_INTERNA, ID_HISTORICA]);
    expect(comparativaMock.mock.calls[0][0]).toBe(clienteAdmin);
  });

  it('entrega el origen solo a la orden comercial; interna e histórica quedan en null', async () => {
    const { ordenes } = await propsDeLaTabla();

    expect(ordenes.find((orden) => orden.id === ID_COMERCIAL)?.origenPropuesta).toEqual({
      propuestaId: ID_PROPUESTA, propuestaFolio: 'CNC-1026_07', revisionLetra: 'B',
    });
    expect(ordenes.find((orden) => orden.id === ID_INTERNA)?.origenPropuesta).toBeNull();
    expect(ordenes.find((orden) => orden.id === ID_HISTORICA)?.origenPropuesta).toBeNull();
  });

  it('sin propuesta_vista el folio sigue llegando a la tabla, con el enlace deshabilitado', async () => {
    const props = await propsDeLaTabla();

    expect(props.puedeVerPropuesta).toBe(false);
    expect(props.ordenes[0].origenPropuesta?.propuestaFolio).toBe('CNC-1026_07');
  });

  it('con propuesta_vista habilita el enlace sin tocar el resto de permisos de la cola', async () => {
    permisosConcedidos.add('propuesta_vista');

    const props = await propsDeLaTabla();

    expect(props.puedeVerPropuesta).toBe(true);
    expect(props.puedeLiberar).toBe(false);
  });

  it('propuesta_vista no sustituye a orden_vista: sin orden_vista responde 404 y no lee nada', async () => {
    permisosConcedidos.clear();
    permisosConcedidos.add('propuesta_vista');

    await expect(PaginaOrdenes({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(origenMock).not.toHaveBeenCalled();
    expect(ordenesMock).not.toHaveBeenCalled();
  });

  it('un fallo al leer el origen se propaga: la cola no finge «sin origen»', async () => {
    origenMock.mockRejectedValue(new Error('URI too long'));

    await expect(PaginaOrdenes({ searchParams: Promise.resolve({}) })).rejects.toThrow('URI too long');
  });

  it('un fallo de la comparativa se sigue propagando como antes', async () => {
    comparativaMock.mockRejectedValue(new Error('Consulta incompleta'));

    await expect(PaginaOrdenes({ searchParams: Promise.resolve({}) })).rejects.toThrow('Consulta incompleta');
  });

  it('con la cola vacía pide el origen sin ids (el servicio no consulta) y la tabla queda sin filas', async () => {
    ordenesMock.mockResolvedValue([]);
    origenMock.mockResolvedValue({});

    const props = await propsDeLaTabla();

    expect(props.ordenes).toEqual([]);
    expect(origenMock).toHaveBeenCalledWith(clienteAdmin, []);
  });
});
