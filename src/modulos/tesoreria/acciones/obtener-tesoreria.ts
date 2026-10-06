'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerTesoreria,
} from '@/modulos/tesoreria/servicios/obtener-tesoreria';
import type { DatosTesoreria } from '@/modulos/tesoreria/tipos/indice';

export type { DatosTesoreria };

/** SII-B8 F5: saldos por cuenta y movimientos de tesorería. */
export async function obtenerTesoreriaAccion(): Promise<RespuestaAccion<DatosTesoreria>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const [puedeOperar, puedeVerFinanzas] = await Promise.all([
    can(usuario, 'registrar_pagos'),
    can(usuario, 'ver_finanzas'),
  ]);
  if (!puedeOperar && !puedeVerFinanzas) {
    return { exito: false, error: 'Sin permiso para ver tesorería' };
  }

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();
    const datos = await obtenerTesoreria(servidor);
    return { exito: true, datos };
  } catch {
    return { exito: false, error: 'No se pudo cargar la tesorería' };
  }
}
