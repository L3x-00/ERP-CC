// @vitest-environment jsdom
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluarTipoCambioDiario,
  type EstadoTipoCambioDiario,
} from '@/modulos/configuracion/utilidades/tipo-cambio-diario';

const { actualizar } = vi.hoisted(() => ({ actualizar: vi.fn() }));
const { refrescar } = vi.hoisted(() => ({ refrescar: vi.fn() }));
vi.mock('@/modulos/configuracion/acciones/indice', () => ({
  actualizarTipoCambioAccion: actualizar,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refrescar }) }));

import { AvisoTipoCambioDiario } from '@/modulos/configuracion/componentes/aviso-tipo-cambio-diario';

const AHORA = new Date('2026-11-10T18:00:00.000Z');

function estadoVencido(): EstadoTipoCambioDiario {
  return evaluarTipoCambioDiario({
    tipoCambioActualizadoEn: null,
    tipoCambioUsd: 18.75,
    ahora: AHORA,
  });
}

function montar(estado: EstadoTipoCambioDiario = estadoVencido()): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    createElement(
      QueryClientProvider,
      { client: cliente },
      createElement(AvisoTipoCambioDiario, { estado }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actualizar.mockResolvedValue({ exito: true, datos: {} });
});

afterEach(cleanup);

describe('modal de tipo de cambio diario', () => {
  it('abre con el último valor precargado y muestra el aviso de respaldo', () => {
    montar();
    expect(screen.getByTestId('modal-tipo-cambio-diario')).toBeTruthy();
    expect((screen.getByTestId('tipo-cambio-diario-input') as HTMLInputElement).value).toBe('18.7500');
    expect(screen.getByTestId('aviso-tipo-cambio-diario').textContent).toContain('18.7500');
  });

  it('«Más tarde» cierra el modal y deja el aviso para reabrirlo', async () => {
    montar();
    fireEvent.click(screen.getByTestId('tipo-cambio-diario-mas-tarde'));
    await waitFor(() => expect(screen.queryByTestId('modal-tipo-cambio-diario')).toBeNull());
    expect(screen.getByTestId('aviso-tipo-cambio-diario')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ahora' }));
    expect(screen.getByTestId('modal-tipo-cambio-diario')).toBeTruthy();
  });

  it('guarda el TC corregido, cierra el aviso y refresca el servidor', async () => {
    montar();
    fireEvent.change(screen.getByTestId('tipo-cambio-diario-input'), {
      target: { value: '19.4321' },
    });
    fireEvent.click(screen.getByTestId('tipo-cambio-diario-guardar'));
    await waitFor(() => expect(actualizar).toHaveBeenCalledWith({ tipoCambioUsd: 19.4321 }));
    await waitFor(() => expect(screen.queryByTestId('modal-tipo-cambio-diario')).toBeNull());
    expect(screen.queryByTestId('aviso-tipo-cambio-diario')).toBeNull();
    expect(refrescar).toHaveBeenCalled();
  });

  it('si el guardado falla conserva el modal y muestra el error', async () => {
    actualizar.mockResolvedValueOnce({ exito: false, error: 'Sin permiso para configurar el sistema' });
    montar();
    fireEvent.click(screen.getByTestId('tipo-cambio-diario-guardar'));
    const error = await screen.findByTestId('tipo-cambio-diario-error');
    expect(error.textContent).toContain('Sin permiso');
    expect(screen.getByTestId('modal-tipo-cambio-diario')).toBeTruthy();
  });

  it('no renderiza nada cuando el TC ya es vigente', () => {
    const vigente = evaluarTipoCambioDiario({
      tipoCambioActualizadoEn: '2026-11-10T16:00:00.000Z',
      tipoCambioUsd: 18.75,
      ahora: AHORA,
    });
    montar(vigente);
    expect(screen.queryByTestId('modal-tipo-cambio-diario')).toBeNull();
    expect(screen.queryByTestId('aviso-tipo-cambio-diario')).toBeNull();
  });
});
