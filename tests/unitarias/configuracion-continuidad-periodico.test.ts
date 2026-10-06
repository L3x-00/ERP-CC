import { describe, expect, it } from 'vitest';
import {
  ETIQUETA_TIPO_FOLIO,
  formatearFolioPeriodico,
  TIPOS_FOLIO_PERIODICO,
} from '@/modulos/configuracion/tipos/continuidad-folios-periodico';
import {
  esquemaAjustarContinuidadPeriodico,
  esquemaConsultarContinuidadPeriodico,
} from '@/modulos/configuracion/validaciones/continuidad-folios-periodico';

describe('continuidad de folios periódicos', () => {
  it('acepta los seis tipos del bloque y rechaza CNC', () => {
    expect(TIPOS_FOLIO_PERIODICO).toEqual(['RFQ', 'O', 'OI', 'NE', 'RP', 'CG']);
    for (const tipo of TIPOS_FOLIO_PERIODICO) {
      expect(esquemaConsultarContinuidadPeriodico.safeParse({ tipo }).success).toBe(true);
    }
    expect(esquemaConsultarContinuidadPeriodico.safeParse({ tipo: 'CNC' }).success).toBe(false);
    expect(esquemaConsultarContinuidadPeriodico.safeParse({ tipo: 'rfq' }).success).toBe(false);
    expect(esquemaConsultarContinuidadPeriodico.safeParse({ tipo: 'RFQ', extra: true }).success).toBe(false);
  });

  it('valida periodo MMYY y rango 0..99 del ajuste', () => {
    const base = { tipo: 'RFQ' as const, periodo: '1026', ultimo: 7 };
    expect(esquemaAjustarContinuidadPeriodico.safeParse(base).success).toBe(true);
    for (const periodo of ['1326', '0026', '1/26', '', '102', '10261', '132']) {
      expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, periodo }).success).toBe(false);
    }
    expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, ultimo: 0 }).success).toBe(true);
    expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, ultimo: 99 }).success).toBe(true);
    expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, ultimo: 100 }).success).toBe(true);
    expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, ultimo: 999 }).success).toBe(true);
    expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, ultimo: 1000 }).success).toBe(false);
    expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, ultimo: -1 }).success).toBe(false);
    expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, ultimo: 1.5 }).success).toBe(false);
    expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, ultimo: Number.NaN }).success).toBe(false);
    expect(esquemaAjustarContinuidadPeriodico.safeParse({ ...base, extra: true }).success).toBe(false);
  });

  it('mapea etiquetas de todos los tipos y formatea TIPO-MMYY_XX', () => {
    for (const tipo of TIPOS_FOLIO_PERIODICO) {
      expect(ETIQUETA_TIPO_FOLIO[tipo]).toBeTruthy();
    }
    expect(formatearFolioPeriodico('RFQ', '1026', 7)).toBe('RFQ-1026_07');
    expect(formatearFolioPeriodico('CG', '0127', 10)).toBe('CG-0127_10');
  });
});
