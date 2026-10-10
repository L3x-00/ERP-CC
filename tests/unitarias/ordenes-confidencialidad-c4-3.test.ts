import { describe, expect, it } from 'vitest';

import {
  COLUMNAS_ORDEN_OPERATIVA,
  filaAOrdenOperativa,
  type FilaOrden,
} from '@/modulos/ordenes/tipos/ordenes';

const FILA_ORDEN = {
  id: '11111111-1111-4111-8111-111111111111',
  folio: 'OP-001001',
  cliente_id: '22222222-2222-4222-8222-222222222222',
  cotizacion_id: null,
  estado: 'programada',
  prioridad: 'normal',
  fecha_compromiso: '2026-10-20T18:00:00.000Z',
  fecha_inicio: null,
  fecha_fin: null,
  creado_en: '2026-10-09T10:00:00.000Z',
  actualizado_en: '2026-10-09T10:00:00.000Z',
  motivo_cancelacion: null,
  es_interna: false,
  archivada_en: null,
  id_historico: null,
  referencia_externa: null,
  condicion_pago: 'credito',
  monto_sin_iva: 75000,
  monto_iva: 12000,
  notas: 'Nota operativa',
  fecha_trabajo: null,
  horas_estimadas: 7,
  orden_origen_id: null,
  propuesta_id: null,
  propuesta_revision_id: null,
  rfq_id: null,
  folio_sii: 'O-1026_01',
  estado_sii: 'PLANIFICADA',
  snapshot_json: {
    totales: { subtotal: 75000, moneda: 'MXN' },
    items: [{ precio_unitario: 75000, costo_unitario: 10000 }],
  },
  cerrada_admin_en: null,
  cerrada_admin_por: null,
  fecha_compromiso_comercial: '2026-10-20',
  fecha_operativa: '2026-10-18T18:00:00.000Z',
} satisfies FilaOrden;

describe('C4.3 proyeccion operativa de ordenes', () => {
  it('no consulta columnas comerciales o financieras para roles operativos', () => {
    expect(COLUMNAS_ORDEN_OPERATIVA).not.toContain('condicion_pago');
    expect(COLUMNAS_ORDEN_OPERATIVA).not.toContain('monto_sin_iva');
    expect(COLUMNAS_ORDEN_OPERATIVA).not.toContain('monto_iva');
    expect(COLUMNAS_ORDEN_OPERATIVA).not.toContain('snapshot_json');
  });

  it('no serializa finanzas aunque la fila de origen las contenga', () => {
    const payload = filaAOrdenOperativa(FILA_ORDEN);
    const serializado = JSON.stringify(payload);

    expect(payload).not.toHaveProperty('condicionPago');
    expect(payload).not.toHaveProperty('montoSinIva');
    expect(payload).not.toHaveProperty('montoIva');
    expect(serializado).not.toContain('75000');
    expect(serializado).not.toContain('precio_unitario');
    expect(serializado).not.toContain('costo_unitario');
    expect(serializado).not.toContain('moneda');
  });
});
