import { z } from 'zod';

import { CLASES_EVIDENCIA_ENTREGA } from '@/modulos/entregas/tipos/indice';
import { campoRutaSubida, camposPrepararSubida } from '@/nucleo/almacenamiento/archivos/esquemas-subida';

const uuid = z.uuid('Identificador inválido');

/** Renglón de entrega: partida + cantidad (≤ producida y ≤ pendiente). */
export const esquemaRenglonEntrega = z
  .object({
    partidaId: uuid,
    cantidadEntregada: z
      .number()
      .positive('La cantidad debe ser mayor a 0')
      .max(1_000_000_000),
  })
  .strict();

/**
 * Alta de entrega. `entregadoPor` permite registrar a quien entrega físicamente
 * (por defecto el actor); `solicitudId` es la clave de idempotencia del intento.
 */
export const esquemaRegistrarEntrega = z
  .object({
    ordenId: uuid,
    renglones: z
      .array(esquemaRenglonEntrega)
      .min(1, 'Agrega al menos un renglón')
      .max(100, 'Máximo 100 renglones por entrega'),
    recibidoPor: z.string().trim().min(3, 'Indica quién recibe').max(120),
    contactoId: uuid.nullable().optional(),
    entregadoPor: uuid.optional(),
    solicitudId: uuid.optional(),
  })
  .strict()
  .refine(
    (datos) =>
      new Set(datos.renglones.map((renglon) => renglon.partidaId)).size ===
      datos.renglones.length,
    { message: 'No se puede repetir una partida en la misma entrega' },
  );

/** Destino de evidencia/firma de una entrega (el binario sube directo a Storage). */
const destinoEvidenciaEntrega = {
  notaId: uuid,
  clase: z.enum(CLASES_EVIDENCIA_ENTREGA),
  nombreArchivo: z.string().trim().min(1, 'Nombre de archivo requerido').max(250),
};

/** Preparación de la subida directa (H-B1-29): solo metadatos, nunca el binario. */
export const esquemaPrepararEvidenciaEntrega = z
  .object({ ...destinoEvidenciaEntrega, ...camposPrepararSubida })
  .strict();

/** Confirmación de la subida directa ya completada en Storage. */
export const esquemaConfirmarEvidenciaEntrega = z
  .object({ ...destinoEvidenciaEntrega, ...campoRutaSubida })
  .strict();

/** Firma corta de un archivo de entrega. */
export const esquemaFirmarEvidenciaEntrega = z
  .object({ archivoId: uuid })
  .strict();

/** Corrección de la fecha de entrega (§7.1, CAS con `actualizadoEn`). */
export const esquemaActualizarFechaEntrega = z
  .object({
    entregaId: uuid,
    fechaEntrega: z.iso.datetime({ offset: true, message: 'La fecha de entrega no es válida' }),
    actualizadoEn: z.iso.datetime({ offset: true, message: 'La versión de la entrega no es válida' }),
  })
  .strict();

/** Identificador de orden para preparar/listar entregas. */
export const esquemaOrdenEntrega = z.object({ ordenId: uuid }).strict();

/** Identificador de una nota de entrega concreta. */
export const esquemaEntregaPorId = z.object({ entregaId: uuid }).strict();

export type RenglonEntregaInput = z.infer<typeof esquemaRenglonEntrega>;
export type RegistrarEntregaInput = z.infer<typeof esquemaRegistrarEntrega>;
export type PrepararEvidenciaEntregaInput = z.infer<typeof esquemaPrepararEvidenciaEntrega>;
export type ConfirmarEvidenciaEntregaInput = z.infer<typeof esquemaConfirmarEvidenciaEntrega>;
export type FirmarEvidenciaEntregaInput = z.infer<typeof esquemaFirmarEvidenciaEntrega>;
export type ActualizarFechaEntregaInput = z.infer<typeof esquemaActualizarFechaEntrega>;
export type OrdenEntregaInput = z.infer<typeof esquemaOrdenEntrega>;
export type EntregaPorIdInput = z.infer<typeof esquemaEntregaPorId>;
