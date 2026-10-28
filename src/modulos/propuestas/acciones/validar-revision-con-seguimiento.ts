'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { mensajeBloqueoValidacion } from '@/modulos/propuestas/servicios/faltantes-validacion';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaValidarConSeguimiento } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerTexto,
  comoJson,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoValidarConSeguimiento = {
  revisionId: string;
  estado: EstadoPropuesta;
  /** `false` cuando ya existía un seguimiento idéntico (reintento sin duplicar). */
  seguimientoRegistrado: boolean;
};

/**
 * Obs. cliente 2026-10-11: «Validar» exige la próxima acción en el mismo flujo.
 * Registra el seguimiento y después valida la revisión (DRAFT → READY_TO_SEND).
 *
 * Orden obligado: la RPC de seguimiento solo admite DRAFT/SENT/FOLLOW_UP y
 * validar deja la revisión en READY_TO_SEND; por eso se registra primero y se
 * relee el token CAS antes de validar. Un reintento tras un bloqueo de
 * validación no duplica un seguimiento idéntico al último registrado.
 *
 * Obs. cliente 2026-10-13: la propuesta debe estar completa (ítem, ruteo
 * costeado por proceso y archivo) ANTES de registrar la próxima acción; así una
 * propuesta incompleta no deja seguimientos huérfanos.
 */
export async function validarRevisionConSeguimientoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoValidarConSeguimiento>> {
  const analisis = esquemaValidarConSeguimiento.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;
  if (datos.fecha < hoyIso()) {
    return { exito: false, error: 'La fecha de la próxima acción no puede ser anterior a hoy' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { data: revision, error: errorRevision } = await admin
    .from('propuesta_revisiones')
    .select('estado, actualizado_en')
    .eq('id', datos.revisionId)
    .maybeSingle();
  if (errorRevision || !revision) {
    return { exito: false, error: 'La revisión no existe' };
  }
  if (revision.estado !== 'DRAFT') {
    return { exito: false, error: 'La revisión ya no está en borrador; recarga la ficha' };
  }
  if (revision.actualizado_en !== datos.actualizadoEn) {
    return { exito: false, error: 'La revisión cambió; recarga la ficha antes de reintentar' };
  }

  const { data: ultima } = await admin
    .from('propuesta_revision_acciones')
    .select('codigo, texto_otro, fecha')
    .eq('revision_id', datos.revisionId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  const esDuplicado =
    ultima !== null
    && ultima.codigo === datos.codigo
    && (ultima.texto_otro ?? '') === (datos.textoOtro ?? '')
    && ultima.fecha === datos.fecha;

  const verificarContenido = (admin: Parameters<typeof mensajeBloqueoValidacion>[0]) =>
    mensajeBloqueoValidacion(admin, datos.revisionId);

  let token = revision.actualizado_en;
  let seguimientoRegistrado = false;
  if (!esDuplicado) {
    const registro = await ejecutarRpcPropuesta(
      {
        permiso: 'propuesta_seguimiento',
        rpc: 'registrar_seguimiento_propuesta',
        args: {
          p_revision_id: datos.revisionId,
          p_datos: comoJson({
            actualizado_en: token,
            codigo: datos.codigo,
            ...(datos.textoOtro !== undefined ? { texto_otro: datos.textoOtro } : {}),
            fecha: datos.fecha,
            ...(datos.canal !== undefined ? { canal: datos.canal } : {}),
            ...(datos.nota !== undefined ? { nota: datos.nota } : {}),
          }),
        },
        accion: 'validar_revision_seguimiento',
        detalles: { revisionId: datos.revisionId, codigo: datos.codigo, fecha: datos.fecha },
        verificarAntes: verificarContenido,
      },
      datos.revisionId,
    );
    if (!registro.exito) return registro;
    seguimientoRegistrado = true;

    const { data: fresca } = await admin
      .from('propuesta_revisiones')
      .select('actualizado_en')
      .eq('id', datos.revisionId)
      .maybeSingle();
    token = fresca?.actualizado_en ?? token;
  }

  const validacion = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_validar',
      rpc: 'validar_revision',
      args: {
        p_revision_id: datos.revisionId,
        p_datos: comoJson({ actualizado_en: token }),
      },
      accion: 'validar_revision',
      detalles: { revisionId: datos.revisionId, seguimientoRegistrado },
      // Si el seguimiento se registró arriba ya se comprobó; en el reintento sin
      // seguimiento nuevo esta es la primera (y única) comprobación.
      ...(esDuplicado ? { verificarAntes: verificarContenido } : {}),
    },
    datos.revisionId,
  );
  if (!validacion.exito) return validacion;

  const estado = leerTexto(validacion.datos, 'estado') as EstadoPropuesta | null;
  if (!estado) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }
  return {
    exito: true,
    datos: { revisionId: datos.revisionId, estado, seguimientoRegistrado },
  };
}
