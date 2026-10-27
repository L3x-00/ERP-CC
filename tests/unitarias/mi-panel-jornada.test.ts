import { describe, expect, it } from 'vitest';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';
import { resumirJornadaDiaria } from '@/modulos/produccion/utilidades/mi-panel-operador';

const operador = 'op-1';
const hoy = '2026-10-26';
const sesion = (id: string, inicio: string, fin: string | null, horasNetas: number,
  estadoSesion: 'activa' | 'finalizada' | 'pausada' = 'finalizada', operadorId = operador) => ({
  id, operadorId, fechaInicio: inicio, fechaFin: fin, horasNetas, estadoSesion,
});
const proceso = (sesiones: ReturnType<typeof sesion>[]) =>
  ({ sesiones }) as unknown as ProcesoEspacioOperador;

describe('resumirJornadaDiaria', () => {
  it('suma horas netas consolidadas en horario de Tijuana y no duplica sesiones', () => {
    const s1 = sesion('s1', '2026-10-26T16:00:00Z', '2026-10-26T19:30:00Z', 3.5);
    const s2 = sesion('s2', '2026-10-26T20:00:00Z', '2026-10-26T22:42:00Z', 2.7, 'pausada');
    expect(resumirJornadaDiaria([proceso([s1, s2]), proceso([s1])], operador, hoy))
      .toEqual({ horasConsolidadas: 6.2, sesionesActivas: 0, sesionesEntreDias: 0 });
  });

  it('no suma sesiones ajenas, activas ni de otra fecha', () => {
    expect(resumirJornadaDiaria([proceso([
      sesion('s1', '2026-10-26T17:00:00Z', null, 0, 'activa'),
      sesion('s2', '2026-10-26T17:00:00Z', '2026-10-26T18:00:00Z', 1, 'finalizada', 'otro'),
      sesion('s3', '2026-10-25T17:00:00Z', '2026-10-25T18:00:00Z', 1),
    ])], operador, hoy)).toEqual({
      horasConsolidadas: 0, sesionesActivas: 1, sesionesEntreDias: 0,
    });
  });

  it('identifica sesión que atraviesa medianoche del taller y no inventa un prorrateo', () => {
    expect(resumirJornadaDiaria([proceso([
      sesion('s1', '2026-10-27T05:00:00Z', '2026-10-27T09:00:00Z', 4),
    ])], operador, hoy)).toEqual({
      horasConsolidadas: 0, sesionesActivas: 0, sesionesEntreDias: 1,
    });
  });
});
