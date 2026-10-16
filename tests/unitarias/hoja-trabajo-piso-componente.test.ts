// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { urlMock } = vi.hoisted(() => ({ urlMock: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/obtener-url-archivo-piso', () => ({
  obtenerUrlArchivoPisoAccion: (...argumentos: unknown[]) => urlMock(...argumentos),
}));

import { HojaTrabajoPiso } from '@/modulos/ordenes/componentes/hoja-trabajo-piso';
import type { HojaTrabajoOrden } from '@/modulos/ordenes/tipos/ficha-orden';

const ORDEN_ID = '00000000-0000-4000-8000-0000000c8381';
const ARCHIVO_ID = '00000000-0000-4000-8000-0000000c8382';
const PATRON_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

const HOJA: HojaTrabajoOrden = {
  folio: 'O-1026_01',
  clienteNombre: 'Cliente de piso',
  observacionesOrden: 'Entregar con empaque',
  items: [{
    codigoItem: 'IT01', descripcion: 'Soporte lateral', cantidad: 4, material: 'Acero A36', espesor: '3 mm',
    procesos: ['Corte láser', 'Doblez'], observaciones: 'Rebabar bordes',
  }],
  archivos: [{
    archivoId: ARCHIVO_ID, nombreOriginal: 'plano.dxf', nombreErp: 'IT01-plano.dxf',
    origen: 'Propuesta', asociadoA: 'IT01', tipo: 'Plano', disponible: true,
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  urlMock.mockResolvedValue({ exito: true, datos: { url: 'https://firmada/archivo' } });
});
afterEach(() => cleanup());

describe('hoja de trabajo del piso (C8.3c)', () => {
  it('muestra cliente, orden, ITxx, descripción, cantidad, material, espesor, procesos, observaciones y archivos', () => {
    render(createElement(HojaTrabajoPiso, { ordenId: ORDEN_ID, hoja: HOJA }));

    const texto = screen.getByTestId('hoja-trabajo').textContent ?? '';
    for (const esperado of [
      'Orden de servicio O-1026_01', 'Cliente de piso', 'IT01', 'Soporte lateral', 'Acero A36', '3 mm',
      'Corte láser', 'Doblez', 'Rebabar bordes', 'Entregar con empaque', 'plano.dxf',
    ]) {
      expect(texto).toContain(esperado);
    }
  });

  it('no muestra montos, moneda, totales ni identificadores internos', () => {
    render(createElement(HojaTrabajoPiso, { ordenId: ORDEN_ID, hoja: HOJA }));

    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/\bMXN\b|\bUSD\b|\$|Subtotal|\bIVA\b|Total|snapshot/u);
    expect(texto).not.toMatch(PATRON_UUID);
  });

  it('ofrece volver al piso y un botón Imprimir fuera del área que se imprime', () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(createElement(HojaTrabajoPiso, { ordenId: ORDEN_ID, hoja: HOJA }));

    const volver = screen.getByRole('link', { name: /Volver al piso/u });
    expect(volver.getAttribute('href')).toBe('/produccion-piso');
    const boton = screen.getByRole('button', { name: 'Imprimir' });
    expect(boton.closest('.print\\:hidden')).not.toBeNull();
    fireEvent.click(boton);
    expect(imprimir).toHaveBeenCalledTimes(1);
    imprimir.mockRestore();
  });

  it('el nombre del archivo lo abre con la acción del piso', async () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    render(createElement(HojaTrabajoPiso, { ordenId: ORDEN_ID, hoja: HOJA }));

    fireEvent.click(within(screen.getByTestId('hoja-trabajo')).getByRole('button', { name: /plano\.dxf/u }));

    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://firmada/archivo', '_blank', 'noopener,noreferrer'));
    expect(urlMock).toHaveBeenCalledWith({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });
    abrir.mockRestore();
  });

  it('si no se puede abrir el archivo avisa sin detalles técnicos', async () => {
    urlMock.mockResolvedValue({ exito: false, error: 'El archivo no pertenece a esta orden' });
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    render(createElement(HojaTrabajoPiso, { ordenId: ORDEN_ID, hoja: HOJA }));

    fireEvent.click(screen.getByRole('button', { name: /plano\.dxf/u }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo abrir el archivo');
    expect(abrir).not.toHaveBeenCalled();
    abrir.mockRestore();
  });

  it('sin hoja congelada lo dice y deja volver al piso', () => {
    render(createElement(HojaTrabajoPiso, { ordenId: ORDEN_ID, hoja: null }));

    expect(screen.getByTestId('hoja-trabajo-vacia').textContent).toContain('no tiene hoja de trabajo');
    expect(screen.queryByTestId('hoja-trabajo')).toBeNull();
    expect(screen.getByRole('link', { name: /Volver al piso/u })).toBeTruthy();
  });
});
