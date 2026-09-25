import { describe, expect, it } from 'vitest';
import { normalizarProcesosConPrevios } from '@/modulos/pipeline/utilidades/procesos';

describe('procesos que se complementan (RFQ)', () => {
  it('agrega corte antes de doblado y conserva el orden capturado', () => {
    const { procesos, agregados } = normalizarProcesosConPrevios(['Doblado']);
    expect(procesos).toEqual(['Corte', 'Doblado']);
    expect(agregados).toEqual(['Corte']);
  });

  it('no duplica el previo si ya fue capturado con otra etiqueta o acento', () => {
    expect(normalizarProcesosConPrevios(['CORTAR', 'doblez']).agregados).toEqual([]);
    expect(normalizarProcesosConPrevios(['corte', 'pulido']).agregados).toEqual([]);
    expect(normalizarProcesosConPrevios(['Corte', 'Doblado', 'Pulido']).procesos)
      .toEqual(['Corte', 'Doblado', 'Pulido']);
  });

  it('admite varios procesos dependientes y agrega corte una sola vez', () => {
    const { procesos, agregados } = normalizarProcesosConPrevios(['Soldadura', 'Pulido']);
    expect(procesos).toEqual(['Corte', 'Soldadura', 'Pulido']);
    expect(agregados).toEqual(['Corte']);
  });

  it('los procesos sin dependencia quedan intactos y limpia vacíos', () => {
    expect(normalizarProcesosConPrevios(['Corte', '', '  ', 'Láser']).procesos)
      .toEqual(['Corte', 'Láser']);
    expect(normalizarProcesosConPrevios([]).procesos).toEqual([]);
  });
});
