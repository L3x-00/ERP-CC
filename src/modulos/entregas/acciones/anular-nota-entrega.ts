'use server';

import { randomUUID } from 'node:crypto';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorEntrega } from '@/modulos/entregas/servicios/errores-entrega';
import { esquemaAnularNotaEntrega } from '@/modulos/entregas/validaciones/esquemas-entregas';

export type ResultadoAnularNota = {
  notaId: string;
  estado: 'ANULADA';
  anuladaEn: string | null;
  yaAnulada: boolean;
  solicitudId: string;
};

/**
 * AUD-14: anulación administrativa de una nota de entrega. Exige administrador
 * activo y motivo; conserva el documento, registra responsable/fecha y es
 * idempotente por `solicitudId`. Si la nota tiene cobranza asociada, Postgres
 * rechaza la operación y aquí se explica por qué.
 */
export async function anularNotaEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoAnularNota>> {
  const analisis = esquemaAnularNotaEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (usuario.rol !== 'admin' || !(await can(usuario, 'entrega_generar'))) {
    return { exito: false, error: 'Solo un administrador puede anular una nota de entrega' };
  }

  const solicitudId = datos.solicitudId ?? randomUUID();
  const correlationId = nuevoCorrelationId();

  const { data, error } = await crearClienteSupabaseAdmin().rpc('anular_nota_entrega', {
    p_nota_id: datos.entregaId,
    p_motivo: datos.motivo,
    p_actor_id: usuario.id,
    p_solicitud_id: solicitudId,
    p_nota_sustituta_id: datos.notaSustitutaId ?? undefined,
  });

  if (error) {
    console.error('[ENTREGAS] Anulación rechazada:', error.message);
    await registrarLog(
      usuario,
      'anular_nota_entrega_rechazado',
      'entregas',
      datos.entregaId,
      { codigo: (error.message ?? 'sin_respuesta').slice(0, 120) },
      correlationId,
    );
    return { exito: false, error: traducirErrorEntrega(error.message ?? '') };
  }

  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila?.id) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  const resultado: ResultadoAnularNota = {
    notaId: fila.id,
    estado: 'ANULADA',
    anuladaEn: fila.anulada_en ?? null,
    yaAnulada: fila.ya_anulada === true,
    solicitudId,
  };

  await registrarLog(
    usuario,
    'anular_nota_entrega',
    'entregas',
    datos.entregaId,
    {
      motivo: datos.motivo,
      yaAnulada: resultado.yaAnulada,
      notaSustitutaId: datos.notaSustitutaId ?? null,
      solicitudId,
    },
    correlationId,
  );

  return { exito: true, datos: resultado };
}
