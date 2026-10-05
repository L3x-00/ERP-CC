import { describe, expect, it } from 'vitest';

import {
  condicionesDesdeCredito,
  derivarCreditoDeCondiciones,
  normalizarMoneda,
  resolverCredito,
} from '@/modulos/clientes/servicios/condiciones-comerciales';
import {
  esquemaActualizarCliente,
  esquemaCrearCliente,
} from '@/modulos/clientes/validaciones/cliente-schema';
import {
  filaACliente,
  filaAContactoCliente,
  filaADocumentoCliente,
  type FilaArchivoCliente,
  type FilaCliente,
  type FilaContactoCliente,
} from '@/modulos/clientes/tipos/indice';

const FILA_CLIENTE: FilaCliente = {
  actualizado_en: '2026-10-01T10:00:00.000Z',
  condiciones_pago: 'credito',
  contacto: 'Ana Compras',
  correo: 'contacto@acme.mx',
  creado_en: '2026-09-01T10:00:00.000Z',
  credito_habilitado: true,
  dias_credito: 45,
  direccion_envio: null,
  direccion_fiscal: null,
  estado: 'activo',
  folio: 'CLI-0042',
  id: '11111111-1111-4111-8111-111111111111',
  limite_credito: 250_000,
  moneda: 'USD',
  nombre_comercial: 'ACME',
  razon_social: 'ACME Manufactura SA de CV',
  rfc: 'ACM010101AB1',
  saldo_a_favor: 1000,
  telefono: null,
  tier: 'oro',
  tier_manual: null,
  tier_manual_hasta: null,
};

describe('resolverCredito (coherencia comercial B2.4)', () => {
  it('sin datos comerciales no hay nada que sincronizar', () => {
    expect(resolverCredito({})).toBeNull();
  });

  it('deriva crédito y días desde condiciones_pago con el mapeo histórico', () => {
    expect(resolverCredito({ condicionesPago: 'contado' })).toEqual({
      creditoHabilitado: false,
      diasCredito: 0,
      condicionesPago: 'contado',
    });
    expect(resolverCredito({ condicionesPago: '15_dias' })).toEqual({
      creditoHabilitado: true,
      diasCredito: 15,
      condicionesPago: '15_dias',
    });
    expect(resolverCredito({ condicionesPago: '30_dias' })).toEqual({
      creditoHabilitado: true,
      diasCredito: 30,
      condicionesPago: '30_dias',
    });
    expect(resolverCredito({ condicionesPago: 'credito' })).toEqual({
      creditoHabilitado: true,
      diasCredito: 45,
      condicionesPago: 'credito',
    });
  });

  it('lo explícito manda: crédito apagado ⇒ 0 días y contado', () => {
    expect(resolverCredito({ creditoHabilitado: false, diasCredito: 30 })).toEqual({
      creditoHabilitado: false,
      diasCredito: 0,
      condicionesPago: 'contado',
    });
  });

  it('crédito encendido sin días usa 45 y mapea 15/30 a su condición', () => {
    expect(resolverCredito({ creditoHabilitado: true })).toEqual({
      creditoHabilitado: true,
      diasCredito: 45,
      condicionesPago: 'credito',
    });
    expect(resolverCredito({ creditoHabilitado: true, diasCredito: 15 })).toEqual({
      creditoHabilitado: true,
      diasCredito: 15,
      condicionesPago: '15_dias',
    });
    expect(resolverCredito({ creditoHabilitado: true, diasCredito: 20 })?.condicionesPago).toBe(
      'credito',
    );
  });

  it('rechaza días fuera de 1..365 cuando hay crédito', () => {
    expect(() => resolverCredito({ creditoHabilitado: true, diasCredito: 0 })).toThrow(
      RangeError,
    );
    expect(() => resolverCredito({ creditoHabilitado: true, diasCredito: 400 })).toThrow(
      RangeError,
    );
  });

  it('normaliza moneda desconocida a MXN y respeta USD', () => {
    expect(normalizarMoneda('USD')).toBe('USD');
    expect(normalizarMoneda('EUR')).toBe('MXN');
    expect(normalizarMoneda(undefined)).toBe('MXN');
  });

  it('mapea condiciones desde crédito/días', () => {
    expect(condicionesDesdeCredito(false, 0)).toBe('contado');
    expect(condicionesDesdeCredito(true, 15)).toBe('15_dias');
    expect(condicionesDesdeCredito(true, 30)).toBe('30_dias');
    expect(condicionesDesdeCredito(true, 20)).toBe('credito');
    expect(derivarCreditoDeCondiciones('15_dias').diasCredito).toBe(15);
  });
});

