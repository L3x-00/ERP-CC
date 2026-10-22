// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { obtenerRfqMock, obtenerCatalogosMock, validarMock, vincularMock } = vi.hoisted(() => ({
  obtenerRfqMock: vi.fn(),
  obtenerCatalogosMock: vi.fn(),
  validarMock: vi.fn(),
  vincularMock: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) =>
    createElement('a', { href, ...resto }, children),
}));
vi.mock('@/modulos/rfq/acciones/obtener-rfq', () => ({
  obtenerRfqAccion: (...args: unknown[]) => obtenerRfqMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerCatalogosRfqAccion: (...args: unknown[]) => obtenerCatalogosMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/validar-rfq-listo', () => ({
  validarRfqListoAccion: (...args: unknown[]) => validarMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/vincular-contacto-rfq', () => ({
  vincularContactoVigenteRfqAccion: (...args: unknown[]) => vincularMock(...args),
}));

// Hijos pesados fuera del alcance de esta prueba: se sustituyen por marcadores.
vi.mock('@/modulos/pipeline/componentes/gestor-cliente-oportunidad', () => ({
  GestorClienteOportunidad: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/lista-propuestas-rfq', () => ({
  ListaPropuestasRfq: () => null,
}));
vi.mock('@/modulos/rfq/componentes/actividad-rfq', () => ({ ActividadRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/dialogo-historial-rfq', () => ({
  DialogoHistorialRfq: () => null,
}));
vi.mock('@/modulos/rfq/componentes/panel-acciones-rfq', () => ({ PanelAccionesRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/panel-archivos-rfq', () => ({ PanelArchivosRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/panel-revision-rfq', () => ({ PanelRevisionRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/resumen-rfq', () => ({ ResumenRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/tabla-items-rfq', () => ({ TablaItemsRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/formulario-general-rfq', () => ({
  FormularioGeneralRfq: () => createElement('div', { 'data-testid': 'formulario-general' }),
}));

import { FichaRfq } from '@/modulos/rfq/componentes/ficha-rfq';
import type { EstadoRfq, Rfq, ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';

const CLIENTE_ID = 'cliente-1';

function rfq(sobrescribir: Partial<Rfq> = {}): Rfq {
  return {
    id: 'rfq-1',
    folio: 'RFQ-1026_01',
    folioOp: 'OP-000001',
    folioCnc: null,
    estadoRfq: 'INCOMPLETE',
    etapa: 'contactado',
    clienteId: CLIENTE_ID,
    condicionesPago: null,
    clienteNombre: 'Metales del Norte SA de CV',
    empresa: 'Empresa legada SA',
    contactoId: null,
    contactoNombre: null,
    nombreContacto: 'Luis Mora',
    vendedorId: 'vend-1',
    responsableId: 'usuario-1',
    responsableNombre: 'Luis Operador',
    canal: 'TELEFONO',
    canalDetalle: null,
    fechaSolicitud: '2026-01-01',
    fechaRequeridaCliente: null,
    plazoComercial: null,
    descripcionGeneral: 'Corte de lámina calibre 14',
    proximaAccionCodigo: null,
    proximaAccionTexto: null,
    fechaProximaAccion: null,
    responsableProximaAccionId: null,
    responsableProximaAccionNombre: null,
    actualizadoEn: '2026-01-05T18:30:00+00:00',
    items: [],
    ...sobrescribir,
  };
}

const SIN_FALTANTES: ValidacionRfqListo = {
  listo: true,
  secciones: { cliente: [], general: [], items: [], archivos: [], seguimiento: [] },
};
const FALTA_CANAL: ValidacionRfqListo = {
  listo: false,
  secciones: { ...SIN_FALTANTES.secciones, general: ['canal'] },
};

function renderizarFicha(continuar = false) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(FichaRfq, { rfqId: 'rfq-1', continuar }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerRfqMock.mockResolvedValue({ exito: true, datos: rfq() });
  obtenerCatalogosMock.mockResolvedValue({
    exito: true,
    datos: {
      materiales: [],
      espesores: [],
      procesos: [],
      canales: [],
      proximasAcciones: [],
      usuarios: [],
    },
  });
  validarMock.mockResolvedValue({ exito: true, datos: SIN_FALTANTES });
  vincularMock.mockResolvedValue({
    exito: true,
    datos: { vinculado: false, motivo: 'sin_datos' },
  });
});

afterEach(cleanup);

describe('FichaRfq — vinculación automática del contacto en RFQ existentes', () => {
  it('RFQ editable con cliente y sin contacto: lo vincula sin acción manual y recarga', async () => {
    vincularMock.mockResolvedValue({
      exito: true,
      datos: { vinculado: true, contactoId: 'c-principal' },
    });
    obtenerRfqMock
      .mockResolvedValueOnce({ exito: true, datos: rfq() })
      .mockResolvedValue({ exito: true, datos: rfq({ contactoId: 'c-principal' }) });
    renderizarFicha();

    await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(1));
    expect(vincularMock).toHaveBeenCalledWith({ rfqId: 'rfq-1' });
    // Tras vincular se relee el RFQ y se revalida (se acaba el faltante de contacto).
    await waitFor(() => expect(obtenerRfqMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(validarMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    // Con contacto ya no se vuelve a intentar.
    expect(vincularMock).toHaveBeenCalledTimes(1);
  });

  it.each<EstadoRfq>(['NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL', 'READY_FOR_PROPOSAL'])(
    'estado editable %s: intenta la vinculación',
    async (estadoRfq) => {
      obtenerRfqMock.mockResolvedValue({ exito: true, datos: rfq({ estadoRfq }) });
      renderizarFicha();

      await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(1));
    },
  );

  it.each<EstadoRfq>(['CONVERTED', 'CLOSED', 'CANCELLED'])(
    'estado terminal %s: no escribe nada',
    async (estadoRfq) => {
      obtenerRfqMock.mockResolvedValue({ exito: true, datos: rfq({ estadoRfq }) });
      renderizarFicha();

      await screen.findByText('RFQ-1026_01');
      await new Promise((resolver) => setTimeout(resolver, 30));
      expect(vincularMock).not.toHaveBeenCalled();
    },
  );

  it('conserva la selección existente: con contacto ligado no llama a la acción', async () => {
    obtenerRfqMock.mockResolvedValue({
      exito: true,
      datos: rfq({ contactoId: 'c-elegido', contactoNombre: 'Ana Pérez' }),
    });
    renderizarFicha();

    await screen.findByText('RFQ-1026_01');
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(vincularMock).not.toHaveBeenCalled();
  });

  it('sin cliente ligado no hay contacto que vincular', async () => {
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: rfq({ clienteId: null }) });
    renderizarFicha();

    await screen.findByText('RFQ-1026_01');
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(vincularMock).not.toHaveBeenCalled();
  });

  it('sin datos o sin permiso para crear: no recarga, no alarma y no reintenta', async () => {
    vincularMock.mockResolvedValue({
      exito: true,
      datos: { vinculado: false, motivo: 'sin_permiso_crear_contacto' },
    });
    renderizarFicha();

    await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(1));
    await screen.findByText('RFQ-1026_01');
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(obtenerRfqMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(vincularMock).toHaveBeenCalledTimes(1);
  });

  it('si la acción falla o rechaza la ficha sigue usable y no entra en bucle', async () => {
    vincularMock.mockRejectedValueOnce(new Error('red'));
    renderizarFicha();

    await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(1));
    await screen.findByText('RFQ-1026_01');
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(vincularMock).toHaveBeenCalledTimes(1);

    cleanup();
    vi.clearAllMocks();
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: rfq() });
    vincularMock.mockResolvedValue({ exito: false, error: 'Sin permiso para editar el RFQ' });
    renderizarFicha();

    await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(1));
    await screen.findByText('RFQ-1026_01');
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(vincularMock).toHaveBeenCalledTimes(1);
  });

  it('mientras se vincula no monta el formulario, para no perder lo que se escriba', async () => {
    validarMock.mockResolvedValue({ exito: true, datos: FALTA_CANAL });
    let resolver: (valor: unknown) => void = () => undefined;
    vincularMock.mockReturnValue(new Promise((resolverPromesa) => (resolver = resolverPromesa)));
    renderizarFicha(true);

    await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(1));
    await screen.findByText('RFQ-1026_01');
    await new Promise((resolverEspera) => setTimeout(resolverEspera, 30));
    expect(screen.queryByTestId('formulario-general')).toBeNull();

    resolver({ exito: true, datos: { vinculado: false, motivo: 'sin_datos' } });
    await screen.findByTestId('formulario-general');
  });

  it('un intento por RFQ y cliente: releer el mismo cliente no repite; cambiarlo sí', async () => {
    renderizarFicha();
    await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(1));
    await screen.findByText('RFQ-1026_01');

    // Mismo RFQ y mismo cliente: releer no genera un segundo intento.
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(obtenerRfqMock).toHaveBeenCalledTimes(2));
    await new Promise((resolverEspera) => setTimeout(resolverEspera, 30));
    expect(vincularMock).toHaveBeenCalledTimes(1);

    // Otro cliente sin contacto: es un caso nuevo.
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: rfq({ clienteId: 'cliente-2' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(2));
  });
});
