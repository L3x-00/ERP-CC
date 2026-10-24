// @vitest-environment jsdom
// Sin JSX: `vitest.config.ts` solo incluye `tests/**/*.test.ts` (mismo patrón que rfq-resumen).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import { fechaHoyLocal } from '@/modulos/rfq/utilidades/proxima-accion';

const { cambiarEstadoMock, validarListoMock } = vi.hoisted(() => ({
  cambiarEstadoMock: vi.fn(),
  validarListoMock: vi.fn(),
}));

vi.mock('@/modulos/rfq/acciones/cambiar-estado-rfq', () => ({
  cambiarEstadoRfqAccion: (...args: unknown[]) => cambiarEstadoMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/validar-rfq-listo', () => ({
  validarRfqListoAccion: (...args: unknown[]) => validarListoMock(...args),
}));

import { PanelAccionesRfq } from '@/modulos/rfq/componentes/panel-acciones-rfq';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111';

function enDias(dias: number): string {
  return fechaHoyLocal(new Date(Date.now() + dias * 86_400_000));
}

const CATALOGOS = {
  proximasAcciones: [
    { codigo: 'FOLLOW_UP', nombre: 'Dar seguimiento', esOtro: false },
    { codigo: 'SEND_QUOTE', nombre: 'Enviar cotización', esOtro: false },
  ],
  usuarios: [{ id: USUARIO_ID, nombre: 'Ana Pérez', rol: 'vendedor' }],
} as unknown as CatalogosRfq;

function rfqCon(campos: Partial<Rfq>): Rfq {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    estadoRfq: 'INCOMPLETE',
    actualizadoEn: '2026-10-21T10:00:00+00:00',
    proximaAccionCodigo: null,
    proximaAccionTexto: null,
    fechaProximaAccion: null,
    responsableProximaAccionId: null,
    ...campos,
  } as Rfq;
}

const VIGENTE = {
  proximaAccionCodigo: 'FOLLOW_UP',
  fechaProximaAccion: enDias(5),
  responsableProximaAccionId: USUARIO_ID,
};

function renderizarPanel(rfq: Rfq) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: cliente },
      createElement(PanelAccionesRfq, { rfq, catalogos: CATALOGOS, onCambio: vi.fn() }),
    ),
  );
}

function abrirEsperaDelCliente(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Poner en espera del cliente' }));
}

