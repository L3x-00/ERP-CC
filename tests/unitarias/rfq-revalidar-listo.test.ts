// @vitest-environment jsdom
// Convención del repo: los componentes usan JSX, pero la config de Vitest solo
// incluye `tests/**/*.test.ts`, así que se usa `createElement`.
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

vi.mock('@/modulos/pipeline/componentes/gestor-cliente-oportunidad', () => ({
  GestorClienteOportunidad: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/lista-propuestas-rfq', () => ({
  ListaPropuestasRfq: () => null,
}));
vi.mock('@/modulos/rfq/componentes/actividad-rfq', () => ({ ActividadRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/activar-cliente-rfq', () => ({ ActivarClienteRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/adjuntos-oportunidad-rfq', () => ({
  AdjuntosOportunidadRfq: () => null,
}));
vi.mock('@/modulos/rfq/componentes/dialogo-historial-rfq', () => ({
  DialogoHistorialRfq: () => null,
}));
vi.mock('@/modulos/rfq/componentes/panel-acciones-rfq', () => ({ PanelAccionesRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/panel-archivos-rfq', () => ({ PanelArchivosRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/panel-revision-rfq', () => ({
  PanelRevisionRfq: (props: { rfq: { estadoRfq: string } }) =>
    createElement('div', {
      'data-testid': 'panel-revision-stub',
      'data-estado': props.rfq.estadoRfq,
    }),
}));
vi.mock('@/modulos/rfq/componentes/resumen-rfq', () => ({ ResumenRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/tabla-items-rfq', () => ({ TablaItemsRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/formulario-general-rfq', () => ({
  FormularioGeneralRfq: () => null,
}));

import { FichaRfq } from '@/modulos/rfq/componentes/ficha-rfq';
import type { Rfq, ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';

function rfq(sobrescribir: Partial<Rfq> = {}): Rfq {
  return {
    id: 'rfq-1',
    folio: 'RFQ-1026_01',
    folioOp: 'OP-000001',
    folioCnc: null,
    estadoRfq: 'READY_FOR_PROPOSAL',
    etapa: 'contactado',
    clienteId: 'cliente-1',
    condicionesPago: null,
    clienteNombre: 'Metales del Norte SA de CV',
    empresa: 'Empresa legada SA',
    contactoId: 'contacto-1',
    contactoNombre: 'Luis Mora',
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

function renderizarFicha() {
  return render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(FichaRfq, { rfqId: 'rfq-1' }),
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

describe('M-5: re-validación visible en READY_FOR_PROPOSAL', () => {
  it('ofrece la pestaña Revisar, consulta la validación y monta el panel sin cambiar el estado', async () => {
    renderizarFicha();

    expect(await screen.findByRole('tab', { name: 'Revisar' })).toBeDefined();
    await waitFor(() => expect(validarMock).toHaveBeenCalledWith({ rfqId: 'rfq-1' }));

    fireEvent.click(screen.getByRole('tab', { name: 'Revisar' }));
    const panel = await screen.findByTestId('panel-revision-stub');
    expect(panel.getAttribute('data-estado')).toBe('READY_FOR_PROPOSAL');
  });

  it('no ofrece Revisar ni consulta la validación en un estado terminal', async () => {
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: rfq({ estadoRfq: 'CLOSED' }) });
    renderizarFicha();

    await screen.findByText('Corte de lámina calibre 14');
    expect(screen.queryByRole('tab', { name: 'Revisar' })).toBeNull();
    expect(validarMock).not.toHaveBeenCalled();
  });

  it('el panel en READY no remite al usuario a “Marcar listo”', async () => {
    const { PanelRevisionRfq } = await vi.importActual<
      typeof import('@/modulos/rfq/componentes/panel-revision-rfq')
    >('@/modulos/rfq/componentes/panel-revision-rfq');

    render(
      createElement(PanelRevisionRfq, {
        rfq: rfq({ estadoRfq: 'READY_FOR_PROPOSAL' }),
        catalogos: null,
        validacion: SIN_FALTANTES,
        validando: false,
        error: null,
        onRevalidar: vi.fn(),
        onEditarResumen: vi.fn(),
        onIrAItems: vi.fn(),
        onIrAArchivos: vi.fn(),
      }),
    );

    expect(screen.getByText(/sigue completo tras la última edición/i)).toBeDefined();
    expect(screen.queryByText(/Marcar listo para propuesta/i)).toBeNull();
  });
});
