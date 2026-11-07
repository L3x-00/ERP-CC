import { z } from 'zod';

import { campoRutaSubida, camposPrepararSubida } from '@/nucleo/almacenamiento/archivos/esquemas-subida';
import { CAUSAS_RETRABAJO } from '@/modulos/produccion/tipos/retrabajos';

/**
 * Validaciones del borde de las acciones B6 (corridas, pausas, jornada, horas
 * extra y calidad). Las RPC revalidan todo en SQL (defensa en profundidad).
 */

const dosDecimales = (valor: number): boolean =>
  Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-9;

/** Checklist de eventos críticos obligatorio al iniciar. */
export const esquemaVerificacionInicio = z
  .object({
    material: z.literal(true),
    espesor: z.literal(true),
    cantidad: z.literal(true),
    archivo: z.literal(true),
    proceso_equipo: z.literal(true),
    observaciones: z.string().trim().max(1000),
  })
  .strict();

export const esquemaCrearCorrida = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    procesoId: z.uuid('ID de proceso inválido'),
    corridaOrigenId: z.uuid('ID de corrida origen inválido').nullish(),
    items: z
      .array(
        z.object({
          partidaId: z.uuid('ID de partida inválido'),
          cantidad: z.number().positive().max(1_000_000_000).refine(dosDecimales, 'Máximo 2 decimales').optional(),
        }).strict(),
      )
      .min(1, 'La corrida requiere al menos un ítem')
      .max(200),
  })
  .strict();

const ACCIONES_ESTADO_CORRIDA = ['iniciar', 'completar', 'cancelar'] as const;

export const esquemaEstadoCorrida = z
  .object({
    corridaId: z.uuid('ID de corrida inválido'),
    accion: z.enum(ACCIONES_ESTADO_CORRIDA),
    verificacion: esquemaVerificacionInicio.optional(),
    motivo: z.string().trim().min(3, 'El motivo es obligatorio').max(300).optional(),
  })
  .strict()
  .superRefine((valor, contexto) => {
    if (valor.accion === 'iniciar' && !valor.verificacion) {
      contexto.addIssue({
        code: 'custom',
        path: ['verificacion'],
        message: 'El checklist de inicio es obligatorio',
      });
    }
    if (valor.accion === 'cancelar' && !valor.motivo) {
      contexto.addIssue({
        code: 'custom',
        path: ['motivo'],
        message: 'El motivo de cancelación es obligatorio',
      });
    }
  });

export const esquemaReclamarRecurso = z.object({ recursoId: z.uuid('ID de recurso inválido') }).strict();

/** Consulta de corridas de una orden (UI de piso). */
export const esquemaConsultarCorridas = z.object({ ordenId: z.uuid('ID de orden inválido') }).strict();

/** Consulta de inspecciones de una orden (UI de calidad). */
export const esquemaConsultarInspecciones = z.object({ ordenId: z.uuid('ID de orden inválido') }).strict();

/** Consulta de autorizaciones de horas extra (opcionalmente por orden). */
export const esquemaConsultarAutorizacionesHoraExtra = z
  .object({ ordenId: z.uuid('ID de orden inválido').optional() })
  .strict();

export const esquemaCerrarJornada = z.object({ fecha: z.iso.date('Fecha inválida') }).strict();

export const esquemaAutorizarHorasExtra = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    sesionId: z.uuid('ID de sesión inválido').nullish(),
    horas: z.number().positive().max(24).refine(dosDecimales, 'Máximo 2 decimales'),
    motivo: z.string().trim().min(3, 'El motivo es obligatorio').max(300),
  })
  .strict();

export const esquemaSolicitarHorasExtra = z
  .object({
    sesionId: z.uuid('ID de sesión inválido'),
  })
  .strict();

export const esquemaResolverHorasExtra = z
  .object({
    id: z.uuid('ID de solicitud inválido'),
    aprobar: z.boolean(),
  })
  .strict();

