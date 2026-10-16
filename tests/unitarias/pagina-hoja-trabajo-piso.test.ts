import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const { notFoundMock, redirectMock, accesoMock, enPisoMock, leerHojaMock, componenteHoja, admin } = vi.hoisted(() => ({
  notFoundMock: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn((ruta: string): never => {
    throw new Error(`NEXT_REDIRECT:${ruta}`);
  }),
  accesoMock: vi.fn(),
  enPisoMock: vi.fn(),
  leerHojaMock: vi.fn(),
  componenteHoja: vi.fn(() => null),
  admin: { tipo: 'admin' },
}));

vi.mock('next/navigation', () => ({ notFound: notFoundMock, redirect: redirectMock }));
vi.mock('@/nucleo/autenticacion/obtener-operador-sesion', () => ({
  obtenerAccesoLecturaPiso: () => accesoMock(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => admin }));
vi.mock('@/modulos/ordenes/servicios/hoja-trabajo-lectura-servicio', () => ({
  ordenEstaEnPiso: (...argumentos: unknown[]) => enPisoMock(...argumentos),
  leerHojaTrabajoOrden: (...argumentos: unknown[]) => leerHojaMock(...argumentos),
}));
vi.mock('@/modulos/ordenes/componentes/hoja-trabajo-piso', () => ({ HojaTrabajoPiso: componenteHoja }));

import PaginaHojaTrabajoPiso, { dynamic } from '@/app/(piso)/produccion-piso/hoja/[ordenId]/page';

const ORDEN_ID = '00000000-0000-4000-8000-0000000c8371';
const OPERADOR_ID = '00000000-0000-4000-8000-0000000c8372';
const HOJA = { folio: 'O-1026_01', clienteNombre: 'Cliente', observacionesOrden: null, items: [], archivos: [] };

async function renderizar(ordenId = ORDEN_ID): Promise<ReactElement<Record<string, unknown>>> {
  const elemento = await PaginaHojaTrabajoPiso({ params: Promise.resolve({ ordenId }) });
  return elemento as ReactElement<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  accesoMock.mockResolvedValue({ operadorId: OPERADOR_ID });
  enPisoMock.mockResolvedValue(true);
  leerHojaMock.mockResolvedValue(HOJA);
});

describe('/produccion-piso/hoja/[ordenId] (C8.3c)', () => {
  it('se renderiza dinámicamente porque autorización y hoja dependen de la sesión y del piso actual', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('sin sesión de piso manda a la terminal del operador y no lee nada', async () => {
    accesoMock.mockResolvedValue(null);

    await expect(renderizar()).rejects.toThrow('NEXT_REDIRECT:/operador');
    expect(enPisoMock).not.toHaveBeenCalled();
    expect(leerHojaMock).not.toHaveBeenCalled();
  });

  it('un id que no es UUID es 404 sin tocar la base', async () => {
    await expect(renderizar('no-es-uuid')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(enPisoMock).not.toHaveBeenCalled();
  });

  it('una orden que no está en el piso del operador es 404 y no se lee su snapshot', async () => {
    enPisoMock.mockResolvedValue(false);

    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(enPisoMock).toHaveBeenCalledWith(admin, ORDEN_ID, OPERADOR_ID);
    expect(leerHojaMock).not.toHaveBeenCalled();
  });

  it('entrega la hoja de la orden al componente imprimible', async () => {
    const elemento = await renderizar();

    expect(elemento.type).toBe(componenteHoja);
    expect(elemento.props.ordenId).toBe(ORDEN_ID);
    expect(elemento.props.hoja).toEqual(HOJA);
    expect(leerHojaMock).toHaveBeenCalledWith(admin, ORDEN_ID);
  });

  it('la vista de administrador pregunta por el piso completo (operadorId null)', async () => {
    accesoMock.mockResolvedValue({ operadorId: null });

    await renderizar();

    expect(enPisoMock).toHaveBeenCalledWith(admin, ORDEN_ID, null);
  });

  it('una orden sin hoja congelada llega con hoja null', async () => {
    leerHojaMock.mockResolvedValue(null);

    const elemento = await renderizar();

    expect(elemento.props.hoja).toBeNull();
  });
});
