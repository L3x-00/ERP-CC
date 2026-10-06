import { z } from 'zod';

const uuid = z.uuid('Identificador inválido');
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

const montoNoNegativo = z.number().nonnegative('El monto no puede ser negativo').max(1_000_000_000);

export const esquemaDatosCompra = z
  .object({
    proveedorId: uuid,
    ordenId: uuid.nullable().optional(),
    montoSubtotal: montoNoNegativo,
    montoIva: montoNoNegativo,
    moneda: z.enum(['MXN', 'USD']),
    tipoCambio: z.number().positive('Tipo de cambio inválido').max(1_000_000),
    fechaVencimiento: fecha.nullable().optional(),
    notas: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((datos) => datos.moneda !== 'MXN' || datos.tipoCambio === 1, {
    message: 'Un monto en MXN exige tipo de cambio 1',
  });

export const esquemaCrearCompra = esquemaDatosCompra;

export const esquemaActualizarCompra = z
  .object({
    compraId: uuid,
    actualizadoEn: z.string().min(1, 'Token de versión requerido'),
    datos: esquemaDatosCompra,
  })
  .strict();

export const esquemaEstadoCompra = z
  .object({
    compraId: uuid,
    actualizadoEn: z.string().min(1, 'Token de versión requerido'),
    estado: z.enum(['CONFIRMADA', 'RECIBIDA', 'CANCELADA']),
    motivo: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((datos) => datos.estado !== 'CANCELADA' || (datos.motivo ?? '').trim().length >= 3, {
    message: 'El motivo de cancelación requiere al menos 3 caracteres',
  });

export const esquemaPagarCompra = z
  .object({
    compraId: uuid,
    monto: z.number().positive('El monto debe ser mayor a 0').max(1_000_000_000),
    metodoPago: z.enum(['transferencia', 'efectivo', 'cheque', 'tarjeta']),
    referencia: z.string().trim().max(120).nullable().optional(),
    cuentaBancariaId: uuid.nullable().optional(),
    notas: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type DatosCompraInput = z.infer<typeof esquemaDatosCompra>;
export type CrearCompraInput = z.infer<typeof esquemaCrearCompra>;
export type ActualizarCompraInput = z.infer<typeof esquemaActualizarCompra>;
export type EstadoCompraInput = z.infer<typeof esquemaEstadoCompra>;
export type PagarCompraInput = z.infer<typeof esquemaPagarCompra>;
