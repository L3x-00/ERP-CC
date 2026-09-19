// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { OportunidadConLineas } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';

const { crearMock, actualizarMock, refrescarRutaMock, usarOportunidadMock } = vi.hoisted(() => ({
  crearMock: vi.fn(),
  actualizarMock: vi.fn(),
  refrescarRutaMock: vi.fn(),
  usarOportunidadMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refrescarRutaMock }),
}));
vi.mock('@/modulos/pipeline/acciones/crear-cotizacion', () => ({
  crearCotizacionAccion: (...args: unknown[]) => crearMock(...args),
}));
vi.mock('@/modulos/pipeline/acciones/actualizar-cotizacion', () => ({
  actualizarCotizacionAccion: (...args: unknown[]) => actualizarMock(...args),
}));
vi.mock('@/modulos/pipeline/acciones/obtener-areas-trabajo', () => ({
  obtenerAreasTrabajoAccion: async () => ({
    exito: true,
    datos: [{ codigo: 'CNC', nombre: 'CNC', esExterno: false }],
  }),
}));
vi.mock('@/modulos/pipeline/hooks/usar-oportunidad', () => ({
  usarOportunidad: (id: string, habilitada: boolean) => {
    const resultado = usarOportunidadMock(id, habilitada);
    return { ...resultado, refetch: resultado.refetch ?? (async () => ({ data: resultado.data, isError: resultado.isError })) };
  },
}));

import { EditorCotizacion } from '@/modulos/pipeline/componentes/editor-cotizacion';
import { FormularioCotizacion } from '@/modulos/pipeline/componentes/formulario-cotizacion';

const PIPELINE_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '2026-09-13T10:00:00.000Z';

const OPORTUNIDAD: Oportunidad = {
  id: PIPELINE_ID,
  folioOp: 'OP-0001',
  folioCnc: 'CNC-0926-0001',
  etapa: 'cotizado',
  nombreContacto: 'Ana Pérez',
  empresa: 'Metales del Norte',
  correo: null,
  telefono: null,
  clienteId: null,
  vendedorId: '22222222-2222-4222-8222-222222222222',
  moneda: 'MXN',
  condicionesPago: null,
  prioridad: 'normal',
  ivaPorcentaje: 16,
  etiquetas: [],
  esOrdenInterna: false,
  poCliente: null,
  fechaRequerida: null,
  horasEstimadas: null,
  notas: null,
  motivoPerdida: null,
  notasPerdida: null,
  fechaUltimoContacto: null,
  fechaEnvioCotizacion: null,
  creadoEn: '2026-09-01T10:00:00.000Z',
  actualizadoEn: TOKEN,
};

const LINEA_PERSISTIDA = {
  id: '33333333-3333-4333-8333-333333333333',
  pipelineId: PIPELINE_ID,
  descripcion: 'Placa base',
  cantidad: 4,
  material: 'Acero A36',
  espesor: '1/8"',
  area: 0.75,
  procesos: ['corte', 'doblez'],
  areaTrabajoCodigo: 'CNC',
  esExterno: false,
  proveedorExterno: null,
  esDescuento: false,
  precioUnitario: 320.5,
  orden: 0,
  creadoEn: '2026-09-01T10:00:00.000Z',
};

function conProveedor(nodo: ReactNode) {
  const clienteConsultas = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(QueryClientProvider, { client: clienteConsultas }, nodo),
  );
}

function entradaDesdePersistida() {
  return {
    descripcion: LINEA_PERSISTIDA.descripcion,
    cantidad: LINEA_PERSISTIDA.cantidad,
    precioUnitario: LINEA_PERSISTIDA.precioUnitario,
    material: LINEA_PERSISTIDA.material,
    espesor: LINEA_PERSISTIDA.espesor,
    area: LINEA_PERSISTIDA.area,
    procesos: LINEA_PERSISTIDA.procesos,
    areaTrabajoCodigo: LINEA_PERSISTIDA.areaTrabajoCodigo,
    esExterno: LINEA_PERSISTIDA.esExterno,
    proveedorExterno: LINEA_PERSISTIDA.proveedorExterno,
    esDescuento: LINEA_PERSISTIDA.esDescuento,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  crearMock.mockResolvedValue({ exito: true, datos: { actualizadoEn: TOKEN, lineasGuardadas: 1 } });
  actualizarMock.mockResolvedValue({
    exito: true,
    datos: { actualizadoEn: '2026-09-13T11:00:00.000Z', lineasGuardadas: 1 },
  });
});

afterEach(() => cleanup());

