'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/** Cuenta disponible para asociar a un gasto, con número enmascarado (OBS-28). */
export type CuentaGastoOpcion = {
  id: string;
  etiqueta: string;
};

/**
 * Cuentas bancarias activas para elegir la cuenta de salida de un gasto
 * (OBS-28). Se lee con el cliente admin porque la RLS de `cuentas_bancarias`
 * exige el permiso `configuracion`; el gasto es una función financiera y solo
 * se expone el número enmascarado, nunca la cuenta completa.
 */
export async function obtenerCuentasGastoAccion(): Promise<RespuestaAccion<CuentaGastoOpcion[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para registrar gastos' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const { data, error } = await admin
      .from('cuentas_bancarias')
      .select('id, banco, numero_cuenta, moneda')
      .eq('activa', true)
      .order('banco', { ascending: true });
    if (error) throw error;

    return {
      exito: true,
      datos: (data ?? []).map((cuenta) => ({
        id: cuenta.id,
        etiqueta: `${cuenta.banco} · …${String(cuenta.numero_cuenta).slice(-4)} · ${cuenta.moneda}`,
      })),
    };
  } catch (error) {
    console.error('[GASTOS] Error al consultar cuentas bancarias:', error);
    return { exito: false, error: 'No se pudieron consultar las cuentas' };
  }
}
