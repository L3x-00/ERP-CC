import { describe, expect, it } from 'vitest';
import {
  esquemaCrearProspecto,
  esquemaDatosOportunidad,
} from '@/modulos/pipeline/validaciones/esquemas-prospecto';

const ID = '11111111-1111-4111-8111-111111111111';

describe('esquemaDatosOportunidad (RFQ-01)', () => {
  it('acepta datos válidos con fecha YYYY-MM-DD y horas', () => {
    const r = esquemaDatosOportunidad.safeParse({
      id: ID,
      poCliente: 'PO-123',
      fechaRequerida: '2026-10-01',
      horasEstimadas: 12.5,
      notas: 'Urgente',
    });
    expect(r.success).toBe(true);
  });

  it('acepta cadenas vacías y horas null (para limpiar los campos)', () => {
    const r = esquemaDatosOportunidad.safeParse({
      id: ID,
      poCliente: '',
      fechaRequerida: '',
      horasEstimadas: null,
      notas: '',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza fecha con formato inválido', () => {
    const r = esquemaDatosOportunidad.safeParse({
      id: ID,
      poCliente: '',
      fechaRequerida: '01/10/2026',
      horasEstimadas: null,
      notas: '',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza horas negativas', () => {
    const r = esquemaDatosOportunidad.safeParse({
      id: ID,
      poCliente: '',
      fechaRequerida: '',
      horasEstimadas: -1,
      notas: '',
    });
    expect(r.success).toBe(false);
  });
});

describe('esquemaCrearProspecto — captura RFQ-01 opcional', () => {
  it('crea sin campos de captura (todos opcionales)', () => {
    const r = esquemaCrearProspecto.safeParse({
      nombreContacto: 'Ana',
      empresa: 'Aceros del Norte',
    });
    expect(r.success).toBe(true);
  });

  it('acepta captura completa', () => {
    const r = esquemaCrearProspecto.safeParse({
      nombreContacto: 'Ana',
      empresa: 'Aceros del Norte',
      poCliente: 'PO-9',
      fechaRequerida: '2026-10-01',
      horasEstimadas: 4,
      notas: 'x',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza fecha de captura mal formada', () => {
    const r = esquemaCrearProspecto.safeParse({
      nombreContacto: 'Ana',
      empresa: 'Aceros del Norte',
      fechaRequerida: '2026/10/01',
    });
    expect(r.success).toBe(false);
  });
});
