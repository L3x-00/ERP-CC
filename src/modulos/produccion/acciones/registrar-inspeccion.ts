'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarInspeccionServicio } from '@/modulos/produccion/servicios/calidad-servicio';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';
import type { InspeccionCalidad } from '@/modulos/produccion/tipos/corridas';
import { esquemaRegistrarInspeccion } from '@/modulos/produccion/validaciones/corridas';

import { obtenerActorProduccion } from './utilidades-acciones';

/**
 * SII-B6.3: registra una inspección de primera pieza, referencia de lote o
 * cierre. La primera pieza exige `calidad_liberar_primera_pieza`; el resto,
 * `calidad_inspeccionar` (el servidor revalida el permiso).
 */
export async function registrarInspeccionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<InspeccionCalidad>> {
  const resultado = esquemaRegistrarInspeccion.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };

  const permiso = resultado.data.tipo === 'PRIMERA_PIEZA'
    ? 'calidad_liberar_primera_pieza'
    : 'calidad_inspeccionar';
  if (!(await can(actor, permiso))) {
    return { exito: false, error: 'Sin permiso para registrar inspecciones de calidad' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const inspeccion = await registrarInspeccionServicio(crearClienteSupabaseAdmin(), {
      ...resultado.data,
      actorId: actor.id,
      correlationId,
    });
    await registrarLog(actor, 'registrar_inspeccion', 'produccion', inspeccion.ordenId, {
      tipo: inspeccion.tipo,
      resultado: inspeccion.resultado,
      codigoItem: inspeccion.codigoItem,
      ...(inspeccion.referencia !== null ? { referencia: inspeccion.referencia } : {}),
    }, correlationId);
    return { exito: true, datos: inspeccion };
  } catch (error) {
    console.error('[PRODUCCION] Error al registrar inspección:', error);
    await registrarLog(actor, 'registrar_inspeccion_rechazado', 'produccion', resultado.data.ordenId, {
      codigo: error instanceof Error ? error.message.slice(0, 120) : 'desconocido',
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
