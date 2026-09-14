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
 * Actualiza la cotización de una oportunidad existente. Usa el mismo servicio
 * transaccional que `crearCotizacionAccion` (reemplazo total de líneas); el
 * editor envía `actualizadoEnEsperado` para que la RPC rechace la escritura si
 * la oportunidad cambió desde que se cargó la pantalla.
 */
export async function actualizarCotizacionAccion(
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
