// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { CatalogosBase } from '@/modulos/catalogos/tipos/indice';

const { obtenerMock, guardarCanalMock, alternarMock, versionesMock } = vi.hoisted(() => ({
  obtenerMock: vi.fn(),
  guardarCanalMock: vi.fn(),
  alternarMock: vi.fn(),
  versionesMock: vi.fn(),
}));

vi.mock('@/modulos/catalogos/acciones/indice', () => ({
  obtenerCatalogosBaseAccion: (...args: unknown[]) => obtenerMock(...args),
  guardarCanalAccion: (...args: unknown[]) => guardarCanalMock(...args),
  alternarActivoAccion: (...args: unknown[]) => alternarMock(...args),
  listarVersionesAccion: (...args: unknown[]) => versionesMock(...args),
  guardarMaterialAccion: vi.fn(),
  guardarEspesorAccion: vi.fn(),
  guardarProcesoAccion: vi.fn(),
  guardarGrupoEquipoAccion: vi.fn(),
  guardarGrupoPlaneadoAccion: vi.fn(),
  guardarProximaAccionAccion: vi.fn(),
}));

import { PestanaCatalogosBase } from '@/modulos/configuracion/componentes/pestana-catalogos-base';

const CANAL_WHATSAPP = '00000000-0000-4000-8000-0000000c0b01';
const CANAL_OTRO = '00000000-0000-4000-8000-0000000c0b02';
const CANAL_FAX = '00000000-0000-4000-8000-0000000c0b03';

function datos(puedeEditar = true): CatalogosBase {
  return {
    materiales: [],
    espesores: [],
    procesos: [],
    gruposEquipo: [],
    gruposPlaneados: [],
    proximasAcciones: [],
    canales: [
      {
        id: CANAL_WHATSAPP,
        codigo: 'WHATSAPP',
        nombre: 'WhatsApp',
        esOtro: false,
        activo: true,
        orden: 10,
        creadoEn: '2026-10-08T00:00:00.000Z',
      },
      {
        id: CANAL_OTRO,
        codigo: 'OTRO',
        nombre: 'Otro',
        esOtro: true,
        activo: true,
        orden: 60,
        creadoEn: '2026-10-08T00:00:00.000Z',
      },
      {
        id: CANAL_FAX,
        codigo: 'FAX',
        nombre: 'Fax',
        esOtro: false,
        activo: false,
        orden: 70,
        creadoEn: '2026-10-08T00:00:00.000Z',
      },
    ],
    areasTrabajo: [],
    puedeEditar,
  };
}

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerMock.mockResolvedValue({ exito: true, datos: datos() });
  guardarCanalMock.mockResolvedValue({ exito: true, datos: {} });
  alternarMock.mockResolvedValue({ exito: true, datos: { id: CANAL_FAX, activo: true } });
  versionesMock.mockResolvedValue({ exito: true, datos: [] });
});

afterEach(() => cleanup());

