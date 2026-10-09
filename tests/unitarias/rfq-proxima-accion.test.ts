import { describe, expect, it } from 'vitest';

import type { Rfq } from '@/modulos/rfq/tipos/indice';
import {
  faltantesProximaAccion,
  fechaHoyLocal,
  proximaAccionInicial,
} from '@/modulos/rfq/utilidades/proxima-accion';
import { esquemaCambiarEstadoRfq } from '@/modulos/rfq/validaciones/esquemas-rfq';

const ACCIONES = [
  { codigo: 'FOLLOW_UP', esOtro: false },
  { codigo: 'OTHER', esOtro: true },
];
const HOY = '2026-10-08';
const USUARIO = '11111111-1111-4111-8111-111111111111';

function rfqCon(campos: Partial<Rfq>): Rfq {
  return {
    proximaAccionCodigo: null,
    proximaAccionTexto: null,
    fechaProximaAccion: null,
    responsableProximaAccionId: null,
    ...campos,
  } as Rfq;
}

describe('próxima acción por transición (C2.2)', () => {
  it('formatea la fecha local de hoy', () => {
    expect(fechaHoyLocal(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('parte de la acción vigente y no arrastra una fecha vencida', () => {
    const vigente = proximaAccionInicial(
      rfqCon({ proximaAccionCodigo: 'FOLLOW_UP', fechaProximaAccion: '2026-10-10', responsableProximaAccionId: USUARIO }),
      HOY,
    );
    expect(vigente).toEqual({ codigo: 'FOLLOW_UP', texto: '', fecha: '2026-10-10', responsableId: USUARIO });
    expect(proximaAccionInicial(rfqCon({ fechaProximaAccion: '2026-10-01' }), HOY).fecha).toBe('');
  });

  it('enumera los faltantes, incluido el detalle de "Otro" y la fecha pasada', () => {
    expect(faltantesProximaAccion({ codigo: '', texto: '', fecha: '', responsableId: '' }, ACCIONES, HOY))
      .toHaveLength(3);
    expect(
      faltantesProximaAccion({ codigo: 'OTHER', texto: 'x', fecha: '2026-10-01', responsableId: USUARIO }, ACCIONES, HOY),
    ).toEqual(['detalle de la acción "Otro"', 'una fecha que no esté en el pasado']);
    expect(
      faltantesProximaAccion({ codigo: 'FOLLOW_UP', texto: '', fecha: HOY, responsableId: USUARIO }, ACCIONES, HOY),
    ).toEqual([]);
  });

  it('el esquema exige próxima acción en transiciones no terminales y motivo en las terminales', () => {
    const base = {
      rfqId: USUARIO,
      actualizadoEn: '2026-10-08T10:00:00.000Z',
    };
    const proximaAccion = { codigo: 'FOLLOW_UP', fecha: HOY, responsableId: USUARIO };
    expect(esquemaCambiarEstadoRfq.safeParse({ ...base, accion: 'marcar_listo' }).success).toBe(false);
    expect(esquemaCambiarEstadoRfq.safeParse({ ...base, accion: 'marcar_listo', proximaAccion }).success).toBe(true);
    expect(esquemaCambiarEstadoRfq.safeParse({ ...base, accion: 'cerrar' }).success).toBe(false);
    expect(esquemaCambiarEstadoRfq.safeParse({ ...base, accion: 'cerrar', motivo: 'sin respuesta' }).success).toBe(true);
  });
});
