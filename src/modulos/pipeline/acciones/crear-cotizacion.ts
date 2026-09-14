'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import {
  guardarCotizacionServicio,
  mensajeErrorCotizacion,
} from '@/modulos/pipeline/servicios/cotizacion-servicio';
import { esquemaGuardarCotizacion } from '@/modulos/pipeline/validaciones/esquemas-cotizacion';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Guarda la cotización de una oportunidad con semántica de reemplazo total de
 * líneas, en una sola transacción (`guardar_cotizacion_atomica`). Comparte
 * servicio con `actualizarCotizacionAccion`: crear y actualizar son la misma
 * operación; se mantienen dos acciones porque un archivo `'use server'` solo
 * puede exportar Server Actions y ambos nombres ya están en uso.
 *
 * La autorización real (dueño/admin/`ver_pipeline_equipo`, usuario activo,
 * etapa abierta) vive dentro de la RPC, que resuelve la identidad con
 * `auth.uid()` del cliente de servidor del usuario.
 */
export async function crearCotizacionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ actualizadoEn: string; lineasGuardadas: number }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaGuardarCotizacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const servidor = await crearClienteSupabaseServidor();

  try {
    const guardada = await guardarCotizacionServicio(servidor, analisis.data);

    await registrarLog(usuario, 'guardar_cotizacion', 'pipeline', guardada.pipelineId, {
      lineas: guardada.lineasGuardadas,
    });

    return {
      exito: true,
      datos: {
        actualizadoEn: guardada.actualizadoEn,
        lineasGuardadas: guardada.lineasGuardadas,
      },
    };
  } catch (error) {
    return { exito: false, error: mensajeErrorCotizacion(error) };
  }
}
