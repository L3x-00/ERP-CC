'use server';

import type { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { esquemaConsultarHistorialCuenta, esquemaConsultarDetalleOrden, esquemaConsultarRecibo, esquemaConsultarCuentasBancarias } from '@/modulos/cobranza/validaciones/cobranza';
import { obtenerHistorialCuentaServicio, obtenerDetalleOrdenCobranzaServicio, obtenerReciboPagoServicio, obtenerCuentasBancariasActivasServicio } from '@/modulos/cobranza/servicios/historial-cobranza-servicio';

async function consultar<Entrada, Salida>(entrada: unknown, esquema: z.ZodType<Entrada>, servicio: (cliente: SupabaseClient<Database>, datos: Entrada) => Promise<Salida>): Promise<RespuestaAccion<Salida>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos de consulta inválidos' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'ver_finanzas'))) return { exito: false, error: 'Sin permiso para consultar cobranza' };
  try {
    return { exito: true, datos: await servicio(await crearClienteSupabaseServidor(), analisis.data) };
  } catch {
    return { exito: false, error: 'No se pudo recuperar la información de cobranza' };
  }
}

export async function obtenerHistorialCuentaAccion(entrada: unknown) {
  return consultar(entrada, esquemaConsultarHistorialCuenta, obtenerHistorialCuentaServicio);
}

export async function obtenerDetalleOrdenCobranzaAccion(entrada: unknown) {
  return consultar(entrada, esquemaConsultarDetalleOrden, obtenerDetalleOrdenCobranzaServicio);
}

export async function obtenerReciboPagoAccion(entrada: unknown) {
  return consultar(entrada, esquemaConsultarRecibo, obtenerReciboPagoServicio);
}

export async function obtenerCuentasBancariasAccion(entrada: unknown) {
  return consultar(entrada, esquemaConsultarCuentasBancarias, obtenerCuentasBancariasActivasServicio);
}
