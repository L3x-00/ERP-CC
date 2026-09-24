'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export type ProveedorGastoOpcion = { id: string; nombre: string };

export async function obtenerProveedoresGastoAccion(): Promise<RespuestaAccion<ProveedorGastoOpcion[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_finanzas')) && !(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para consultar proveedores' };
  }
  const { data, error } = await crearClienteSupabaseAdmin().from('proveedores')
    .select('id, nombre_comercial').order('nombre_comercial');
  if (error) return { exito: false, error: 'No se pudieron consultar proveedores' };
  return { exito: true, datos: (data ?? []).map((fila) => ({ id: fila.id, nombre: fila.nombre_comercial })) };
}
