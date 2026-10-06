import { describe, expect, it } from 'vitest';

import {
  ACCIONES_POR_ESTADO,
  esAccionValida,
  esEstadoTerminal,
} from '@/modulos/pipeline/servicios/reglas-transicion';

describe('acciones por estado del RFQ (ADR-SII-07)', () => {
  it('NEW permite capturar, esperar, listo y cerrar', () => {
    expect(esAccionValida('NEW', 'marcar_incompleto')).toBe(true);
    expect(esAccionValida('NEW', 'poner_en_espera_cliente')).toBe(true);
    expect(esAccionValida('NEW', 'poner_en_espera_tecnica')).toBe(true);
    expect(esAccionValida('NEW', 'marcar_listo')).toBe(true);
    expect(esAccionValida('NEW', 'cerrar')).toBe(true);
    expect(esAccionValida('NEW', 'cancelar')).toBe(true);
  });

  it('READY_FOR_PROPOSAL solo vuelve a incompleto o cierra', () => {
    expect(ACCIONES_POR_ESTADO.READY_FOR_PROPOSAL).toEqual([
      'marcar_incompleto',
      'cerrar',
      'cancelar',
    ]);
    expect(esAccionValida('READY_FOR_PROPOSAL', 'marcar_listo')).toBe(false);
    expect(esAccionValida('READY_FOR_PROPOSAL', 'marcar_incompleto')).toBe(true);
  });

  it('las esperas solo salen de NEW/INCOMPLETE', () => {
    expect(esAccionValida('INCOMPLETE', 'poner_en_espera_cliente')).toBe(true);
    expect(esAccionValida('WAITING_CUSTOMER', 'poner_en_espera_tecnica')).toBe(false);
    expect(esAccionValida('WAITING_TECHNICAL', 'marcar_incompleto')).toBe(true);
  });

  it('los estados terminales no admiten acciones', () => {
    for (const estado of ['CONVERTED', 'CLOSED', 'CANCELLED'] as const) {
      expect(ACCIONES_POR_ESTADO[estado]).toEqual([]);
      expect(esEstadoTerminal(estado)).toBe(true);
    }
    expect(esEstadoTerminal('READY_FOR_PROPOSAL')).toBe(false);
  });
});
