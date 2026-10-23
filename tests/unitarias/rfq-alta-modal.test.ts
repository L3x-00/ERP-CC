// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';
import type { ArchivoRfq } from '@/modulos/rfq/acciones/archivos-rfq';
import type { Rfq, RfqItem } from '@/modulos/rfq/tipos/indice';

const {
  usarPipelineMock,
  crearProspectoMock,
  crearClienteMock,
  empujarRutaMock,
  refrescarRutaMock,
  usarClientesMock,
  usarClienteMock,
  obtenerRfqMock,
  obtenerCatalogosMock,
  listarArchivosMock,
  actualizarDatosMock,
} = vi.hoisted(() => ({
  usarPipelineMock: vi.fn(),
  crearProspectoMock: vi.fn(),
  crearClienteMock: vi.fn(),
  empujarRutaMock: vi.fn(),
  refrescarRutaMock: vi.fn(),
  usarClientesMock: vi.fn(),
  usarClienteMock: vi.fn(),
  obtenerRfqMock: vi.fn(),
  obtenerCatalogosMock: vi.fn(),
  listarArchivosMock: vi.fn(),
  actualizarDatosMock: vi.fn(),
}));

vi.mock('@/modulos/rfq/acciones/validar-rfqs-listo-lote', () => ({
  validarRfqsListoLoteAccion: vi.fn().mockResolvedValue({ exito: true, datos: {} }),
}));
vi.mock('@/modulos/pipeline/hooks/usar-pipeline', () => ({
  usarPipeline: (...args: unknown[]) => usarPipelineMock(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujarRutaMock, refresh: refrescarRutaMock }),
}));
vi.mock('@/modulos/pipeline/acciones/crear-prospecto', () => ({
  crearProspectoAccion: (...args: unknown[]) => crearProspectoMock(...args),
}));
vi.mock('@/modulos/clientes/acciones/crear-cliente', () => ({
  crearClienteAccion: (...args: unknown[]) => crearClienteMock(...args),
}));
vi.mock('@/modulos/clientes/hooks/usar-clientes', () => ({
  usarClientes: (...args: unknown[]) => usarClientesMock(...args),
}));
vi.mock('@/modulos/clientes/hooks/usar-cliente', () => ({
  usarCliente: (...args: unknown[]) => usarClienteMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/obtener-rfq', () => ({
  obtenerRfqAccion: (...args: unknown[]) => obtenerRfqMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/actualizar-datos-rfq', () => ({
  actualizarDatosRfqAccion: (...args: unknown[]) => actualizarDatosMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerCatalogosRfqAccion: (...args: unknown[]) => obtenerCatalogosMock(...args),
  obtenerContactosClienteRfqAccion: vi.fn().mockResolvedValue({ exito: true, datos: [] }),
}));
vi.mock('@/modulos/rfq/acciones/archivos-rfq', () => ({
  listarArchivosRfqAccion: (...args: unknown[]) => listarArchivosMock(...args),
  prepararSubidaArchivoRfqAccion: vi.fn(),
  confirmarArchivoRfqAccion: vi.fn(),
  descartarSubidaArchivoRfqAccion: vi.fn(),
  firmarArchivoRfqAccion: vi.fn(),
}));
vi.mock('@/nucleo/almacenamiento/archivos/subida-navegador', () => ({
  subirArchivoDirecto: vi.fn(),
}));

import { ColaRfq } from '@/modulos/pipeline/componentes/cola-rfq';
import { TablaOportunidades } from '@/modulos/pipeline/componentes/tabla-oportunidades';
import { fechaHoyLocal } from '@/modulos/rfq/utilidades/proxima-accion';

const OPORTUNIDAD: Oportunidad = {
  id: 'op-1',
  folioOp: 'OP-000001',
  folioCnc: null,
  folioRfq: 'RFQ-1026_01',
  estadoRfq: 'NEW',
  nombreContacto: 'Ana Pérez',
  empresa: 'Metales del Norte SA de CV',
  correo: 'ana@metanor.mx',
  telefono: '664 000 0000',
  clienteId: null,
  contactoId: null,
  vendedorId: 'vend-1',
  responsableId: null,
  canal: null,
  fechaSolicitud: '2026-10-01',
  descripcionGeneral: 'Corte de lámina',
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
  proximaAccionCodigo: null,
  proximaAccionTexto: null,
  fechaProximaAccion: null,
  responsableProximaAccionId: null,
  motivoPerdida: null,
  notasPerdida: null,
  fechaUltimoContacto: null,
  fechaEnvioCotizacion: null,
  creadoEn: '2026-10-01T00:00:00Z',
  actualizadoEn: '2026-10-01T00:00:00Z',
};

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

