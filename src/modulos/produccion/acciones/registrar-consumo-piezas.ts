'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  mensajeErrorSesion,
  registrarConsumoPiezasSesionServicio,
  type ConsumoPiezasRegistrado,
} from '@/modulos/produccion/servicios/indice';
import { esquemaRegistrarConsumoPiezas } from '@/modulos/produccion/validaciones/indice';

/**
 * C17: después de cerrar una operación posterior al corte, el operador registra
 * cuántas piezas del proceso anterior usó y cuántas tuvieron merma. La RPC es
 * idempotente y descuenta el consumo del inventario de piezas disponible.
 */
export async function registrarConsumoPiezasAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConsumoPiezasRegistrado>> {
  const resultado = esquemaRegistrarConsumoPiezas.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'registrar_consumo_piezas',
    resultado.data.sesionId,
  );
  if (!operador) return { exito: false, error: 'No autorizado' };

  const correlationId = nuevoCorrelationId();
  try {
    const consumo = await registrarConsumoPiezasSesionServicio(
      crearClienteSupabaseAdmin(),
      {
        sesionId: resultado.data.sesionId,
        operadorId: operador.id,
        cantidadUsada: resultado.data.cantidadUsada,
        cantidadMerma: resultado.data.cantidadMerma,
        motivo: resultado.data.motivo,
      },
    );
    await registrarLog(operador, 'registrar_consumo_piezas', 'produccion', consumo.id, {
      sesionId: resultado.data.sesionId,
      cantidadUsada: resultado.data.cantidadUsada,
      cantidadMerma: resultado.data.cantidadMerma,
      cantidadConsumida: consumo.cantidadConsumida,
    }, correlationId);
    return { exito: true, datos: consumo };
  } catch (error) {
    console.error('[PRODUCCION] Error al registrar consumo de piezas:', error);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
