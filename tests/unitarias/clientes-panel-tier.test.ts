// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import { PanelTier } from '@/modulos/clientes/componentes/panel-tier';
import { ETIQUETA_TIER } from '@/modulos/clientes/utilidades/indice';
import type { Cliente } from '@/modulos/clientes/tipos/indice';

vi.mock('@/modulos/configuracion/hooks/usar-catalogos-comerciales', async () => {
  const { CATALOGO_TIERS_DEFECTO } = await import('@/modulos/clientes/tipos/indice');
  return {
    usarCatalogosComerciales: () => ({ tiers: CATALOGO_TIERS_DEFECTO, categoriasGasto: [] }),
  };
});

const CLIENTE: Cliente = {
  id: '11111111-1111-4111-8111-111111111111',
  razonSocial: 'Metales del Norte SA de CV',
  nombreComercial: 'Metales del Norte',
  rfc: null,
  contacto: null,
  correo: null,
  telefono: null,
  condicionesPago: '30_dias',
  limiteCredito: 100_000,
  saldoAFavor: 0,
  tier: 'plata',
  tierManual: null,
  tierManualHasta: null,
  estado: 'activo',
  direccionFiscal: null,
  direccionEnvio: null,
  creadoEn: '2026-09-01T10:00:00.000Z',
  actualizadoEn: '2026-09-01T10:00:00.000Z',
};

afterEach(() => cleanup());

describe('PanelTier', () => {
  it('muestra tier efectivo, descuento, consumo, siguiente tier y progreso', () => {
    // Consumo 100 000 → tier por consumo = plata; siguiente = oro (umbral 150 000).
    render(createElement(PanelTier, { cliente: CLIENTE, consumo: 100_000 }));

    expect(screen.getByText(new RegExp(ETIQUETA_TIER.plata))).toBeTruthy();
    expect(screen.getByText(/Descuento 3%/)).toBeTruthy();
    expect(screen.getByText(new RegExp(ETIQUETA_TIER.oro))).toBeTruthy();
    expect(screen.getByText(/Faltan/)).toBeTruthy();

    // Progreso en la banda plata→oro: (100k-50k)/(150k-50k) = 50%.
    const barra = screen.getByRole('progressbar');
    expect(barra.getAttribute('aria-valuenow')).toBe('50');
  });

  it('en el tier máximo indica que no hay siguiente nivel', () => {
    render(createElement(PanelTier, { cliente: CLIENTE, consumo: 400_000 }));

    expect(screen.getByText(/máximo alcanzado/)).toBeTruthy();
    expect(screen.queryByText(/Faltan/)).toBeNull();
  });
});
