import { z } from 'zod';

import { CATEGORIAS_COSTO, ESTADOS_PROPIESTA } from '@/modulos/propuestas/tipos/indice';
import { campoRutaSubida, camposPrepararSubida } from '@/nucleo/almacenamiento/archivos/esquemas-subida';

const uuid = z.uuid('Identificador inválido');
const actualizadoEn = z.string().trim().min(1, 'Falta la versión del registro');
const motivo = z
  .string()
  .trim()
  .min(3, 'El motivo requiere al menos 3 caracteres')
  .max(300, 'El motivo no puede exceder 300 caracteres');

/** Alta de propuesta desde un RFQ LISTO. */
export const esquemaCrearPropuesta = z
  .object({ rfqId: uuid })
  .strict();

/** Nueva revisión (B..Z) con motivo obligatorio. */
export const esquemaCrearNuevaRevision = z
  .object({ revisionOrigen: uuid, motivo })
  .strict();

/**
 * Edición parcial de un ítem DRAFT. `actualizadoEn` es el token CAS del ítem;
 * los campos ausentes se conservan. Debe venir al menos un campo editable.
 */
export const esquemaEditarItemPropuesta = z
  .object({
    itemId: uuid,
    actualizadoEn,
    descripcion: z.string().trim().min(1).max(300).optional(),
    cantidad: z.number().positive('La cantidad debe ser mayor a 0').max(1_000_000_000).optional(),
    materialId: uuid.nullable().optional(),
    espesorId: uuid.nullable().optional(),
    acabado: z.string().trim().max(120).nullable().optional(),
    notas: z.string().trim().max(2000).nullable().optional(),
    precioUnitario: z.number().nonnegative('El precio no puede ser negativo').max(1_000_000_000).optional(),
    esDescuento: z.boolean().optional(),
    activo: z.boolean().optional(),
  })
  .strict()
  .refine(
    (datos) =>
      datos.descripcion !== undefined ||
      datos.cantidad !== undefined ||
      datos.materialId !== undefined ||
      datos.espesorId !== undefined ||
      datos.acabado !== undefined ||
      datos.notas !== undefined ||
      datos.precioUnitario !== undefined ||
      datos.esDescuento !== undefined ||
      datos.activo !== undefined,
    { message: 'No hay cambios en el ítem' },
  );

const filaRuteo = z
  .object({
    procesoId: uuid,
    grupoEquipoId: uuid.nullable().optional(),
    grupoPlaneadoId: uuid.nullable().optional(),
    setupHoras: z.number().nonnegative().max(10_000).default(0),
    runHoras: z.number().nonnegative().max(100_000).default(0),
  })
  .strict();

/** Reemplazo completo del ruteo estimado de un ítem DRAFT. */
export const esquemaEditarRuteoItem = z
  .object({
    itemId: uuid,
    actualizadoEn,
    filas: z.array(filaRuteo).max(50, 'Demasiadas filas de ruteo'),
  })
  .strict();

const costoRevision = z
  .object({
    categoria: z.enum(CATEGORIAS_COSTO),
    monto: z.number().nonnegative('El monto no puede ser negativo').max(1_000_000_000),
    nota: z.string().trim().max(500).optional(),
  })
  .strict();

/** Reemplazo del costeo interno por categoría (una fila por categoría). */
export const esquemaEditarCostosRevision = z
  .object({
    revisionId: uuid,
    actualizadoEn,
    costos: z.array(costoRevision).max(5, 'Solo hay cinco categorías de costo'),
  })
  .strict()
  .refine(
    (datos) => new Set(datos.costos.map((costo) => costo.categoria)).size === datos.costos.length,
    { message: 'No se puede repetir una categoría de costo' },
  );

/** Seguimiento: próxima acción del catálogo B1.7 (+ texto si es "Otro"). */
export const esquemaRegistrarSeguimientoPropuesta = z
  .object({
    revisionId: uuid,
    actualizadoEn,
    codigo: z.string().trim().min(2).max(49),
    textoOtro: z.string().trim().max(300).optional(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)'),
    responsableId: uuid.optional(),
    canal: z.string().trim().max(60).optional(),
    nota: z.string().trim().max(1000).optional(),
  })
  .strict();

