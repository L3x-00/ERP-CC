// @vitest-environment jsdom
// Sin JSX: `vitest.config.ts` solo incluye `tests/**/*.test.ts` (mismo patrón
// que rfq-resumen y rfq-seguimiento-transicion).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import { fechaHoyLocal } from '@/modulos/rfq/utilidades/proxima-accion';

const { actualizarMock, contactosMock, principalMock } = vi.hoisted(() => ({
  actualizarMock: vi.fn(),
  contactosMock: vi.fn(),
  principalMock: vi.fn(),
}));

vi.mock('@/modulos/rfq/acciones/actualizar-datos-rfq', () => ({
  actualizarDatosRfqAccion: (...args: unknown[]) => actualizarMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerContactosClienteRfqAccion: (...args: unknown[]) => contactosMock(...args),
  obtenerCatalogosRfqAccion: vi.fn(),
}));
vi.mock('@/modulos/rfq/acciones/contactos-rfq', () => ({
  obtenerContactoPrincipalRfqAccion: (...args: unknown[]) => principalMock(...args),
  asegurarContactoRfqAccion: vi.fn(),
}));

import { FormularioGeneralRfq } from '@/modulos/rfq/componentes/formulario-general-rfq';

function enDias(dias: number): string {
  return fechaHoyLocal(new Date(Date.now() + dias * 86_400_000));
}

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
  canal: 'TELEFONO',
  canalDetalle: null,
  fechaSolicitud: enDias(-2),
  fechaRequeridaCliente: null,
  plazoComercial: null,
  descripcionGeneral: 'Corte de lámina',
  proximaAccionCodigo: 'FOLLOW_UP',
  proximaAccionTexto: null,
  fechaProximaAccion: enDias(5),
  responsableProximaAccionId: null,
  responsableProximaAccionNombre: null,
  actualizadoEn: '2026-10-21T10:00:00+00:00',
  items: [],
};

const CATALOGOS: CatalogosRfq = {
  materiales: [],
  espesores: [],
  procesos: [],
  canales: [{ codigo: 'TELEFONO', nombre: 'Teléfono', esOtro: false, activo: true }],
  proximasAcciones: [
    { codigo: 'FOLLOW_UP', nombre: 'Dar seguimiento', esOtro: false },
    { codigo: 'SEND_QUOTE', nombre: 'Enviar cotización', esOtro: false },
  ],
  usuarios: [],
};

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

function renderizarFormulario(rfq: Rfq = RFQ) {
  return render(
    envolver(
      createElement(FormularioGeneralRfq, {
        rfq,
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
  actualizarMock.mockResolvedValue({ exito: true, datos: { actualizadoEn: '2026-10-21T11:00:00+00:00' } });
});

afterEach(cleanup);

describe('edición directa de la próxima acción en el Resumen (obs. 2026-10-21)', () => {
  it('al sustituir la acción vigente pide el resultado antes de guardar', async () => {
    renderizarFormulario();

    expect(screen.queryByTestId('resultado-edicion-seguimiento')).toBeNull();
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'SEND_QUOTE' } });

    const bloque = await screen.findByTestId('resultado-edicion-seguimiento');
    expect(bloque.textContent).toContain('Dar seguimiento');
    const guardar = screen.getByRole('button', { name: 'Guardar datos' });
    expect(guardar).toHaveProperty('disabled', true);
    expect(screen.getByText(/Falta: cómo terminó la acción actual/)).toBeDefined();

    fireEvent.click(screen.getByLabelText(/Sin respuesta/));
    expect(guardar).toHaveProperty('disabled', false);
    fireEvent.click(guardar);

    await waitFor(() => expect(actualizarMock).toHaveBeenCalledTimes(1));
    expect(actualizarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        proximaAccionCodigo: 'SEND_QUOTE',
        resultadoProximaAccion: 'sin_respuesta',
      }),
    );
  });

  it('mover solo la fecha conserva la acción y no pide resultado', async () => {
    renderizarFormulario();

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: enDias(9) } });
    expect(screen.queryByTestId('resultado-edicion-seguimiento')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    await waitFor(() => expect(actualizarMock).toHaveBeenCalledTimes(1));
    const entrada = actualizarMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entrada.proximaAccionCodigo).toBe('FOLLOW_UP');
    expect(entrada.fechaProximaAccion).toBe(enDias(9));
    expect(entrada).not.toHaveProperty('resultadoProximaAccion');
  });

  it('sin acción vigente definir una no pide resultado', async () => {
    renderizarFormulario({
      ...RFQ,
      proximaAccionCodigo: null,
      fechaProximaAccion: null,
    });

    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'SEND_QUOTE' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: enDias(7) } });

    expect(screen.queryByTestId('resultado-edicion-seguimiento')).toBeNull();
    expect(screen.getByRole('button', { name: 'Guardar datos' })).toHaveProperty('disabled', false);
  });
});
