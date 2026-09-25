'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  configurarMetasProcesoPartidaServicio,
  ErrorOrden,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaConfigurarMetasProceso } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function configurarMetasProcesoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ partidaId: string; ordenActualizadoEn: string }>> {
  const analisis = esquemaConfigurarMetasProceso.safeParse(entrada);
  if (!analisis.success) return {
    exito: false,
    error: analisis.error.issues[0]?.message ?? 'Datos de procesos inválidos',
  };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'aprobar_ordenes'))) return {
    exito: false, error: 'Sin permiso para configurar procesos',
  };
  try {
    const datos = await configurarMetasProcesoPartidaServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data, actorId: usuario.id,
    });
    await registrarLog(usuario, 'configurar_metas_proceso', 'ordenes', datos.partidaId, {
      procesos: analisis.data.procesos.length,
    });
    return { exito: true, datos };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al configurar procesos:', error);
    await registrarLog(usuario, 'configuracion_procesos_rechazada', 'ordenes', analisis.data.partidaId, {
      codigo,
    });
    return { exito: false, error: (
      codigo === 'orden_desactualizada' ? 'La orden cambió; recarga antes de configurar procesos.'
        : codigo === 'orden_no_editable' ? 'La orden ya no está en borrador.'
          : codigo === 'partida_con_historial' ? 'La partida ya tiene programación o historial.'
            : codigo === 'sin_permiso_configurar_procesos' ? 'Tu permiso ya no está vigente.'
              : 'No se pudieron guardar los procesos.'
    ) };
  }
}
