'use server';

import { randomUUID } from 'node:crypto';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorEntrega } from '@/modulos/entregas/servicios/errores-entrega';
import { esquemaRegistrarEntrega } from '@/modulos/entregas/validaciones/esquemas-entregas';

export type ResultadoRegistrarEntrega = {
  notaId: string;
  folio: string;
  folioSii: string | null;
  esParcial: boolean;
  creadoEn: string;
  renglones: number;
  yaExistia: boolean;
  solicitudId: string;
};

function leerTexto(datos: unknown, clave: string): string | null {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const valor = (datos as Record<string, unknown>)[clave];
  return typeof valor === 'string' ? valor : null;
}

function leerNumero(datos: unknown, clave: string): number | null {
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const valor = (datos as Record<string, unknown>)[clave];
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/**
 * SII-B7.1: registra una entrega parcial/total por ITxx con la RPC idempotente
 * `registrar_entrega`. El `solicitudId` se genera aquí cuando el cliente no lo
 * envía, y se devuelve para reintentos seguros.
 */
export async function registrarEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoRegistrarEntrega>> {
  const analisis = esquemaRegistrarEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'entrega_generar'))) {
    return { exito: false, error: 'Sin permiso para generar entregas' };
  }

  const solicitudId = datos.solicitudId ?? randomUUID();
  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();

  const renglones = datos.renglones.map((renglon) => ({
    partida_id: renglon.partidaId,
    cantidad_entregada: renglon.cantidadEntregada,
  }));

  const { data, error } = await admin.rpc('registrar_entrega', {
    p_orden_id: datos.ordenId,
    p_renglones: renglones as unknown as Json,
    p_recibido_por: datos.recibidoPor,
    p_contacto_id: datos.contactoId ?? undefined,
    p_entregado_por: datos.entregadoPor ?? undefined,
    p_solicitud_id: solicitudId,
    p_actor: usuario.id,
    p_correlation_id: correlationId,
  });

  if (error || data === null || typeof data !== 'object' || Array.isArray(data)) {
    console.error('[ENTREGAS] Registro rechazado:', error?.message);
    await registrarLog(
      usuario,
      'registrar_entrega_rechazado',
      'entregas',
      datos.ordenId,
      { codigo: (error?.message ?? 'sin_respuesta').slice(0, 120) },
      correlationId,
    );
    return {
      exito: false,
      error: traducirErrorEntrega(error?.message ?? '', error?.details ?? undefined),
    };
  }

  const notaId = leerTexto(data, 'notaId');
  const folio = leerTexto(data, 'folio');
  if (!notaId || !folio) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  const resultado: ResultadoRegistrarEntrega = {
    notaId,
    folio,
    folioSii: leerTexto(data, 'folioSii'),
    esParcial: (data as Record<string, unknown>).esParcial === true,
    creadoEn: leerTexto(data, 'creadoEn') ?? '',
    renglones: leerNumero(data, 'renglones') ?? renglones.length,
    yaExistia: (data as Record<string, unknown>).yaExistia === true,
    solicitudId,
  };

  await registrarLog(
    usuario,
    'registrar_entrega',
    'entregas',
    datos.ordenId,
    {
      notaId: resultado.notaId,
      folioSii: resultado.folioSii,
      esParcial: resultado.esParcial,
      renglones: resultado.renglones,
      yaExistia: resultado.yaExistia,
      solicitudId,
    },
    correlationId,
  );

  return { exito: true, datos: resultado };
}
