import { describe, expect, it } from 'vitest';

import { valorJsonAItemRfq } from '@/modulos/rfq/tipos/indice';
import { formatearCodigoItem, siguienteNumeroItem } from '@/modulos/rfq/utilidades/estados';
import { etiquetaProximaAccion } from '@/modulos/pipeline/utilidades/proxima-accion';
import {
  esquemaCambiarEstadoRfq,
  esquemaCancelarItemRfq,
  esquemaDatosGeneralesRfq,
  esquemaDatosItemRfq,
  esquemaGuardarItemRfq,
} from '@/modulos/rfq/validaciones/esquemas-rfq';

const UUID = '10000000-0000-4000-8000-000000000001';

describe('identidad de ítems ITxx', () => {
  it('formatea el código con dos dígitos', () => {
    expect(formatearCodigoItem(1)).toBe('IT01');
    expect(formatearCodigoItem(9)).toBe('IT09');
    expect(formatearCodigoItem(12)).toBe('IT12');
    expect(formatearCodigoItem(99)).toBe('IT99');
  });

  it('calcula el siguiente número considerando cancelados', () => {
    expect(siguienteNumeroItem([])).toBe(1);
    expect(siguienteNumeroItem([1, 2, 3])).toBe(4);
    expect(siguienteNumeroItem([3, 1, 2])).toBe(4);
    expect(siguienteNumeroItem([1, 4])).toBe(5);
  });

  it('mapea defensivamente el jsonb del ítem devuelto por la RPC', () => {
    const item = valorJsonAItemRfq({
      id: UUID,
      rfq_id: UUID,
      numero: 2,
      codigo: 'IT02',
      descripcion: 'Pieza',
      cantidad: 3.5,
      material_id: UUID,
      espesor_id: null,
      acabado: null,
      notas: null,
      estado: 'activo',
      creado_en: '2026-10-05T10:00:00+00',
      actualizado_en: '2026-10-05T10:00:00+00',
    });

    expect(item).toMatchObject({
      codigo: 'IT02',
      numero: 2,
      cantidad: 3.5,
      materialId: UUID,
      espesorId: null,
      estado: 'activo',
    });
    expect(valorJsonAItemRfq(null)).toBeNull();
    expect(valorJsonAItemRfq({ codigo: 'IT01' })).toBeNull();
    expect(valorJsonAItemRfq([{ id: UUID, codigo: 'IT01' }])).toBeNull();
  });
});

describe('esquemas Zod de RFQ', () => {
  const datosValidos = {
    descripcion: 'Pieza de prueba',
    cantidad: 2.5,
    materialId: UUID,
    procesoIds: [UUID],
  };

  it('acepta datos de ítem válidos y rechaza cantidades fuera de escala', () => {
    expect(esquemaDatosItemRfq.safeParse(datosValidos).success).toBe(true);
    expect(esquemaDatosItemRfq.safeParse({ ...datosValidos, cantidad: 0 }).success).toBe(false);
    expect(esquemaDatosItemRfq.safeParse({ ...datosValidos, cantidad: 1.005 }).success).toBe(false);
    expect(esquemaDatosItemRfq.safeParse({ ...datosValidos, cantidad: 1.01 }).success).toBe(true);
    expect(esquemaDatosItemRfq.safeParse({ ...datosValidos, descripcion: '   ' }).success).toBe(false);
    expect(esquemaDatosItemRfq.safeParse({ ...datosValidos, columna: 'x' }).success).toBe(false);
    expect(esquemaDatosItemRfq.safeParse({
      ...datosValidos,
      procesoIds: Array.from({ length: 21 }, () => UUID),
    }).success).toBe(false);
  });

  it('exige rfqId en alta y token CAS en edición', () => {
    expect(esquemaGuardarItemRfq.safeParse({ rfqId: UUID, datos: datosValidos }).success).toBe(true);
    expect(esquemaGuardarItemRfq.safeParse({
      itemId: UUID,
      actualizadoEn: '2026-10-05T10:00:00+00:00',
      datos: datosValidos,
    }).success).toBe(true);
    expect(esquemaGuardarItemRfq.safeParse({ itemId: UUID, datos: datosValidos }).success).toBe(false);
    expect(esquemaGuardarItemRfq.safeParse({ datos: datosValidos }).success).toBe(false);
  });

  it('exige motivo al cerrar o cancelar y token de estado', () => {
    expect(esquemaCambiarEstadoRfq.safeParse({
      rfqId: UUID,
      accion: 'poner_en_espera_cliente',
      actualizadoEn: '2026-10-05T10:00:00+00:00',
    }).success).toBe(true);
    expect(esquemaCambiarEstadoRfq.safeParse({
      rfqId: UUID,
      accion: 'cerrar',
      actualizadoEn: '2026-10-05T10:00:00+00:00',
    }).success).toBe(false);
    expect(esquemaCambiarEstadoRfq.safeParse({
      rfqId: UUID,
      accion: 'cerrar',
      motivo: 'sin respuesta',
      actualizadoEn: '2026-10-05T10:00:00+00:00',
    }).success).toBe(true);
    expect(esquemaCambiarEstadoRfq.safeParse({
      rfqId: UUID,
      accion: 'inventada',
      actualizadoEn: '2026-10-05T10:00:00+00:00',
    }).success).toBe(false);
    expect(esquemaCambiarEstadoRfq.safeParse({ rfqId: UUID, accion: 'cancelar' }).success).toBe(false);
  });

  it('valida la cancelación de ítem', () => {
    expect(esquemaCancelarItemRfq.safeParse({ itemId: UUID }).success).toBe(true);
    expect(esquemaCancelarItemRfq.safeParse({ itemId: UUID, motivo: 'duplicado' }).success).toBe(true);
    expect(esquemaCancelarItemRfq.safeParse({ itemId: 'no-uuid' }).success).toBe(false);
    expect(esquemaCancelarItemRfq.safeParse({ itemId: UUID, extra: 1 }).success).toBe(false);
  });

  it('valida los datos generales y la próxima acción "Otro"', () => {
    const base = {
      rfqId: UUID,
      actualizadoEn: '2026-10-05T10:00:00+00:00',
      canal: 'correo',
      fechaSolicitud: '2026-10-01',
      descripcionGeneral: 'Solicitud de prueba',
      proximaAccionCodigo: 'FOLLOW_UP',
      fechaProximaAccion: '2026-10-10',
    };
    expect(esquemaDatosGeneralesRfq.safeParse(base).success).toBe(true);
    expect(esquemaDatosGeneralesRfq.safeParse({
      ...base,
      proximaAccionCodigo: 'OTHER',
    }).success).toBe(false);
    expect(esquemaDatosGeneralesRfq.safeParse({
      ...base,
      proximaAccionCodigo: 'OTHER',
      proximaAccionTexto: 'Llamar al comprador',
    }).success).toBe(true);
    expect(esquemaDatosGeneralesRfq.safeParse({ ...base, fechaSolicitud: '01/10/2026' }).success).toBe(false);
  });

  it('etiqueta la próxima acción del catálogo y humaniza códigos nuevos', () => {
    expect(etiquetaProximaAccion('FOLLOW_UP')).toBe('Seguimiento');
    expect(etiquetaProximaAccion('OTHER')).toBe('Otro');
    expect(etiquetaProximaAccion('ACCION_NUEVA')).toBe('ACCION NUEVA');
    expect(etiquetaProximaAccion(null)).toBe('Sin próxima acción');
  });
});
