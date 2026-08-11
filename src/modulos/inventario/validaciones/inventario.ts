import { z } from 'zod';

/** RFC mexicano opcional (persona moral 12 / física 13). Formato, no existencia. */
const rfcOpcional = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, 'RFC inválido')
  .optional()
  .or(z.literal(''));

export const esquemaCrearMaterial = z.object({
  codigo: z.string().min(2, 'El código es requerido').trim(),
  nombre: z.string().min(2, 'El nombre es requerido').trim(),
  descripcion: z.string().trim().optional(),
  categoria: z.enum(['materia_prima', 'insumo', 'semiterminado', 'terminado']),
  unidadCompra: z.enum(['hoja', 'barra', 'rollo', 'pieza']),
  unidadControl: z.enum(['m2', 'ml', 'pieza', 'kg']),
  factorConversion: z.number().positive('El factor debe ser mayor a 0'),
  costoUnitarioCompra: z.number().min(0, 'El costo no puede ser negativo'),
  stockMinimoControl: z.number().min(0, 'El stock mínimo no puede ser negativo'),
  // Zod v4: validador de UUID de primer nivel (no `z.string().uuid()`).
  proveedorId: z.uuid('ID de proveedor inválido').optional(),
  factorMermaPorcentaje: z.number().min(0).max(100).default(8),
});

export const esquemaEntradaInventario = z.object({
  materialId: z.uuid('ID de material inválido'),
  cantidadCompra: z.number().positive('Debe registrar al menos 1 unidad de compra'),
  costoUnitarioCompra: z.number().positive('Costo de compra debe ser mayor a 0'),
  referenciaExterna: z.string().trim().optional(),
  notas: z.string().trim().optional(),
});

export const esquemaSalidaInventario = z.object({
  materialId: z.uuid('ID de material inválido'),
  cantidadControl: z.number().positive('La cantidad debe ser mayor a 0'),
  ordenId: z.uuid('ID de orden inválido').optional(),
  notas: z.string().trim().optional(),
});

export const esquemaCrearProveedor = z.object({
  nombreComercial: z.string().min(2, 'El nombre comercial es requerido').trim(),
  razonSocial: z.string().trim().optional(),
  rfc: rfcOpcional,
  contactoNombre: z.string().min(2, 'El contacto es requerido').trim(),
  // Zod v4: `z.email()` de primer nivel (no `z.string().email()`).
  correo: z.email({ message: 'Correo inválido' }),
  telefono: z.string().min(7, 'Teléfono inválido').trim(),
  direccion: z.string().trim().optional(),
});

export type CrearMaterialInput = z.infer<typeof esquemaCrearMaterial>;
export type EntradaInventarioInput = z.infer<typeof esquemaEntradaInventario>;
export type SalidaInventarioInput = z.infer<typeof esquemaSalidaInventario>;
export type CrearProveedorInput = z.infer<typeof esquemaCrearProveedor>;
