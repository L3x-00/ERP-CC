import { z } from 'zod';

const uuid = z.uuid('Identificador inválido');

/** Lectura de la promesa activa de una cuenta. */
export const esquemaPromesaCuenta = z.object({ cuentaId: uuid }).strict();

/** Alta de promesa de pago. */
export const esquemaCrearPromesa = z
  .object({
    cuentaId: uuid,
    fechaPrometida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    monto: z.number().positive('El monto debe ser mayor a 0').max(1_000_000_000),
  })
  .strict();

/** Cancelación de promesa con motivo. */
export const esquemaCancelarPromesa = z
  .object({
    promesaId: uuid,
    motivo: z.string().trim().min(3, 'El motivo requiere al menos 3 caracteres').max(300),
  })
  .strict();

/** Cliente para el cobro repartido. */
export const esquemaCuentasCliente = z.object({ clienteId: uuid }).strict();

/** Cobro repartido: un recibo aplicado a varias AR del mismo cliente. */
export const esquemaCobroMultiple = z
  .object({
    clienteId: uuid,
    montoPagado: z.number().positive('El monto debe ser mayor a 0').max(1_000_000_000),
    monedaPago: z.enum(['MXN', 'USD']),
    tipoCambio: z.number().positive('Tipo de cambio inválido').max(1_000_000),
    metodoPago: z.enum(['transferencia', 'efectivo', 'cheque', 'tarjeta']),
    referencia: z.string().trim().max(120).nullable().optional(),
    notas: z.string().trim().max(500).nullable().optional(),
    cuentaBancariaId: uuid.nullable().optional(),
    aplicaciones: z
      .array(
        z
          .object({
            cuentaId: uuid,
            monto: z.number().positive('La aplicación debe ser mayor a 0').max(1_000_000_000),
          })
          .strict(),
      )
      .min(1, 'Selecciona al menos una factura')
      .max(100, 'Máximo 100 facturas por cobro'),
    solicitudId: uuid.optional(),
  })
  .strict()
  .refine(
    (datos) => new Set(datos.aplicaciones.map((aplicacion) => aplicacion.cuentaId)).size
      === datos.aplicaciones.length,
    { message: 'No se puede repetir una factura en el mismo cobro' },
  )
  .refine((datos) => datos.monedaPago !== 'MXN' || datos.tipoCambio === 1, {
    message: 'Un pago en MXN exige tipo de cambio 1',
  });

export type CrearPromesaInput = z.infer<typeof esquemaCrearPromesa>;
export type CancelarPromesaInput = z.infer<typeof esquemaCancelarPromesa>;
export type CobroMultipleInput = z.infer<typeof esquemaCobroMultiple>;
