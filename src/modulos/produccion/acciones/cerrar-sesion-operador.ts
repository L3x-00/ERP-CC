'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import {
  estaBloqueado,
  limpiarIntentos,
  obtenerIdentificadorSolicitante,
  registrarIntentoFallido,
} from '@/nucleo/autenticacion/limitar-intentos';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { confirmarPinDeOperador } from '@/nucleo/autenticacion/pin-operador';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  ErrorProduccion,
  cerrarSesionTrabajoServicio,
  mensajeErrorSesion,
  type CierreSesionRegistrado,
} from '@/modulos/produccion/servicios/indice';
import { esquemaCerrarSesion } from '@/modulos/produccion/validaciones/indice';

const MENSAJE_PIN_INVALIDO = 'Confirmación de operador no válida';
const MENSAJE_BLOQUEADO = 'Demasiados intentos. Intenta de nuevo más tarde.';

/** La cookie HMAC identifica al operador y el PIN vuelve a confirmar su cierre crítico. */
export async function cerrarSesionOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<CierreSesionRegistrado>> {
  const analisis = esquemaCerrarSesion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorConSesionActiva();
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  const identificador = await obtenerIdentificadorSolicitante();
  if (await estaBloqueado(identificador, 'pin')) {
    return { exito: false, error: MENSAJE_BLOQUEADO };
  }

  const pinConfirmado = await confirmarPinDeOperador(operador.id, analisis.data.pinConfirmacion);
  if (!pinConfirmado) {
    await registrarIntentoFallido(identificador, 'pin');
    await registrarLog(operador, 'confirmacion_cierre_sesion_rechazada', 'produccion', analisis.data.sesionId);
    return { exito: false, error: MENSAJE_PIN_INVALIDO };
  }
  await limpiarIntentos(identificador, 'pin');

  try {
    const sesion = await cerrarSesionTrabajoServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'cerrar_sesion_trabajo', 'produccion', sesion.id, {
      estadoDestino: analisis.data.estadoDestino,
      piezasProducidas: analisis.data.piezasProducidas,
      horasNetas: sesion.horasNetas,
      estadoPlaneacion: sesion.estadoPlaneacion,
    });
    return { exito: true, datos: sesion };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al cerrar sesión:', error);
    await registrarLog(operador, 'cierre_sesion_trabajo_rechazado', 'produccion', analisis.data.sesionId, {
      codigo,
      estadoDestino: analisis.data.estadoDestino,
    });
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