describe('sección Canales RFQ en Configuración → Catálogos base (DC-02)', () => {
  it('lista los canales con código, nombre, marca de Otro y estado', async () => {
    render(envolver(createElement(PestanaCatalogosBase)));

    expect(await screen.findByText('Canales RFQ')).toBeTruthy();
    const lista = screen.getByTestId('lista-canales');
    expect(lista.textContent).toContain('WHATSAPP');
    expect(lista.textContent).toContain('WhatsApp');
    expect(lista.textContent).toContain('OTRO');
    expect(lista.textContent).toContain('Inactivo');
    expect(screen.getByTestId('fila-canal-OTRO').textContent).toContain('Texto libre');
    expect(screen.getByTestId('fila-canal-WHATSAPP').textContent).not.toContain('Texto libre');
    expect(screen.getByTestId('catalogos-conteos').textContent).toContain('Canales RFQ: 2 activos / 3 totales');
  });

  it('da de alta un canal con marca de Otro y orden capturados', async () => {
    render(envolver(createElement(PestanaCatalogosBase)));
    fireEvent.click(await screen.findByTestId('catalogo-canal-nuevo'));

    fireEvent.change(screen.getByTestId('catalogo-canal-codigo'), { target: { value: 'referido' } });
    fireEvent.change(screen.getByTestId('catalogo-canal-nombre'), { target: { value: 'Referido' } });
    fireEvent.change(screen.getByTestId('catalogo-canal-orden'), { target: { value: '50' } });
    fireEvent.click(screen.getByTestId('catalogo-canal-es-otro'));
    fireEvent.submit(screen.getByTestId('catalogo-canal-formulario'));

    await waitFor(() =>
      expect(guardarCanalMock).toHaveBeenCalledWith({
        id: undefined,
        codigo: 'REFERIDO',
        nombre: 'Referido',
        esOtro: true,
        activo: true,
        orden: 50,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('catalogos-confirmacion').textContent).toContain('Canal guardado'),
    );
  });

  it('precarga el canal al editarlo y envía su id', async () => {
    render(envolver(createElement(PestanaCatalogosBase)));
    fireEvent.click(await screen.findByTestId('editar-canal-OTRO'));

    const codigo = screen.getByTestId('catalogo-canal-codigo') as HTMLInputElement;
    expect(codigo.value).toBe('OTRO');
    expect(codigo.disabled).toBe(true);
    expect((screen.getByTestId('catalogo-canal-es-otro') as HTMLInputElement).checked).toBe(true);

    fireEvent.change(screen.getByTestId('catalogo-canal-nombre'), { target: { value: 'Otro canal' } });
    fireEvent.submit(screen.getByTestId('catalogo-canal-formulario'));

    await waitFor(() =>
      expect(guardarCanalMock).toHaveBeenCalledWith({
        id: CANAL_OTRO,
        codigo: 'OTRO',
        nombre: 'Otro canal',
        esOtro: true,
        activo: true,
        orden: 60,
      }),
    );
  });

  it('cancelar la edición no envía cambios', async () => {
    render(envolver(createElement(PestanaCatalogosBase)));
    fireEvent.click(await screen.findByTestId('editar-canal-OTRO'));
    fireEvent.click(screen.getByTestId('catalogo-canal-cancelar'));

    expect(screen.queryByTestId('catalogo-canal-formulario')).toBeNull();
    expect(guardarCanalMock).not.toHaveBeenCalled();
  });

  it('muestra el mensaje del servidor cuando el alta choca con la regla de Otro', async () => {
    guardarCanalMock.mockResolvedValue({
      exito: false,
      error: 'Solo un canal puede ser “Otro”: desmarca el canal que lo tiene antes de asignarlo aquí',
    });
    render(envolver(createElement(PestanaCatalogosBase)));
    fireEvent.click(await screen.findByTestId('catalogo-canal-nuevo'));
    fireEvent.change(screen.getByTestId('catalogo-canal-codigo'), { target: { value: 'VISITA' } });
    fireEvent.change(screen.getByTestId('catalogo-canal-nombre'), { target: { value: 'Visita' } });
    fireEvent.click(screen.getByTestId('catalogo-canal-es-otro'));
    fireEvent.submit(screen.getByTestId('catalogo-canal-formulario'));

    await waitFor(() =>
      expect(screen.getByTestId('catalogos-error').textContent).toContain('Solo un canal puede ser'),
    );
  });

  it('activa un canal retirado sin ofrecer borrado', async () => {
    render(envolver(createElement(PestanaCatalogosBase)));
    const boton = await screen.findByTestId('alternar-canal-FAX');
    expect(boton.textContent).toContain('Activar');
    fireEvent.click(boton);

    await waitFor(() =>
      expect(alternarMock).toHaveBeenCalledWith({
        entidad: 'catalogo_canales',
        id: CANAL_FAX,
        activo: true,
      }),
    );
    expect(screen.getByTestId('fila-canal-WHATSAPP').textContent).not.toContain('Eliminar');
  });

  it('abre el historial de versiones del canal', async () => {
    render(envolver(createElement(PestanaCatalogosBase)));
    fireEvent.click(await screen.findByTestId('historial-canal-WHATSAPP'));

    await waitFor(() =>
      expect(versionesMock).toHaveBeenCalledWith({
        entidad: 'catalogo_canales',
        entidadId: CANAL_WHATSAPP,
      }),
    );
  });

  it('sin permiso de edición deja los controles del canal deshabilitados', async () => {
    obtenerMock.mockResolvedValue({ exito: true, datos: datos(false) });
    render(envolver(createElement(PestanaCatalogosBase)));

    const nuevo = await screen.findByTestId('catalogo-canal-nuevo');
    expect(nuevo.hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('editar-canal-WHATSAPP').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('alternar-canal-WHATSAPP').hasAttribute('disabled')).toBe(true);
  });
});