describe('validaciones Zod de coherencia comercial', () => {
  const base = {
    razonSocial: 'ACME Manufactura SA',
    nombreComercial: 'ACME',
    estado: 'activo' as const,
  };

  it('rechaza crédito apagado con días mayores a 0', () => {
    const analisis = esquemaCrearCliente.safeParse({
      ...base,
      creditoHabilitado: false,
      diasCredito: 30,
    });
    expect(analisis.success).toBe(false);
  });

  it('rechaza días fuera de rango con crédito encendido', () => {
    expect(
      esquemaCrearCliente.safeParse({ ...base, creditoHabilitado: true, diasCredito: 400 }).success,
    ).toBe(false);
    expect(
      esquemaActualizarCliente.safeParse({
        id: FILA_CLIENTE.id,
        creditoHabilitado: true,
        diasCredito: 0,
      }).success,
    ).toBe(false);
  });

  it('rechaza moneda fuera de MXN/USD', () => {
    expect(esquemaCrearCliente.safeParse({ ...base, moneda: 'EUR' }).success).toBe(false);
    expect(esquemaCrearCliente.safeParse({ ...base, moneda: 'USD' }).success).toBe(true);
  });
});

describe('mapeos de ficha (B2)', () => {
  it('mapea el cliente con folio, moneda y crédito', () => {
    const cliente = filaACliente(FILA_CLIENTE);

    expect(cliente.folio).toBe('CLI-0042');
    expect(cliente.moneda).toBe('USD');
    expect(cliente.creditoHabilitado).toBe(true);
    expect(cliente.diasCredito).toBe(45);
  });

  it('tolera filas históricas sin folio ni datos comerciales', () => {
    const cliente = filaACliente({
      ...FILA_CLIENTE,
      folio: null,
      moneda: undefined as unknown as string,
      credito_habilitado: undefined as unknown as boolean,
      dias_credito: undefined as unknown as number | null,
    });

    expect(cliente.folio).toBeNull();
    expect(cliente.moneda).toBe('MXN');
    expect(cliente.creditoHabilitado).toBe(false);
    expect(cliente.diasCredito).toBeNull();
  });

  it('mapea el contacto lógico con su baja', () => {
    const fila: FilaContactoCliente = {
      id: '22222222-2222-4222-8222-222222222222',
      cliente_id: FILA_CLIENTE.id,
      nombre: 'Beto Finanzas',
      puesto: 'Finanzas',
      correo: null,
      telefono: null,
      notas: null,
      es_principal: false,
      activo: false,
      desactivado_en: '2026-10-02T10:00:00.000Z',
      desactivado_por: '33333333-3333-4333-8333-333333333333',
      creado_por: null,
      creado_en: '2026-09-01T10:00:00.000Z',
      actualizado_en: '2026-10-02T10:00:00.000Z',
    };

    const contacto = filaAContactoCliente(fila);
    expect(contacto.activo).toBe(false);
    expect(contacto.desactivadoEn).toBe('2026-10-02T10:00:00.000Z');
    expect(contacto.desactivadoPor).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('mapea el documento versionado de archivos con su reemplazo', () => {
    const fila: FilaArchivoCliente = {
      bucket: 'documentos-cliente',
      clase: 'documento',
      creado_en: '2026-10-03T10:00:00.000Z',
      entidad: 'cliente',
      entidad_id: FILA_CLIENTE.id,
      hash_sha256: null,
      id: '44444444-4444-4444-8444-444444444444',
      mime: 'application/pdf',
      nombre_erp: 'csf.pdf',
      nombre_original: 'CSF 2026.pdf',
      reemplaza_a: '55555555-5555-4555-8555-555555555555',
      ruta_storage: 'cliente/abc/uuid-csf.pdf',
      subido_por: null,
      tamano_bytes: 1234,
      tema_codigo: 'csf',
      version: 2,
      vigente: true,
    };

    const documento = filaADocumentoCliente(fila);
    expect(documento.version).toBe(2);
    expect(documento.vigente).toBe(true);
    expect(documento.nombreErp).toBe('csf.pdf');
    expect(documento.reemplazaA).toBe('55555555-5555-4555-8555-555555555555');
  });
});
