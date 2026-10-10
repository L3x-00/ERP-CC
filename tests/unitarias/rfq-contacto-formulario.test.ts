// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { contactosMock, principalMock, actualizarMock, asegurarMock } = vi.hoisted(() => ({
  contactosMock: vi.fn(),
  principalMock: vi.fn(),
  actualizarMock: vi.fn(),
  asegurarMock: vi.fn(),
}));

vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerContactosClienteRfqAccion: (...args: unknown[]) => contactosMock(...args),
  obtenerCatalogosRfqAccion: vi.fn(),
}));
vi.mock('@/modulos/rfq/acciones/actualizar-datos-rfq', () => ({
  actualizarDatosRfqAccion: (...args: unknown[]) => actualizarMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/contactos-rfq', () => ({
  obtenerContactoPrincipalRfqAccion: (...args: unknown[]) => principalMock(...args),
  asegurarContactoRfqAccion: (...args: unknown[]) => asegurarMock(...args),
}));

import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import { FormularioGeneralRfq } from '@/modulos/rfq/componentes/formulario-general-rfq';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import { VALOR_CONTACTO_PRINCIPAL } from '@/modulos/rfq/utilidades/contacto-rfq';

const RFQ: Rfq = {
  id: 'rfq-1',
  folio: 'RFQ-1026_01',
  folioOp: 'OP-000001',
  folioCnc: null,
  estadoRfq: 'INCOMPLETE',
  etapa: 'contactado',
  clienteId: 'cliente-1',
  condicionesPago: null,
  clienteNombre: 'Metales del Norte SA de CV',
  empresa: 'Empresa legada SA',
  contactoId: null,
  contactoNombre: null,
  nombreContacto: 'Contacto legado',
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

const CATALOGOS: CatalogosRfq = {
  materiales: [],
  espesores: [],
  procesos: [],
  canales: [{ codigo: 'TELEFONO', nombre: 'Teléfono', esOtro: false, activo: true }],
  proximasAcciones: [{ codigo: 'LLAMAR', nombre: 'Llamar', esOtro: false }],
  usuarios: [],
};

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

function renderizarFormulario() {
  return render(
    envolver(
      createElement(FormularioGeneralRfq, {
        rfq: RFQ,
        catalogos: CATALOGOS,
        onGuardado: vi.fn(),
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  contactosMock.mockResolvedValue({ exito: true, datos: [] });
  principalMock.mockResolvedValue({ exito: true, datos: null });
  actualizarMock.mockResolvedValue({ exito: true, datos: undefined });
  asegurarMock.mockResolvedValue({ exito: true, datos: { id: 'contacto-nuevo' } });
});

afterEach(cleanup);

describe('FormularioGeneralRfq — Contacto del cliente (observación cliente)', () => {
  it('con datos del cliente los ofrece en la lista y los crea al guardar', async () => {
    principalMock.mockResolvedValue({
      exito: true,
      datos: { nombre: 'Ana Pérez', correo: 'ana@metanor.mx', telefono: '664 000 0000' },
    });
    renderizarFormulario();

    const selector = await screen.findByLabelText('Contacto del cliente');
    await screen.findByRole('option', {
      name: 'Ana Pérez · ana@metanor.mx · 664 000 0000',
    });

    fireEvent.change(selector, { target: { value: VALOR_CONTACTO_PRINCIPAL } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() => {
      expect(asegurarMock).toHaveBeenCalledWith({
        clienteId: 'cliente-1',
        nombre: 'Ana Pérez',
        correo: 'ana@metanor.mx',
        telefono: '664 000 0000',
      });
    });
    await waitFor(() => {
      expect(actualizarMock).toHaveBeenCalledWith(
        expect.objectContaining({ contactoId: 'contacto-nuevo' }),
      );
    });
  });

  it('sin datos del cliente permite escribir el nombre y lo crea al guardar', async () => {
    renderizarFormulario();

    const entrada = await screen.findByPlaceholderText('Nombre del contacto');
    fireEvent.change(entrada, { target: { value: 'Luis Nuevo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() => {
      expect(asegurarMock).toHaveBeenCalledWith({
        clienteId: 'cliente-1',
        nombre: 'Luis Nuevo',
      });
    });
    await waitFor(() => {
      expect(actualizarMock).toHaveBeenCalledWith(
        expect.objectContaining({ contactoId: 'contacto-nuevo' }),
      );
    });
  });

  it('con contactos vigentes guarda el elegido sin crear nada', async () => {
    contactosMock.mockResolvedValue({
      exito: true,
      datos: [{ id: 'c-1', nombre: 'Pedro', correo: 'pedro@x.com' }],
    });
    renderizarFormulario();

    const selector = await screen.findByLabelText('Contacto del cliente');
    await screen.findByRole('option', { name: 'Pedro · pedro@x.com' });
    fireEvent.change(selector, { target: { value: 'c-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() => {
      expect(actualizarMock).toHaveBeenCalledWith(
        expect.objectContaining({ contactoId: 'c-1' }),
      );
    });
    expect(asegurarMock).not.toHaveBeenCalled();
  });
});
