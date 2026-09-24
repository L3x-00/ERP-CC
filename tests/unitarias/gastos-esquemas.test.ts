import { describe, expect, it } from 'vitest';
import {
  esquemaBuscarOrdenesGasto,
  esquemaCambiarEstadoGasto,
  esquemaComprobanteOCR,
  esquemaConsultarGastos,
  esquemaDatosComprobanteOCR,
  esquemaRegistrarGasto,
} from '@/modulos/gastos/validaciones/indice';
import { filaAGasto, type FilaGasto } from '@/modulos/gastos/tipos/indice';

const ORDEN = '11111111-1111-4111-8111-111111111111';
const PROVEEDOR = '22222222-2222-4222-8222-222222222222';
const USUARIO = '33333333-3333-4333-8333-333333333333';

function gastoBase(parcial: Record<string, unknown> = {}) {
  return {
    tipoGasto: 'variable',
    categoria: 'materia_prima',
    descripcion: 'Placa de aluminio 6061',
    montoSubtotal: 1_000,
    montoIva: 160,
    montoTotal: 1_160,
    moneda: 'MXN',
    tipoCambio: 1,
    fechaGasto: '2026-09-09',
    ...parcial,
  };
}

describe('esquemaRegistrarGasto', () => {
  it('exige clasificación explícita para registros nuevos', () => {
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ tipoGasto: undefined })).success).toBe(false);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ tipoGasto: 'indefinido' })).success).toBe(false);
  });
  it('acepta gasto indirecto y gasto directo', () => {
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ categoria: 'servicios_generales' })).success)
      .toBe(true);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ ordenId: ORDEN, proveedorId: PROVEEDOR }))
      .success).toBe(true);
  });

  it('acepta las categorías contractuales', () => {
    const categorias = [
      'materia_prima', 'consumibles', 'herramentental', 'maquila_externa', 'logistica',
      'servicios_generales', 'nomina', 'mantenimiento', 'otros',
    ];
    for (const categoria of categorias) {
      expect(esquemaRegistrarGasto.safeParse(gastoBase({ categoria })).success).toBe(true);
    }
  });

  it('acepta categorías configurables (CFG-09) con formato válido', () => {
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ categoria: 'acero_inoxidable' })).success).toBe(true);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ categoria: 'MAL!' })).success).toBe(false);
    expect(esquemaConsultarGastos.safeParse({ categorias: ['acero_inoxidable'] }).success).toBe(true);
  });

  it('rechaza negativos, no finitos y total incoherente', () => {
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ montoSubtotal: -1 })).success).toBe(false);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ montoSubtotal: Number.NaN })).success)
      .toBe(false);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ montoTotal: 2_000 })).success).toBe(false);
  });

  it('exige tipo de cambio positivo y 1 para MXN', () => {
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ tipoCambio: 0 })).success).toBe(false);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ tipoCambio: 18.5 })).success).toBe(false);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ moneda: 'USD', tipoCambio: 18.5 })).success)
      .toBe(true);
  });

  it('rechaza UUID, fecha, URL y claves fuera del contrato', () => {
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ ordenId: 'orden-1' })).success).toBe(false);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ fechaGasto: '09/09/2026' })).success)
      .toBe(false);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ comprobanteUrl: 'javascript:alert(1)' }))
      .success).toBe(false);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ estadoPago: 'pagado' })).success).toBe(false);
  });

  it('rechaza vencimiento anterior al gasto y acepta datos OCR JSON', () => {
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ fechaVencimiento: '2026-09-01' })).success)
      .toBe(false);
    expect(esquemaRegistrarGasto.safeParse(gastoBase({ datosOcrJson: { folioFactura: 'A-1' } }))
      .success).toBe(true);
  });
});

