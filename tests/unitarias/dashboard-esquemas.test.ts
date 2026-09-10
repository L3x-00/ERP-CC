import { describe, expect, it } from 'vitest';
import { esquemaFiltroPeriodo } from '@/modulos/dashboard/validaciones/indice';

const filtroValido = {
  fechaInicio: '2026-09-01T00:00:00.000Z',
  fechaFin: '2026-10-01T00:00:00.000Z',
  periodoTipo: 'mes_actual',
} as const;

describe('esquemaFiltroPeriodo', () => {
  it('acepta un rango ISO y enum de periodo válidos', () => {
    const resultado = esquemaFiltroPeriodo.safeParse(filtroValido);
    expect(resultado.success).toBe(true);
  });

  it.each(['hoy', 'semana_actual', 'mes_actual', 'anio_actual', 'personalizado'])(
    'acepta el periodo %s',
    (periodoTipo) => {
      expect(esquemaFiltroPeriodo.safeParse({ ...filtroValido, periodoTipo }).success).toBe(true);
    },
  );

  it('rechaza fechas con formato no ISO', () => {
    expect(esquemaFiltroPeriodo.safeParse({ ...filtroValido, fechaInicio: '01/09/2026' }).success).toBe(false);
    expect(esquemaFiltroPeriodo.safeParse({ ...filtroValido, fechaFin: '2026-10-01' }).success).toBe(false);
  });

  it('rechaza un intervalo invertido o de duración excesiva', () => {
    expect(esquemaFiltroPeriodo.safeParse({ ...filtroValido, fechaInicio: filtroValido.fechaFin }).success).toBe(false);
    expect(esquemaFiltroPeriodo.safeParse({ ...filtroValido, fechaFin: '2028-01-01T00:00:00.000Z' }).success).toBe(false);
  });

  it('rechaza enums desconocidos y propiedades extra', () => {
    expect(esquemaFiltroPeriodo.safeParse({ ...filtroValido, periodoTipo: 'trimestre' }).success).toBe(false);
    expect(esquemaFiltroPeriodo.safeParse({ ...filtroValido, extra: true }).success).toBe(false);
  });
});
