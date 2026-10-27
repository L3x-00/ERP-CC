// @vitest-environment jsdom

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import LayoutPiso from '@/app/(piso)/layout';

describe('Layout de piso y tema global', () => {
  it('hereda el tema global en vez de forzar el modo oscuro', () => {
    const { container } = render(createElement(
      LayoutPiso,
      null,
      createElement('p', null, 'Contenido de piso'),
    ));

    expect(container.firstElementChild?.classList.contains('dark')).toBe(false);
  });
});
