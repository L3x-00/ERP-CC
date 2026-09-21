import { describe, expect, it } from 'vitest';
import {
  esquemaCrearContactoCliente,
  esquemaEliminarContactoCliente,
} from '@/modulos/clientes/validaciones/cliente-schema';
import { esquemaDatosOportunidad } from '@/modulos/pipeline/validaciones/esquemas-prospecto';

const CLIENTE = '11111111-1111-4111-8111-111111111111';
const CONTACTO = '22222222-2222-4222-8222-222222222222';

describe('esquemaCrearContactoCliente (OBS-02)', () => {
  it('acepta un contacto con nombre y campos opcionales vacíos', () => {
    const analisis = esquemaCrearContactoCliente.safeParse({
      clienteId: CLIENTE,
      nombre: 'Laura Compras',
      puesto: 'Compras',
      correo: 'laura@cliente.mx',
      telefono: '',
      notas: '',
    });
    expect(analisis.success).toBe(true);
    if (analisis.success) expect(analisis.data.esPrincipal).toBe(false);
  });

  it('exige nombre suficiente y correo válido cuando viene', () => {
    expect(
      esquemaCrearContactoCliente.safeParse({ clienteId: CLIENTE, nombre: 'A' }).success,
    ).toBe(false);
    expect(
      esquemaCrearContactoCliente.safeParse({
        clienteId: CLIENTE,
        nombre: 'Laura Compras',
        correo: 'sin-arroba',
      }).success,
    ).toBe(false);
  });

  it('rechaza claves inesperadas y cliente inválido', () => {
    expect(
      esquemaCrearContactoCliente.safeParse({
        clienteId: CLIENTE,
        nombre: 'Laura Compras',
        extra: 1,
      }).success,
    ).toBe(false);
    expect(
      esquemaCrearContactoCliente.safeParse({ clienteId: 'no-uuid', nombre: 'Laura Compras' })
        .success,
    ).toBe(false);
  });

  it('la baja exige contacto y cliente', () => {
    expect(
      esquemaEliminarContactoCliente.safeParse({ id: CONTACTO, clienteId: CLIENTE }).success,
    ).toBe(true);
    expect(esquemaEliminarContactoCliente.safeParse({ id: CONTACTO }).success).toBe(false);
  });
});

describe('esquemaDatosOportunidad con siguiente acción (OBS-03)', () => {
  const base = {
    id: '33333333-3333-4333-8333-333333333333',
    poCliente: '',
    fechaRequerida: '',
    horasEstimadas: null,
    notas: '',
  };

  it('exige la acción concreta cuando hay fecha de seguimiento', () => {
    const sinAccion = esquemaDatosOportunidad.safeParse({
      ...base,
      fechaSeguimiento: '2026-10-01',
      proximoPaso: '   ',
    });
    expect(sinAccion.success).toBe(false);
    if (!sinAccion.success) {
      expect(sinAccion.error.issues[0]?.path).toEqual(['proximoPaso']);
    }

    const conAccion = esquemaDatosOportunidad.safeParse({
      ...base,
      fechaSeguimiento: '2026-10-01',
      proximoPaso: 'Llamar para confirmar la orden de compra',
    });
    expect(conAccion.success).toBe(true);
  });

  it('sin fecha de seguimiento la acción es opcional', () => {
    expect(esquemaDatosOportunidad.safeParse({ ...base, fechaSeguimiento: '' }).success).toBe(true);
    expect(esquemaDatosOportunidad.safeParse(base).success).toBe(true);
  });

  it('acota la longitud de la acción', () => {
    expect(
      esquemaDatosOportunidad.safeParse({
        ...base,
        fechaSeguimiento: '2026-10-01',
        proximoPaso: 'x'.repeat(301),
      }).success,
    ).toBe(false);
  });
});
