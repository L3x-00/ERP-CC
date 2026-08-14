'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  aplicarSaldoFavorServicio,
  mensajeErrorCobranza,
  type SaldoFavorAplicado,
} from '@/modulos/cobranza/servicios/cobranza-servicio';
import { esquemaAplicarSaldoFavor } from '@/modulos/cobranza/validaciones/cobranza';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function aplicarSaldoFavorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SaldoFavorAplicado>> {
  const analisis = esquemaAplicarSaldoFavor.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'aplicar_saldos'))) {
    return { exito: false, error: 'Sin permiso para aplicar saldos a favor' };
  }

  try {
    const aplicacion = await aplicarSaldoFavorServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      usuarioId: usuario.id,
    });
    await registrarLog(usuario, 'aplicar_saldo_favor', 'cobranza', aplicacion.pagoId, {
      arId: aplicacion.arId,
      folioRecibo: aplicacion.folioRecibo,
      idempotente: aplicacion.idempotente,
    });
    return { exito: true, datos: aplicacion };
  } catch (error) {
    console.error('[COBRANZA] Error al aplicar saldo a favor:', error);
    await registrarLog(usuario, 'aplicacion_saldo_rechazada', 'cobranza', analisis.data.arId, {
      solicitudId: analisis.data.solicitudId,
    });
    return { exito: false, error: mensajeErrorCobranza(error) };
  }
}
