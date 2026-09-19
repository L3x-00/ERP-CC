import { describe, expect, it } from 'vitest';

import { clienteRfqDesdeAlta } from '@/modulos/pipeline/servicios/cliente-rfq-alta';
import { clienteAClienteRfq } from '@/modulos/pipeline/tipos/indice';
import {
  esquemaAsignarClienteOportunidad,
  esquemaCrearProspecto,
} from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import type { Cliente } from '@/modulos/clientes/tipos/indice';

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';
const OPORTUNIDAD_ID = '22222222-2222-4222-8222-222222222222';

const CLIENTE: Cliente = {
  id: CLIENTE_ID,
  razonSocial: 'Metales del Norte SA de CV',
  nombreComercial: 'Metanor',
  rfc: 'MNO120101AB1',
  contacto: 'Ana Pérez',
  correo: 'ana@metanor.mx',
  telefono: '664 000 0000',
  condicionesPago: '30_dias',
  limiteCredito: 50_000,
  saldoAFavor: 0,
  tier: 'oro',
  tierManual: null,
  tierManualHasta: null,
  estado: 'activo',
  direccionFiscal: null,
  direccionEnvio: null,
  creadoEn: '2026-01-01T00:00:00Z',
  actualizadoEn: '2026-01-01T00:00:00Z',
};

describe('clienteAClienteRfq', () => {
  it('reduce el cliente a lo que la RFQ hereda o muestra', () => {
    expect(clienteAClienteRfq(CLIENTE)).toEqual({
      id: CLIENTE_ID,
      razonSocial: 'Metales del Norte SA de CV',
      nombreComercial: 'Metanor',
      rfc: 'MNO120101AB1',
      contacto: 'Ana Pérez',
      correo: 'ana@metanor.mx',
      telefono: '664 000 0000',
      condicionesPago: '30_dias',
      estado: 'activo',
    });
  });

  it('no copia el tier: el efectivo lo resuelve la ficha con el consumo real', () => {
    expect(clienteAClienteRfq(CLIENTE)).not.toHaveProperty('tier');
  });
});

describe('clienteRfqDesdeAlta', () => {
  it('normaliza igual que el alta del catálogo (trim, RFC mayúsculas, correo minúsculas)', () => {
    const cliente = clienteRfqDesdeAlta(CLIENTE_ID, {
      razonSocial: '  Aceros Baja SA  ',
      nombreComercial: '',
      rfc: ' abc120101ab1 ',
      contacto: '  Luis  ',
      correo: '  Luis@Aceros.MX ',
      telefono: '   ',
      condicionesPago: 'contado',
    });

    expect(cliente).toEqual({
      id: CLIENTE_ID,
      razonSocial: 'Aceros Baja SA',
      // Sin nombre comercial capturado se usa la razón social (igual que el envío).
      nombreComercial: 'Aceros Baja SA',
      rfc: 'ABC120101AB1',
      contacto: 'Luis',
      correo: 'luis@aceros.mx',
      telefono: null,
      condicionesPago: 'contado',
      estado: 'prospecto',
    });
  });

  it('respeta el nombre comercial capturado y admite sin condiciones', () => {
    const cliente = clienteRfqDesdeAlta(CLIENTE_ID, {
      razonSocial: 'Aceros Baja SA',
      nombreComercial: 'Acebaja',
      rfc: '',
      contacto: '',
      correo: '',
      telefono: '664 111 2222',
      condicionesPago: null,
    });

    expect(cliente.nombreComercial).toBe('Acebaja');
    expect(cliente.rfc).toBeNull();
    expect(cliente.condicionesPago).toBeNull();
  });
});

describe('esquemaCrearProspecto con cliente (RFQ-02)', () => {
  const BASE = { nombreContacto: 'Ana Pérez', empresa: 'Metanor' };

  it('acepta la RFQ sin cliente del catálogo', () => {
    const analisis = esquemaCrearProspecto.safeParse(BASE);
    expect(analisis.success).toBe(true);
    expect(analisis.success && analisis.data.clienteId).toBeUndefined();
  });

  it('acepta un clienteId uuid', () => {
    const analisis = esquemaCrearProspecto.safeParse({ ...BASE, clienteId: CLIENTE_ID });
    expect(analisis.success && analisis.data.clienteId).toBe(CLIENTE_ID);
  });

  it('rechaza un clienteId que no es uuid', () => {
    const analisis = esquemaCrearProspecto.safeParse({ ...BASE, clienteId: 'metanor' });
    expect(analisis.success).toBe(false);
  });
});

describe('esquemaAsignarClienteOportunidad', () => {
  it('admite desligar con clienteId null y no hereda por omisión', () => {
    const analisis = esquemaAsignarClienteOportunidad.safeParse({
      id: OPORTUNIDAD_ID,
      clienteId: null,
    });
    expect(analisis.success).toBe(true);
    expect(analisis.success && analisis.data.heredarCondiciones).toBe(false);
  });

  it('admite asignar con herencia explícita', () => {
    const analisis = esquemaAsignarClienteOportunidad.safeParse({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });
    expect(analisis.success && analisis.data.heredarCondiciones).toBe(true);
  });

  it('rechaza omitir clienteId (desligar debe ser explícito)', () => {
    const analisis = esquemaAsignarClienteOportunidad.safeParse({ id: OPORTUNIDAD_ID });
    expect(analisis.success).toBe(false);
  });
});
