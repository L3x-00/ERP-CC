'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
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

const MENSAJE_SESION_INVALIDA =
  'Tu sesión de operador venció o no corresponde a esta sesión de trabajo. Vuelve a entrar con tu PIN y abre de nuevo la ficha del proceso.';

/**
 * C20: corrige piezas y hora real de una pausa automática por jornada.
 * El operador dueño queda identificado por su cookie HMAC y un administrador
 * con `gestionar_produccion` puede corregir sesiones ajenas. El cierre
 * administrativo normal queda intacto.
 */
export async function actualizarAvanceSesionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AvanceActualizado>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaActualizarAvanceSesion.safeParse(entrada);
  if (!analisis.success) {
    return {
      exito: false,
      error: analisis.error.issues[0]?.message ?? 'Datos inválidos',
      codigo: 'datos_invalidos',
    };
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
    if (!operador) {
      return {
        exito: false,
        error: MENSAJE_SESION_INVALIDA,
        codigo: 'sesion_operador_invalida',
      };
    }

    actor = operador;
  }

  try {
    const avance = await actualizarAvanceSesionServicio(crearClienteSupabaseAdmin(), {
      sesionId: analisis.data.sesionId,
      actorId: actor.id,
      piezasProducidas: analisis.data.piezasProducidas,
      horasReales: analisis.data.horasReales,
      notas: analisis.data.notas,
      materialId: analisis.data.materialId,
      cantidadUsada: analisis.data.cantidadUsada,
      cantidadScrap: analisis.data.cantidadScrap,
      motivoConsumo: analisis.data.motivoConsumo,
    });
    await registrarLog(actor, 'actualizar_avance_sesion', 'produccion', avance.id, {
      sesionId: analisis.data.sesionId,
      piezasProducidas: analisis.data.piezasProducidas,
      horasReales: analisis.data.horasReales,
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
