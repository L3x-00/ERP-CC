'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  cambiarEstadoGastoServicio,
  mensajeErrorGastos,
} from '@/modulos/gastos/servicios/indice';
import type { Gasto } from '@/modulos/gastos/tipos/indice';
import { esquemaCambiarEstadoGasto } from '@/modulos/gastos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function cambiarEstadoGastoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<Gasto>> {
  const analisis = esquemaCambiarEstadoGasto.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para cambiar estados de gastos' };
  }

  try {
    const gasto = await cambiarEstadoGastoServicio(
      crearClienteSupabaseAdmin(),
      analisis.data,
      usuario.id,
    );
    await registrarLog(usuario, 'cambiar_estado_gasto', 'gastos', gasto.id, {
      estadoNuevo: gasto.estadoPago,
    });
    return { exito: true, datos: gasto };
  } catch (error) {
    console.error('[GASTOS] Error al cambiar estado:', error);
    await registrarLog(usuario, 'cambio_estado_gasto_rechazado', 'gastos', analisis.data.gastoId, {
      estadoNuevo: analisis.data.nuevoEstado,
    });
    return { exito: false, error: mensajeErrorGastos(error) };
  }
}
