// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import { FormularioGeneralRfq } from '@/modulos/rfq/componentes/formulario-general-rfq';
import type { Rfq } from '@/modulos/rfq/tipos/indice';

const { actualizarDatosRfqAccionMock, obtenerContactosClienteRfqAccionMock } = vi.hoisted(() => ({
  actualizarDatosRfqAccionMock: vi.fn(),
  obtenerContactosClienteRfqAccionMock: vi.fn(),
}));

vi.mock('@/modulos/rfq/acciones/actualizar-datos-rfq', () => ({
  actualizarDatosRfqAccion: (...args: unknown[]) => actualizarDatosRfqAccionMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerContactosClienteRfqAccion: (...args: unknown[]) =>
    obtenerContactosClienteRfqAccionMock(...args),
}));

const RFQ = {
  id: '20000000-0000-4000-8000-000000000001',
  folio: 'RFQ-1026_01',
  folioOp: 'OP-000001',
  folioCnc: null,
  estadoRfq: 'INCOMPLETE',
  etapa: 'prospecto',
  clienteId: null,
  clienteNombre: null,
  empresa: 'Cliente QA',
  contactoId: null,
  contactoNombre: null,
  nombreContacto: 'Contacto QA',
  vendedorId: '30000000-0000-4000-8000-000000000001',
  responsableId: null,
  responsableNombre: null,
  canal: 'TELEFONO',
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
} as unknown as Rfq;

const CATALOGOS = {
  materiales: [],
  espesores: [],
  procesos: [],
  canales: [
    { codigo: 'CORREO', nombre: 'Correo', esOtro: false, activo: true },
    { codigo: 'TELEFONO', nombre: 'Teléfono', esOtro: false, activo: false },
    { codigo: 'OTRO', nombre: 'Otro', esOtro: true, activo: true },
  ],
  proximasAcciones: [],
  usuarios: [],
} as unknown as CatalogosRfq;

function renderizarFormulario(onGuardado = vi.fn()) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onGuardado,
    ...render(
      createElement(
        QueryClientProvider,
        { client: cliente },
        createElement(FormularioGeneralRfq, { rfq: RFQ, catalogos: CATALOGOS, onGuardado }),
      ),
    ),
  };
}

afterEach(cleanup);

describe('Canal configurable en Resumen RFQ — DC-02', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actualizarDatosRfqAccionMock.mockResolvedValue({
      exito: true,
      datos: { actualizadoEn: '2026-10-08T01:00:00.000Z' },
    });
    obtenerContactosClienteRfqAccionMock.mockResolvedValue({ exito: true, datos: [] });
  });

  it('usa un selector y conserva visible el canal histórico aunque esté inactivo', () => {
    renderizarFormulario();

    const canal = screen.getByRole('combobox', { name: 'Canal' }) as HTMLSelectElement;
    expect(canal.tagName).toBe('SELECT');
    expect(canal.value).toBe('TELEFONO');
    expect(screen.getByRole('option', { name: 'Teléfono (inactivo)' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Correo' })).toBeDefined();
  });

  it('exige y envía el detalle cuando el canal elegido es Otro', async () => {
    const { onGuardado } = renderizarFormulario();
    fireEvent.change(screen.getByRole('combobox', { name: 'Canal' }), {
      target: { value: 'OTRO' },
    });

    const detalle = screen.getByRole('textbox', { name: 'Detalle del canal Otro' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect((await screen.findByRole('alert')).textContent).toContain('detalle del canal');
    expect(actualizarDatosRfqAccionMock).not.toHaveBeenCalled();

    fireEvent.change(detalle, { target: { value: 'Feria industrial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() => expect(actualizarDatosRfqAccionMock).toHaveBeenCalledTimes(1));
    expect(actualizarDatosRfqAccionMock).toHaveBeenCalledWith(
      expect.objectContaining({ canal: 'OTRO', canalDetalle: 'Feria industrial' }),
    );
    await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1));
  });
});
