import { beforeEach, describe, expect, it, vi } from 'vitest';

const { permisosConcedidos, redirectMock, notFoundMock, usuarioMock } = vi.hoisted(() => ({
  permisosConcedidos: new Set<string>(),
  redirectMock: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFoundMock: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  usuarioMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock, notFound: notFoundMock }));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: usuarioMock,
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: vi.fn(async (_usuario: unknown, permiso: string) => permisosConcedidos.has(permiso)),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({ crearClienteSupabaseServidor: vi.fn(async () => ({})) }));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: vi.fn(() => ({})) }));
vi.mock('@/modulos/ordenes/servicios/ordenes-servicio', () => ({
  obtenerOrdenesConPartidasServicio: vi.fn(async () => []),
}));
vi.mock('@/modulos/ordenes/servicios/datos-comparativa-servicio', () => ({
  obtenerDatosComparativaServicio: vi.fn(async () => ({ sesiones: [], entregas: [], cuentas: [] })),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({ obtenerCatalogosRfqAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/componentes/panel-orden-interna', () => ({ PanelOrdenInterna: () => null }));
vi.mock('@/modulos/ordenes/componentes/comparativa-ordenes', () => ({ ComparativaOrdenes: () => null }));
vi.mock('@/modulos/ordenes/componentes/sincronizador-ordenes-realtime', () => ({
  SincronizadorOrdenesRealtime: () => null,
}));
vi.mock('@/modulos/ordenes/componentes/tabla-ordenes', () => ({ TablaOrdenes: () => null }));

import PaginaOrdenes from '@/app/(privado)/ordenes/page';

const ID_ORDEN = '00000000-0000-4000-8000-0000000c8121';

function conParametros(parametros: Record<string, string | string[] | undefined>) {
  return PaginaOrdenes({ searchParams: Promise.resolve(parametros) });
}

beforeEach(() => {
  vi.clearAllMocks();
  permisosConcedidos.clear();
  permisosConcedidos.add('orden_vista');
  usuarioMock.mockResolvedValue({ id: 'u-c81', rol: 'vendedor', activo: true });
});

describe('/ordenes?ordenId= → ficha (C8.1)', () => {
  it('redirige un uuid válido a la ficha con Comentarios activa', async () => {
    await expect(conParametros({ ordenId: ID_ORDEN }))
      .rejects.toThrow(`NEXT_REDIRECT:/ordenes/${ID_ORDEN}?pestana=comentarios`);
    expect(redirectMock).toHaveBeenCalledWith(`/ordenes/${ID_ORDEN}?pestana=comentarios`);
  });

  it('sin orden_vista responde notFound y no redirige (no filtra qué ids existen)', async () => {
    permisosConcedidos.clear();

    await expect(conParametros({ ordenId: ID_ORDEN })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('sin sesión responde notFound y no redirige', async () => {
    usuarioMock.mockResolvedValue(null);

    await expect(conParametros({ ordenId: ID_ORDEN })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    ['texto libre', 'no-es-uuid'],
    ['numérico', '12345'],
    ['intento de salida de ruta', '../../admin'],
    ['uuid con sufijo', `${ID_ORDEN}?x=1`],
  ])('un ordenId no válido (%s) muestra la cola sin redirigir', async (_caso, ordenId) => {
    await expect(conParametros({ ordenId })).resolves.toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('ignora un ordenId repetido (arreglo) y muestra la cola', async () => {
    await expect(conParametros({ ordenId: [ID_ORDEN, ID_ORDEN] })).resolves.toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('sin ordenId muestra la cola', async () => {
    await expect(conParametros({})).resolves.toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
