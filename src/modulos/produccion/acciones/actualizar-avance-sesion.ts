'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import {
  estaBloqueado,
  limpiarIntentos,
  obtenerIdentificadorSolicitante,
  registrarIntentoFallido,
} from '@/nucleo/autenticacion/limitar-intentos';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { confirmarPinDeOperador } from '@/nucleo/autenticacion/pin-operador';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  ErrorProduccion,
  actualizarAvanceSesionServicio,
  mensajeErrorSesion,
} from '@/modulos/produccion/servicios/indice';
import { esquemaActualizarAvanceSesion } from '@/modulos/produccion/validaciones/indice';

type AvanceActualizado = Awaited<ReturnType<typeof actualizarAvanceSesionServicio>>;

const MENSAJE_PIN_INVALIDO = 'Confirmación de operador no válida';
const MENSAJE_BLOQUEADO = 'Demasiados intentos. Intenta de nuevo más tarde.';

/**
 * C20: corrige piezas y hora real de una pausa automática por jornada.
 * El operador dueño confirma con PIN; un administrador con
 * `gestionar_produccion` puede corregir sin PIN, igual que cierra sesiones
 * ajenas. El cierre administrativo normal queda intacto.
 */
export async function actualizarAvanceSesionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AvanceActualizado>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaActualizarAvanceSesion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  const esAdministrador = Boolean(
    usuario && usuario.rol === 'admin' && await can(usuario, 'gestionar_produccion'),
  );

  let actor: UsuarioAutenticado;
  if (esAdministrador && usuario) {
    actor = usuario;
  } else {
    const operador = await obtenerOperadorParaMutacion(
      'actualizar_avance_sesion',
      analisis.data.sesionId,
    );
    if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

    const identificador = await obtenerIdentificadorSolicitante();
    if (await estaBloqueado(identificador, 'pin')) {
      return { exito: false, error: MENSAJE_BLOQUEADO };
    }
    const pin = analisis.data.pinConfirmacion;
    if (!pin || !await confirmarPinDeOperador(operador.id, pin)) {
      await registrarIntentoFallido(identificador, 'pin');
      await registrarLog(operador, 'actualizacion_avance_pin_rechazada', 'produccion',
        analisis.data.sesionId, undefined, correlationId);
      return { exito: false, error: MENSAJE_PIN_INVALIDO };
    }
    await limpiarIntentos(identificador, 'pin');
    actor = operador;
  }

  try {
    const avance = await actualizarAvanceSesionServicio(crearClienteSupabaseAdmin(), {
      sesionId: analisis.data.sesionId,
      actorId: actor.id,
      piezasProducidas: analisis.data.piezasProducidas,
      horasARestar: analisis.data.horasARestar,
      notas: analisis.data.notas,
    });
    await registrarLog(actor, 'actualizar_avance_sesion', 'produccion', avance.id, {
      sesionId: analisis.data.sesionId,
      piezasProducidas: analisis.data.piezasProducidas,
      horasARestar: analisis.data.horasARestar,
      estadoSesion: avance.estadoSesion,
      estadoPlaneacion: avance.estadoPlaneacion,
      esAdministrador,
    }, correlationId);
    return { exito: true, datos: avance };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al actualizar avance de sesión:', error);
    await registrarLog(actor, 'actualizacion_avance_rechazada', 'produccion',
      analisis.data.sesionId, { codigo }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error), codigo };
  }
}
