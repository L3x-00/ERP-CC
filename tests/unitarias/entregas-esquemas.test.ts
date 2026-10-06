import { describe, expect, it } from 'vitest';

import { traducirErrorEntrega } from '@/modulos/entregas/servicios/errores-entrega';
import {
  esquemaRegistrarEntrega,
  esquemaSubirEvidenciaEntrega,
} from '@/modulos/entregas/validaciones/esquemas-entregas';

const ORDEN = '11111111-1111-4111-8111-111111111111';
const PARTIDA_A = '22222222-2222-4222-8222-222222222222';
const PARTIDA_B = '33333333-3333-4333-8333-333333333333';

describe('esquemaRegistrarEntrega (SII-B7.1)', () => {
  it('acepta una entrega parcial válida con contacto y solicitud', () => {
    const analisis = esquemaRegistrarEntrega.safeParse({
      ordenId: ORDEN,
      renglones: [{ partidaId: PARTIDA_A, cantidadEntregada: 3.5 }],
      recibidoPor: 'Ana Cliente',
      contactoId: PARTIDA_B,
      solicitudId: PARTIDA_B,
    });
    expect(analisis.success).toBe(true);
  });

  it('exige al menos un renglón y cantidades positivas', () => {
    expect(
      esquemaRegistrarEntrega.safeParse({ ordenId: ORDEN, renglones: [], recibidoPor: 'Ana' })
        .success,
    ).toBe(false);
    expect(
      esquemaRegistrarEntrega.safeParse({
        ordenId: ORDEN,
        renglones: [{ partidaId: PARTIDA_A, cantidadEntregada: 0 }],
        recibidoPor: 'Ana',
      }).success,
    ).toBe(false);
  });

  it('rechaza partidas repetidas y receptor demasiado corto', () => {
    expect(
      esquemaRegistrarEntrega.safeParse({
        ordenId: ORDEN,
        renglones: [
          { partidaId: PARTIDA_A, cantidadEntregada: 1 },
          { partidaId: PARTIDA_A, cantidadEntregada: 2 },
        ],
        recibidoPor: 'Ana',
      }).success,
    ).toBe(false);
    expect(
      esquemaRegistrarEntrega.safeParse({
        ordenId: ORDEN,
        renglones: [{ partidaId: PARTIDA_A, cantidadEntregada: 1 }],
        recibidoPor: 'A',
      }).success,
    ).toBe(false);
  });

  it('valida la clase de evidencia/firma', () => {
    expect(
      esquemaSubirEvidenciaEntrega.safeParse({
        notaId: ORDEN,
        clase: 'firma',
        nombreArchivo: 'firma.png',
      }).success,
    ).toBe(true);
    expect(
      esquemaSubirEvidenciaEntrega.safeParse({
        notaId: ORDEN,
        clase: 'otro',
        nombreArchivo: 'x.png',
      }).success,
    ).toBe(false);
  });
});

describe('traducirErrorEntrega (SII-B7.1)', () => {
  it('traduce los códigos principales', () => {
    expect(traducirErrorEntrega('sin_permiso_entrega')).toContain('Sin permiso');
    expect(traducirErrorEntrega('orden_no_entregable')).toContain('no admite entregas');
    expect(traducirErrorEntrega('cantidad_entrega_excede_producida')).toContain('producido');
    expect(traducirErrorEntrega('cantidad_entrega_excede_pendiente')).toContain('pendiente');
    expect(traducirErrorEntrega('contacto_invalido')).toContain('contacto');
  });

  it('incluye el estado en el detalle de orden no entregable', () => {
    expect(traducirErrorEntrega('orden_no_entregable', 'CONFIRMADA')).toContain('CONFIRMADA');
  });
});
