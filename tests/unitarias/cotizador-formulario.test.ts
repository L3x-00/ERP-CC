// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const { guardar } = vi.hoisted(() => ({ guardar: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/modulos/pipeline/acciones/crear-cotizacion', () => ({ crearCotizacionAccion: guardar }));
vi.mock('@/modulos/pipeline/acciones/actualizar-cotizacion', () => ({ actualizarCotizacionAccion: guardar }));
import { FormularioCotizacion } from '@/modulos/pipeline/componentes/formulario-cotizacion';
import { calcularCotizacionTecnica } from '@/modulos/cotizador/servicios/calcular-cotizacion-tecnica';
const calculo = calcularCotizacionTecnica({ moneda: 'MXN', cantidad: 2, material: 'Aluminio', espesorMm: 3, recargoPorcentaje: 25, descuentoPorcentaje: 0, otros: { flete: 100, adicionales: 0 } });
const linea = { descripcion: 'Pieza de prueba', cantidad: 2, precioUnitario: 62.5, material: 'Aluminio', espesor: '3 mm', procesos: ['otros'], calculoTecnico: calculo };
function montar(soloLectura = false) {
  return render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(FormularioCotizacion, { pipelineId: '11111111-1111-4111-8111-111111111111', moneda: 'MXN', ivaPorcentaje: 16, lineasIniciales: [linea, { descripcion: 'Otra pieza', cantidad: 1, precioUnitario: 10 }], soloLectura })));
}
beforeEach(() => { guardar.mockReset(); guardar.mockResolvedValue({ exito: true, datos: {} }); });
afterEach(cleanup);
describe('cotizador integrado con las partidas', () => {
  it('recalcula y aplica solo a la partida elegida; calcular no guarda la cotización', async () => {
    montar(); fireEvent.click(screen.getAllByRole('button', { name: 'Calcular precio por procesos' })[0]);
    fireEvent.change(screen.getByLabelText('Flete'), { target: { value: '200' } });
    expect(screen.queryByRole('button', { name: 'Aplicar a la línea' })).toBeNull();
    expect((screen.getByRole('form', { name: 'Cálculo técnico de la línea' }) as HTMLFormElement).checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Calcular precio' }));
    expect(guardar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a la línea' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Guardar cotización/ }));
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    const datos = guardar.mock.calls[0][0];
    expect(datos.lineas[0].precioUnitario).toBe(125);
    expect(datos.lineas[0].calculoTecnico.entrada.otros.flete).toBe(200);
    expect(datos.lineas[1]).toMatchObject({ descripcion: 'Otra pieza', cantidad: 1, precioUnitario: 10 });
    expect(datos.lineas[1].calculoTecnico).toBeUndefined();
  });
  it('retira el cálculo al editar el precio manualmente', async () => {
    montar(); fireEvent.change(screen.getAllByLabelText(/Precio unitario/)[0], { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cotización/ }));
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    expect(guardar.mock.calls[0][0].lineas[0]).toMatchObject({ precioUnitario: 70 });
    expect(guardar.mock.calls[0][0].lineas[0].calculoTecnico).toBeUndefined();
  });
  it('permite consultar el desglose sin modificar una cotización cerrada', () => {
    montar(true); fireEvent.click(screen.getByRole('button', { name: 'Consultar cálculo técnico' }));
    expect(screen.getByLabelText('Flete')).toHaveProperty('disabled', false);
    expect(screen.getByLabelText('Flete').closest('fieldset')).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Aplicar a la línea' })).toBeNull();
    expect(guardar).not.toHaveBeenCalled();
  });
});