describe('consultas y cambio de estado', () => {
  it('valida la búsqueda de órdenes del selector (OBS-28)', () => {
    expect(esquemaBuscarOrdenesGasto.safeParse({}).success).toBe(true);
    expect(esquemaBuscarOrdenesGasto.safeParse({ busqueda: 'OP-001' }).success).toBe(true);
    expect(esquemaBuscarOrdenesGasto.safeParse({ busqueda: 'x'.repeat(81) }).success).toBe(false);
    expect(esquemaBuscarOrdenesGasto.safeParse({ busqueda: 'OP', extra: true }).success).toBe(false);
  });

  it('valida filtros de fecha y transición', () => {
    expect(esquemaConsultarGastos.safeParse({ desde: '2026-09-10', hasta: '2026-09-01' }).success)
      .toBe(false);
    expect(esquemaConsultarGastos.safeParse({ estados: ['pendiente'] }).success).toBe(true);
    expect(esquemaCambiarEstadoGasto.safeParse({
      gastoId: ORDEN,
      nuevoEstado: 'pagado',
      estadoEsperado: 'pendiente',
    }).success).toBe(true);
  });
});

describe('comprobante OCR', () => {
  const salidaValida = {
    proveedorSugerido: 'Aceros del Norte',
    rfc: 'ANO010101AAA',
    folioFactura: 'A-1024',
    montoSubtotal: 1_000,
    montoIva: 160,
    montoTotal: 1_160,
    moneda: 'MXN',
    fechaEmision: '2026-09-01',
    confianza: 0.92,
    advertencias: [],
  };

  it('acepta imágenes y rechaza PDF, MIME o base64 inválidos', () => {
    expect(esquemaComprobanteOCR.safeParse({ contenidoBase64: 'QUJD', tipoMime: 'image/png' }).success)
      .toBe(true);
    expect(esquemaComprobanteOCR.safeParse({ contenidoBase64: 'QUJD', tipoMime: 'application/pdf' })
      .success).toBe(false);
    expect(esquemaComprobanteOCR.safeParse({ contenidoBase64: 'a', tipoMime: 'image/png' }).success)
      .toBe(false);
    expect(esquemaComprobanteOCR.safeParse({ contenidoBase64: 'no válido', tipoMime: 'text/html' })
      .success).toBe(false);
  });

  it('valida salida estricta, nulabilidad y coherencia de importes', () => {
    expect(esquemaDatosComprobanteOCR.safeParse(salidaValida).success).toBe(true);
    expect(esquemaDatosComprobanteOCR.safeParse({
      ...salidaValida,
      proveedorSugerido: null,
      rfc: null,
      folioFactura: null,
      montoSubtotal: null,
      montoIva: null,
      montoTotal: null,
      moneda: null,
      fechaEmision: null,
    }).success).toBe(true);
    expect(esquemaDatosComprobanteOCR.safeParse({ ...salidaValida, montoTotal: 999 }).success)
      .toBe(false);
  });
});

describe('filaAGasto', () => {
  const fila: FilaGasto = {
    id: '44444444-4444-4444-8444-444444444444',
    folio: 'GTO-001001',
    orden_id: ORDEN,
    proveedor_id: PROVEEDOR,
    categoria: 'materia_prima',
    descripcion: 'Placa de aluminio 6061',
    monto_subtotal: '1000.0000',
    monto_iva: '160.0000',
    monto_total: '1160.0000',
    moneda: 'MXN',
    tipo_cambio: '1.0000',
    estado_pago: 'pendiente',
    fecha_gasto: '2026-09-09',
    fecha_vencimiento: null,
    comprobante_url: null,
    folio_comprobante: 'A-1024',
    metodo_pago: 'transferencia',
    datos_ocr_json: null,
    notas: null,
    creado_por: USUARIO,
    creado_en: '2026-09-09T10:00:00.000Z',
    actualizado_en: '2026-09-09T10:00:00.000Z',
  };

  it('convierte numeric a número y snake_case a camelCase', () => {
    const gasto = filaAGasto(fila);
    expect(gasto.folio).toBe('GTO-001001');
    expect(gasto.montoTotal).toBe(1_160);
    expect(gasto.tipoCambio).toBe(1);
    expect(gasto.ordenId).toBe(ORDEN);
    expect(gasto.ordenFolio).toBeNull();
  });

  it('rompe ante enum o importe ilegible', () => {
    expect(() => filaAGasto({ ...fila, estado_pago: 'archivado' })).toThrow(/estado_pago/);
    expect(() => filaAGasto({ ...fila, monto_total: 'mil pesos' })).toThrow(/monto_total/);
  });
});
