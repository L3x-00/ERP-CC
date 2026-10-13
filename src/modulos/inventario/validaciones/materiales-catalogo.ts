import { z } from 'zod';

const CODIGO_MATERIAL = /^[A-Z0-9][A-Z0-9_-]{1,48}$/;

const escalaCuatroDecimales = (valor: number): boolean =>
  Math.abs(valor * 10_000 - Math.round(valor * 10_000)) < 1e-6;

const ordenCatalogo = z.number().int().min(0).max(99_999);

/**
 * Obs. cliente 2026-10-13 (8): alta/edición de material desde «Materiales y
 * costos» —código, nombre, grupo (padre), unidad base y espesores—. El costo
 * inicial no viaja aquí: se confirma con la RPC de costos (DC-13) después de
 * guardar, con el token CAS que devuelve esta acción.
 */
export const esquemaGuardarMaterialInventario = z
  .object({
    id: z.uuid('ID inválido').optional(),
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(CODIGO_MATERIAL, 'El código no es válido (mayúsculas, números, guion y guion bajo)'),
    nombre: z.string().trim().min(2, 'El nombre es requerido').max(120),
    unidadBase: z.string().trim().min(1, 'La unidad es requerida').max(30),
    padreId: z.uuid('Grupo inválido').nullish(),
    activo: z.boolean().default(true),
    orden: ordenCatalogo.default(0),
    espesores: z
      .array(
        z
          .object({
            id: z.uuid('Espesor inválido').optional(),
            etiqueta: z.string().trim().min(1, 'La etiqueta del espesor es requerida').max(40),
            espesorMm: z
              .number({ message: 'El espesor debe ser numérico' })
              .refine(Number.isFinite, 'El espesor debe ser finito')
              .gt(0, 'El espesor debe ser mayor que cero')
              .max(99_999.999, 'El espesor excede el máximo soportado'),
            activo: z.boolean().default(true),
            orden: ordenCatalogo.default(0),
          })
          .strict(),
      )
      .max(50, 'Máximo 50 espesores por material')
      .default([]),
  })
  .strict();

export type GuardarMaterialInventarioInput = z.infer<typeof esquemaGuardarMaterialInventario>;

/** Obs. 8: ajuste manual de saldo (existencia) con motivo obligatorio. */
export const esquemaAjustarSaldoMaterial = z
  .object({
    materialId: z.uuid('Material inválido'),
    espesorId: z.uuid('Espesor inválido').nullish(),
    saldo: z
      .number({ message: 'El saldo debe ser numérico' })
      .nonnegative('El saldo no puede ser negativo')
      .max(1_000_000_000, 'El saldo es demasiado alto')
      .refine(escalaCuatroDecimales, 'El saldo admite máximo 4 decimales'),
    motivo: z
      .string()
      .trim()
      .min(3, 'El motivo debe tener al menos 3 caracteres')
      .max(300, 'El motivo es demasiado largo'),
  })
  .strict();

export type AjustarSaldoMaterialInput = z.infer<typeof esquemaAjustarSaldoMaterial>;

/** Consulta del historial de ajustes (opcionalmente por material). */
export const esquemaConsultaMovimientosSaldo = z
  .object({
    materialId: z.uuid('Material inválido').optional(),
    limite: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export type ConsultaMovimientosSaldoInput = z.infer<typeof esquemaConsultaMovimientosSaldo>;