const RFQ_CAPTURADO: Rfq = {
  id: 'op-1',
  folio: 'RFQ-1026_01',
  folioOp: 'OP-000001',
  folioCnc: null,
  estadoRfq: 'INCOMPLETE',
  etapa: 'contactado',
  clienteId: null,
  condicionesPago: null,
  clienteNombre: null,
  empresa: 'Cliente QA',
  contactoId: null,
  contactoNombre: null,
  nombreContacto: 'Ana QA',
  vendedorId: 'vend-1',
  responsableId: null,
  responsableNombre: null,
  canal: null,
  canalDetalle: null,
  fechaSolicitud: null,
  fechaRequeridaCliente: null,
  plazoComercial: null,
  descripcionGeneral: null,
  proximaAccionCodigo: null,
  proximaAccionTexto: null,
  fechaProximaAccion: null,
  responsableProximaAccionId: null,
  responsableProximaAccionNombre: null,
  actualizadoEn: '2026-10-08T00:00:00.000Z',
  items: [],
};

const ITEM_ACTIVO: RfqItem = {
  id: 'item-1',
  rfqId: 'op-1',
  numero: 1,
  codigo: 'IT01',
  descripcion: 'Brida de acero',
  cantidad: 4,
  materialId: null,
  espesorId: null,
  acabado: null,
  notas: null,
  estado: 'activo',
  creadoEn: '2026-10-08T00:00:00.000Z',
  actualizadoEn: '2026-10-08T00:00:00.000Z',
  operaciones: [],
};

const ARCHIVO: ArchivoRfq = {
  id: 'archivo-1',
  entidad: 'rfq',
  entidadId: 'op-1',
  itemCodigo: null,
  clase: 'DIBUJO',
  nombreOriginal: 'plano.pdf',
  nombreErp: 'plano.pdf',
  temaCodigo: null,
  version: 1,
  vigente: true,
  reemplazaA: null,
  creadoEn: '2026-10-08T00:00:00.000Z',
};

/** Captura los datos mínimos del contacto (nombre y teléfono son obligatorios). */
function capturarContacto(): void {
  fireEvent.change(screen.getByLabelText('Nombre del contacto'), {
    target: { value: 'Ana Pérez' },
  });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '664 111 2233' } });
}

async function completarSolicitudInicial(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Canal')).not.toHaveProperty('disabled', true));
  fireEvent.change(screen.getByLabelText('Canal'), { target: { value: 'CORREO' } });
  fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Corte láser' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  usarPipelineMock.mockReturnValue({ data: [OPORTUNIDAD], isLoading: false, isError: false });
  usarClientesMock.mockReturnValue({
    data: { registros: [], total: 0, pagina: 1, porPagina: 25 },
    isLoading: false,
    isError: false,
  });
  usarClienteMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  crearProspectoMock.mockResolvedValue({ exito: true, datos: { id: 'op-1', folioOp: 'OP-000001' } });
  obtenerRfqMock.mockResolvedValue({ exito: true, datos: RFQ_CAPTURADO });
  obtenerCatalogosMock.mockResolvedValue({
    exito: true,
    datos: {
      materiales: [],
      espesores: [],
      procesos: [],
      canales: [
        { codigo: 'WHATSAPP', nombre: 'WhatsApp', esOtro: false, activo: true },
        { codigo: 'CORREO', nombre: 'Correo', esOtro: false, activo: true },
      ],
      proximasAcciones: [{ codigo: 'FOLLOW_UP', nombre: 'Seguimiento', esOtro: false }],
      usuarios: [{ id: 'vend-1', nombre: 'Vendedor', rol: 'ventas' }],
    },
  });
  listarArchivosMock.mockResolvedValue({ exito: true, datos: [] });
  actualizarDatosMock.mockResolvedValue({
    exito: true,
    datos: { actualizadoEn: '2026-10-08T01:00:00.000Z' },
  });
});

afterEach(() => {
  cleanup();
});

