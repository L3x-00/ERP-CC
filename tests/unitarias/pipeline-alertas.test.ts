import { describe, expect, it } from 'vitest';
import {
  calcularAlertas,
  contarDiasHabiles,
  type AlertaPipeline,
} from '@/modulos/pipeline/servicios/calcular-alertas';
import type { EtapaPipeline, Oportunidad } from '@/modulos/pipeline/tipos/indice';

function oportunidad(sobre: Partial<Oportunidad> & { etapa: EtapaPipeline }): Oportunidad {
  return {
    id: 'op-1',
    folioOp: 'OP-0001',
    folioCnc: null,
    nombreContacto: 'Juan',
    empresa: 'ACME',
    correo: 'juan@acme.com',
    telefono: null,
    clienteId: null,
    vendedorId: 'v-1',
    moneda: 'MXN',
    condicionesPago: null,
    prioridad: 'normal',
    ivaPorcentaje: 16,
    etiquetas: [],
    motivoPerdida: null,
    notasPerdida: null,
    fechaUltimoContacto: null,
    fechaEnvioCotizacion: null,
    creadoEn: '2026-07-01T00:00:00.000Z',
    actualizadoEn: '2026-07-01T00:00:00.000Z',
    ...sobre,
  };
}

describe('contarDiasHabiles', () => {
  it('cuenta lun-vie, excluye fin de semana', () => {
    // mié 2026-07-01 → mié 2026-07-08 = 5 días hábiles (jue,vie,lun,mar,mié)
    expect(contarDiasHabiles(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-08T00:00:00Z'))).toBe(5);
  });

  it('viernes → lunes = 1 día hábil (salta fin de semana)', () => {
    // vie 2026-07-03 → lun 2026-07-06
    expect(contarDiasHabiles(new Date('2026-07-03T00:00:00Z'), new Date('2026-07-06T00:00:00Z'))).toBe(1);
  });

  it('misma fecha → 0', () => {
    expect(contarDiasHabiles(new Date('2026-07-03T00:00:00Z'), new Date('2026-07-03T12:00:00Z'))).toBe(0);
  });
});

describe('calcularAlertas', () => {
  const ahora = new Date('2026-07-15T00:00:00Z');

  it('ganada/perdida no generan alertas', () => {
    expect(calcularAlertas(oportunidad({ etapa: 'ganada' }), ahora)).toEqual([]);
    expect(calcularAlertas(oportunidad({ etapa: 'perdida' }), ahora)).toEqual([]);
  });

  it('sin_respuesta: cotización enviada > 3 días hábiles atrás', () => {
    const op = oportunidad({
      etapa: 'cotizado',
      fechaEnvioCotizacion: '2026-07-06T00:00:00Z', // lun; a mié 15 hay 7 hábiles
      fechaUltimoContacto: '2026-07-14T00:00:00Z', // reciente, para aislar sin_respuesta
    });
    const alertas = calcularAlertas(op, ahora);
    expect(alertas).toContain<AlertaPipeline>('sin_respuesta');
  });

  it('NO sin_respuesta si la cotización se envió hace <= 3 días hábiles', () => {
    const op = oportunidad({
      etapa: 'cotizado',
      fechaEnvioCotizacion: '2026-07-13T00:00:00Z', // lun; a mié 15 = 2 hábiles
      fechaUltimoContacto: '2026-07-14T00:00:00Z',
    });
    expect(calcularAlertas(op, ahora)).not.toContain('sin_respuesta');
  });

  it('estancada: > 7 días sin actividad', () => {
    const op = oportunidad({
      etapa: 'contactado',
      fechaUltimoContacto: '2026-07-01T00:00:00Z', // 14 días atrás
    });
    expect(calcularAlertas(op, ahora)).toContain<AlertaPipeline>('estancada');
  });

  it('usa actualizadoEn si no hay fechaUltimoContacto', () => {
    const op = oportunidad({ etapa: 'prospecto', actualizadoEn: '2026-07-14T00:00:00Z' });
    expect(calcularAlertas(op, ahora)).not.toContain('estancada');
  });

  it('datos_incompletos: en cotizado sin correo', () => {
    const op = oportunidad({
      etapa: 'cotizado',
      correo: null,
      fechaUltimoContacto: '2026-07-14T00:00:00Z',
    });
    expect(calcularAlertas(op, ahora)).toContain<AlertaPipeline>('datos_incompletos');
  });
});
