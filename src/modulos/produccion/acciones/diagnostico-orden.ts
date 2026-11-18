'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  cerrarPausaHuerfanaServicio,
  obtenerDiagnosticoOrdenServicio,
  type DiagnosticoOrdenItem,
  type PausaHuerfanaCerrada,
} from '@/modulos/produccion/servicios/indice';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';
import {
  esquemaCerrarPausaHuerfana,
  esquemaConsultarOrdenConcluida,
} from '@/modulos/produccion/validaciones/indice';

/**
 * C23: el panel de salud se muestra en la ficha de una orden concluida, que
 * comparten Producción y Planeación. La lectura no muta datos.
 */
async function autorizarLectura() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false as const, error: 'No autorizado' };
  const permitido =
    (await can(usuario, 'gestionar_produccion'))
    || (await can(usuario, 'ver_planeacion'))
    || (await can(usuario, 'gestionar_planeacion'))
    || (await can(usuario, 'ver_finanzas'));
  if (!permitido) {
    return { exito: false as const, error: 'Sin permiso para consultar el diagnóstico' };
  }
  return { exito: true as const, usuario };
}

/** C23: inconsistencias accionables de una orden (solo lectura). */
export async function obtenerDiagnosticoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DiagnosticoOrdenItem[]>> {
  const analisis = esquemaConsultarOrdenConcluida.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const autorizacion = await autorizarLectura();
  if (!autorizacion.exito) return autorizacion;

  try {
    const datos = await obtenerDiagnosticoOrdenServicio(
      crearClienteSupabaseAdmin(),
      analisis.data.ordenId,
    );
    return { exito: true, datos };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar el diagnóstico de la orden:', error);
    return { exito: false, error: 'No se pudo consultar la consistencia de la orden' };
  }
}

/**
 * C23: cierra una pausa huérfana de una orden terminada. Solo un administrador
 * con `gestionar_produccion`; la RPC conserva o descarta el tiempo y deja el
 * evento en la bitácora de la orden.
 */
export async function cerrarPausaHuerfanaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<PausaHuerfanaCerrada>> {
  const analisis = esquemaCerrarPausaHuerfana.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (usuario.rol !== 'admin' || !(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Solo un administrador puede cerrar pausas administrativas' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const cierre = await cerrarPausaHuerfanaServicio(crearClienteSupabaseAdmin(), {
      sesionId: analisis.data.sesionId,
      actorId: usuario.id,
      conservarTiempo: analisis.data.conservarTiempo,
      horasReales: analisis.data.horasReales ?? null,
      motivo: analisis.data.motivo ?? null,
      correlationId,
    });
    await registrarLog(
      usuario,
      'cerrar_pausa_huerfana_administrativa',
      'produccion',
      cierre.id,
      {
        conservarTiempo: analisis.data.conservarTiempo,
        horasNetas: cierre.horasNetas,
        estadoPlaneacion: cierre.estadoPlaneacion,
        tiempoRealMinutos: cierre.tiempoRealMinutos,
      },
      correlationId,
    );
    return { exito: true, datos: cierre };
  } catch (error) {
    console.error('[PRODUCCION] Error al cerrar pausa huérfana:', error);
    await registrarLog(
      usuario,
      'cerrar_pausa_huerfana_rechazada',
      'produccion',
      analisis.data.sesionId,
      { conservarTiempo: analisis.data.conservarTiempo },
      correlationId,
    );
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
