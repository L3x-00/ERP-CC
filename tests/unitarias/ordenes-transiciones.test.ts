import { describe, expect, it } from 'vitest';
import {
  TRANSICIONES_ORDEN_VALIDAS,
  esTransicionOrdenValida,
  requiereMotivoCancelacion,
} from '@/modulos/ordenes/servicios/reglas-transicion';
import type { EstadoOrden } from '@/modulos/ordenes/tipos/ordenes';

const todosLosEstados: readonly EstadoOrden[] = [
  'borrador',
  'programada',
  'en_proceso',
  'pausada',
  'completada',
  'cancelada',
];

describe('TRANSICIONES_ORDEN_VALIDAS', () => {
  it('cubre los seis estados de orden', () => {
    expect(Object.keys(TRANSICIONES_ORDEN_VALIDAS).sort()).toEqual([...todosLosEstados].sort());
  });

  it('deja completada y cancelada como estados terminales', () => {
    expect(TRANSICIONES_ORDEN_VALIDAS.completada).toEqual([]);
    expect(TRANSICIONES_ORDEN_VALIDAS.cancelada).toEqual([]);
  });
});

describe('esTransicionOrdenValida', () => {
  it('permite el camino feliz borrador → programada → en_proceso → completada', () => {
    expect(esTransicionOrdenValida('borrador', 'programada')).toBe(true);
    expect(esTransicionOrdenValida('programada', 'en_proceso')).toBe(true);
    expect(esTransicionOrdenValida('en_proceso', 'completada')).toBe(true);
  });

  it('permite el ciclo de pausa y reanudación', () => {
    expect(esTransicionOrdenValida('en_proceso', 'pausada')).toBe(true);
    expect(esTransicionOrdenValida('pausada', 'en_proceso')).toBe(true);
  });

  it('permite cancelar desde cualquier estado no terminal', () => {
    expect(esTransicionOrdenValida('borrador', 'cancelada')).toBe(true);
    expect(esTransicionOrdenValida('programada', 'cancelada')).toBe(true);
    expect(esTransicionOrdenValida('en_proceso', 'cancelada')).toBe(true);
    expect(esTransicionOrdenValida('pausada', 'cancelada')).toBe(true);
  });

  it('rechaza saltos de etapa', () => {
    expect(esTransicionOrdenValida('borrador', 'en_proceso')).toBe(false);
    expect(esTransicionOrdenValida('borrador', 'completada')).toBe(false);
    expect(esTransicionOrdenValida('programada', 'completada')).toBe(false);
    expect(esTransicionOrdenValida('pausada', 'completada')).toBe(false);
  });

  it('rechaza reversiones', () => {
    expect(esTransicionOrdenValida('programada', 'borrador')).toBe(false);
    expect(esTransicionOrdenValida('en_proceso', 'programada')).toBe(false);
    expect(esTransicionOrdenValida('pausada', 'programada')).toBe(false);
  });

  it('rechaza cualquier salida de completada o cancelada', () => {
    for (const destino of todosLosEstados) {
      expect(esTransicionOrdenValida('completada', destino)).toBe(false);
      expect(esTransicionOrdenValida('cancelada', destino)).toBe(false);
    }
  });

  it('rechaza permanecer en la misma etapa', () => {
    for (const estado of todosLosEstados) {
      expect(esTransicionOrdenValida(estado, estado)).toBe(false);
    }
  });
});

describe('requiereMotivoCancelacion', () => {
  it('exige motivo solo cuando el destino es cancelada', () => {
    expect(requiereMotivoCancelacion('borrador', 'cancelada')).toBe(true);
    expect(requiereMotivoCancelacion('en_proceso', 'cancelada')).toBe(true);
    expect(requiereMotivoCancelacion('pausada', 'cancelada')).toBe(true);
  });

  it('no exige motivo en transiciones sin cancelación', () => {
    expect(requiereMotivoCancelacion('borrador', 'programada')).toBe(false);
    expect(requiereMotivoCancelacion('en_proceso', 'completada')).toBe(false);
    expect(requiereMotivoCancelacion('pausada', 'en_proceso')).toBe(false);
    expect(requiereMotivoCancelacion('cancelada', 'cancelada')).toBe(false);
  });
});
