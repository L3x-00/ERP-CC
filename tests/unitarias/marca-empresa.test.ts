import { describe, expect, it } from 'vitest';

import {
  LOGO_EMPRESA_RUTA,
  NOMBRE_EMPRESA,
  resolverLogoDocumento,
} from '@/compartido/constantes/marca';

describe('identidad de marca', () => {
  it('conserva el nombre oficial en todo el sistema', () => {
    expect(NOMBRE_EMPRESA).toBe('CC Manufacturing Group');
  });

  it('cae al logo institucional cuando la empresa no configuró uno', () => {
    expect(resolverLogoDocumento(null)).toBe(LOGO_EMPRESA_RUTA);
    expect(resolverLogoDocumento(undefined)).toBe(LOGO_EMPRESA_RUTA);
    expect(resolverLogoDocumento('   ')).toBe(LOGO_EMPRESA_RUTA);
  });

  it('respeta el logo configurado por la empresa', () => {
    expect(resolverLogoDocumento('https://cdn.empresa.mx/logo.png')).toBe(
      'https://cdn.empresa.mx/logo.png',
    );
  });
});
