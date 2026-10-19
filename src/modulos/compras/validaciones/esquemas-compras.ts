import { z } from 'zod';

import { RUBROS_COSTO_COMPRA } from '@/modulos/compras/utilidades/indice';

const uuid = z.uuid('Identificador inválido');
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

const montoNoNegativo = z.number().nonnegative('El monto no puede ser negativo').max(1_000_000_000);
const cantidadPositiva = z.number().positive('La cantidad debe ser mayor a 0').max(1_000_000_000);
const cantidadCosto = z.number().nonnegative('El costo no puede ser negativo').max(1_000_000_000);
const rubroCosto = z.enum(RUBROS_COSTO_COMPRA).nullable().optional();

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
    /** C10.1/F06: obligatorio cuando hay Orden; nullable en históricas sin clasificar. */
    rubroCosto,
    /** C10.1/F08: detalle mínimo de material (nullable, no mueve inventario). */
    concepto: z.string().trim().max(200).nullable().optional(),
    materialId: uuid.nullable().optional(),
    cantidad: cantidadPositiva.nullable().optional(),
    unidad: z.string().trim().max(40).nullable().optional(),
    costoUnitario: cantidadCosto.nullable().optional(),
  })
  .strict()
  .refine((datos) => datos.moneda !== 'MXN' || datos.tipoCambio === 1, {
    message: 'Un monto en MXN exige tipo de cambio 1',
  })
  .refine((datos) => datos.ordenId == null || datos.rubroCosto != null, {
    message: 'Con Orden el rubro de costo es obligatorio',
    path: ['rubroCosto'],
  })
  .refine((datos) => {
    const hayDetalle = datos.cantidad != null || datos.costoUnitario != null || datos.unidad != null;
    return !hayDetalle || datos.materialId != null || (datos.concepto ?? '').length >= 2;
  }, {
    message: 'Indica el concepto o el material del detalle',
    path: ['concepto'],
  })
  .refine((datos) => {
    if (datos.cantidad == null || datos.costoUnitario == null) return true;
    return Math.abs(datos.montoSubtotal - datos.cantidad * datos.costoUnitario) <= 0.01;
  }, {
    message: 'El subtotal debe cuadrar con cantidad × costo unitario (±0.01)',
    path: ['montoSubtotal'],
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

/** C10.1/F09: clasificación manual de una compra histórica con Orden. */
export const esquemaAsignarRubroCostoCompra = z
  .object({
    compraId: uuid,
    rubroCosto: z.enum(RUBROS_COSTO_COMPRA),
  })
  .strict();

export type DatosCompraInput = z.infer<typeof esquemaDatosCompra>;
export type CrearCompraInput = z.infer<typeof esquemaCrearCompra>;
export type ActualizarCompraInput = z.infer<typeof esquemaActualizarCompra>;
export type EstadoCompraInput = z.infer<typeof esquemaEstadoCompra>;
export type PagarCompraInput = z.infer<typeof esquemaPagarCompra>;
export type AsignarRubroCostoCompraInput = z.infer<typeof esquemaAsignarRubroCostoCompra>;
