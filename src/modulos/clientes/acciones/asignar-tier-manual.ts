'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { esquemaAsignarTierManual } from '@/modulos/clientes/validaciones/cliente-schema';
import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/configuracion-servicio';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Asigna manualmente el tier de un cliente, con la vigencia configurada en
 * Configuración (CFG-08; 90 días de fábrica).
 *
 * Restringido a `rol === 'admin'` explícito (no un permiso otorgable): forzar el
 * tier salta la regla automática por consumo, así que es privilegio de admin. La
 * caducidad la fija el servidor —no la entrada— para que no se pueda extender.
 * El tier efectivo lo resuelve `calcularTier` al leer.
 */
export async function asignarTierManualAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string; venceEn: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaAsignarTierManual.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (usuario.rol !== 'admin') {
    return { exito: false, error: 'Solo un administrador puede asignar el tier manualmente' };
  }

  const { clienteId, tier } = analisis.data;
  const configuracion = await obtenerConfiguracionGeneral().catch(() => null);
  if (!configuracion) {
    return { exito: false, error: 'No se pudo leer la vigencia configurada del tier' };
  }
  const venceEn = new Date(Date.now() + configuracion.tiers.diasManual * MS_POR_DIA).toISOString();

  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin
    .from('clientes')
    .update({ tier_manual: tier, tier_manual_hasta: venceEn })
    .eq('id', clienteId);

  if (error) {
    return { exito: false, error: 'No se pudo asignar el tier' };
  }

  await registrarLog(usuario, 'asignar_tier_manual', 'clientes', clienteId, {
    tier,
    venceEn,
  });

  return { exito: true, datos: { id: clienteId, venceEn } };
}