describe('seguimiento al cambiar de estado (panel de acciones del RFQ)', () => {
  beforeEach(() => {
    cambiarEstadoMock.mockResolvedValue({ exito: true, datos: { estadoRfq: 'WAITING_CUSTOMER' } });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('con una acción vigente muestra el seguimiento y por defecto la deja como está', async () => {
    renderizarPanel(rfqCon(VIGENTE));
    abrirEsperaDelCliente();

    const bloque = await screen.findByTestId('seguimiento-transicion');
    expect(bloque.textContent).toContain('Dar seguimiento');
    expect(bloque.textContent).toContain('Ana Pérez');
    expect(screen.getByLabelText(/Dejarlo como está/)).toHaveProperty('checked', true);
    // No pide otra acción ni un resultado.
    expect(screen.queryByTestId('campos-proxima-accion')).toBeNull();
    expect(screen.queryByTestId('resultado-seguimiento')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(cambiarEstadoMock).toHaveBeenCalledTimes(1));
    const entrada = cambiarEstadoMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entrada.accion).toBe('poner_en_espera_cliente');
    expect(entrada.mantenerProximaAccion).toBe(true);
    expect(entrada).not.toHaveProperty('proximaAccion');
    expect(entrada).not.toHaveProperty('resultadoProximaAccion');
  });

  it('para sustituirla pide primero el resultado y luego la nueva acción', async () => {
    renderizarPanel(rfqCon(VIGENTE));
    abrirEsperaDelCliente();
    await screen.findByTestId('seguimiento-transicion');

    fireEvent.click(screen.getByLabelText(/Cerrarlo y definir otro/));
    const resultados = await screen.findByTestId('resultado-seguimiento');
    for (const etiqueta of ['Completada', 'Sin respuesta', 'Reprogramada', 'Ya no aplica']) {
      expect(resultados.textContent).toContain(etiqueta);
    }
    // Sin resultado aún no hay campos de la nueva acción y no se puede confirmar.
    expect(screen.queryByTestId('campos-proxima-accion')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByLabelText(/Sin respuesta/));
    fireEvent.change(await screen.findByLabelText('Acción a seguir'), {
      target: { value: 'SEND_QUOTE' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de la acción'), { target: { value: enDias(7) } });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(cambiarEstadoMock).toHaveBeenCalledTimes(1));
    const entrada = cambiarEstadoMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entrada.resultadoProximaAccion).toBe('sin_respuesta');
    expect(entrada.proximaAccion).toEqual({
      codigo: 'SEND_QUOTE',
      fecha: enDias(7),
      responsableId: USUARIO_ID,
    });
    expect(entrada).not.toHaveProperty('mantenerProximaAccion');
  });

  it('«Reprogramada» conserva la acción y solo pide la nueva fecha', async () => {
    renderizarPanel(rfqCon(VIGENTE));
    abrirEsperaDelCliente();
    await screen.findByTestId('seguimiento-transicion');

    fireEvent.click(screen.getByLabelText(/Cerrarlo y definir otro/));
    fireEvent.click(await screen.findByLabelText(/Reprogramada/));

    expect(await screen.findByLabelText('Acción a seguir')).toHaveProperty('value', 'FOLLOW_UP');
    expect(screen.getByLabelText('Fecha de la acción')).toHaveProperty('value', '');
  });

  it('con la acción vencida no deja conservarla: pide el resultado', async () => {
    renderizarPanel(rfqCon({ ...VIGENTE, fechaProximaAccion: enDias(-3) }));
    abrirEsperaDelCliente();

    const bloque = await screen.findByTestId('seguimiento-transicion');
    expect(bloque.textContent).toContain('Ya venció');
    expect(screen.queryByLabelText(/Dejarlo como está/)).toBeNull();
    expect(screen.getByTestId('resultado-seguimiento')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveProperty('disabled', true);
  });

  it('sin acción vigente pide definirla, sin preguntar por un resultado', async () => {
    renderizarPanel(rfqCon({}));
    abrirEsperaDelCliente();

    const bloque = await screen.findByTestId('seguimiento-transicion');
    expect(bloque.textContent).toContain('aún no tiene seguimiento');
    expect(screen.getByTestId('campos-proxima-accion')).toBeDefined();
    expect(screen.queryByTestId('resultado-seguimiento')).toBeNull();
  });

  it('permite marcar listo capturando el seguimiento en el mismo modal de validación', async () => {
    validarListoMock.mockResolvedValue({
      exito: true,
      datos: {
        listo: false,
        secciones: {
          cliente: [],
          general: [],
          items: [],
          archivos: [],
          seguimiento: [
            'próxima acción',
            'fecha de próxima acción',
            'responsable de próxima acción',
          ],
        },
      },
    });
    cambiarEstadoMock.mockResolvedValue({
      exito: true,
      datos: { estadoRfq: 'READY_FOR_PROPOSAL' },
    });
    renderizarPanel(rfqCon({}));

    fireEvent.click(screen.getByRole('button', { name: 'Marcar listo' }));
    const dialogo = await screen.findByTestId('validacion-listo');
    // Antes de capturar el seguimiento, el checklist del servidor explica qué falta.
    expect(dialogo.textContent).toContain('Seguimiento: próxima acción');

    const confirmar = screen.getByRole('button', { name: 'Confirmar y marcar listo' });
    expect(confirmar).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Acción a seguir'), {
      target: { value: 'FOLLOW_UP' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de la acción'), { target: { value: enDias(7) } });
    fireEvent.change(screen.getByLabelText('Responsable de la acción a seguir'), {
      target: { value: USUARIO_ID },
    });

    // Al completar el seguimiento local, el checklist deja de mostrarlo como
    // pendiente, el botón se habilita y la transición guarda la acción.
    expect(dialogo.textContent).not.toContain('Seguimiento: próxima acción');
    expect(screen.getByText('El RFQ cumple todos los requisitos.')).toBeDefined();
    expect(confirmar).toHaveProperty('disabled', false);

    fireEvent.click(confirmar);
    await waitFor(() => expect(cambiarEstadoMock).toHaveBeenCalledTimes(1));
    const entrada = cambiarEstadoMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entrada).toMatchObject({
      accion: 'marcar_listo',
      proximaAccion: {
        codigo: 'FOLLOW_UP',
        fecha: enDias(7),
        responsableId: USUARIO_ID,
      },
    });
    expect(entrada).not.toHaveProperty('mantenerProximaAccion');
  });
});