export const esquemaRegistrarInspeccion = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    corridaId: z.uuid('ID de corrida inválido').nullish(),
    partidaId: z.uuid('ID de partida inválido').nullish(),
    codigoItem: z.string().trim().min(1, 'El código de ítem es obligatorio').max(40),
    tipo: z.enum(['PRIMERA_PIEZA', 'REFERENCIA_LOTE', 'CIERRE']),
    referencia: z.number().int().positive().nullish(),
    resultado: z.enum(['APROBADA', 'RECHAZADA']),
    tolerancias: z.record(z.string(), z.unknown()).optional(),
    cantidadInspeccionada: z.number().min(0).default(0),
    cantidadOk: z.number().min(0).default(0),
    cantidadNok: z.number().min(0).default(0),
    cantidadRetrabajo: z.number().min(0).default(0),
    materialUsado: z.record(z.string(), z.unknown()).optional(),
    observaciones: z.string().trim().max(1000).nullish(),
  })
  .strict()
  .superRefine((valor, contexto) => {
    if (valor.tipo === 'REFERENCIA_LOTE' && (valor.referencia ?? 0) <= 0) {
      contexto.addIssue({
        code: 'custom',
        path: ['referencia'],
        message: 'La referencia de lote es obligatoria',
      });
    }
  });

export type CrearCorridaInput = z.infer<typeof esquemaCrearCorrida>;
export type EstadoCorridaInput = z.infer<typeof esquemaEstadoCorrida>;
export type AutorizarHorasExtraInput = z.infer<typeof esquemaAutorizarHorasExtra>;
export type SolicitarHorasExtraInput = z.infer<typeof esquemaSolicitarHorasExtra>;
export type ResolverHorasExtraInput = z.infer<typeof esquemaResolverHorasExtra>;
export type RegistrarInspeccionInput = z.infer<typeof esquemaRegistrarInspeccion>;

/** C13.2: retrabajo declarado al cerrar la sesión (material, tiempo y causa). */
export const esquemaRegistrarRetrabajo = z
  .object({
    sesionId: z.uuid('ID de sesión inválido'),
    materialId: z.uuid('ID de material inválido'),
    cantidadUsada: z.number().finite().min(0),
    cantidadScrap: z.number().finite().min(0),
    minutos: z.number().finite().positive('Indica el tiempo del retrabajo').max(1440),
    causa: z.enum(CAUSAS_RETRABAJO),
    motivo: z.string().trim().min(3, 'Describe el motivo del retrabajo').max(300),
    notas: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((valor) => valor.cantidadUsada + valor.cantidadScrap > 0, {
    message: 'Registra material usado o merma mayor a cero',
    path: ['cantidadUsada'],
  });

export type RegistrarRetrabajoInput = z.infer<typeof esquemaRegistrarRetrabajo>;

/** C13.3: declaración de material del cliente por ítem en una revisión DRAFT. */
export const esquemaMaterialClienteItem = z
  .object({
    revisionId: z.uuid('ID de revisión inválido'),
    codigoItem: z.string().trim().min(1).max(50),
    materiales: z
      .array(
        z.object({
          materialId: z.uuid('ID de material inválido'),
          cantidad: z.number().finite().positive('La cantidad debe ser mayor a cero'),
        }).strict(),
      )
      .max(20),
  })
  .strict();

export type MaterialClienteItemInput = z.infer<typeof esquemaMaterialClienteItem>;

/** C13.3 + AUD-11: consumo real del material del cliente al cerrar la sesión. */
export const esquemaConsumoMaterialCliente = z
  .object({
    sesionId: z.uuid('ID de sesión inválido'),
    materialId: z.uuid('ID de material inválido'),
    cantidadUsada: z.number().finite().min(0),
    cantidadScrap: z.number().finite().min(0),
    /** AUD-11: clave de idempotencia del intento. */
    solicitudId: z.uuid('ID de solicitud inválido').optional(),
  })
  .strict()
  .refine((valor) => valor.cantidadUsada + valor.cantidadScrap > 0, {
    message: 'Registra material usado o merma mayor a cero',
    path: ['cantidadUsada'],
  });

export type ConsumoMaterialClienteInput = z.infer<typeof esquemaConsumoMaterialCliente>;

const destinoFotoInspeccion = {
  inspeccionId: z.uuid('ID de inspección inválido'),
  nombre: z.string().trim().min(1).max(250),
};

/** Preparación de la subida directa de una foto de inspección (H-B1-29): solo metadatos. */
export const esquemaPrepararFotoInspeccion = z
  .object({ ...destinoFotoInspeccion, ...camposPrepararSubida })
  .strict();

/** Confirmación de la subida directa ya completada en Storage. */
export const esquemaConfirmarFotoInspeccion = z
  .object({ ...destinoFotoInspeccion, ...campoRutaSubida })
  .strict();
