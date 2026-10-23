import { describe, expect, it } from 'vitest';

import type { Rfq, ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';
import {
  faltantesProximaAccion,
  faltantesSeguimientoTransicion,
  fechaHoyLocal,
  proximaAccionInicial,
  proximaAccionTrasResultado,
  proximaAccionVencida,
  puedeConfirmarMarcarListo,
  reemplazaProximaAccionVigente,
  seguimientoTransicionInicial,
} from '@/modulos/rfq/utilidades/proxima-accion';
import {
  esquemaCambiarEstadoRfq,
  esquemaDatosGeneralesRfq,
} from '@/modulos/rfq/validaciones/esquemas-rfq';

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

describe('edición directa del Resumen (obs. cliente 2026-10-21)', () => {
  it('solo cuenta como sustitución cambiar la acción o su detalle, no fecha ni responsable', () => {
    const vigente = rfqCon({ proximaAccionCodigo: 'FOLLOW_UP', proximaAccionTexto: null });
    expect(reemplazaProximaAccionVigente(rfqCon({}), { codigo: 'FOLLOW_UP', texto: '' })).toBe(false);
    expect(reemplazaProximaAccionVigente(vigente, { codigo: 'FOLLOW_UP', texto: '' })).toBe(false);
    expect(reemplazaProximaAccionVigente(vigente, { codigo: 'SEND_QUOTE', texto: '' })).toBe(true);
    expect(reemplazaProximaAccionVigente(vigente, { codigo: '', texto: '' })).toBe(true);

    const otro = rfqCon({ proximaAccionCodigo: 'OTHER', proximaAccionTexto: 'Visita a planta' });
    expect(reemplazaProximaAccionVigente(otro, { codigo: 'OTHER', texto: ' Visita a planta ' })).toBe(false);
    expect(reemplazaProximaAccionVigente(otro, { codigo: 'OTHER', texto: 'Llamada' })).toBe(true);
  });

  it('el esquema del Resumen acepta el resultado solo con un valor conocido', () => {
    const base = { rfqId: USUARIO, actualizadoEn: '2026-10-08T10:00:00.000Z' };
    expect(esquemaDatosGeneralesRfq.safeParse({
      ...base, resultadoProximaAccion: 'sin_respuesta',
    }).success).toBe(true);
    expect(esquemaDatosGeneralesRfq.safeParse({
      ...base, resultadoProximaAccion: 'inventado',
    }).success).toBe(false);
  });
});

function validacionCon(
  secciones: Partial<ValidacionRfqListo['secciones']>,
): ValidacionRfqListo {
  return {
    listo: false,
    secciones: {
      cliente: [],
      general: [],
      items: [],
      archivos: [],
      seguimiento: [],
      ...secciones,
    },
  };
}

describe('confirmar «Marcar listo» con el seguimiento capturado en el modal', () => {
  it('permite confirmar si el único pendiente es el seguimiento que el modal completó', () => {
    const validacion = validacionCon({
      seguimiento: ['próxima acción', 'fecha de próxima acción'],
    });
    expect(puedeConfirmarMarcarListo(validacion, { modo: 'cerrar' }, true)).toBe(true);
  });

  it('no permite confirmar si falta alguna sección fuera de seguimiento', () => {
    const validacion = validacionCon({
      general: ['canal'],
      seguimiento: ['próxima acción'],
    });
    expect(puedeConfirmarMarcarListo(validacion, { modo: 'cerrar' }, true)).toBe(false);
  });

  it('exige el formulario local completo y la validación del servidor', () => {
    const validacion = validacionCon({ seguimiento: ['próxima acción'] });
    expect(puedeConfirmarMarcarListo(validacion, { modo: 'cerrar' }, false)).toBe(false);
    expect(puedeConfirmarMarcarListo(null, { modo: 'cerrar' }, true)).toBe(false);
  });

  it('conservar la acción vigente no corrige faltantes de seguimiento del servidor', () => {
    const validacion = validacionCon({
      seguimiento: ['detalle de la próxima acción (Otro)'],
    });
    expect(puedeConfirmarMarcarListo(validacion, { modo: 'mantener' }, true)).toBe(false);
    expect(puedeConfirmarMarcarListo(validacion, { modo: 'cerrar' }, true)).toBe(true);
  });

  it('sin faltantes de seguimiento permite confirmar con la acción vigente', () => {
    expect(puedeConfirmarMarcarListo(validacionCon({}), { modo: 'mantener' }, true)).toBe(true);
  });
});
