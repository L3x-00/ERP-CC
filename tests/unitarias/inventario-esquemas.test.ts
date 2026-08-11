import { describe, expect, it } from 'vitest';
import {
  esquemaCrearMaterial,
  esquemaCrearProveedor,
  esquemaEntradaInventario,
} from '@/modulos/inventario/validaciones/inventario';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('esquemaCrearMaterial', () => {
  const valido = {
    codigo: 'AC-304-2MM',
    nombre: 'Lámina acero inox 304 2mm',
    categoria: 'materia_prima',
    unidadCompra: 'hoja',
    unidadControl: 'm2',
    factorConversion: 2.88,
    costoUnitarioCompra: 1500,
    stockMinimoControl: 10,
  } as const;

  it('acepta un material válido y aplica el default de merma (8%)', () => {
    const r = esquemaCrearMaterial.safeParse(valido);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.factorMermaPorcentaje).toBe(8);
    }
  });

  it('acepta proveedorId con UUID válido', () => {
    const r = esquemaCrearMaterial.safeParse({ ...valido, proveedorId: UUID });
    expect(r.success).toBe(true);
  });

  it('rechaza factorConversion no positivo', () => {
    const r = esquemaCrearMaterial.safeParse({ ...valido, factorConversion: 0 });
    expect(r.success).toBe(false);
  });

  it('rechaza categoría fuera del enum', () => {
    const r = esquemaCrearMaterial.safeParse({ ...valido, categoria: 'chatarra' });
    expect(r.success).toBe(false);
  });

  it('rechaza proveedorId que no es UUID', () => {
    const r = esquemaCrearMaterial.safeParse({ ...valido, proveedorId: 'abc' });
    expect(r.success).toBe(false);
  });

  it('rechaza costo negativo', () => {
    const r = esquemaCrearMaterial.safeParse({ ...valido, costoUnitarioCompra: -1 });
    expect(r.success).toBe(false);
  });
});

describe('esquemaEntradaInventario', () => {
  const valido = {
    materialId: UUID,
    cantidadCompra: 5,
    costoUnitarioCompra: 1500,
  };

  it('acepta una entrada válida', () => {
    expect(esquemaEntradaInventario.safeParse(valido).success).toBe(true);
  });

  it('rechaza materialId inválido', () => {
    const r = esquemaEntradaInventario.safeParse({ ...valido, materialId: 'x' });
    expect(r.success).toBe(false);
  });

  it('rechaza cantidad no positiva', () => {
    const r = esquemaEntradaInventario.safeParse({ ...valido, cantidadCompra: 0 });
    expect(r.success).toBe(false);
  });

  it('rechaza costo no positivo', () => {
    const r = esquemaEntradaInventario.safeParse({ ...valido, costoUnitarioCompra: 0 });
    expect(r.success).toBe(false);
  });
});

describe('esquemaCrearProveedor', () => {
  const valido = {
    nombreComercial: 'Aceros del Norte',
    contactoNombre: 'Juan Pérez',
    correo: 'ventas@acerosnorte.mx',
    telefono: '6641234567',
  };

  it('acepta un proveedor válido', () => {
    expect(esquemaCrearProveedor.safeParse(valido).success).toBe(true);
  });

  it('rechaza correo inválido (z.email v4)', () => {
    const r = esquemaCrearProveedor.safeParse({ ...valido, correo: 'no-es-correo' });
    expect(r.success).toBe(false);
  });

  it('rechaza RFC con formato inválido', () => {
    const r = esquemaCrearProveedor.safeParse({ ...valido, rfc: '123' });
    expect(r.success).toBe(false);
  });

  it('acepta RFC válido y lo normaliza a mayúsculas', () => {
    const r = esquemaCrearProveedor.safeParse({ ...valido, rfc: 'abc010203xy1' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rfc).toBe('ABC010203XY1');
    }
  });
});
