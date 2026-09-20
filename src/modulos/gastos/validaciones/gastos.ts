import { z } from 'zod';
import {
  ESTADOS_GASTO,
  FORMATO_CATEGORIA_GASTO,
  METODOS_PAGO_GASTO,
  MONEDAS_GASTO,
} from '@/modulos/gastos/tipos/gastos';

const MONTO_MAXIMO = 99_999_999.9999;
const TIPO_CAMBIO_MAXIMO = 999_999.9999;
const FACTOR_DECIMALES = 10_000;

function tieneCuatroDecimales(valor: number): boolean {
  const escalado = valor * FACTOR_DECIMALES;
  return Number.isFinite(escalado) && Math.abs(escalado - Math.round(escalado)) < 1e-6;
}

function montoNoNegativo(etiqueta: string) {
  return z
    .number()
    .refine(Number.isFinite, `El ${etiqueta} debe ser finito`)
    .refine((valor) => valor >= 0, `El ${etiqueta} no puede ser negativo`)
    .refine((valor) => valor <= MONTO_MAXIMO, `El ${etiqueta} excede el máximo permitido`)
    .refine(tieneCuatroDecimales, `El ${etiqueta} admite máximo cuatro decimales`);
}

const tipoCambioPositivo = z
  .number()
  .refine(Number.isFinite, 'El tipo de cambio debe ser finito')
  .refine((valor) => valor > 0, 'El tipo de cambio debe ser mayor a cero')
  .refine((valor) => valor <= TIPO_CAMBIO_MAXIMO, 'El tipo de cambio excede el máximo permitido')
  .refine(tieneCuatroDecimales, 'El tipo de cambio admite máximo cuatro decimales');

