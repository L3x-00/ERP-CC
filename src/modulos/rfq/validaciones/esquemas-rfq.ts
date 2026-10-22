import { z } from 'zod';

import { campoRutaSubida, camposPrepararSubida } from '@/nucleo/almacenamiento/archivos/esquemas-subida';

import { ACCIONES_RFQ, MAXIMO_RFQ_VALIDACION_LOTE } from '../tipos/indice';
import { VALORES_RESULTADO_PROXIMA_ACCION } from '../utilidades/proxima-accion';

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

/** Próxima acción que acompaña una transición no terminal (C2.2/DC-06). */
export const esquemaProximaAccionTransicion = z
  .object({
    codigo: z.string().trim().min(1, 'Elige la próxima acción').max(50),
    texto: z.string().trim().max(300).optional(),
    fecha: z.iso.date({ message: 'Indica la fecha de la próxima acción' }),
    responsableId: z.uuid({ message: 'Elige el responsable de la próxima acción' }),
  })
  .strict();

const ACCIONES_TERMINALES_RFQ = ['cerrar', 'cancelar'] as const;

/** Las transiciones terminales piden motivo; el resto, la próxima acción. */
export function esAccionTerminalRfq(accion: (typeof ACCIONES_RFQ)[number]): boolean {
  return (ACCIONES_TERMINALES_RFQ as readonly string[]).includes(accion);
}

