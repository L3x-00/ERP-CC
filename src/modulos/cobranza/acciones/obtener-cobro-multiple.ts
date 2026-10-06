'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerClientesCobrables,
  obtenerCuentasCobrablesCliente,
  type ClienteCobrable,
  type CuentaCobrableMultiple,
} from '@/modulos/cobranza/servicios/promesas-servicio';
import { esquemaCuentasCliente } from '@/modulos/cobranza/validaciones/promesas';

export type DatosCobroMultiple =
  | { modo: 'clientes'; clientes: ClienteCobrable[] }
  | { modo: 'cuentas'; cuentas: CuentaCobrableMultiple[] };

/** SII-B8 F3: clientes cobrables o cuentas cobrables de un cliente. */
export async function obtenerCobroMultipleAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DatosCobroMultiple>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para cobros múltiples' };
  }

  const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
  const servidor = await crearClienteSupabaseServidor();

  const analisis = esquemaCuentasCliente.safeParse(entrada ?? {});
  if (analisis.success) {
    const cuentas = await obtenerCuentasCobrablesCliente(servidor, analisis.data.clienteId);
    return { exito: true, datos: { modo: 'cuentas', cuentas } };
  }
  const clientes = await obtenerClientesCobrables(servidor);
  return { exito: true, datos: { modo: 'clientes', clientes } };
}
