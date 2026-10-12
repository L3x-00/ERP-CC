'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrdenSii,
  codigoErrorOrdenSii,
  crearOrdenDesdeRevisionServicio,
} from '@/modulos/ordenes/servicios/orden-sii-servicio';
import type { OrdenSiiCreada } from '@/modulos/ordenes/tipos/orden-sii';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaAceptarRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerTexto,
  comoJson,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoAceptarRevision = {
  revisionId: string;
  estado: EstadoPropuesta;
  acceptedRevisionId: string | null;
  /** Intento inmediato de Orden: `null` cuando todavía queda «Orden pendiente». */
  orden: OrdenSiiCreada | null;
};

/**
 * SII-B4.10 + C4.1/DC-09: acepta la revisión exacta (SENT/FOLLOW_UP) y fija
 * `accepted_revision_id`; puede ser una revisión anterior a la última. La misma
 * RPC crea la solicitud durable de Orden y, acto seguido, la aceptación dispara
 * el intento inmediato e idempotente (obs. cliente 2026-10-12: la propuesta
 * aceptada llega sola a Órdenes, sin depender de `orden_liberar` del actor).
 * Un gate fallido deja la solicitud BLOCKED con causa y no revierte la
 * aceptación; el panel de la ficha ofrece «Reintentar» sin duplicar la Orden.
 */
export async function aceptarRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoAceptarRevision>> {
  const analisis = esquemaAceptarRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_aceptar',
      rpc: 'aceptar_revision',
      args: {
        p_revision_id: datos.revisionId,
        p_datos: comoJson({
          actualizado_en: datos.actualizadoEn,
          fecha_compromiso_comercial: datos.fechaCompromisoComercial,
          ...(datos.canal !== undefined ? { canal: datos.canal } : {}),
          ...(datos.destino !== undefined ? { destino: datos.destino } : {}),
        }),
      },
      accion: 'aceptar_revision',
      detalles: { revisionId: datos.revisionId },
    },
    datos.revisionId,
  );
  if (!respuesta.exito) return respuesta;

  const estado = leerTexto(respuesta.datos, 'estado') as EstadoPropuesta | null;
  if (!estado) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  const orden = await intentarOrdenInmediata(datos.revisionId);

  return {
    exito: true,
    datos: {
      revisionId: datos.revisionId,
      estado,
      acceptedRevisionId: leerTexto(respuesta.datos, 'acceptedRevisionId'),
      orden,
    },
  };
}

/**
 * Intento inmediato de creación de la Orden tras aceptar. Obs. cliente
 * 2026-10-12: la aceptación (ya autorizada por `propuesta_aceptar`) siempre
 * intenta crear la Orden; la RPC revalida que el actor pueda liberar o aceptar.
 * Si un gate falla, la solicitud queda BLOCKED y la aceptación se conserva —
 * este helper NUNCA revierte ni falla la aceptación.
 */
async function intentarOrdenInmediata(revisionId: string): Promise<OrdenSiiCreada | null> {
  try {
    const usuario = await obtenerUsuarioServidor();
    if (!usuario) {
      return null;
    }
    const correlationId = nuevoCorrelationId();
    const orden = await crearOrdenDesdeRevisionServicio(crearClienteSupabaseAdmin(), {
      revisionId,
      actorId: usuario.id,
      correlationId,
    });
    await registrarLog(
      usuario,
      'crear_orden_desde_revision',
      'ordenes',
      orden.id,
      { folio: orden.folio, folioSii: orden.folioSii, revisionId, automatica: true },
      correlationId,
    );
    return orden;
  } catch (error) {
    const codigo = error instanceof ErrorOrdenSii ? error.codigo : codigoErrorOrdenSii(String(error));
    console.warn('[PROPUESTAS] Orden pendiente tras aceptar:', codigo);
    return null;
  }
}
