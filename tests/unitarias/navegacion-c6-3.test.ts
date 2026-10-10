import { describe, expect, it } from 'vitest';
import { MODULOS_NAVEGACION } from '@/compartido/componentes/navegacion/modulos-navegacion';

describe('navegación C6.3', () => {
  it('presenta /inventario como Materiales y costos', () => {
    expect(MODULOS_NAVEGACION.find((modulo) => modulo.href === '/inventario')?.etiqueta).toBe(
      'Materiales y costos',
    );
  });
});
