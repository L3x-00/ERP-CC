'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerPromesaActiva,
  type PromesaPago,
} from '@/modulos/cobranza/servicios/promesas-servicio';
import { esquemaPromesaCuenta } from '@/modulos/cobranza/validaciones/promesas';

/** SII-B8 F3: promesa activa (vigente/vencida) de una cuenta. */
export async function obtenerPromesaCuentaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<PromesaPago | null>> {
  const analisis = esquemaPromesaCuenta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  const [puedeCobrar, puedeVerFinanzas] = await Promise.all([
    can(usuario, 'registrar_pagos'),
    can(usuario, 'ver_finanzas'),
  ]);
  if (!puedeCobrar && !puedeVerFinanzas) {
    return { exito: false, error: 'Sin permiso para ver promesas' };
  }

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();
    const promesa = await obtenerPromesaActiva(servidor, analisis.data.cuentaId);
    return { exito: true, datos: promesa };
  } catch {
    return { exito: false, error: 'No se pudo cargar la promesa' };
  }
}
