import { describe, expect, it } from 'vitest';

import {
  esquemaCambiarEstadoCliente,
  esquemaCrearContactoCliente,
  esquemaDesactivarContactoCliente,
  esquemaMarcarContactoPrincipal,
  esquemaReactivarContactoCliente,
} from '@/modulos/clientes/validaciones/cliente-schema';

const CLIENTE = '11111111-1111-4111-8111-111111111111';
const CONTACTO = '22222222-2222-4222-8222-222222222222';
const VERSION = '2026-10-05T10:00:00.000000+00:00';

describe('contactos lógicos (B2.3)', () => {
  it('marcar principal exige ambos ids y rechaza claves extra', () => {
    expect(esquemaMarcarContactoPrincipal.safeParse({ id: CONTACTO, clienteId: CLIENTE }).success).toBe(
      true,
    );
    expect(
      esquemaMarcarContactoPrincipal.safeParse({ id: CONTACTO, clienteId: CLIENTE, extra: 1 }).success,
    ).toBe(false);
    expect(esquemaMarcarContactoPrincipal.safeParse({ id: 'no-uuid', clienteId: CLIENTE }).success).toBe(
      false,
    );
  });

  it('la baja lógica exige motivo suficiente y versión (CAS)', () => {
    expect(
      esquemaDesactivarContactoCliente.safeParse({
        id: CONTACTO,
        clienteId: CLIENTE,
        motivo: 'cambio de proveedor',
        actualizadoEn: VERSION,
      }).success,
    ).toBe(true);

    expect(
      esquemaDesactivarContactoCliente.safeParse({
        id: CONTACTO,
        clienteId: CLIENTE,
        motivo: 'xy',
        actualizadoEn: VERSION,
      }).success,
    ).toBe(false);

    expect(
      esquemaDesactivarContactoCliente.safeParse({
        id: CONTACTO,
        clienteId: CLIENTE,
        motivo: 'motivo válido',
      }).success,
    ).toBe(false);
  });

  it('reactivar exige contacto y cliente', () => {
    expect(
      esquemaReactivarContactoCliente.safeParse({ id: CONTACTO, clienteId: CLIENTE }).success,
    ).toBe(true);
    expect(esquemaReactivarContactoCliente.safeParse({ id: CONTACTO }).success).toBe(false);
  });

  it('el alta de contacto sigue aceptando notas y principal', () => {
    const analisis = esquemaCrearContactoCliente.safeParse({
      clienteId: CLIENTE,
      nombre: 'Laura Compras',
      notas: 'Prefiere correo',
      esPrincipal: true,
    });
    expect(analisis.success).toBe(true);
    if (analisis.success) expect(analisis.data.esPrincipal).toBe(true);
  });
});

describe('cambio de estado por acción (B2.5)', () => {
  it('exige estado válido y versión', () => {
    expect(
      esquemaCambiarEstadoCliente.safeParse({
        clienteId: CLIENTE,
        nuevoEstado: 'activo',
        actualizadoEn: VERSION,
      }).success,
    ).toBe(true);
    expect(
      esquemaCambiarEstadoCliente.safeParse({
        clienteId: CLIENTE,
        nuevoEstado: 'cancelado',
        actualizadoEn: VERSION,
      }).success,
    ).toBe(false);
    expect(
      esquemaCambiarEstadoCliente.safeParse({ clienteId: CLIENTE, nuevoEstado: 'activo' }).success,
    ).toBe(false);
  });

  it('acepta motivo opcional acotado (obligatorio solo para inactivar)', () => {
    expect(
      esquemaCambiarEstadoCliente.safeParse({
        clienteId: CLIENTE,
        nuevoEstado: 'inactivo',
        motivo: 'cliente sin compras',
        actualizadoEn: VERSION,
      }).success,
    ).toBe(true);
    expect(
      esquemaCambiarEstadoCliente.safeParse({
        clienteId: CLIENTE,
        nuevoEstado: 'inactivo',
        motivo: 'x'.repeat(301),
        actualizadoEn: VERSION,
      }).success,
    ).toBe(false);
  });
});
