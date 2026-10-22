// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { Cliente } from '@/modulos/clientes/tipos/indice';
import type { ArchivoRfq } from '@/modulos/rfq/acciones/archivos-rfq';
import type { Rfq, RfqItem } from '@/modulos/rfq/tipos/indice';

const {
  crearProspectoMock,
  crearClienteMock,
  empujarRutaMock,
  refrescarRutaMock,
  usarClientesMock,
  usarClienteMock,
  obtenerRfqMock,
  obtenerCatalogosMock,
  listarArchivosMock,
  contactosMock,
} = vi.hoisted(() => ({
  crearProspectoMock: vi.fn(),
  crearClienteMock: vi.fn(),
  empujarRutaMock: vi.fn(),
  refrescarRutaMock: vi.fn(),
  usarClientesMock: vi.fn(),
  usarClienteMock: vi.fn(),
  obtenerRfqMock: vi.fn(),
  obtenerCatalogosMock: vi.fn(),
  listarArchivosMock: vi.fn(),
  contactosMock: vi.fn(),
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
// El modal de «Finalizar captura» importa la acción con CAS; en jsdom se aísla.
vi.mock('@/modulos/rfq/acciones/actualizar-datos-rfq', () => ({
  actualizarDatosRfqAccion: vi.fn(),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerCatalogosRfqAccion: (...args: unknown[]) => obtenerCatalogosMock(...args),
  obtenerContactosClienteRfqAccion: (...args: unknown[]) => contactosMock(...args),
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

import { FormularioProspecto } from '@/modulos/pipeline/componentes/formulario-prospecto';

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';

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

const RFQ_CON_ITEM: Rfq = { ...RFQ_CAPTURADO, items: [ITEM_ACTIVO] };

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

const CATALOGOS_VACIOS = {
  materiales: [],
  espesores: [],
  procesos: [],
  canales: [{ codigo: 'WHATSAPP', nombre: 'WhatsApp', esOtro: false, activo: true }],
  proximasAcciones: [],
  usuarios: [],
};

const CLIENTE: Cliente = {
  id: CLIENTE_ID,
  folio: 'CLI-0001',
  razonSocial: 'Metales del Norte SA de CV',
  nombreComercial: 'Metanor',
  rfc: 'MNO120101AB1',
  contacto: 'Ana Pérez',
  correo: 'ana@metanor.mx',
  telefono: '664 000 0000',
  condicionesPago: '30_dias',
  limiteCredito: 50_000,
  saldoAFavor: 0,
  moneda: 'MXN',
  creditoHabilitado: true,
  diasCredito: 30,
  tier: 'oro',
  tierManual: null,
  tierManualHasta: null,
  estado: 'activo',
  direccionFiscal: null,
  direccionEnvio: null,
  creadoEn: '2026-01-01T00:00:00Z',
  actualizadoEn: '2026-01-01T00:00:00Z',
};

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

function renderizarFormulario() {
  const vista = render(envolver(createElement(FormularioProspecto)));
  fireEvent.change(screen.getByLabelText('Descripción'), {
    target: { value: 'Solicitud de prueba' },
  });
  return vista;
}

/** Campo del formulario por su etiqueta visible. */
function campo(etiqueta: RegExp): HTMLInputElement {
  return screen.getByLabelText(etiqueta) as HTMLInputElement;
}

/** Espera a que el botón exista y deje de estar bloqueado. */
async function esperarBotonHabilitado(nombre: string): Promise<void> {
  await waitFor(() => {
    const boton = screen.getByRole('button', { name: nombre });
    expect(boton.hasAttribute('disabled')).toBe(false);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  usarClientesMock.mockReturnValue({
    data: { registros: [CLIENTE], total: 1, pagina: 1, porPagina: 25 },
    isLoading: false,
    isError: false,
  });
  usarClienteMock.mockReturnValue({
    data: { cliente: CLIENTE, documentos: [], consumoUltimos3Meses: 200_000, creditoUsado: 0 },
    isLoading: false,
    isError: false,
  });
  crearProspectoMock.mockResolvedValue({ exito: true, datos: { id: 'op-1', folioOp: 'OP-000001' } });
  crearClienteMock.mockResolvedValue({ exito: true, datos: { id: CLIENTE_ID } });
  obtenerRfqMock.mockResolvedValue({ exito: true, datos: RFQ_CAPTURADO });
  obtenerCatalogosMock.mockResolvedValue({ exito: true, datos: CATALOGOS_VACIOS });
  listarArchivosMock.mockResolvedValue({ exito: true, datos: [] });
  contactosMock.mockResolvedValue({ exito: true, datos: [] });
});

afterEach(() => {
  cleanup();
});

describe('FormularioProspecto con selector de cliente (RFQ-02/03)', () => {
  it('hereda condiciones de pago y rellena solo los campos vacíos', async () => {
    renderizarFormulario();

    // Borrador previo: la empresa ya se capturó a mano y no debe pisarse.
    fireEvent.change(campo(/Empresa/), { target: { value: 'Taller propio' } });
    fireEvent.focus(campo(/Cliente \(opcional\)/));
    fireEvent.click(screen.getByText('Metales del Norte SA de CV'));

    await waitFor(() => {
      expect(campo(/Condiciones de pago/)).toHaveProperty('value', '30_dias');
    });
    expect(campo(/Empresa/).value).toBe('Taller propio');
    expect(campo(/Nombre del contacto/).value).toBe('Ana Pérez');
    expect(campo(/Correo/).value).toBe('ana@metanor.mx');
    expect(screen.getByText(/Heredadas del cliente seleccionado/)).toBeDefined();
  });

  it('envía el clienteId al crear la oportunidad', async () => {
    renderizarFormulario();

    fireEvent.focus(campo(/Cliente \(opcional\)/));
    fireEvent.click(screen.getByText('Metales del Norte SA de CV'));
    await screen.findByText('Cambiar cliente');
    // Con un cliente elegido el alta espera a que carguen sus contactos.
    await esperarBotonHabilitado('Continuar con ítems');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));

    await waitFor(() => {
      expect(crearProspectoMock).toHaveBeenCalledWith(
        expect.objectContaining({ clienteId: CLIENTE_ID, condicionesPago: '30_dias' }),
      );
    });
  });

  it('quitar el cliente conserva lo capturado y no envía clienteId', async () => {
    renderizarFormulario();

    fireEvent.focus(campo(/Cliente \(opcional\)/));
    fireEvent.click(screen.getByText('Metales del Norte SA de CV'));
    await screen.findByText('Quitar');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(campo(/Nombre del contacto/).value).toBe('Ana Pérez');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));

    await waitFor(() => {
      expect(crearProspectoMock).toHaveBeenCalledTimes(1);
    });
    expect(crearProspectoMock.mock.calls[0]?.[0]).not.toHaveProperty('clienteId');
  });

  it('el alta rápida crea el cliente, lo selecciona y no pierde el borrador', async () => {
    renderizarFormulario();

    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Urge cotizar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }));

    fireEvent.change(await screen.findByLabelText(/Razón social/), {
      target: { value: 'Aceros Baja SA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear y usar en la RFQ' }));

    await waitFor(() => {
      expect(crearClienteMock).toHaveBeenCalledWith(
        expect.objectContaining({ razonSocial: 'Aceros Baja SA', estado: 'prospecto' }),
      );
    });
    // El cliente recién creado queda seleccionado en la RFQ…
    expect(await screen.findByText('Aceros Baja SA')).toBeDefined();
    // …y la captura previa de la oportunidad sigue intacta.
    expect(screen.getByLabelText('Descripción')).toHaveProperty('value', 'Urge cotizar');
  });

  it('un fallo del alta rápida no cierra el formulario ni selecciona nada', async () => {
    crearClienteMock.mockResolvedValue({ exito: false, error: 'Sin permiso para crear clientes' });
    renderizarFormulario();

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
    fireEvent.change(await screen.findByLabelText(/Razón social/), {
      target: { value: 'Aceros Baja SA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear y usar en la RFQ' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Sin permiso para crear clientes',
    );
    // El diálogo sigue abierto para reintentar y nada quedó seleccionado.
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Cambiar cliente' })).toBeNull();
  });
});

describe('FormularioProspecto — alta durable sin PO ni horas (C1.2a, DC-01/DC-03)', () => {
  it('no muestra Orden de compra ni Horas estimadas', () => {
    renderizarFormulario();

    expect(screen.queryByLabelText(/Orden de compra/)).toBeNull();
    expect(screen.queryByLabelText(/Horas estimadas/)).toBeNull();
    // Orden interna (TI) es otra cosa y se conserva.
    expect(screen.getByLabelText(/Orden interna \(TI\)/)).toBeDefined();
  });

  it('muestra la fecha de registro y el responsable autocompletados', () => {
    renderizarFormulario();

    expect(screen.getByLabelText('Fecha de registro')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Responsable')).toHaveProperty('disabled', true);
  });

  it('envía canal y descripción, sin PO ni horas estimadas', async () => {
    renderizarFormulario();

    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    fireEvent.change(campo(/Teléfono/), { target: { value: '664 111 2233' } });
    fireEvent.change(campo(/Empresa/), { target: { value: 'Aceros Baja SA' } });
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Corte láser' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));

    await waitFor(() => {
      expect(crearProspectoMock).toHaveBeenCalledTimes(1);
    });
    const entrada = crearProspectoMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entrada.canal).toBe('WHATSAPP');
    expect(entrada.descripcionGeneral).toBe('Corte láser');
    expect(entrada).not.toHaveProperty('fechaRequerida');
    expect(entrada).not.toHaveProperty('poCliente');
    expect(entrada).not.toHaveProperty('horasEstimadas');
  });

  it('envía la fecha requerida por el cliente cuando se captura (opcional)', async () => {
    renderizarFormulario();

    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    fireEvent.change(campo(/Teléfono/), { target: { value: '664 111 2233' } });
    fireEvent.change(campo(/Empresa/), { target: { value: 'Aceros Baja SA' } });
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Corte láser' } });
    fireEvent.change(screen.getByLabelText(/Fecha requerida por el cliente/), {
      target: { value: '2026-11-30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));

    await waitFor(() => {
      expect(crearProspectoMock).toHaveBeenCalledTimes(1);
    });
    const entrada = crearProspectoMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entrada.fechaRequerida).toBe('2026-11-30');
  });

  it('un error del servidor conserva la captura y no navega', async () => {
    crearProspectoMock.mockResolvedValue({ exito: false, error: 'No se pudo crear el prospecto' });
    renderizarFormulario();

    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    fireEvent.change(campo(/Teléfono/), { target: { value: '664 111 2233' } });
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Urge cotizar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'No se pudo crear el prospecto',
    );
    expect(campo(/Nombre del contacto/).value).toBe('Ana QA');
    expect(screen.getByLabelText('Descripción')).toHaveProperty('value', 'Urge cotizar');
    expect(empujarRutaMock).not.toHaveBeenCalled();
  });

  it('un fallo de conexión conserva la captura y no navega', async () => {
    crearProspectoMock.mockRejectedValue(new Error('offline'));
    renderizarFormulario();

    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    fireEvent.change(campo(/Teléfono/), { target: { value: '664 111 2233' } });
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Urge cotizar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Error de conexión. Intenta de nuevo.',
    );
    expect(screen.getByLabelText('Descripción')).toHaveProperty('value', 'Urge cotizar');
    expect(empujarRutaMock).not.toHaveBeenCalled();
  });

  it('el éxito continúa en ítems dentro del mismo modal, sin navegar, y avisa al finalizar', async () => {
    const alExito = vi.fn();
    // Con ítem y archivo ya capturados, los pasos del alta dejan avanzar.
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: RFQ_CON_ITEM });
    listarArchivosMock.mockResolvedValue({ exito: true, datos: [ARCHIVO] });
    render(envolver(createElement(FormularioProspecto, { onExito: alExito })));

    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Solicitud de prueba' } });
    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    fireEvent.change(campo(/Teléfono/), { target: { value: '664 111 2233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));

    expect(await screen.findByTestId('alta-rfq-items')).toBeDefined();
    expect(empujarRutaMock).not.toHaveBeenCalled();
    expect(alExito).not.toHaveBeenCalled();

    await esperarBotonHabilitado('Continuar con archivos');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con archivos' }));
    // «Finalizar captura» abre el modal obligatorio del seguimiento; no cierra en seco.
    await esperarBotonHabilitado('Finalizar captura');
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar captura' }));
    expect(await screen.findByTestId('dialogo-finalizar-captura')).toBeDefined();
    expect(alExito).not.toHaveBeenCalled();

    // Cancelar el modal devuelve al paso Archivos; «Finalizar más tarde» sigue
    // cerrando la captura sin modal desde el paso Ítems.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver a ítems' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar más tarde' }));

    await waitFor(() => {
      expect(alExito).toHaveBeenCalledWith('op-1');
    });
    expect(empujarRutaMock).not.toHaveBeenCalled();
  });
});

describe('FormularioProspecto — datos mínimos obligatorios del alta (obs. cliente 2026-10-13)', () => {
  /** Captura el contacto completo y llega al paso Ítems. */
  async function llegarAItems(): Promise<void> {
    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    fireEvent.change(campo(/Teléfono/), { target: { value: '664 111 2233' } });
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Solicitud de prueba' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));
    expect(await screen.findByTestId('alta-rfq-items')).toBeDefined();
  }

  function botonBloqueado(nombre: string): boolean {
    return screen.getByRole('button', { name: nombre }).hasAttribute('disabled');
  }

  it('bloquea “Continuar con ítems” y marca en rojo nombre y teléfono hasta completarlos', () => {
    renderizarFormulario();

    expect(botonBloqueado('Continuar con ítems')).toBe(true);
    expect(campo(/Nombre del contacto/).getAttribute('aria-invalid')).toBe('true');
    expect(campo(/Teléfono/).getAttribute('aria-invalid')).toBe('true');
    expect(campo(/Nombre del contacto/).className).toContain('border-peligro');
    expect(campo(/Teléfono/).className).toContain('border-peligro');
    expect(screen.getByText('Completa el nombre del contacto.')).toBeDefined();
    expect(screen.getByText('Completa el teléfono del contacto.')).toBeDefined();
    expect(screen.getByTestId('alta-rfq-faltantes-cliente').textContent).toContain(
      'nombre del contacto y teléfono',
    );

    // Solo el nombre: el botón sigue bloqueado y únicamente el teléfono queda marcado.
    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    expect(botonBloqueado('Continuar con ítems')).toBe(true);
    expect(campo(/Nombre del contacto/).getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText('Completa el nombre del contacto.')).toBeNull();
    expect(screen.getByText('Completa el teléfono del contacto.')).toBeDefined();

    fireEvent.change(campo(/Teléfono/), { target: { value: '664 111 2233' } });
    expect(botonBloqueado('Continuar con ítems')).toBe(false);
    expect(screen.queryByTestId('alta-rfq-faltantes-cliente')).toBeNull();
    expect(crearProspectoMock).not.toHaveBeenCalled();
  });

  it('un teléfono en blanco no cuenta como capturado', () => {
    renderizarFormulario();
    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    fireEvent.change(campo(/Teléfono/), { target: { value: '   ' } });

    expect(botonBloqueado('Continuar con ítems')).toBe(true);
  });

  it('el cliente del catálogo completa nombre y teléfono y habilita el avance', async () => {
    renderizarFormulario();

    fireEvent.focus(campo(/Cliente \(opcional\)/));
    fireEvent.click(screen.getByText('Metales del Norte SA de CV'));

    await waitFor(() => expect(botonBloqueado('Continuar con ítems')).toBe(false));
    expect(campo(/Teléfono/).value).toBe('664 000 0000');
  });

  it('bloquea “Continuar con archivos” y marca el estado vacío hasta crear un ítem', async () => {
    renderizarFormulario();
    await llegarAItems();

    expect(await screen.findByText('Sin ítems capturados.')).toBeDefined();
    expect(botonBloqueado('Continuar con archivos')).toBe(true);
    expect(screen.getByTestId('alta-rfq-items-requerido').textContent).toContain(
      'al menos un ítem',
    );
    expect(
      screen.getByTestId('tabla-items-rfq').querySelector('[data-faltante="si"]'),
    ).not.toBeNull();
  });

  it('un ítem cancelado no habilita el avance', async () => {
    obtenerRfqMock.mockResolvedValue({
      exito: true,
      datos: { ...RFQ_CAPTURADO, items: [{ ...ITEM_ACTIVO, estado: 'cancelado' }] },
    });
    renderizarFormulario();
    await llegarAItems();

    await screen.findByTestId('tabla-items-rfq');
    expect(botonBloqueado('Continuar con archivos')).toBe(true);
    expect(screen.getByTestId('alta-rfq-items-requerido')).toBeDefined();
  });

  it('con un ítem activo desaparece el aviso y se puede continuar', async () => {
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: RFQ_CON_ITEM });
    renderizarFormulario();
    await llegarAItems();

    await esperarBotonHabilitado('Continuar con archivos');
    expect(screen.queryByTestId('alta-rfq-items-requerido')).toBeNull();
  });

  it('bloquea “Finalizar captura” y marca el archivo en rojo hasta subir uno', async () => {
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: RFQ_CON_ITEM });
    renderizarFormulario();
    await llegarAItems();
    await esperarBotonHabilitado('Continuar con archivos');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con archivos' }));

    expect(await screen.findByTestId('alta-rfq-archivos')).toBeDefined();
    expect(await screen.findByTestId('archivo-rfq-requerido')).toBeDefined();
    expect(botonBloqueado('Finalizar captura')).toBe(true);
    const entrada = screen.getByLabelText(/^Archivo/) as HTMLInputElement;
    expect(entrada.getAttribute('aria-invalid')).toBe('true');
    expect(entrada.className).toContain('border-peligro');
  });

  it('con un archivo subido se habilita “Finalizar captura” y desaparece el aviso', async () => {
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: RFQ_CON_ITEM });
    listarArchivosMock.mockResolvedValue({ exito: true, datos: [ARCHIVO] });
    renderizarFormulario();
    await llegarAItems();
    await esperarBotonHabilitado('Continuar con archivos');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con archivos' }));

    await esperarBotonHabilitado('Finalizar captura');
    expect(screen.queryByTestId('archivo-rfq-requerido')).toBeNull();
  });
});

