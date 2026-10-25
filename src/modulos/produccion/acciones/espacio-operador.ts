'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  ErrorProduccion,
  iniciarProcesoReclamadoServicio,
  liberarReclamoOperadorServicio,
  mensajeErrorSesion,
  moverReclamoOperadorServicio,
  reclamarProcesoOperadorServicio,
  type SesionIniciada,
} from '@/modulos/produccion/servicios/indice';
import type { ReclamoProcesoOperador } from '@/modulos/produccion/tipos/indice';
import {
  esquemaIniciarProcesoReclamado,
  esquemaLiberarReclamo,
  esquemaMoverReclamo,
  esquemaReclamarProceso,
} from '@/modulos/produccion/validaciones/indice';

/**
 * C10: acciones del espacio de operador. La cookie HMAC identifica al operador
 * de piso; una vista delegada de administrador queda bloqueada para escritura.
 * Capacidad de 8 h, exclusividad y área habilitada las valida PostgreSQL.
 */

export async function reclamarProcesoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ReclamoProcesoOperador>> {
  const analisis = esquemaReclamarProceso.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'reclamar_proceso_operador',
    analisis.data.partidaId,
  );
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  const correlationId = nuevoCorrelationId();
  try {
    const reclamo = await reclamarProcesoOperadorServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'reclamar_proceso_operador', 'produccion', reclamo.id, {
      ordenId: reclamo.ordenId,
      partidaId: reclamo.partidaId,
      metaProcesoId: reclamo.metaProcesoId,
      fecha: reclamo.fecha,
      turno: reclamo.turno,
      horasEstimadas: reclamo.horasEstimadas,
    }, correlationId);
    return { exito: true, datos: reclamo };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al reclamar proceso:', error);
    await registrarLog(operador, 'reclamo_proceso_rechazado', 'produccion', analisis.data.partidaId, {
      codigo,
      fecha: analisis.data.fecha,
      metaProcesoId: analisis.data.metaProcesoId,
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}

export async function moverReclamoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ReclamoProcesoOperador>> {
  const analisis = esquemaMoverReclamo.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'mover_reclamo_operador',
    analisis.data.reclamoId,
  );
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  const correlationId = nuevoCorrelationId();
  try {
    const reclamo = await moverReclamoOperadorServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'mover_reclamo_operador', 'produccion', reclamo.id, {
      fecha: reclamo.fecha,
      turno: reclamo.turno,
      horasEstimadas: reclamo.horasEstimadas,
    }, correlationId);
    return { exito: true, datos: reclamo };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al mover reclamo:', error);
    await registrarLog(operador, 'mover_reclamo_rechazado', 'produccion', analisis.data.reclamoId, {
      codigo,
      fecha: analisis.data.fecha,
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}

export async function liberarReclamoAccion(entrada: unknown): Promise<RespuestaAccion<true>> {
  const analisis = esquemaLiberarReclamo.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'liberar_reclamo_operador',
    analisis.data.reclamoId,
  );
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  const correlationId = nuevoCorrelationId();
  try {
    await liberarReclamoOperadorServicio(crearClienteSupabaseAdmin(), {
      reclamoId: analisis.data.reclamoId,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'liberar_reclamo_operador', 'produccion', analisis.data.reclamoId, undefined, correlationId);
    return { exito: true, datos: true };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al liberar reclamo:', error);
    await registrarLog(operador, 'liberar_reclamo_rechazado', 'produccion', analisis.data.reclamoId, {
      codigo,
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}

export async function iniciarProcesoReclamadoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SesionIniciada>> {
  const analisis = esquemaIniciarProcesoReclamado.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'iniciar_proceso_reclamado',
    analisis.data.reclamoId,
  );
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  const correlationId = nuevoCorrelationId();
  try {
    const sesion = await iniciarProcesoReclamadoServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'iniciar_proceso_reclamado', 'produccion', sesion.id, {
      reclamoId: analisis.data.reclamoId,
      ordenId: sesion.ordenId,
      partidaId: sesion.partidaId,
      programacionId: sesion.programacionId,
    }, correlationId);
    return { exito: true, datos: sesion };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al iniciar proceso reclamado:', error);
    await registrarLog(operador, 'inicio_proceso_reclamado_rechazado', 'produccion', analisis.data.reclamoId, {
      codigo,
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