/** Entrada de `cambiarEstadoRfqAccion`. */
export const esquemaCambiarEstadoRfq = z
  .object({
    rfqId: z.uuid(),
    accion: z.enum(ACCIONES_RFQ),
    motivo: z.string().trim().min(3).max(300).optional(),
    proximaAccion: esquemaProximaAccionTransicion.optional(),
    // Obs. cliente 2026-10-21: cambiar de estado no obliga a capturar otra acción
    // si la vigente sigue teniendo sentido; el servidor la conserva tal cual.
    mantenerProximaAccion: z.literal(true).optional(),
    // Cómo terminó la acción vigente cuando se sustituye por otra.
    resultadoProximaAccion: z.enum(VALORES_RESULTADO_PROXIMA_ACCION).optional(),
    actualizadoEn: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((entrada) => !esAccionTerminalRfq(entrada.accion) || Boolean(entrada.motivo), {
    message: 'El motivo es obligatorio',
    path: ['motivo'],
  })
  .refine(
    (entrada) =>
      esAccionTerminalRfq(entrada.accion)
      || Boolean(entrada.proximaAccion) !== Boolean(entrada.mantenerProximaAccion),
    {
      message: 'Indica la próxima acción o deja la actual como está',
      path: ['proximaAccion'],
    },
  )
  .refine((entrada) => !entrada.mantenerProximaAccion || !entrada.resultadoProximaAccion, {
    message: 'Si la acción actual se deja como está, no lleva resultado',
    path: ['resultadoProximaAccion'],
  });

/** Entrada de `cancelarItemRfqAccion`. */
export const esquemaCancelarItemRfq = z
  .object({
    itemId: z.uuid(),
    motivo: z.string().trim().max(300).optional(),
  })
  .strict();

/** Entrada de lectura de un RFQ. */
export const esquemaObtenerRfq = z.object({ rfqId: z.uuid() }).strict();

/** Entrada de lectura del contacto principal del cliente (Solicitud del RFQ). */
export const esquemaObtenerContactoPrincipalRfq = z.object({ clienteId: z.uuid() }).strict();

/** Entrada para vincular el contacto vigente del cliente a un RFQ existente. */
export const esquemaVincularContactoRfq = z.object({ rfqId: z.uuid() }).strict();

/**
 * Entrada para asegurar un contacto del cliente desde el RFQ: si el cliente no
 * tiene filas en `contactos_cliente`, se crea una con estos datos.
 */
export const esquemaAsegurarContactoRfq = z
  .object({
    clienteId: z.uuid(),
    nombre: z.string().trim().min(1, 'Escribe el nombre del contacto').max(120),
    correo: z.email({ message: 'El correo no es válido' }).max(200).nullish(),
    telefono: z.string().trim().max(40).nullish(),
  })
  .strict();

/** Entrada de validación LISTO. */
export const esquemaValidarRfqListo = z.object({ rfqId: z.uuid() }).strict();

/** Entrada de validación LISTO en lote (indicador de captura de la cola RFQ). */
export const esquemaValidarRfqsListoLote = z
  .object({ rfqIds: z.array(z.uuid()).min(1).max(MAXIMO_RFQ_VALIDACION_LOTE) })
  .strict();

/** Fecha ISO simple `YYYY-MM-DD`. */
const fechaDia = z.iso.date();

/**
 * Datos generales y de seguimiento del RFQ (ficha → Resumen). Todos los campos
 * son opcionales/nullable: la validación LISTO decide si alcanzan.
 */
export const esquemaDatosGeneralesRfq = z
  .object({
    rfqId: z.uuid(),
    actualizadoEn: z.iso.datetime({ offset: true }),
    canal: z.string().trim().max(49).nullish(),
    canalDetalle: z.string().trim().max(300).nullish(),
    fechaSolicitud: fechaDia.nullish(),
    // Opcional e informativa; ausente (`undefined`) conserva la guardada.
    fechaRequeridaCliente: fechaDia.nullish(),
    // Plazo comercial en texto libre; ausente (`undefined`) conserva el guardado.
    plazoComercial: z.string().trim().max(120, 'El plazo admite máximo 120 caracteres').nullish(),
    descripcionGeneral: z.string().trim().max(2000).nullish(),
    contactoId: z.uuid().nullish(),
    responsableId: z.uuid().nullish(),
    proximaAccionCodigo: z.string().trim().max(40).nullish(),
    proximaAccionTexto: z.string().trim().max(300).nullish(),
    fechaProximaAccion: fechaDia.nullish(),
    responsableProximaAccionId: z.uuid().nullish(),
    // Obs. cliente 2026-10-21: si el Resumen sustituye la acción vigente, se
    // registra cómo terminó. El servidor exige el resultado solo en ese caso.
    resultadoProximaAccion: z.enum(VALORES_RESULTADO_PROXIMA_ACCION).optional(),
  })
  .strict()
  .refine(
    (entrada) =>
      entrada.proximaAccionCodigo !== 'OTHER' ||
      (entrada.proximaAccionTexto !== null && entrada.proximaAccionTexto !== undefined),
    { message: 'La próxima acción "Otro" exige detalle', path: ['proximaAccionTexto'] },
  );

/** Entrada de subida de archivo del RFQ (general o por ítem). */
const destinoArchivoRfq = {
  rfqId: z.uuid(),
  itemId: z.uuid().optional(),
  clase: z.enum(['CAD', 'DIBUJO', 'IMAGEN', 'ESPECIFICACIONES', 'OTROS']),
  nombre: z.string().trim().min(1).max(250),
};

/** Metadatos para preparar la subida directa (H-B1-29): el binario no pasa por la acción. */
export const esquemaPrepararArchivoRfq = z
  .object({ ...destinoArchivoRfq, ...camposPrepararSubida })
  .strict();

/** Confirmación de una subida directa ya completada en Storage. */
export const esquemaConfirmarArchivoRfq = z
  .object({ ...destinoArchivoRfq, ...campoRutaSubida })
  .strict();

/** Entrada de lectura de archivos del RFQ. */
export const esquemaListarArchivosRfq = z.object({ rfqId: z.uuid() }).strict();

/** Entrada para firmar la lectura de un archivo. */
export const esquemaFirmarArchivoRfq = z.object({ rfqId: z.uuid(), archivoId: z.uuid() }).strict();

export type DatosGeneralesRfqInput = z.infer<typeof esquemaDatosGeneralesRfq>;
export type PrepararArchivoRfqInput = z.infer<typeof esquemaPrepararArchivoRfq>;
export type ConfirmarArchivoRfqInput = z.infer<typeof esquemaConfirmarArchivoRfq>;

export type DatosItemRfqInput = z.infer<typeof esquemaDatosItemRfq>;
export type GuardarItemRfqInput = z.infer<typeof esquemaGuardarItemRfq>;
export type CambiarEstadoRfqInput = z.infer<typeof esquemaCambiarEstadoRfq>;
export type ProximaAccionTransicionInput = z.infer<typeof esquemaProximaAccionTransicion>;