/** Validación de la revisión (→ READY_TO_SEND). */
export const esquemaValidarRevision = z
  .object({ revisionId: uuid, actualizadoEn })
  .strict();

/** Aceptación de la revisión exacta. */
export const esquemaAceptarRevision = z
  .object({
    revisionId: uuid,
    actualizadoEn,
    canal: z.string().trim().max(60).optional(),
    destino: z.string().trim().max(120).optional(),
  })
  .strict();

/** Confirmación de venta sobre la revisión aceptada. */
export const esquemaConfirmarVenta = z
  .object({ revisionId: uuid, actualizadoEn })
  .strict();

/** Rechazo o cierre con motivo obligatorio. */
export const esquemaMotivoPropuesta = z
  .object({ revisionId: uuid, motivo, actualizadoEn })
  .strict();

/** Generación/regeneración del PDF de una revisión lista para enviar. */
export const esquemaGenerarPdfRevision = z
  .object({ revisionId: uuid })
  .strict();

/** Envío atómico de la revisión (congela en SENT). */
export const esquemaEnviarRevision = z
  .object({
    revisionId: uuid,
    canal: z.string().trim().min(1, 'Indica el canal de envío').max(60),
    destino: z.string().trim().min(1, 'Indica el destino').max(120),
  })
  .strict();

/** Firma corta de un archivo de propuesta (PDF o adjunto). */
export const esquemaFirmarArchivoPropuesta = z
  .object({ archivoId: uuid })
  .strict();

/** Destino de un archivo propio de la revisión (el binario sube directo a Storage). */
const destinoArchivoPropuesta = {
  revisionId: uuid,
  tema: z.enum(['general', 'tecnico']).default('general'),
  nombreArchivo: z.string().trim().min(1, 'Nombre de archivo requerido').max(250),
};

/** Metadatos para preparar la subida directa de un archivo de la revisión (H-B1-29). */
export const esquemaPrepararArchivoPropuesta = z
  .object({ ...destinoArchivoPropuesta, ...camposPrepararSubida })
  .strict();

/** Confirmación de la subida directa ya completada en Storage. */
export const esquemaConfirmarArchivoPropuesta = z
  .object({ ...destinoArchivoPropuesta, ...campoRutaSubida })
  .strict();

/** Filtros de la cola de propuestas. */
export const esquemaFiltrosPropuestas = z
  .object({
    estado: z.enum(ESTADOS_PROPIESTA).optional(),
    busqueda: z.string().trim().max(120).optional(),
    responsableId: uuid.optional(),
    rfqId: uuid.optional(),
    soloVencidas: z.boolean().optional(),
  })
  .strict();

export type CrearPropuestaInput = z.infer<typeof esquemaCrearPropuesta>;
export type CrearNuevaRevisionInput = z.infer<typeof esquemaCrearNuevaRevision>;
export type EditarItemPropuestaInput = z.infer<typeof esquemaEditarItemPropuesta>;
export type EditarRuteoItemInput = z.infer<typeof esquemaEditarRuteoItem>;
export type EditarCostosRevisionInput = z.infer<typeof esquemaEditarCostosRevision>;
export type RegistrarSeguimientoPropuestaInput = z.infer<
  typeof esquemaRegistrarSeguimientoPropuesta
>;
export type ValidarRevisionInput = z.infer<typeof esquemaValidarRevision>;
export type AceptarRevisionInput = z.infer<typeof esquemaAceptarRevision>;
export type ConfirmarVentaInput = z.infer<typeof esquemaConfirmarVenta>;
export type MotivoPropuestaInput = z.infer<typeof esquemaMotivoPropuesta>;
export type GenerarPdfRevisionInput = z.infer<typeof esquemaGenerarPdfRevision>;
export type EnviarRevisionInput = z.infer<typeof esquemaEnviarRevision>;
export type FirmarArchivoPropuestaInput = z.infer<typeof esquemaFirmarArchivoPropuesta>;
export type PrepararArchivoPropuestaInput = z.infer<typeof esquemaPrepararArchivoPropuesta>;
export type ConfirmarArchivoPropuestaInput = z.infer<typeof esquemaConfirmarArchivoPropuesta>;
export type FiltrosPropuestasInput = z.infer<typeof esquemaFiltrosPropuestas>;
