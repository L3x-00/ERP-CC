'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export interface MaterialGasto {
  id: string;
  codigo: string;
  nombre: string;
  unidadBase: string;
  monedaCosto: string;
}

/** Catálogo mínimo para vincular una compra de material a un egreso. */
export async function listarMaterialesGastoAccion(): Promise<RespuestaAccion<MaterialGasto[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para registrar gastos' };
  }

  const { data, error } = await crearClienteSupabaseAdmin()
    .from('catalogo_materiales')
    .select('id, codigo, nombre, unidad_base, moneda_costo')
    .eq('activo', true)
    .order('codigo');
  if (error) return { exito: false, error: 'No se pudieron cargar los materiales' };

  return {
    exito: true,
    datos: (data ?? []).map((fila) => ({
      id: String(fila.id),
      codigo: String(fila.codigo),
      nombre: String(fila.nombre),
      unidadBase: String(fila.unidad_base),
      monedaCosto: String(fila.moneda_costo),
    })),
  };
}
