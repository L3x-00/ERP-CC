'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  ErrorProduccion,
  cerrarSesionTrabajoServicio,
  mensajeErrorSesion,
  type CierreSesionRegistrado,
} from '@/modulos/produccion/servicios/indice';
import { esquemaCerrarSesionSupervisor } from '@/modulos/produccion/validaciones/indice';

/**
 * Cierre excepcional por administrador. La sesión pertenece al operador: el
 * servidor resuelve su id y nunca acepta un operador elegido por el navegador.
 * El PIN del operador no se solicita; el permiso de administración y PostgreSQL
 * conservan las reglas de cierre.
 */
export async function cerrarSesionSupervisorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<CierreSesionRegistrado>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaCerrarSesionSupervisor.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (usuario.rol !== 'admin' || !(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Solo un administrador puede cerrar la sesión de un operador' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { data: sesion, error: errorSesion } = await admin
    .from('sesiones_trabajo')
    .select('id, operador_id, orden_id, estado_sesion')
    .eq('id', analisis.data.sesionId)
    .maybeSingle();
  if (errorSesion) return { exito: false, error: 'No se pudo cargar la sesión' };
  if (!sesion) return { exito: false, error: 'La sesión ya no existe' };
  if (sesion.estado_sesion !== 'activa' && sesion.estado_sesion !== 'pausada') {
    return { exito: false, error: 'La sesión ya fue cerrada' };
  }
  if (!sesion.operador_id) {
    return { exito: false, error: 'La sesión no tiene un operador asociado' };
  }

  try {
    const cierre = await cerrarSesionTrabajoServicio(admin, {
      ...analisis.data,
      operadorId: sesion.operador_id,
    });
    await registrarLog(usuario, 'cerrar_sesion_trabajo_supervisor', 'produccion', cierre.id, {
      sesionId: analisis.data.sesionId,
      operadorId: sesion.operador_id,
      estadoDestino: analisis.data.estadoDestino,
      piezasProducidas: analisis.data.piezasProducidas,
      horasNetas: cierre.horasNetas,
      estadoPlaneacion: cierre.estadoPlaneacion,
    }, correlationId);
    return { exito: true, datos: cierre };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al cerrar sesión como administrador:', error);
    await registrarLog(usuario, 'cierre_sesion_supervisor_rechazado', 'produccion', analisis.data.sesionId, {
      codigo,
      operadorId: sesion.operador_id,
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error), codigo };
  }
}