describe('FormularioProspecto — la ficha no hereda el RFQ previo al modal final (obs. cliente 1)', () => {
  it('al finalizar invalida el RFQ y su validación para que la ficha relea el Resumen guardado', async () => {
    const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidar = vi.spyOn(consultas, 'invalidateQueries');
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: RFQ_CON_ITEM });
    const alExito = vi.fn();
    render(
      createElement(
        QueryClientProvider,
        { client: consultas },
        createElement(FormularioProspecto, { onExito: alExito }),
      ),
    );

    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Solicitud de prueba' } });
    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    fireEvent.change(campo(/Teléfono/), { target: { value: '664 111 2233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));
    await screen.findByTestId('alta-rfq-items');
    await esperarBotonHabilitado('Continuar con archivos');
    invalidar.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar más tarde' }));

    await waitFor(() => expect(alExito).toHaveBeenCalledWith('op-1'));
    const claves = invalidar.mock.calls.map(([filtros]) => JSON.stringify(filtros?.queryKey));
    expect(claves).toContain(JSON.stringify(['rfq', 'op-1']));
    expect(claves).toContain(JSON.stringify(['rfq-validacion-listo', 'op-1']));
    expect(claves).toContain(JSON.stringify(['pipeline']));
  });
});

describe('FormularioProspecto — espera los contactos del cliente antes de crear el RFQ', () => {
  const CONTACTO_ID = '22222222-2222-4222-8222-222222222222';

  it('con los contactos aún cargando bloquea «Continuar con ítems» y luego liga el contacto', async () => {
    let resolverContactos: ((valor: unknown) => void) | undefined;
    contactosMock.mockReturnValue(
      new Promise((resolver) => {
        resolverContactos = resolver;
      }),
    );
    renderizarFormulario();

    fireEvent.focus(campo(/Cliente \(opcional\)/));
    fireEvent.click(screen.getByText('Metales del Norte SA de CV'));
    await screen.findByText('Cambiar cliente');

    // Nombre y teléfono ya vienen del cliente, pero sin contactos aún no se continúa:
    // enviar ahora crearía el RFQ sin contacto vigente («Cliente: faltan datos»).
    const continuar = screen.getByRole('button', { name: 'Continuar con ítems' }) as HTMLButtonElement;
    expect(continuar.disabled).toBe(true);
    expect(screen.getByText('Cargando los contactos del cliente…')).toBeDefined();
    fireEvent.click(continuar);
    expect(crearProspectoMock).not.toHaveBeenCalled();

    resolverContactos?.({
      exito: true,
      datos: [{ id: CONTACTO_ID, nombre: 'Ana Pérez', correo: 'ana@metanor.mx', telefono: '664 000 0000' }],
    });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Continuar con ítems' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(screen.queryByText('Cargando los contactos del cliente…')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar con ítems' }));
    await waitFor(() => expect(crearProspectoMock).toHaveBeenCalledTimes(1));
    expect(crearProspectoMock.mock.calls[0]?.[0]).toMatchObject({
      clienteId: CLIENTE_ID,
      contactoId: CONTACTO_ID,
    });
  });

  it('si los contactos no se pueden cargar no bloquea el alta', async () => {
    contactosMock.mockRejectedValue(new Error('sin conexión'));
    renderizarFormulario();

    fireEvent.focus(campo(/Cliente \(opcional\)/));
    fireEvent.click(screen.getByText('Metales del Norte SA de CV'));
    await screen.findByText('Cambiar cliente');

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Continuar con ítems' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });

  it('sin cliente del catálogo no espera ningún contacto', () => {
    renderizarFormulario();
    fireEvent.change(campo(/Nombre del contacto/), { target: { value: 'Ana QA' } });
    fireEvent.change(campo(/Teléfono/), { target: { value: '664 111 2233' } });

    expect(
      (screen.getByRole('button', { name: 'Continuar con ítems' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(contactosMock).not.toHaveBeenCalled();
  });
});
