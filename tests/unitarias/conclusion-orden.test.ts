import { describe, expect, it } from 'vitest';
import {
  operacionConcluida,
  ordenConcluida,
  ordenSoloConsultaEnProduccion,
  trabajoEnPisoConcluido,
} from '@/modulos/ordenes/utilidades/conclusion-orden';

describe('estado de conclusión de una orden', () => {
  it('reconoce los estados legacy y SII terminales', () => {
    expect(ordenConcluida({ estado: 'completada' })).toBe(true);
    expect(ordenConcluida({ estadoSii: 'PRODUCCION_COMPLETADA' })).toBe(true);
    expect(ordenConcluida({ estadoSii: 'CERRADA' })).toBe(true);
  });

  it('no confunde una orden activa con una concluida', () => {
    expect(ordenConcluida({ estado: 'en_proceso', estadoSii: 'EN_PRODUCCION' })).toBe(false);
    expect(ordenConcluida({ estado: 'programada', estadoSii: 'PLANIFICADA' })).toBe(false);
    expect(ordenConcluida({})).toBe(false);
  });

  it('considera concluida la operación aunque la orden siga activa', () => {
    expect(operacionConcluida({ estadoPlaneacion: 'completada' })).toBe(true);
    expect(operacionConcluida({
      estadoPlaneacion: 'programada',
      ordenEstado: 'completada',
    })).toBe(true);
    expect(operacionConcluida({
      estadoPlaneacion: 'en_proceso',
      ordenEstado: 'en_proceso',
      ordenEstadoSii: 'EN_PRODUCCION',
    })).toBe(false);
  });

  it('solo marca lista o entregada como trabajo de piso concluido', () => {
    expect(trabajoEnPisoConcluido('lista')).toBe(true);
    expect(trabajoEnPisoConcluido('entregada')).toBe(true);
    expect(trabajoEnPisoConcluido('bandeja')).toBe(false);
    expect(trabajoEnPisoConcluido('en_proceso')).toBe(false);
    expect(trabajoEnPisoConcluido('pausada')).toBe(false);
  });

  it('manda a consulta una orden concluida aunque el tablero aún traiga un estado activo', () => {
    expect(ordenSoloConsultaEnProduccion({
      estado: 'en_proceso', estadoSii: 'PRODUCCION_COMPLETADA', estadoKanban: 'en_proceso',
    })).toBe(true);
    expect(ordenSoloConsultaEnProduccion({
      estado: 'en_proceso', estadoSii: 'EN_PRODUCCION', estadoKanban: 'en_proceso',
    })).toBe(false);
  });
});
