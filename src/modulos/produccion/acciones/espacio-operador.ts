'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerActorProduccion } from '@/modulos/produccion/acciones/utilidades-acciones';
import {
  ErrorProduccion,
  iniciarProcesoReclamadoServicio,
  liberarReclamoOperadorServicio,
  mensajeErrorSesion,
  moverReclamoOperadorServicio,
  reclamarProcesoOperadorServicio,
  type SesionIniciada,
} from '@/modulos/produccion/servicios/indice';
import {
  notificarInicioProcesoServicio,
  notificarSolicitudProgramacionServicio,
} from '@/modulos/produccion/servicios/notificaciones-produccion-servicio';
import type { ReclamoProcesoOperador } from '@/modulos/produccion/tipos/indice';
import {
  esquemaIniciarProcesoDirecto,
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
  const admin = crearClienteSupabaseAdmin();
  try {
    const reclamo = await reclamarProcesoOperadorServicio(admin, {
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
    await notificarSolicitudProgramacionServicio(admin, {
      ordenId: reclamo.ordenId,
      partidaId: reclamo.partidaId,
      operadorId: operador.id,
      operadorNombre: operador.nombreCompleto,
      reclamoId: reclamo.id,
    });
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
    // PLAN-2: avisa a Planeación que el operador ya está trabajando la orden.
    await notificarInicioProcesoServicio(crearClienteSupabaseAdmin(), {
      ordenId: sesion.ordenId,
      partidaId: sesion.partidaId,
      operadorId: operador.id,
      operadorNombre: operador.nombreCompleto,
      reclamoId: analisis.data.reclamoId,
    });
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

const esquemaValidarOcupacion = z.object({ reclamoId: z.uuid('ID de reclamo inválido') }).strict();

/**
 * Corrección obs: aviso anticipado de equipo ocupado. Solo lectura; la RPC de
 * inicio sigue siendo la autoridad final si la máquina se ocupa después.
 */
export async function validarOcupacionInicioAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ ocupadoPor: string | null }>> {
  const analisis = esquemaValidarOcupacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const operador = await obtenerOperadorParaMutacion(
    'validar_ocupacion_inicio',
    analisis.data.reclamoId,
  );
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  const { data, error } = await crearClienteSupabaseAdmin()
    .rpc('validar_ocupacion_inicio_reclamo', {
      p_reclamo_id: analisis.data.reclamoId,
      p_operador_id: operador.id,
    });
  if (error) return { exito: false, error: 'No se pudo verificar la disponibilidad del equipo' };
  return { exito: true, datos: { ocupadoPor: typeof data === 'string' && data.trim() !== '' ? data : null } };
}

const esquemaConsultarOcupacion = z.object({
  ordenId: z.uuid('Orden inválida'),
  partidaId: z.uuid('Ítem inválido'),
  metaProcesoId: z.uuid('Operación inválida').optional(),
  fecha: z.iso.date('Fecha inválida'),
  turno: z.enum(['matutino', 'vespertino', 'nocturno']).default('matutino'),
}).strict();

/** Aviso de solo lectura: ocupación del equipo antes de abrir cualquier checklist. */
export async function consultarOcupacionInicioAccion(
  entrada: unknown,
): Promise<RespuestaAccion<string | null>> {
  const analisis = esquemaConsultarOcupacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'Sesión de operador no válida' };
  const { data, error } = await crearClienteSupabaseAdmin().rpc('validar_ocupacion_inicio_operacion', {
    p_orden_id: analisis.data.ordenId,
    p_partida_id: analisis.data.partidaId,
    p_meta_proceso_id: analisis.data.metaProcesoId ?? null,
    p_operador_id: actor.id,
    p_fecha: analisis.data.fecha,
    p_turno: analisis.data.turno,
  });
  if (error) return { exito: false, error: error.message };
  return { exito: true, datos: typeof data === 'string' && data.trim() !== '' ? data : null };
}

/**
 * Inicio directo (obs. cliente): el operador no hace el paso de «reclamar».
 * La reserva se crea aquí con la RPC existente —jornada, área, exclusividad y
 * propiedad siguen validadas en PostgreSQL— y se libera si el inicio falla.
 */
export async function iniciarProcesoDirectoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SesionIniciada>> {
  const analisis = esquemaIniciarProcesoDirecto.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;
  const operador = await obtenerOperadorParaMutacion('iniciar_proceso_directo', datos.ordenId);
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  let reclamoId: string | null = null;
  try {
    const reclamo = await reclamarProcesoOperadorServicio(admin, {
      ordenId: datos.ordenId,
      partidaId: datos.partidaId,
      metaProcesoId: datos.metaProcesoId,
      fecha: datos.fecha,
      turno: datos.turno,
      operadorId: operador.id,
    });
    reclamoId = reclamo.id;

    const sesion = await iniciarProcesoReclamadoServicio(admin, {
      reclamoId: reclamo.id,
      operadorId: operador.id,
      ...(datos.verificacion ? { verificacion: datos.verificacion } : {}),
      ...(datos.corridaId ? { corridaId: datos.corridaId } : {}),
    });

    await registrarLog(operador, 'iniciar_proceso_directo', 'produccion', sesion.id, {
      ordenId: datos.ordenId,
      partidaId: datos.partidaId,
      reclamoId: reclamo.id,
    }, correlationId);
    await notificarInicioProcesoServicio(admin, {
      ordenId: sesion.ordenId,
      partidaId: sesion.partidaId,
      operadorId: operador.id,
      operadorNombre: operador.nombreCompleto,
      reclamoId: reclamo.id,
    });
    return { exito: true, datos: sesion };
  } catch (error) {
    if (reclamoId) {
      try {
        await liberarReclamoOperadorServicio(admin, { reclamoId, operadorId: operador.id });
      } catch {
        // La RPC de inicio ya revirtió la preparación; liberar es best-effort.
      }
    }
    await registrarLog(operador, 'inicio_proceso_directo_rechazado', 'produccion', datos.ordenId, {
      codigo: error instanceof ErrorProduccion ? error.codigo : 'desconocido',
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
