'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  ErrorProduccion,
  cerrarSesionTrabajoServicio,
  limpiarHoraFinSesionServicio,
  mensajeErrorSesion,
  registrarMotivoExcesoSesionServicio,
  type CierreSesionRegistrado,
} from '@/modulos/produccion/servicios/indice';
import { esquemaCerrarSesion } from '@/modulos/produccion/validaciones/indice';

const MENSAJE_SESION_INVALIDA =
  'Tu sesión de operador venció o no corresponde a esta sesión de trabajo. Vuelve a entrar con tu PIN y abre de nuevo la ficha del proceso.';

/** La cookie HMAC identifica al operador; el cierre se confirma solo con su sesión. */
export async function cerrarSesionOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<CierreSesionRegistrado>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaCerrarSesion.safeParse(entrada);
  if (!analisis.success) {
    return {
      exito: false,
      error: analisis.error.issues[0]?.message ?? 'Datos inválidos',
      codigo: 'datos_invalidos',
    };
  }

  const operador = await obtenerOperadorParaMutacion(
    'cerrar_sesion_trabajo',
    analisis.data.sesionId,
  );
  if (!operador) {
    return {
      exito: false,
      error: MENSAJE_SESION_INVALIDA,
      codigo: 'sesion_operador_invalida',
    };
  }

  try {
    // C31/A12: el motivo de la demora se guarda antes del cierre. La RPC de
    // cierre no cambia de firma y sigue su flujo normal.
    if (analisis.data.motivoExceso && analisis.data.detalleExceso) {
      await registrarMotivoExcesoSesionServicio(crearClienteSupabaseAdmin(), {
        sesionId: analisis.data.sesionId,
        operadorId: operador.id,
        motivoExceso: analisis.data.motivoExceso,
        detalleExceso: analisis.data.detalleExceso,
      });
    }
    const sesion = await cerrarSesionTrabajoServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'cerrar_sesion_trabajo', 'produccion', sesion.id, {
      estadoDestino: analisis.data.estadoDestino,
      piezasProducidas: analisis.data.piezasProducidas,
      horasNetas: sesion.horasNetas,
      estadoPlaneacion: sesion.estadoPlaneacion,
      ...(analisis.data.consumo
        ? {
          materialId: analisis.data.consumo.materialId,
          cantidadUsada: analisis.data.consumo.cantidadUsada,
          cantidadScrap: analisis.data.consumo.cantidadScrap,
        }
        : {}),
    }, correlationId);
    return { exito: true, datos: sesion };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al cerrar sesión:', error);
    // C20: no dejar una hora declarada huérfana si el cierre no se completó.
    if (analisis.data.horaFin) {
      try {
        await limpiarHoraFinSesionServicio(crearClienteSupabaseAdmin(), {
          sesionId: analisis.data.sesionId,
          operadorId: operador.id,
        });
      } catch (errorLimpieza) {
        console.error('[PRODUCCION] No se pudo limpiar la hora declarada:', errorLimpieza);
      }
    }
    await registrarLog(operador, 'cierre_sesion_trabajo_rechazado', 'produccion', analisis.data.sesionId, {
      codigo,
      estadoDestino: analisis.data.estadoDestino,
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error), codigo };
  }
}