describe('Alta RFQ en modal guiado (C1.2a, DC-01/DC-03)', () => {
  it('“Nuevo RFQ” abre un diálogo modal con título y descripción accesibles', () => {
    render(envolver(createElement(ColaRfq)));

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialogo.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Nuevo RFQ/ })).toBeDefined();
  });

  it('el diálogo enumera las etapas del flujo y aclara que todo se captura ahí', () => {
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));

    const etapas = screen.getByRole('list', { name: 'Etapas del alta de RFQ' });
    for (const etapa of ['Cliente y solicitud', 'Ítems', 'Archivos']) {
      expect(etapas.textContent).toContain(etapa);
    }
    expect(screen.getByTestId('etapas-alta-rfq').textContent).toMatch(/sin salir de esta ventana/i);
  });

  it('Escape cierra el diálogo y el botón vuelve a ofrecer el alta', () => {
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Nuevo RFQ' })).toBeDefined();
  });

  it('no permite cerrar el modal mientras el alta está en vuelo', async () => {
    let resolverAlta: ((valor: { exito: true; datos: { id: string; folioOp: string } }) => void) | undefined;
    crearProspectoMock.mockReturnValue(
      new Promise((resolver) => {
        resolverAlta = resolver;
      }),
    );
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));
    capturarContacto();
    await completarSolicitudInicial();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));

    expect(await screen.findByRole('button', { name: 'Creando RFQ…' })).toBeDefined();
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(screen.getByRole('dialog')).toBeDefined();

    await act(async () => {
      resolverAlta?.({ exito: true, datos: { id: 'op-1', folioOp: 'OP-000001' } });
    });
  });

  it('tras crear, continúa en ítems dentro del mismo modal sin navegar', async () => {
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));
    capturarContacto();
    await completarSolicitudInicial();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));

    expect(await screen.findByTestId('alta-rfq-items')).toBeDefined();
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(empujarRutaMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continuar con archivos' })).toBeDefined();
  });

  /** Crea el RFQ y navega hasta el paso Archivos con el RFQ ya cargado. */
  async function llegarAPasoArchivos(): Promise<void> {
    // Para avanzar de paso el RFQ ya debe tener un ítem activo y un archivo subido.
    obtenerRfqMock.mockResolvedValue({
      exito: true,
      datos: { ...RFQ_CAPTURADO, items: [ITEM_ACTIVO] },
    });
    listarArchivosMock.mockResolvedValue({ exito: true, datos: [ARCHIVO] });
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));
    capturarContacto();
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'Metanor' } });
    await completarSolicitudInicial();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));
    expect(await screen.findByTestId('alta-rfq-items')).toBeDefined();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Continuar con archivos' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con archivos' }));
    expect(await screen.findByTestId('alta-rfq-archivos')).toBeDefined();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Finalizar captura' }).hasAttribute('disabled'),
      ).toBe(false),
    );
  }

  it('captura los datos generales antes de los ítems y reserva la próxima acción para el cierre', () => {
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));
    const dialogo = within(screen.getByRole('dialog'));

    expect(dialogo.getByLabelText('Nombre del contacto')).toBeDefined();
    expect(dialogo.getByLabelText('Fecha de registro')).toHaveProperty('disabled', true);
    expect(dialogo.getByLabelText('Responsable')).toHaveProperty('disabled', true);
    expect(dialogo.getByLabelText('Descripción')).toBeDefined();
    expect(dialogo.queryByLabelText('Notas (opcional)')).toBeNull();
    expect(dialogo.queryByLabelText('Acción a seguir')).toBeNull();
    expect(dialogo.queryByLabelText('Fecha de la acción')).toBeNull();
    // La solicitud básica se conserva en el paso inicial.
    expect(dialogo.getByLabelText('Moneda')).toBeDefined();
  });

  it('preselecciona WhatsApp cuando el canal está vigente', async () => {
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Canal') as HTMLSelectElement).value).toBe('WHATSAPP'),
    );
  });

  it('“Finalizar captura” resume el RFQ y persiste únicamente la próxima acción', async () => {
    obtenerCatalogosMock.mockResolvedValue({
      exito: true,
      datos: {
        materiales: [],
        espesores: [],
        procesos: [],
        canales: [{ codigo: 'CORREO', nombre: 'Correo', esOtro: false, activo: true }],
        proximasAcciones: [{ codigo: 'FOLLOW_UP', nombre: 'Seguimiento', esOtro: false }],
        usuarios: [{ id: 'vend-1', nombre: 'Vendedor', rol: 'ventas' }],
      },
    });
    const fechaFutura = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    render(envolver(createElement(ColaRfq)));
    await llegarAPasoArchivos();

    // Los datos generales nacen completos; el cierre solo captura seguimiento.
    expect(crearProspectoMock).toHaveBeenCalledTimes(1);
    expect(crearProspectoMock.mock.calls[0]?.[0]).toMatchObject({
      canal: 'CORREO',
      descripcionGeneral: 'Corte láser',
    });
    expect(crearProspectoMock.mock.calls[0]?.[0]).not.toHaveProperty('proximaAccionCodigo');

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar captura' }));
    const dialogo = within(await screen.findByTestId('dialogo-finalizar-captura'));

    expect(dialogo.getByRole('region', { name: 'Resumen del RFQ' })).toBeDefined();
    expect(dialogo.queryByLabelText('Canal')).toBeNull();
    expect(dialogo.queryByLabelText('Responsable')).toBeNull();
    // El responsable de la acción es el mismo que registra el RFQ: se muestra
    // de solo lectura y no se puede alterar desde el cierre.
    expect(
      (dialogo.getByLabelText('Responsable de la acción a seguir') as HTMLInputElement).value,
    ).toBe('Vendedor');
    fireEvent.change(dialogo.getByLabelText('Acción a seguir'), {
      target: { value: 'FOLLOW_UP' },
    });
    fireEvent.change(dialogo.getByLabelText('Fecha de la acción'), {
      target: { value: fechaFutura },
    });

    fireEvent.click(dialogo.getByRole('button', { name: 'Guardar y finalizar' }));

    await waitFor(() => expect(actualizarDatosMock).toHaveBeenCalledTimes(1));
    expect(actualizarDatosMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rfqId: 'op-1',
        actualizadoEn: RFQ_CAPTURADO.actualizadoEn,
        canal: RFQ_CAPTURADO.canal,
        descripcionGeneral: RFQ_CAPTURADO.descripcionGeneral,
        responsableId: RFQ_CAPTURADO.vendedorId,
        proximaAccionCodigo: 'FOLLOW_UP',
        fechaProximaAccion: fechaFutura,
        responsableProximaAccionId: RFQ_CAPTURADO.vendedorId,
      }),
    );
    // Al confirmar se cierra el alta completa: no queda ningún diálogo abierto.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('el modal autocompleta fecha y responsable, y no permite finalizar sin acción', async () => {
    obtenerCatalogosMock.mockResolvedValue({
      exito: true,
      datos: {
        materiales: [],
        espesores: [],
        procesos: [],
        canales: [{ codigo: 'CORREO', nombre: 'Correo', esOtro: false, activo: true }],
        proximasAcciones: [{ codigo: 'FOLLOW_UP', nombre: 'Seguimiento', esOtro: false }],
        usuarios: [{ id: 'vend-1', nombre: 'Vendedor', rol: 'ventas' }],
      },
    });
    const fechaFutura = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    render(envolver(createElement(ColaRfq)));
    await llegarAPasoArchivos();
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar captura' }));
    const dialogo = within(await screen.findByTestId('dialogo-finalizar-captura'));

    const confirmar = dialogo.getByRole('button', { name: 'Guardar y finalizar' });
    expect(confirmar.hasAttribute('disabled')).toBe(true);
    expect(dialogo.getByTestId('faltantes-finalizar').textContent).toContain('próxima acción');
    // La fecha y el responsable llegan precargados; el responsable es fijo.
    expect((dialogo.getByLabelText('Fecha de la acción') as HTMLInputElement).value)
      .toBe(fechaHoyLocal());
    expect(
      (dialogo.getByLabelText('Responsable de la acción a seguir') as HTMLInputElement).value,
    ).toBe('Vendedor');
    fireEvent.change(dialogo.getByLabelText('Acción a seguir'), {
      target: { value: 'FOLLOW_UP' },
    });
    // Sin fecha no se puede guardar, aunque la acción ya esté elegida.
    fireEvent.change(dialogo.getByLabelText('Fecha de la acción'), { target: { value: '' } });
    expect(confirmar.hasAttribute('disabled')).toBe(true);
    expect(dialogo.getByTestId('faltantes-finalizar').textContent).toContain('fecha de la próxima acción');

    fireEvent.change(dialogo.getByLabelText('Fecha de la acción'), { target: { value: fechaFutura } });
    expect(confirmar.hasAttribute('disabled')).toBe(false);
    expect(dialogo.queryByTestId('faltantes-finalizar')).toBeNull();

    fireEvent.click(confirmar);
    await waitFor(() => expect(actualizarDatosMock).toHaveBeenCalledTimes(1));
  });

  it('“Finalizar más tarde” abre la próxima acción, autocompleta fecha y responsable y deja el RFQ incompleto', async () => {
    obtenerCatalogosMock.mockResolvedValue({
      exito: true,
      datos: {
        materiales: [],
        espesores: [],
        procesos: [],
        canales: [{ codigo: 'CORREO', nombre: 'Correo', esOtro: false, activo: true }],
        proximasAcciones: [{ codigo: 'FOLLOW_UP', nombre: 'Seguimiento', esOtro: false }],
        usuarios: [{ id: 'vend-1', nombre: 'Vendedor', rol: 'ventas' }],
      },
    });
    render(envolver(createElement(ColaRfq)));
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo RFQ' }));
    capturarContacto();
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'Metanor' } });
    await completarSolicitudInicial();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));
    expect(await screen.findByTestId('alta-rfq-items')).toBeDefined();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Finalizar más tarde' }).hasAttribute('disabled'),
      ).toBe(false),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar más tarde' }));

    const dialogo = within(await screen.findByTestId('dialogo-finalizar-captura'));
    expect(screen.getByTestId('dialogo-finalizar-captura').getAttribute('data-motivo')).toBe('mas_tarde');
    expect(dialogo.getByRole('heading', { name: 'Próxima acción' })).toBeDefined();
    expect((dialogo.getByLabelText('Fecha de la acción') as HTMLInputElement).value)
      .toBe(fechaHoyLocal());
    expect(
      (dialogo.getByLabelText('Responsable de la acción a seguir') as HTMLInputElement).value,
    ).toBe('Vendedor');
    expect(actualizarDatosMock).not.toHaveBeenCalled();

    fireEvent.change(dialogo.getByLabelText('Acción a seguir'), {
      target: { value: 'FOLLOW_UP' },
    });
    fireEvent.click(dialogo.getByRole('button', { name: 'Guardar y finalizar más tarde' }));

    await waitFor(() => expect(actualizarDatosMock).toHaveBeenCalledTimes(1));
    expect(actualizarDatosMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rfqId: 'op-1',
        responsableId: 'vend-1',
        proximaAccionCodigo: 'FOLLOW_UP',
        fechaProximaAccion: fechaHoyLocal(),
        responsableProximaAccionId: 'vend-1',
      }),
    );
    // El RFQ queda en la cola como Incompleto y el alta se cierra.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(crearProspectoMock).toHaveBeenCalledTimes(1);
  });
});

