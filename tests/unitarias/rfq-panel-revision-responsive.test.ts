// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('@/modulos/rfq/componentes/resumen-rfq', () => ({
  ResumenRfq: () => null,
}));

import { PanelRevisionRfq } from '@/modulos/rfq/componentes/panel-revision-rfq';
import type { Rfq, ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';

afterEach(cleanup);

describe('PanelRevisionRfq — diseño responsive', () => {
  it('organiza el checklist en 1, 2 y 5 columnas según el breakpoint', () => {
    const validacion = {
      listo: true,
      secciones: {
        cliente: [],
        general: [],
        items: [],
        archivos: [],
        seguimiento: [],
      },
    } as unknown as ValidacionRfqListo;

    render(
      createElement(PanelRevisionRfq, {
        rfq: { id: 'rfq-test' } as Rfq,
        catalogos: null,
        validacion,
        validando: false,
        error: null,
        onRevalidar: vi.fn(),
        onEditarResumen: vi.fn(),
        onIrAItems: vi.fn(),
        onIrAArchivos: vi.fn(),
      }),
    );

    const checklist = screen.getByTestId('revision-checklist');

    expect(checklist.className).toContain('grid-cols-1');
    expect(checklist.className).toContain('sm:grid-cols-2');
    expect(checklist.className).toContain('lg:grid-cols-5');
    expect(checklist.children).toHaveLength(5);
  });
});