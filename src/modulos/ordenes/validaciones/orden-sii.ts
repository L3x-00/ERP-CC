import { z } from 'zod';

import { ESTADOS_SII_ORDEN } from '@/modulos/ordenes/tipos/orden-sii';

const ID = z.uuid('ID inválido');
const FECHA_HORA = z.iso.datetime({ offset: true, message: 'La fecha no es válida' });
const PRIORIDADES = ['baja', 'normal', 'alta', 'urgente'] as const;

/** Crear orden desde la revisión aceptada (ADR-SII-03). */
export const esquemaCrearOrdenDesdeRevision = z
  .object({ revisionId: ID })
  .strict();

const ITEM_INTERNO = z
  .object({
    codigoItem: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^IT[0-9]{2,}$/, 'El código de ítem debe ser ITxx')
      .optional(),
    descripcion: z.string().trim().min(1, 'La descripción del ítem es requerida').max(300),
    cantidad: z.number().positive('La cantidad debe ser mayor que cero'),
    material: z.string().trim().max(120).optional(),
    espesor: z.string().trim().max(120).optional(),
    procesos: z
      .array(z.string().trim().min(1).max(60))
      .max(20, 'Demasiados procesos para un ítem')
      .optional(),
    tiempoEstimadoMinutos: z.number().min(0).max(99_999_999).default(0),
  })
  .strict();

/** Alta directa de orden interna (TI) autorizada (§5.5). */
export const esquemaCrearOrdenInterna = z
  .object({
    clienteId: ID,
    fechaCompromiso: FECHA_HORA,
    prioridad: z.enum(PRIORIDADES).default('normal'),
    descripcion: z.string().trim().max(300).optional(),
    notas: z.string().trim().max(2000).optional(),
    motivoAutorizacion: z
      .string()
      .trim()
      .min(3, 'Indica el motivo de la autorización')
      .max(300),
    autorizadoPor: ID.optional(),
    items: z.array(ITEM_INTERNO).min(1, 'La orden interna requiere al menos un ítem').max(50),
  })
  .strict();

/** Liberar orden a producción (PLANIFICADA→LISTA). */
export const esquemaLiberarOrden = z
  .object({ ordenId: ID, actualizadoEn: FECHA_HORA })
  .strict();

/** Cierre administrativo al 100 % entregado. */
export const esquemaCerrarOrdenAdministrativa = z
  .object({ ordenId: ID, actualizadoEn: FECHA_HORA })
  .strict();

/** Ajustes operativos posteriores a la aceptación, solo antes de producción (DC-10). */
export const esquemaAjustarOrdenPostAceptacion = z
  .object({
    ordenId: ID,
    actualizadoEn: FECHA_HORA,
    motivo: z.string().trim().min(3, 'Indica el motivo del ajuste').max(500),
    cambios: z
      .object({
        fechaOperativa: FECHA_HORA.optional(),
        prioridad: z.enum(PRIORIDADES).optional(),
        notas: z.string().trim().max(2000).optional(),
      })
      .strict()
      .refine(
        (cambios) =>
          cambios.fechaOperativa !== undefined
          || cambios.prioridad !== undefined
          || cambios.notas !== undefined,
        'Indica al menos un cambio',
      ),
  })
  .strict();

export interface CrearOrdenDesdeRevisionInput {
  revisionId: string;
}

export interface CrearOrdenInternaInput {
  clienteId: string;
  fechaCompromiso: string;
  prioridad: (typeof PRIORIDADES)[number];
  descripcion?: string;
  notas?: string;
  motivoAutorizacion: string;
  autorizadoPor?: string;
  items: Array<z.infer<typeof ITEM_INTERNO>>;
}

export interface LiberarOrdenInput {
  ordenId: string;
  actualizadoEn: string;
}

export interface CerrarOrdenAdministrativaInput {
  ordenId: string;
  actualizadoEn: string;
}

export interface AjustarOrdenPostAceptacionInput {
  ordenId: string;
  actualizadoEn: string;
  motivo: string;
  cambios: z.infer<typeof esquemaAjustarOrdenPostAceptacion>['cambios'];
}

/** Valida que un estado de orden sea del contrato SII. */
export function esEstadoSiiOrden(valor: unknown): valor is (typeof ESTADOS_SII_ORDEN)[number] {
  return typeof valor === 'string' && (ESTADOS_SII_ORDEN as readonly string[]).includes(valor);
}
