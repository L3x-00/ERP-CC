// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { urlMock } = vi.hoisted(() => ({ urlMock: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/obtener-url-archivo-ficha', () => ({
  obtenerUrlArchivoFichaAccion: (...argumentos: unknown[]) => urlMock(...argumentos),
}));

import { PanelArchivosFicha } from '@/modulos/ordenes/componentes/panel-archivos-ficha';
import type { ArchivoFicha } from '@/modulos/ordenes/tipos/ficha-orden';

const ORDEN_ID = '00000000-0000-4000-8000-0000000c8351';
const PATRON_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

const ARCHIVOS: ArchivoFicha[] = [
  {
    archivoId: '00000000-0000-4000-8000-0000000c8352', nombreOriginal: 'pieza.dxf', nombreErp: 'IT01-pieza.dxf',
    origen: 'RFQ', asociadoA: 'IT01', tipo: 'CAD', disponible: true,
  },
  {
    archivoId: '00000000-0000-4000-8000-0000000c8353', nombreOriginal: 'CNC-1026_04-A.pdf', nombreErp: 'CNC-1026_04-A.pdf',
    origen: 'Propuesta Rev A', asociadoA: '(general)', tipo: '-', disponible: true,
  },
  {
    archivoId: '00000000-0000-4000-8000-0000000c8354', nombreOriginal: null, nombreErp: null,
    origen: 'RFQ', asociadoA: '(general)', tipo: '-', disponible: false,
  },
];

function montar(archivos: ArchivoFicha[] = ARCHIVOS) {
  return render(createElement(PanelArchivosFicha, { ordenId: ORDEN_ID, archivos }));
}

beforeEach(() => {
  vi.clearAllMocks();
  urlMock.mockResolvedValue({ exito: true, datos: { url: 'https://firmada/archivo' } });
});
afterEach(() => cleanup());

describe('pestaña Archivos vivos como tabla (R09)', () => {
  it('muestra las cuatro columnas Archivo | Origen | Asociado a | Tipo', () => {
    montar();

    const encabezados = within(screen.getByTestId('ficha-panel-archivos'))
      .getAllByRole('columnheader').map((celda) => celda.textContent?.trim());
    expect(encabezados).toEqual(['Archivo', 'Origen', 'Asociado a', 'Tipo']);
  });

  it('pieza.dxf = RFQ / IT01 / CAD y el PDF de la Rev A = Propuesta Rev A / (general) / «-»', () => {
    montar();

    const filas = within(screen.getByTestId('ficha-panel-archivos')).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(3);
    const celdas = (fila: HTMLElement) => within(fila).getAllByRole('cell').map((celda) => celda.textContent?.trim());
    const primera = celdas(filas[0] as HTMLElement);
    expect(primera[0]).toContain('pieza.dxf');
    expect(primera.slice(1)).toEqual(['RFQ', 'IT01', 'CAD']);
    const segunda = celdas(filas[1] as HTMLElement);
    expect(segunda[0]).toContain('CNC-1026_04-A.pdf');
    expect(segunda.slice(1)).toEqual(['Propuesta Rev A', '(general)', '-']);
  });

  it('muestra el nombre original y el nombre ERP (O-12)', () => {
    montar();

    const primera = within(screen.getByTestId('ficha-panel-archivos')).getAllByRole('row')[1] as HTMLElement;
    expect(primera.textContent).toContain('pieza.dxf');
    expect(primera.textContent).toContain('IT01-pieza.dxf');
  });

  it('no repite el nombre ERP cuando es idéntico al original', () => {
    montar();

    const segunda = within(screen.getByTestId('ficha-panel-archivos')).getAllByRole('row')[2] as HTMLElement;
    expect(segunda.textContent?.match(/CNC-1026_04-A\.pdf/gu)).toHaveLength(1);
  });

  it('un archivo no disponible lo dice y no se puede abrir', () => {
    montar();

    const tercera = within(screen.getByTestId('ficha-panel-archivos')).getAllByRole('row')[3] as HTMLElement;
    expect(tercera.textContent).toContain('No disponible');
    expect(within(tercera).queryByRole('button')).toBeNull();
  });

  it('no imprime ningún UUID ni la palabra snapshot', () => {
    montar();

    const texto = screen.getByTestId('ficha-panel-archivos').textContent ?? '';
    expect(texto).not.toMatch(PATRON_UUID);
    expect(texto).not.toMatch(/snapshot/iu);
  });

  it('sin archivos lo declara (sin hablar de snapshot)', () => {
    montar([]);

    const texto = screen.getByTestId('ficha-panel-archivos').textContent ?? '';
    expect(texto).toContain('Sin archivos registrados');
    expect(texto).not.toMatch(/snapshot/iu);
  });
});

describe('abrir un archivo desde la ficha (O-05)', () => {
  it('pide la URL firmada con la orden y el archivo, y la abre en una pestaña nueva', async () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    montar();

    fireEvent.click(screen.getByRole('button', { name: /pieza\.dxf/u }));

    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://firmada/archivo', '_blank', 'noopener,noreferrer'));
    expect(urlMock).toHaveBeenCalledWith({ ordenId: ORDEN_ID, archivoId: ARCHIVOS[0]?.archivoId });
    abrir.mockRestore();
  });

  it('si la acción falla muestra un aviso genérico y no abre nada', async () => {
    urlMock.mockResolvedValue({ exito: false, error: 'El archivo no pertenece a esta orden' });
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    montar();

    fireEvent.click(screen.getByRole('button', { name: /pieza\.dxf/u }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo abrir el archivo');
    expect(abrir).not.toHaveBeenCalled();
    abrir.mockRestore();
  });
});