describe('FormularioCotizacion', () => {
  it('carga las líneas existentes con sus datos técnicos', () => {
    conProveedor(
      createElement(FormularioCotizacion, {
        pipelineId: PIPELINE_ID,
        ivaPorcentaje: 16,
        moneda: 'MXN',
        lineasIniciales: [entradaDesdePersistida()],
        actualizadoEn: TOKEN,
      }),
    );

    expect((screen.getByLabelText('Descripción') as HTMLInputElement).value).toBe('Placa base');
    expect((screen.getByLabelText('Cantidad') as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('Precio unitario') as HTMLInputElement).value).toBe('320.5');
    expect((screen.getByLabelText('Material (opcional)') as HTMLInputElement).value).toBe(
      'Acero A36',
    );
    expect((screen.getByLabelText('Espesor (opcional)') as HTMLInputElement).value).toBe('1/8"');
    expect((screen.getByLabelText('Área geométrica (opcional)') as HTMLInputElement).value).toBe('0.75');
    expect((screen.getByLabelText('Procesos (opcional)') as HTMLInputElement).value).toBe(
      'corte, doblez',
    );
  });

  it('al editar una línea existente actualiza con el token y conserva los datos técnicos', async () => {
    conProveedor(
      createElement(FormularioCotizacion, {
        pipelineId: PIPELINE_ID,
        ivaPorcentaje: 16,
        moneda: 'MXN',
        lineasIniciales: [entradaDesdePersistida()],
        actualizadoEn: TOKEN,
      }),
    );

    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => expect(actualizarMock).toHaveBeenCalledTimes(1));
    expect(crearMock).not.toHaveBeenCalled();
    expect(actualizarMock).toHaveBeenCalledWith({
      pipelineId: PIPELINE_ID,
      actualizadoEnEsperado: TOKEN,
      lineas: [
        {
          descripcion: 'Placa base',
          cantidad: 6,
          precioUnitario: 320.5,
          material: 'Acero A36',
          espesor: '1/8"',
          area: 0.75,
          procesos: ['corte', 'doblez'],
          areaTrabajoCodigo: 'CNC',
          esExterno: false,
          proveedorExterno: undefined,
        },
      ],
    });
    await screen.findByText('Cotización guardada.');
  });

  it('una cotización nueva usa la acción de creación y calcula totales en vivo', async () => {
    conProveedor(
      createElement(FormularioCotizacion, {
        pipelineId: PIPELINE_ID,
        ivaPorcentaje: 16,
        moneda: 'MXN',
      }),
    );

    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Corte láser' } });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio unitario'), { target: { value: '1000' } });

    // Subtotal 2000 + IVA 16% = 2320.
    expect(screen.getByText('$2,320.00')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => expect(crearMock).toHaveBeenCalledTimes(1));
    expect(actualizarMock).not.toHaveBeenCalled();
    expect(crearMock).toHaveBeenCalledWith({
      pipelineId: PIPELINE_ID,
      lineas: [
        {
          descripcion: 'Corte láser',
          cantidad: 2,
          precioUnitario: 1000,
          material: undefined,
          espesor: undefined,
          area: undefined,
          procesos: [],
          areaTrabajoCodigo: undefined,
          esExterno: false,
          proveedorExterno: undefined,
        },
      ],
    });
  });

  it('agrega la línea de descuento, la resta del total y la envía marcada (RFQ-03)', async () => {
    conProveedor(
      createElement(FormularioCotizacion, {
        pipelineId: PIPELINE_ID,
        ivaPorcentaje: 16,
        moneda: 'MXN',
      }),
    );

    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Corte láser' } });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio unitario'), { target: { value: '1000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Agregar descuento' }));
    fireEvent.change(screen.getByLabelText('Monto del descuento'), { target: { value: '200' } });

    // Subtotal 2000 - 200 = 1800 + IVA 16% = 2088.
    expect(screen.getByText('$2,088.00')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    await waitFor(() => expect(crearMock).toHaveBeenCalledTimes(1));
    expect(crearMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lineas: expect.arrayContaining([
          expect.objectContaining({
            descripcion: 'Descuento',
            cantidad: 1,
            precioUnitario: 200,
            esDescuento: true,
          }),
        ]),
      }),
    );
  });

  it('muestra el error devuelto por el servidor sin cerrar el formulario', async () => {
    actualizarMock.mockResolvedValue({
      exito: false,
      error: 'La oportunidad cambió mientras editabas',
    });
    const alGuardar = vi.fn();

    conProveedor(
      createElement(FormularioCotizacion, {
        pipelineId: PIPELINE_ID,
        ivaPorcentaje: 16,
        moneda: 'MXN',
        lineasIniciales: [entradaDesdePersistida()],
        actualizadoEn: TOKEN,
        alGuardar,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('La oportunidad cambió mientras editabas');
    expect(alGuardar).not.toHaveBeenCalled();
    expect(screen.queryByText('Cotización guardada.')).toBeNull();
  });

  it('un fallo de red no se reporta como guardado', async () => {
    actualizarMock.mockRejectedValue(new Error('sin red'));

    conProveedor(
      createElement(FormularioCotizacion, {
        pipelineId: PIPELINE_ID,
        ivaPorcentaje: 16,
        moneda: 'MXN',
        lineasIniciales: [entradaDesdePersistida()],
        actualizadoEn: TOKEN,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cotización' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Error de conexión');
  });

  it('en solo lectura muestra los datos técnicos y no ofrece guardar', () => {
    conProveedor(
      createElement(FormularioCotizacion, {
        pipelineId: PIPELINE_ID,
        ivaPorcentaje: 16,
        moneda: 'MXN',
        lineasIniciales: [entradaDesdePersistida()],
        actualizadoEn: TOKEN,
        soloLectura: true,
      }),
    );

    expect(screen.getByText('Placa base')).toBeDefined();
    expect(screen.getByText(/Material: Acero A36/)).toBeDefined();
    expect(screen.getByText(/Espesor: 1\/8"/)).toBeDefined();
    expect(screen.getByText(/Procesos: corte, doblez/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Guardar cotización' })).toBeNull();
    expect(screen.queryByLabelText('Cantidad')).toBeNull();
  });
});

describe('EditorCotizacion', () => {
  const DATOS: OportunidadConLineas = {
    oportunidad: OPORTUNIDAD,
    lineas: [LINEA_PERSISTIDA],
  };

  it('no consulta la oportunidad hasta abrir el editor', () => {
    usarOportunidadMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    conProveedor(createElement(EditorCotizacion, { oportunidad: OPORTUNIDAD }));

    expect(usarOportunidadMock).toHaveBeenCalledWith(PIPELINE_ID, false);
  });

  it('abre el editor con las líneas vigentes recuperadas del servidor', async () => {
    usarOportunidadMock.mockReturnValue({ data: DATOS, isLoading: false, isError: false });

    conProveedor(createElement(EditorCotizacion, { oportunidad: OPORTUNIDAD }));
    fireEvent.click(screen.getByRole('button', { name: 'Cotización' }));

    await screen.findByLabelText('Descripción');
    expect(usarOportunidadMock).toHaveBeenCalledWith(PIPELINE_ID, false);
    expect((screen.getByLabelText('Descripción') as HTMLInputElement).value).toBe('Placa base');
    expect((screen.getByLabelText('Material (opcional)') as HTMLInputElement).value).toBe(
      'Acero A36',
    );
    expect(screen.getByRole('button', { name: 'Guardar cotización' })).toBeDefined();
  });

  it('una oportunidad ganada se consulta en solo lectura', async () => {
    usarOportunidadMock.mockReturnValue({
      data: { oportunidad: { ...OPORTUNIDAD, etapa: 'ganada' }, lineas: [LINEA_PERSISTIDA] },
      isLoading: false,
      isError: false,
    });

    conProveedor(
      createElement(EditorCotizacion, {
        oportunidad: { ...OPORTUNIDAD, etapa: 'ganada' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver cotización' }));

    await screen.findByText('Placa base');
    expect(screen.getByText('Placa base')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Guardar cotización' })).toBeNull();
  });

  it('informa cuando la cotización no se puede cargar', async () => {
    usarOportunidadMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    conProveedor(createElement(EditorCotizacion, { oportunidad: OPORTUNIDAD }));
    fireEvent.click(screen.getByRole('button', { name: 'Cotización' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo cargar la cotización.');
  });
});


describe('regresiones de lectura del cotizador', () => {
  it('consulta vacía no inventa una partida', () => {
    conProveedor(createElement(FormularioCotizacion, {pipelineId: PIPELINE_ID, ivaPorcentaje:16, moneda:'MXN', lineasIniciales:[], soloLectura:true}));
    expect(screen.getByText('Esta oportunidad no tiene cotización.')).toBeDefined();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
  it('ignora caché vieja y conserva el borrador ante actualizaciones de caché', async () => {
    const fresca = {oportunidad:OPORTUNIDAD,lineas:[{...LINEA_PERSISTIDA,descripcion:'Servidor fresco'}]};
    const refetch = vi.fn().mockResolvedValue({data:fresca,isError:false});
    usarOportunidadMock.mockReturnValue({data:{...fresca,lineas:[{...LINEA_PERSISTIDA,descripcion:'Caché vieja'}]},refetch});
    const vista=conProveedor(createElement(EditorCotizacion,{oportunidad:OPORTUNIDAD}));
    expect(refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Cotización'}));
    const campo=await screen.findByLabelText('Descripción') as HTMLInputElement;
    expect(campo.value).toBe('Servidor fresco');
    fireEvent.change(campo,{target:{value:'Borrador propio'}});
    usarOportunidadMock.mockReturnValue({data:{...fresca,lineas:[]},refetch});
    fireEvent.click(screen.getByRole('button',{name:'Agregar línea'}));
    expect((screen.getAllByLabelText('Descripción')[0] as HTMLInputElement).value).toBe('Borrador propio');
    expect(refetch).toHaveBeenCalledTimes(1);
    vista.unmount();
  });
  it('reintenta una lectura fallida sin mostrar datos obsoletos', async () => {
    const refetch=vi.fn().mockResolvedValueOnce({data:null,isError:true}).mockResolvedValueOnce({data:{oportunidad:OPORTUNIDAD,lineas:[LINEA_PERSISTIDA]},isError:false});
    usarOportunidadMock.mockReturnValue({refetch});
    conProveedor(createElement(EditorCotizacion,{oportunidad:OPORTUNIDAD}));
    fireEvent.click(screen.getByRole('button',{name:'Cotización'}));
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('Descripción')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));
    await screen.findByLabelText('Descripción');
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
