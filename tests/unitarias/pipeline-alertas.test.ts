import { describe, expect, it } from 'vitest';
import {
  calcularAlertas,
  contarDiasHabiles,
  type AlertaPipeline,
} from '@/modulos/pipeline/servicios/calcular-alertas';
import type { EstadoRfq, Oportunidad } from '@/modulos/pipeline/tipos/indice';

function oportunidad(sobre: Partial<Oportunidad> & { estadoRfq?: EstadoRfq }): Oportunidad {
  return {
    id: 'op-1',
    folioOp: 'OP-0001',
    folioCnc: null,
    folioRfq: 'RFQ-0726_01',
    estadoRfq: 'NEW',
    nombreContacto: 'Juan',
    empresa: 'ACME',
    correo: 'juan@acme.com',
    telefono: null,
    clienteId: null,
    contactoId: null,
    vendedorId: 'v-1',
    responsableId: null,
    canal: null,
    fechaSolicitud: null,
    descripcionGeneral: null,
    moneda: 'MXN',
    condicionesPago: null,
    prioridad: 'normal',
    ivaPorcentaje: 16,
    etiquetas: [],
    esOrdenInterna: false,
    poCliente: null,
    fechaRequerida: null,
    horasEstimadas: null,
    notas: null,
    proximaAccionCodigo: null,
    proximaAccionTexto: null,
    fechaProximaAccion: null,
    responsableProximaAccionId: null,
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

  it('cerrados/cancelados (y con orden) no generan alertas', () => {
    expect(calcularAlertas(oportunidad({ estadoRfq: 'CLOSED' }), ahora)).toEqual([]);
    expect(calcularAlertas(oportunidad({ estadoRfq: 'CANCELLED' }), ahora)).toEqual([]);
    expect(
      calcularAlertas(
        oportunidad({
          estadoRfq: 'CONVERTED',
          ordenVinculada: { folio: 'OP-1', estado: 'borrador' },
        }),
        ahora,
      ),
    ).toEqual([]);
  });

  it('sin_respuesta: cotización enviada > 3 días hábiles atrás', () => {
    const op = oportunidad({
      estadoRfq: 'READY_FOR_PROPOSAL',
      fechaEnvioCotizacion: '2026-07-06T00:00:00Z', // lun; a mié 15 hay 7 hábiles
      fechaUltimoContacto: '2026-07-14T00:00:00Z', // reciente, para aislar sin_respuesta
    });
    const alertas = calcularAlertas(op, ahora);
    expect(alertas).toContain<AlertaPipeline>('sin_respuesta');
  });

  it('NO sin_respuesta si la cotización se envió hace <= 3 días hábiles', () => {
    const op = oportunidad({
      estadoRfq: 'CONVERTED',
      fechaEnvioCotizacion: '2026-07-13T00:00:00Z', // lun; a mié 15 = 2 hábiles
      fechaUltimoContacto: '2026-07-14T00:00:00Z',
    });
    expect(calcularAlertas(op, ahora)).not.toContain('sin_respuesta');
  });

  it('estancada: > 7 días sin actividad', () => {
    const op = oportunidad({
      estadoRfq: 'WAITING_CUSTOMER',
      fechaUltimoContacto: '2026-07-01T00:00:00Z', // 14 días atrás
    });
    expect(calcularAlertas(op, ahora)).toContain<AlertaPipeline>('estancada');
  });

  it('usa actualizadoEn si no hay fechaUltimoContacto', () => {
    const op = oportunidad({ estadoRfq: 'NEW', actualizadoEn: '2026-07-14T00:00:00Z' });
    expect(calcularAlertas(op, ahora)).not.toContain('estancada');
  });

  it('datos_incompletos: listo/convertido sin correo', () => {
    const op = oportunidad({
      estadoRfq: 'READY_FOR_PROPOSAL',
      correo: null,
      fechaUltimoContacto: '2026-07-14T00:00:00Z',
    });
    expect(calcularAlertas(op, ahora)).toContain<AlertaPipeline>('datos_incompletos');
  });
});
