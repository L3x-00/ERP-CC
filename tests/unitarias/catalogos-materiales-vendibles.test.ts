import { describe, expect, it } from 'vitest';

import { esMaterialVendible } from '@/modulos/catalogos/utilidades/materiales';

describe('esMaterialVendible', () => {
  it('oculta consumibles marcados como insumo', () => {
    expect(esMaterialVendible({ categoria: 'insumo' })).toBe(false);
    expect(esMaterialVendible({ categoria: ' INSUMO ' })).toBe(false);
  });

  it('conserva materiales vendibles y filas sin categoría', () => {
    expect(esMaterialVendible({ categoria: 'producto' })).toBe(true);
    expect(esMaterialVendible({})).toBe(true);
    expect(esMaterialVendible(null)).toBe(true);
    expect(esMaterialVendible(undefined)).toBe(true);
    expect(esMaterialVendible([])).toBe(true);
  });
});