const fechaISO = z.union([
  z.iso.date({ message: 'La fecha debe tener formato ISO YYYY-MM-DD' }),
  z.iso.datetime({ message: 'La fecha debe tener formato ISO 8601' }),
]);
const urlComprobante = z
  .url({ message: 'La URL del comprobante no es válida' })
  .refine((valor) => /^https?:\/\//i.test(valor), 'La URL debe usar HTTP o HTTPS')
  .optional();
const textoOpcional = (maximo: number, etiqueta: string) =>
  z.string().trim().min(1, `${etiqueta} no puede estar vacío`).max(maximo).optional();

const esquemaImportes = z
  .object({
    montoSubtotal: montoNoNegativo('subtotal'),
    montoIva: montoNoNegativo('IVA'),
    montoTotal: montoNoNegativo('total'),
    moneda: z.enum(MONEDAS_GASTO),
    tipoCambio: tipoCambioPositivo,
  })
  .superRefine((datos, contexto) => {
    const esperado = Math.round((datos.montoSubtotal + datos.montoIva) * FACTOR_DECIMALES)
      / FACTOR_DECIMALES;
    if (Math.abs(esperado - datos.montoTotal) > 0.00005) {
      contexto.addIssue({
        code: 'custom',
        path: ['montoTotal'],
        message: 'El total debe ser igual al subtotal más el IVA',
      });
    }
    if (datos.moneda === 'MXN' && datos.tipoCambio !== 1) {
      contexto.addIssue({
        code: 'custom',
        path: ['tipoCambio'],
        message: 'Un gasto en MXN debe tener tipo de cambio 1',
      });
    }
  });

export const esquemaRegistrarGasto = z
  .object({
  ordenId: z.uuid('ID de orden inválido').optional(),
  proveedorId: z.uuid('ID de proveedor inválido').optional(),
  // OBS-28: cuenta bancaria de salida (opcional).
  cuentaBancariaId: z.uuid('Cuenta inválida').optional(),
  categoria: z.string().trim().regex(FORMATO_CATEGORIA_GASTO, 'La categoría no es válida'),
    descripcion: z.string().trim().min(3).max(500),
    montoSubtotal: montoNoNegativo('subtotal'),
    montoIva: montoNoNegativo('IVA'),
    montoTotal: montoNoNegativo('total'),
    moneda: z.enum(MONEDAS_GASTO),
    tipoCambio: tipoCambioPositivo,
    fechaGasto: fechaISO,
    fechaVencimiento: fechaISO.optional(),
    comprobanteUrl: urlComprobante,
    folioComprobante: textoOpcional(60, 'El folio'),
    metodoPago: z.enum(METODOS_PAGO_GASTO).optional(),
    datosOcrJson: z.record(z.string(), z.unknown()).nullable().optional(),
    notas: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((datos, contexto) => {
    const resultado = esquemaImportes.safeParse({
      montoSubtotal: datos.montoSubtotal,
      montoIva: datos.montoIva,
      montoTotal: datos.montoTotal,
      moneda: datos.moneda,
      tipoCambio: datos.tipoCambio,
    });
    if (!resultado.success) {
      for (const problema of resultado.error.issues) {
        contexto.addIssue({ ...problema, path: problema.path });
      }
    }
    if (datos.fechaVencimiento && datos.fechaVencimiento < datos.fechaGasto) {
      contexto.addIssue({
        code: 'custom',
        path: ['fechaVencimiento'],
        message: 'La fecha de vencimiento no puede ser anterior al gasto',
      });
    }
  });

export const esquemaCambiarEstadoGasto = z
  .object({
    gastoId: z.uuid('ID de gasto inválido'),
    nuevoEstado: z.enum(ESTADOS_GASTO),
    estadoEsperado: z.enum(ESTADOS_GASTO).optional(),
  })
  .strict();

export const esquemaConsultarGastos = z
  .object({
    ordenId: z.uuid('ID de orden inválido').optional(),
    proveedorId: z.uuid('ID de proveedor inválido').optional(),
    categorias: z.array(z.string().trim().regex(FORMATO_CATEGORIA_GASTO, 'La categoría no es válida')).min(1).optional(),
    estados: z.array(z.enum(ESTADOS_GASTO)).min(1).optional(),
    moneda: z.enum(MONEDAS_GASTO).optional(),
    desde: fechaISO.optional(),
    hasta: fechaISO.optional(),
    busqueda: z.string().trim().max(120).optional(),
  })
  .strict()
  .superRefine((datos, contexto) => {
    if (datos.desde && datos.hasta && datos.desde > datos.hasta) {
      contexto.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: 'La fecha final no puede ser anterior a la inicial',
      });
    }
  });

export const esquemaConsultarRentabilidadOrden = z
  .object({ ordenId: z.uuid('ID de orden inválido') })
  .strict();

export const esquemaComprobanteOCR = z
  .object({
    contenidoBase64: z.string().min(1).regex(
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      'El comprobante no contiene Base64 canónico',
    ),
    tipoMime: z.enum([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ] as const),
  })
  .strict();

export const esquemaDatosComprobanteOCR = z
  .object({
    proveedorSugerido: z.string().trim().max(200).nullable(),
    rfc: z.string().trim().max(40).nullable(),
    folioFactura: z.string().trim().max(60).nullable(),
    montoSubtotal: montoNoNegativo('subtotal').nullable(),
    montoIva: montoNoNegativo('IVA').nullable(),
    montoTotal: montoNoNegativo('total').nullable(),
    moneda: z.enum(MONEDAS_GASTO).nullable(),
    fechaEmision: fechaISO.nullable(),
    confianza: z.number().refine(Number.isFinite).min(0).max(1),
    advertencias: z.array(z.string().trim().max(300)).max(20),
  })
  .strict()
  .superRefine((datos, contexto) => {
    if (
      datos.montoSubtotal !== null
      && datos.montoIva !== null
      && datos.montoTotal !== null
      && Math.abs(
        Math.round((datos.montoSubtotal + datos.montoIva) * FACTOR_DECIMALES) / FACTOR_DECIMALES
          - datos.montoTotal,
      ) > 0.00005
    ) {
      contexto.addIssue({
        code: 'custom',
        path: ['montoTotal'],
        message: 'El total OCR no cuadra con subtotal más IVA',
      });
    }
  });

export type RegistrarGastoInput = z.infer<typeof esquemaRegistrarGasto>;
export type CambiarEstadoGastoInput = z.infer<typeof esquemaCambiarEstadoGasto>;
export type ConsultarGastosInput = z.infer<typeof esquemaConsultarGastos>;
export type ConsultarRentabilidadOrdenInput = z.infer<typeof esquemaConsultarRentabilidadOrden>;
export type ComprobanteOCRInput = z.infer<typeof esquemaComprobanteOCR>;
export type DatosComprobanteOCRValidados = z.infer<typeof esquemaDatosComprobanteOCR>;
export type TipoMimeComprobante = ComprobanteOCRInput['tipoMime'];
