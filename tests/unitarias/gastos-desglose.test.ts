import { describe, expect, it } from 'vitest';
import { mapearDesgloseRentabilidad } from '@/modulos/gastos/servicios/indice';

const MANO_OBRA = {
  concepto: 'CNC-01 · CNC principal',
  horas_estimadas: 12,
  horas_reales: 10.5,
  importe: 1575,
  nota: '',
  referencia: 'CNC-01',
  rubro: 'mano_obra',
  tarifa_hora: 150,
};

describe('mapeo del desglose de rentabilidad (OBS-29)', () => {
  it('mapea los renglones por estación, material y gastos', () => {
    const resultado = mapearDesgloseRentabilidad([
      MANO_OBRA,
      {
        ...MANO_OBRA,
        concepto: 'Acero A36',
        referencia: 'AC-1045',
        rubro: 'material',
        horas_estimadas: 0,
        horas_reales: 0,
        tarifa_hora: 0,
      },
      {
        ...MANO_OBRA,
        concepto: 'maquila_externa',
        referencia: '',
        rubro: 'gasto',
        horas_estimadas: 0,
        horas_reales: 0,
        tarifa_hora: 0,
      },
      {
        ...MANO_OBRA,
        concepto: 'materia_prima',
        referencia: '',
        rubro: 'gasto_incluido',
        horas_estimadas: 0,
        horas_reales: 0,
        tarifa_hora: 0,
        nota: 'Ya incluido en material o mano de obra; no suma al costo',
      },
    ]);

    expect(resultado).toHaveLength(4);
    expect(resultado[0]).toMatchObject({
      rubro: 'mano_obra',
      concepto: 'CNC-01 · CNC principal',
      horasEstimadas: 12,
      horasReales: 10.5,
      tarifaHora: 150,
      importe: 1575,
    });
    expect(resultado[3]).toMatchObject({
      rubro: 'gasto_incluido',
      nota: expect.stringContaining('no suma'),
    });
  });

  it('descarta rubros desconocidos sin romper la tarjeta', () => {
    const resultado = mapearDesgloseRentabilidad([
      { ...MANO_OBRA, rubro: 'inventado' as unknown as 'gasto' },
      MANO_OBRA,
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.rubro).toBe('mano_obra');
  });
});
