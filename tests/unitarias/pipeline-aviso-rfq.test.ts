// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { AvisoPipelineRfq } from '@/modulos/pipeline/componentes/aviso-pipeline-rfq';

describe('AvisoPipelineRfq', () => {
  it('explica que la oportunidad es el RFQ y que las etapas no se editan', () => {
    render(createElement(AvisoPipelineRfq));

    const aviso = screen.getByTestId('aviso-pipeline-rfq');
    expect(aviso.textContent).toContain('RFQ');
    expect(aviso.textContent).toContain('Marcar listo');
    expect(aviso.textContent).toContain('Archivos');
    expect(aviso.textContent).toContain('propuesta');
  });
});
