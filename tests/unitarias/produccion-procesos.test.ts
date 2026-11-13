import { describe, expect, it } from 'vitest';

import {
  CAMPOS_CHECKLIST_COMPLETO,
  CAMPOS_CHECKLIST_DOBLADO,
  camposChecklistInicio,
  etiquetaPiezasProceso,
  familiaProceso,
  verboProceso,
} from '@/modulos/produccion/utilidades/procesos';

describe('vocabulario de procesos del piso', () => {
  it('reconoce la familia por el área macro aunque el nombre varíe', () => {
    expect(familiaProceso('Doblado CNC', 'DOBLADO')).toBe('doblado');
    expect(familiaProceso('Láser fibra', 'CORTE')).toBe('corte');
    expect(familiaProceso('Soldadura', null)).toBe('soldadura');
    expect(familiaProceso('Maquinado/Fabricación', null)).toBe('maquinado');
    expect(familiaProceso('Proceso especial', null)).toBe('otro');
  });

  it('etiqueta las piezas según el proceso que cierra la sesión', () => {
    expect(etiquetaPiezasProceso('Doblado CNC')).toBe('Piezas dobladas');
    expect(etiquetaPiezasProceso('Láser fibra')).toBe('Piezas cortadas');
    expect(etiquetaPiezasProceso('Soldadura')).toBe('Piezas soldadas');
    expect(etiquetaPiezasProceso('Acabado')).toBe('Piezas acabadas');
    expect(etiquetaPiezasProceso(null)).toBe('Piezas producidas');
  });

  it('guía al operador con el verbo del proceso', () => {
    expect(verboProceso('Doblado CNC')).toBe('doblar');
    expect(verboProceso('Láser fibra')).toBe('cortar');
    expect(verboProceso('Ensamble')).toBe('ensamblar');
  });

  it('reduce el checklist de doblado a tres confirmaciones', () => {
    expect(camposChecklistInicio('Doblado CNC', 'DOBLADO')).toBe(CAMPOS_CHECKLIST_DOBLADO);
    expect(CAMPOS_CHECKLIST_DOBLADO).toHaveLength(3);
    expect(camposChecklistInicio('Láser fibra', 'CORTE')).toBe(CAMPOS_CHECKLIST_COMPLETO);
    expect(CAMPOS_CHECKLIST_COMPLETO).toHaveLength(5);
  });
});
