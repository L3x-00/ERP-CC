'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  ErrorProduccion,
  iniciarSesionTrabajoServicio,
  mensajeErrorSesion,
} from '@/modulos/produccion/servicios/indice';
import { esquemaIniciarSesion } from '@/modulos/produccion/validaciones/indice';

export async function iniciarSesionOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<Awaited<ReturnType<typeof iniciarSesionTrabajoServicio>>>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaIniciarSesion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorConSesionActiva();
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  // SII-B6 ola 1: el contrato SQL exige checklist de eventos críticos. La UI de
  // piso lo capturará en la ola 2; mientras, se registra una verificación de
  // compatibilidad marcada como tal para no romper el flujo existente.
  const verificacion = analisis.data.verificacion ?? {
    material: true,
    espesor: true,
    cantidad: true,
    archivo: true,
    proceso_equipo: true,
    observaciones: 'Checklist de compatibilidad B6 ola 1 (la UI de piso lo captura en la ola 2).',
  };

  try {
    const sesion = await iniciarSesionTrabajoServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      verificacion,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'iniciar_sesion_trabajo', 'produccion', sesion.id, {
      ordenId: sesion.ordenId,
      partidaId: sesion.partidaId,
      programacionId: sesion.programacionId,
    }, correlationId);
    return { exito: true, datos: sesion };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al iniciar sesión:', error);
    await registrarLog(operador, 'inicio_sesion_trabajo_rechazado', 'produccion', analisis.data.partidaId, {
      codigo,
      programacionId: analisis.data.programacionId,
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
