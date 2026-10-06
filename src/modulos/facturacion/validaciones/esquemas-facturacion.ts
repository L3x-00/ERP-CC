import { z } from 'zod';

const uuid = z.uuid('Identificador inválido');

const montoOpcional = z
  .number()
  .nonnegative('El monto no puede ser negativo')
  .max(1_000_000_000)
  .nullable()
  .optional();

const rfcOpcional = z.string().trim().max(13, 'El RFC excede 13 caracteres').nullable().optional();

/** Datos editables de una factura (borrador). */
export const esquemaDatosFactura = z
  .object({
    subtotal: montoOpcional,
    iva: montoOpcional,
    total: montoOpcional,
    rfcReceptor: rfcOpcional,
  })
  .strict();

/** Preparar el borrador de la entrega indicada. */
export const esquemaFacturaEntrega = z.object({ entregaId: uuid }).strict();

/** Crear el borrador desde una entrega. */
export const esquemaCrearFactura = z
  .object({
    entregaId: uuid,
    subtotal: montoOpcional,
    iva: montoOpcional,
    total: montoOpcional,
    rfcReceptor: rfcOpcional,
  })
  .strict();

/** Editar un borrador con token de versión (CAS). */
export const esquemaActualizarFactura = z
  .object({
    facturaId: uuid,
    actualizadoEn: z.string().min(1, 'Token de versión requerido'),
    datos: esquemaDatosFactura,
  })
  .strict();

/** Emitir con el folio fiscal capturado del PAC (sin timbrado en el ERP). */
export const esquemaEmitirFactura = z
  .object({
    facturaId: uuid,
    actualizadoEn: z.string().min(1, 'Token de versión requerido'),
    folioFiscal: z.string().trim().min(1, 'Indica el folio fiscal').max(60),
    rfcReceptor: rfcOpcional,
    uuidFiscal: z.string().trim().max(64, 'El UUID fiscal excede 64 caracteres').nullable().optional(),
  })
  .strict();

/** Cancelar una factura con motivo obligatorio. */
export const esquemaCancelarFactura = z
  .object({
    facturaId: uuid,
    actualizadoEn: z.string().min(1, 'Token de versión requerido'),
    motivo: z.string().trim().min(3, 'El motivo requiere al menos 3 caracteres').max(500),
  })
  .strict();

export type DatosFacturaInput = z.infer<typeof esquemaDatosFactura>;
export type CrearFacturaInput = z.infer<typeof esquemaCrearFactura>;
export type ActualizarFacturaInput = z.infer<typeof esquemaActualizarFactura>;
export type EmitirFacturaInput = z.infer<typeof esquemaEmitirFactura>;
export type CancelarFacturaInput = z.infer<typeof esquemaCancelarFactura>;
export type FacturaEntregaInput = z.infer<typeof esquemaFacturaEntrega>;
