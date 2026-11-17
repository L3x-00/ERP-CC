// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/modulos/pipeline/componentes/panel-adjuntos', async () => {
  const react = await import('react');
  return {
    PanelAdjuntos: ({ pipelineId, soloLectura }: { pipelineId: string; soloLectura?: boolean }) =>
      react.createElement(
        'div',
        { 'data-testid': 'panel-adjuntos-stub' },
        `${pipelineId} · soloLectura=${String(soloLectura)}`,
      ),
  };
});

import { AdjuntosOportunidadRfq } from '@/modulos/rfq/componentes/adjuntos-oportunidad-rfq';

afterEach(cleanup);

describe('AdjuntosOportunidadRfq', () => {
  it('hace alcanzable la vista histórica de adjuntos en solo lectura', () => {
    render(createElement(AdjuntosOportunidadRfq, { pipelineId: 'rfq-1' }));

    const vista = screen.getByTestId('adjuntos-oportunidad-rfq');
    expect(vista.textContent).toContain('Adjuntos de la oportunidad');
    expect(vista.textContent).toContain('solo consulta');
    expect(screen.getByTestId('panel-adjuntos-stub').textContent).toContain('rfq-1');
    expect(screen.getByTestId('panel-adjuntos-stub').textContent).toContain('soloLectura=true');
  });
});
