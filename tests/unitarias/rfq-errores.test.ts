import { describe, expect, it } from 'vitest';

import { mensajeErrorRfq } from '@/modulos/rfq/acciones/utilidades-acciones';

describe('mensajes de error de RFQ', () => {
  it('traduce los códigos estables a mensajes públicos', () => {
    expect(mensajeErrorRfq('sin_permiso_rfq')).toContain('permiso');
    expect(mensajeErrorRfq('rfq_congelado')).toContain('Rev A');
    expect(mensajeErrorRfq('rfq_desactualizado')).toContain('recarga');
    expect(mensajeErrorRfq('item_desactualizado')).toContain('recarga');
    expect(mensajeErrorRfq('rfq_transicion_invalida')).toContain('estado actual');
    expect(mensajeErrorRfq('motivo_requerido')).toContain('motivo');
    expect(mensajeErrorRfq('item_con_documentos')).toContain('documentos');
    expect(mensajeErrorRfq('espesor_requerido')).toContain('espesor');
    expect(mensajeErrorRfq('items_agotados')).toContain('99');
    expect(mensajeErrorRfq('codigo_desconocido')).toBe('No se pudo completar la operación');
  });

  it('desglosa los faltantes de rfq_no_listo desde el detalle JSON', () => {
    const detalle = JSON.stringify({
      listo: false,
      secciones: {
        general: ['canal'],
        items: ['ítem IT01: material'],
        archivos: [],
      },
    });

    const mensaje = mensajeErrorRfq('rfq_no_listo', detalle);
    expect(mensaje).toContain('Faltan requisitos');
    expect(mensaje).toContain('General: canal');
    expect(mensaje).toContain('Ítems: ítem IT01: material');
  });

  it('cae al mensaje base si el detalle no es JSON válido', () => {
    expect(mensajeErrorRfq('rfq_no_listo', 'no-json')).toBe(
      'Faltan requisitos para marcar el RFQ como listo',
    );
    expect(mensajeErrorRfq('rfq_no_listo', null)).toBe(
      'Faltan requisitos para marcar el RFQ como listo',
    );
  });
});
