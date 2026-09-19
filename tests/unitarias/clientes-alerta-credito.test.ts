// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import { AlertaCredito } from '@/modulos/clientes/componentes/alerta-credito';
import type { Cliente } from '@/modulos/clientes/tipos/indice';

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

describe('AlertaCredito', () => {
  it('avisa en el 80% exacto del límite (el corte es inclusivo)', () => {
    render(createElement(AlertaCredito, { cliente: CLIENTE, usado: 80_000 }));

    const barra = screen.getByRole('progressbar', { name: 'Uso del crédito' });
    expect(barra.getAttribute('aria-valuenow')).toBe('80');
    expect(screen.getByRole('alert').textContent).toContain('80%');
  });

  it('por debajo del 80% no muestra aviso', () => {
    render(createElement(AlertaCredito, { cliente: CLIENTE, usado: 79_000 }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('un crédito excedido mantiene el bloqueo explícito', () => {
    render(createElement(AlertaCredito, { cliente: CLIENTE, usado: 120_000 }));

    expect(screen.getByRole('alert').textContent).toContain('Crédito excedido');
  });

  it('sin límite definido (0) informa ausencia de límite, sin excedido ni porcentaje', () => {
    render(createElement(AlertaCredito, { cliente: { ...CLIENTE, limiteCredito: 0 }, usado: 50_000 }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Sin límite definido')).toBeTruthy();
  });

  it('el saldo a favor amplía la base del porcentaje (fórmula intacta)', () => {
    render(
      createElement(AlertaCredito, {
        cliente: { ...CLIENTE, saldoAFavor: 100_000 },
        usado: 80_000,
      }),
    );

    // 80 000 / (100 000 + 100 000) = 40%: aún no es alerta.
    const barra = screen.getByRole('progressbar', { name: 'Uso del crédito' });
    expect(barra.getAttribute('aria-valuenow')).toBe('40');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
