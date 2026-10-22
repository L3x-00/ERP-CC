import { describe, expect, it } from 'vitest';

import type { Rfq } from '@/modulos/rfq/tipos/indice';
import {
  faltantesProximaAccion,
  faltantesSeguimientoTransicion,
  fechaHoyLocal,
  proximaAccionInicial,
  proximaAccionTrasResultado,
  proximaAccionVencida,
  seguimientoTransicionInicial,
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

describe('seguimiento al cambiar de estado (obs. cliente 2026-10-21)', () => {
  const VIGENTE = rfqCon({
    proximaAccionCodigo: 'FOLLOW_UP',
    fechaProximaAccion: '2026-10-10',
    responsableProximaAccionId: USUARIO,
  });

  it('con una acción vigente a tiempo, la deja como está sin pedir otra', () => {
    const inicial = seguimientoTransicionInicial(VIGENTE, HOY);
    expect(inicial.modo).toBe('mantener');
    expect(faltantesSeguimientoTransicion(inicial, true, ACCIONES, HOY)).toEqual([]);
  });

  it('con la acción vencida o inexistente obliga a definir la siguiente', () => {
    const vencida = rfqCon({ ...VIGENTE, fechaProximaAccion: '2026-10-01' });
    expect(proximaAccionVencida(vencida, HOY)).toBe(true);
    expect(seguimientoTransicionInicial(vencida, HOY).modo).toBe('cerrar');
    expect(seguimientoTransicionInicial(rfqCon({}), HOY).modo).toBe('cerrar');
  });

  it('al sustituir la vigente pide primero cómo terminó y luego la nueva acción', () => {
    const cerrar = { modo: 'cerrar' as const, resultado: '' as const, proxima: proximaAccionTrasResultado(VIGENTE, 'completada') };
    expect(faltantesSeguimientoTransicion(cerrar, true, ACCIONES, HOY)).toContain('cómo terminó la acción actual');
    const completo = {
      modo: 'cerrar' as const,
      resultado: 'sin_respuesta' as const,
      proxima: { codigo: 'FOLLOW_UP', texto: '', fecha: HOY, responsableId: USUARIO },
    };
    expect(faltantesSeguimientoTransicion(completo, true, ACCIONES, HOY)).toEqual([]);
    // Sin acción vigente no hay resultado que pedir.
    expect(faltantesSeguimientoTransicion({ ...completo, resultado: '' }, false, ACCIONES, HOY)).toEqual([]);
  });

  it('reprogramada conserva la acción y pide solo la nueva fecha; las demás empiezan en blanco', () => {
    expect(proximaAccionTrasResultado(VIGENTE, 'reprogramada')).toEqual({
      codigo: 'FOLLOW_UP', texto: '', fecha: '', responsableId: USUARIO,
    });
    expect(proximaAccionTrasResultado(VIGENTE, 'completada')).toEqual({
      codigo: '', texto: '', fecha: '', responsableId: USUARIO,
    });
  });

  it('el esquema acepta dejar la acción actual o sustituirla, nunca ambas', () => {
    const base = { rfqId: USUARIO, actualizadoEn: '2026-10-08T10:00:00.000Z', accion: 'marcar_listo' };
    const proximaAccion = { codigo: 'FOLLOW_UP', fecha: HOY, responsableId: USUARIO };
    expect(esquemaCambiarEstadoRfq.safeParse({ ...base, mantenerProximaAccion: true }).success).toBe(true);
    expect(esquemaCambiarEstadoRfq.safeParse({
      ...base, proximaAccion, resultadoProximaAccion: 'sin_respuesta',
    }).success).toBe(true);
    expect(esquemaCambiarEstadoRfq.safeParse({ ...base, mantenerProximaAccion: true, proximaAccion }).success).toBe(false);
    expect(esquemaCambiarEstadoRfq.safeParse({
      ...base, mantenerProximaAccion: true, resultadoProximaAccion: 'completada',
    }).success).toBe(false);
    expect(esquemaCambiarEstadoRfq.safeParse({
      ...base, proximaAccion, resultadoProximaAccion: 'inventado',
    }).success).toBe(false);
  });
});
