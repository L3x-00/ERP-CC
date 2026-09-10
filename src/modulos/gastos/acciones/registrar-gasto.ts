'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  mensajeErrorGastos,
  registrarGastoServicio,
} from '@/modulos/gastos/servicios/indice';
import type { Gasto } from '@/modulos/gastos/tipos/indice';
import { esquemaRegistrarGasto } from '@/modulos/gastos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function registrarGastoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<Gasto>> {
  const analisis = esquemaRegistrarGasto.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para registrar gastos' };
  }

  try {
    const gasto = await registrarGastoServicio(
      crearClienteSupabaseAdmin(),
      analisis.data,
      usuario.id,
    );
    await registrarLog(usuario, 'registrar_gasto', 'gastos', gasto.id, {
      folio: gasto.folio,
      ordenId: gasto.ordenId,
      montoTotal: gasto.montoTotal,
      moneda: gasto.moneda,
    });
    return { exito: true, datos: gasto };
  } catch (error) {
    console.error('[GASTOS] Error al registrar gasto:', error);
    await registrarLog(usuario, 'registro_gasto_rechazado', 'gastos', analisis.data.ordenId ?? usuario.id, {
      categoria: analisis.data.categoria,
    });
    return { exito: false, error: mensajeErrorGastos(error) };
  }
}
