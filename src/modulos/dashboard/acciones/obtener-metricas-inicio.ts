'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerDashboardPorRol } from '@/modulos/dashboard/servicios/indice';
import type { DashboardConsolidado } from '@/modulos/dashboard/tipos/indice';
import { esquemaFiltroPeriodo } from '@/modulos/dashboard/validaciones/indice';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

async function ejecutarConsultaDashboard(entrada: unknown): Promise<RespuestaAccion<DashboardConsolidado>> {
  const analisis = esquemaFiltroPeriodo.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const permisoDashboard = usuario.rol === 'contador'
    ? 'ver_finanzas'
    : usuario.rol === 'gerente'
      ? 'ver_pipeline_equipo'
      : usuario.rol === 'vendedor'
        ? 'ver_clientes'
        : null;
  if (permisoDashboard && !(await can(usuario, permisoDashboard))) {
    return { exito: false, error: 'Sin permiso para consultar el dashboard' };
  }

  try {
    const datos = await obtenerDashboardPorRol(
      usuario.id,
      usuario.rol,
      usuario.permisos,
      analisis.data,
      crearClienteSupabaseAdmin(),
    );
    await registrarLog(usuario, 'consultar_dashboard', 'dashboard', usuario.id, {
      periodoTipo: analisis.data.periodoTipo,
      fechaInicio: analisis.data.fechaInicio,
      fechaFin: analisis.data.fechaFin,
      secciones: Object.keys(datos).filter((clave) => !['rol', 'filtro', 'tarjetas'].includes(clave)),
    });
    return { exito: true, datos };
  } catch (error) {
    console.error('[DASHBOARD] Error al consolidar métricas:', error);
    await registrarLog(usuario, 'consulta_dashboard_rechazada', 'dashboard', usuario.id, {
      periodoTipo: analisis.data.periodoTipo,
    });
    return { exito: false, error: 'No se pudieron consultar las métricas' };
  }
}

/** Consulta inicial: la sesión y todos los permisos se resuelven en servidor. */
export async function obtenerMetricasInicioAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DashboardConsolidado>> {
  return ejecutarConsultaDashboard(entrada);
}

/** Reevalúa el mismo contrato cuando el usuario cambia el periodo global. */
export async function cambiarPeriodoDashboardAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DashboardConsolidado>> {
  return ejecutarConsultaDashboard(entrada);
}
