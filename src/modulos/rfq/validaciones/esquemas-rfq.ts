import { z } from 'zod';

import { ACCIONES_RFQ } from '../tipos/indice';

const escalaDosDecimales = (valor: number): boolean =>
  Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-9;

/** Datos capturables de un ítem RFQ (borde de la Server Action). */
export const esquemaDatosItemRfq = z
  .object({
    descripcion: z.string().trim().min(1).max(300),
    cantidad: z
      .number()
      .positive()
      .max(1_000_000_000)
      .refine(escalaDosDecimales, 'La cantidad admite máximo 2 decimales'),
    materialId: z.uuid().nullish(),
    espesorId: z.uuid().nullish(),
    acabado: z.string().trim().max(120).nullish(),
    notas: z.string().trim().max(2000).nullish(),
    procesoIds: z.array(z.uuid()).max(20).optional(),
  })
  .strict();

/**
 * Entrada de `guardarItemRfqAccion`: alta (rfqId) o edición (itemId + token CAS).
 */
export const esquemaGuardarItemRfq = z
  .object({
    rfqId: z.uuid().optional(),
    itemId: z.uuid().optional(),
    actualizadoEn: z.iso.datetime({ offset: true }).optional(),
    datos: esquemaDatosItemRfq,
  })
  .strict()
  .refine(
    (entrada) => (entrada.itemId ? Boolean(entrada.actualizadoEn) : Boolean(entrada.rfqId)),
    { message: 'Indica el RFQ (alta) o el ítem con su token de actualización (edición)' },
  );

/** Entrada de `cambiarEstadoRfqAccion`. */
export const esquemaCambiarEstadoRfq = z
  .object({
    rfqId: z.uuid(),
    accion: z.enum(ACCIONES_RFQ),
    motivo: z.string().trim().min(3).max(300).optional(),
    actualizadoEn: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(
    (entrada) => !(entrada.accion === 'cerrar' || entrada.accion === 'cancelar') || Boolean(entrada.motivo),
    { message: 'El motivo es obligatorio', path: ['motivo'] },
  );

/** Entrada de `cancelarItemRfqAccion`. */
export const esquemaCancelarItemRfq = z
  .object({
    itemId: z.uuid(),
    motivo: z.string().trim().max(300).optional(),
  })
  .strict();

/** Entrada de lectura de un RFQ. */
export const esquemaObtenerRfq = z.object({ rfqId: z.uuid() }).strict();

/** Entrada de validación LISTO. */
export const esquemaValidarRfqListo = z.object({ rfqId: z.uuid() }).strict();

export type DatosItemRfqInput = z.infer<typeof esquemaDatosItemRfq>;
export type GuardarItemRfqInput = z.infer<typeof esquemaGuardarItemRfq>;
export type CambiarEstadoRfqInput = z.infer<typeof esquemaCambiarEstadoRfq>;
