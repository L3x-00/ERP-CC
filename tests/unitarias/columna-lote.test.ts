import { describe, expect, it } from 'vitest';
import { columnaAdminLote, columnaOperadorLote } from '@/modulos/produccion/utilidades/columna-lote';

describe('columna del tablero según el estado de la corrida', () => {
  it('pone un lote recién creado en Bandeja, no en En proceso', () => {
    expect(columnaOperadorLote('PLANIFICADA')).toBe('bandeja');
    expect(columnaAdminLote('PLANIFICADA')).toBe('bandeja');
  });

  it('mueve el lote a En proceso solo cuando ya se inició', () => {
    expect(columnaOperadorLote('EN_PROCESO')).toBe('en_proceso');
    expect(columnaAdminLote('EN_PROCESO')).toBe('en_proceso');
  });

  it('conserva la columna Pausada y oculta las corridas cerradas', () => {
    expect(columnaOperadorLote('PAUSADA')).toBe('pausada');
    expect(columnaAdminLote('PAUSADA')).toBe('pausada');
    expect(columnaOperadorLote('COMPLETADA')).toBeNull();
    expect(columnaOperadorLote('CANCELADA')).toBeNull();
    expect(columnaAdminLote('COMPLETADA')).toBeNull();
    expect(columnaAdminLote('CANCELADA')).toBeNull();
  });
});