describe('TablaOportunidades — reanudación de captura (DC-03)', () => {
  it('un RFQ INCOMPLETE ofrece “Continuar captura” sobre el mismo id y su Historial', () => {
    render(
      envolver(
        createElement(TablaOportunidades, {
          oportunidades: [{ ...OPORTUNIDAD, estadoRfq: 'INCOMPLETE' }],
        }),
      ),
    );

    const enlace = screen.getByRole('link', { name: 'Continuar captura' });
    expect(enlace.getAttribute('href')).toBe('/rfq?rfq=op-1&continuar=1');
    expect(screen.queryByRole('link', { name: 'Abrir' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Historial' })).toBeDefined();
  });

  it('los demás estados conservan “Abrir”', () => {
    render(envolver(createElement(TablaOportunidades, { oportunidades: [OPORTUNIDAD] })));

    expect(screen.getByRole('link', { name: 'Abrir' }).getAttribute('href')).toBe('/rfq?rfq=op-1');
    expect(screen.queryByRole('link', { name: 'Continuar captura' })).toBeNull();
  });

  it('un RFQ CONVERTED conserva Historial para consultar sus versiones (solo lectura)', () => {
    render(
      envolver(
        createElement(TablaOportunidades, {
          oportunidades: [{ ...OPORTUNIDAD, estadoRfq: 'CONVERTED' }],
        }),
      ),
    );

    expect(screen.getByRole('button', { name: 'Historial' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Abrir' })).toBeDefined();
  });
});
