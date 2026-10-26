import { describe, expect, it } from 'vitest';
import {
  evaluarTipoCambioDiario,
  fechaLocalNegocio,
} from '@/modulos/configuracion/utilidades/tipo-cambio-diario';

// 10 de noviembre de 2026, 10:00 en Tijuana (PST, UTC-8).
const AHORA = new Date('2026-11-10T18:00:00.000Z');

describe('fecha local del negocio', () => {
  it('usa la fecha de Tijuana y no la de UTC', () => {
    // 03:00 UTC del 10 es 19:00 del 9 en Tijuana.
    expect(fechaLocalNegocio(new Date('2026-11-10T03:00:00.000Z'))).toBe('2026-11-09');
  });

  it('respeta el horario de verano de la frontera', () => {
    // 25 de octubre de 2026, 10:00 en Tijuana (PDT, UTC-7).
    expect(fechaLocalNegocio(new Date('2026-10-25T17:00:00.000Z'))).toBe('2026-10-25');
  });
});

describe('evaluación del tipo de cambio diario', () => {
  it('pide captura cuando nunca se registró', () => {
    const estado = evaluarTipoCambioDiario({
      tipoCambioActualizadoEn: null,
      tipoCambioUsd: 19.5,
      ahora: AHORA,
    });
    expect(estado).toMatchObject({
      requiereActualizacion: true,
      motivo: 'sin_registro',
      tipoCambioUsd: 19.5,
      actualizadoEn: null,
      fechaLocal: '2026-11-10',
      horasDesdeActualizacion: null,
    });
  });

  it('trata una fecha inválida como sin registro', () => {
    const estado = evaluarTipoCambioDiario({
      tipoCambioActualizadoEn: 'no-es-una-fecha',
      ahora: AHORA,
    });
    expect(estado.requiereActualizacion).toBe(true);
    expect(estado.motivo).toBe('sin_registro');
  });

  it('considera vigente un registro del mismo día con menos de 24 horas', () => {
    const estado = evaluarTipoCambioDiario({
      tipoCambioActualizadoEn: '2026-11-10T16:00:00.000Z',
      tipoCambioUsd: 18.75,
      ahora: AHORA,
    });
    expect(estado.requiereActualizacion).toBe(false);
    expect(estado.motivo).toBeNull();
    expect(estado.horasDesdeActualizacion).toBe(2);
  });

  it('pide captura al cambiar el día aunque hayan pasado menos de 24 horas', () => {
    const estado = evaluarTipoCambioDiario({
      // 22:00 del 9 en Tijuana; la consulta es a la 01:00 del 10.
      tipoCambioActualizadoEn: '2026-11-10T06:00:00.000Z',
      ahora: new Date('2026-11-10T09:00:00.000Z'),
    });
    expect(estado.requiereActualizacion).toBe(true);
    expect(estado.motivo).toBe('nuevo_dia');
    expect(estado.horasDesdeActualizacion).toBe(3);
  });

  it('pide captura cuando el registro supera 24 horas', () => {
    const estado = evaluarTipoCambioDiario({
      tipoCambioActualizadoEn: '2026-11-09T17:00:00.000Z',
      ahora: AHORA,
    });
    expect(estado.requiereActualizacion).toBe(true);
    expect(estado.motivo).toBe('mas_de_24_horas');
    expect(estado.horasDesdeActualizacion).toBe(25);
  });

  it('aplica la frontera exacta de 24 horas', () => {
    const estado = evaluarTipoCambioDiario({
      tipoCambioActualizadoEn: '2026-11-09T18:00:00.000Z',
      ahora: AHORA,
    });
    expect(estado.motivo).toBe('mas_de_24_horas');
  });
});
