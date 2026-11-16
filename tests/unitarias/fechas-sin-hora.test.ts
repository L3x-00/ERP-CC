import { describe, expect, it } from 'vitest';

import { formatearFecha, formatearFechaCorta } from '@/compartido/utilidades/formatear';
import { formatearFechaDia } from '@/modulos/inventario/utilidades/materiales-costos';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';

/**
 * Regresión QA (M2): las fechas de calendario no deben mostrar hora ni correr
 * un día en zonas horarias negativas. Postgres serializa una columna `date`
 * como `YYYY-MM-DD` o como medianoche UTC, y ambas formas deben leerse igual.
 */
describe('formatearFecha / formatearFechaCorta sin hora', () => {
  it('trata igual el día calendario y su medianoche UTC con milisegundos', () => {
    expect(formatearFecha('2026-01-01')).toBe('1 de enero de 2026');
    expect(formatearFecha('2026-01-01T00:00:00.000Z')).toBe('1 de enero de 2026');
    expect(formatearFecha('2026-01-01T00:00:00+00:00')).toBe('1 de enero de 2026');
    expect(formatearFechaCorta('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
  });

  it('formatea objetos Date en la zona local sin agregar la hora', () => {
    const mediodia = new Date(2026, 0, 1, 12, 0, 0);
    const medianocheLocal = new Date(2026, 0, 1);

    expect(formatearFecha(mediodia)).toBe('1 de enero de 2026');
    expect(formatearFecha(medianocheLocal)).toBe('1 de enero de 2026');
    expect(formatearFechaCorta(medianocheLocal)).toBe('01/01/2026');
    expect(formatearFecha(mediodia)).not.toContain(':');
    expect(formatearFechaCorta(mediodia)).not.toContain(':');
  });

  it('devuelve un guion para cadenas y Date inválidos', () => {
    expect(formatearFecha('')).toBe('—');
    expect(formatearFechaCorta('')).toBe('—');
    expect(formatearFecha(new Date('no-es-fecha'))).toBe('—');
    expect(formatearFechaCorta(new Date('no-es-fecha'))).toBe('—');
  });
});

describe('formatearFechaCalendario', () => {
  it('formatea días calendario en UTC sin correr el día', () => {
    expect(formatearFechaCalendario('2026-01-01')).toBe('1 de enero de 2026');
    expect(formatearFechaCalendario('2026-12-31')).toBe('31 de diciembre de 2026');
  });

  it('ignora la hora cuando el valor llega como instante ISO', () => {
    expect(formatearFechaCalendario('2026-12-04T15:30:00Z')).toBe('4 de diciembre de 2026');
    expect(formatearFechaCalendario('2026-12-04T23:59:59.999Z')).toBe('4 de diciembre de 2026');
  });

  it('rechaza días inexistentes y valores vacíos', () => {
    expect(formatearFechaCalendario('2026-02-30')).toBe('—');
    expect(formatearFechaCalendario('2026-13-01')).toBe('—');
    expect(formatearFechaCalendario('')).toBe('—');
    expect(formatearFechaCalendario('sin-fecha')).toBe('—');
  });
});

describe('formatearFechaDia', () => {
  it('formatea días calendario y acepta instantes ISO', () => {
    expect(formatearFechaDia('2026-01-01')).toBe('1 de enero de 2026');
    expect(formatearFechaDia('2026-12-04T15:30:00Z')).toBe('4 de diciembre de 2026');
  });

  it('devuelve un guion con null, cadena vacía o día inválido', () => {
    expect(formatearFechaDia(null)).toBe('—');
    expect(formatearFechaDia('')).toBe('—');
    expect(formatearFechaDia('2026-02-30')).toBe('—');
    expect(formatearFechaDia('no-es-fecha')).toBe('—');
  });
});
