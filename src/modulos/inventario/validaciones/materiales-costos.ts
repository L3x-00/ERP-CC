import { z } from 'zod';

const escalaCuatroDecimales = (valor: number): boolean =>
  Math.abs(valor * 10_000 - Math.round(valor * 10_000)) < 1e-6;

const costoValido = z
  .number()
  .nonnegative()
  .max(1_000_000_000)
  .refine(escalaCuatroDecimales, 'El costo admite máximo 4 decimales');

const moneda = z.enum(['MXN', 'USD']);
const fechaEfectiva = z.iso.date({ message: 'Indica la fecha efectiva' });

const referencia = z
  .string()
  .trim()
  .min(2, 'La referencia debe tener al menos 2 caracteres')
  .max(120);

/** Entrada de `proponerCostoMaterialAccion` (compra/gasto propone, C6.1/DC-13). */
export const esquemaProponerCostoMaterial = z
  .object({
    materialId: z.uuid(),
    costo: costoValido,
    moneda,
    fechaEfectiva,
    fuente: z.enum(['COMPRA', 'GASTO']),
    referencia,
  })
  .strict();

/**
 * Entrada de `confirmarCostoMaterialAccion`: manual (sin propuesta) o la
 * confirmación exacta de una propuesta existente, con el token CAS del material.
 */
export const esquemaConfirmarCostoMaterial = z
  .object({
    materialId: z.uuid(),
    costo: costoValido,
    moneda,
    fechaEfectiva,
    fuente: z.enum(['MANUAL', 'COMPRA', 'GASTO']),
    referencia: referencia.nullish(),
    propuestaId: z.uuid().nullish(),
    actualizadoEn: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(
    (entrada) =>
      entrada.fuente === 'MANUAL'
        ? entrada.propuestaId === null || entrada.propuestaId === undefined
        : Boolean(entrada.propuestaId),
    { message: 'Una compra o gasto exige su propuesta', path: ['propuestaId'] },
  )
  .refine(
    (entrada) =>
      entrada.fuente === 'MANUAL' ||
      (typeof entrada.referencia === 'string' && entrada.referencia.length >= 2),
    { message: 'La confirmación de una propuesta exige su referencia', path: ['referencia'] },
  );

export type ProponerCostoMaterialInput = z.infer<typeof esquemaProponerCostoMaterial>;
export type ConfirmarCostoMaterialInput = z.infer<typeof esquemaConfirmarCostoMaterial>;
