import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const { permisosConcedidos, notFoundMock, usuarioMock, fichaMock, componenteFicha } = vi.hoisted(() => ({
  permisosConcedidos: new Set<string>(),
  notFoundMock: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  usuarioMock: vi.fn(),
  fichaMock: vi.fn(),
  componenteFicha: vi.fn(() => null),
}));

vi.mock('next/navigation', () => ({ notFound: notFoundMock }));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: usuarioMock,
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: vi.fn(async (_usuario: unknown, permiso: string) => permisosConcedidos.has(permiso)),
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: vi.fn(() => ({})) }));
vi.mock('@/modulos/ordenes/servicios/ficha-orden-servicio', () => ({ obtenerFichaOrdenServicio: fichaMock }));
vi.mock('@/modulos/ordenes/componentes/ficha-orden', () => ({ FichaOrden: componenteFicha }));

import PaginaOrden from '@/app/(privado)/ordenes/[id]/page';

const ID_ORDEN = '00000000-0000-4000-8000-0000000c8131';
const FICHA = { orden: { id: ID_ORDEN } };

async function renderizar(
  searchParams?: Record<string, string | string[] | undefined>,
): Promise<ReactElement<Record<string, unknown>>> {
  const elemento = await PaginaOrden({
    params: Promise.resolve({ id: ID_ORDEN }),
    ...(searchParams ? { searchParams: Promise.resolve(searchParams) } : {}),
  });
  return elemento as ReactElement<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  permisosConcedidos.clear();
  permisosConcedidos.add('orden_vista');
  usuarioMock.mockResolvedValue({ id: 'u-ficha', rol: 'vendedor', activo: true });
  fichaMock.mockResolvedValue(FICHA);
});

describe('/ordenes/[id] · destino de la ficha (C8.1)', () => {
  it('abre en la pestaña pedida por ?pestana= cuando es válida', async () => {
    const elemento = await renderizar({ pestana: 'comentarios' });
    expect(elemento.type).toBe(componenteFicha);
    expect(elemento.props.pestanaInicial).toBe('comentarios');
  });

  it.each([
    ['inexistente', { pestana: 'inexistente' }],
    ['arreglo', { pestana: ['comentarios', 'resumen'] }],
    ['ausente', {}],
  ])('ignora una pestaña %s y deja la predeterminada', async (_caso, parametros) => {
    const elemento = await renderizar(parametros);
    expect(elemento.props.pestanaInicial).toBeUndefined();
  });

  it('funciona sin searchParams', async () => {
    const elemento = await renderizar();
    expect(elemento.props.pestanaInicial).toBeUndefined();
  });

  it('entrega a la ficha el usuario y los permisos de Comentarios y Adjuntos', async () => {
    permisosConcedidos.add('aprobar_ordenes');
    usuarioMock.mockResolvedValue({ id: 'u-admin', rol: 'admin', activo: true });

    const elemento = await renderizar();
    expect(elemento.props.usuarioActualId).toBe('u-admin');
    expect(elemento.props.permisos).toMatchObject({
      puedeEliminarTodos: true,
      puedeAdjuntar: true,
    });
  });

  it('resuelve con rfq_vista y propuesta_vista si habilitan los enlaces del origen comercial', async () => {
    permisosConcedidos.add('rfq_vista');
    let elemento = await renderizar();
    expect(elemento.props.permisos).toMatchObject({ puedeVerRfq: true, puedeVerPropuesta: false });

    permisosConcedidos.add('propuesta_vista');
    elemento = await renderizar();
    expect(elemento.props.permisos).toMatchObject({ puedeVerRfq: true, puedeVerPropuesta: true });
  });

  it('sin rfq_vista ni propuesta_vista los enlaces del origen quedan deshabilitados', async () => {
    const elemento = await renderizar();
    expect(elemento.props.permisos).toMatchObject({ puedeVerRfq: false, puedeVerPropuesta: false });
  });

  it('sin rol admin ni aprobar_ordenes no concede borrar comentarios ajenos ni Adjuntos', async () => {
    const elemento = await renderizar();
    expect(elemento.props.permisos).toMatchObject({
      puedeEliminarTodos: false,
      puedeAdjuntar: false,
    });
  });

  it('sin orden_vista responde notFound', async () => {
    permisosConcedidos.clear();
    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
