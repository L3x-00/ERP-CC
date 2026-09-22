'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import type { EquipoEstacionOpcion } from '@/modulos/pipeline/tipos/indice';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * OBS-04: equipos/estaciones activos del catálogo de Planeación, para asignar el
 * equipo de una línea de cotización. Cotizar es función de vendedor, así que
 * basta la sesión; se lee con el cliente admin porque la RLS de
 * `recursos_planeacion` exige permisos de Planeación, pero solo se expone el
 * mínimo operativo (código, nombre y área): ni capacidad, ni costos, ni tarifas.
 */
export async function obtenerEquiposEstacionesAccion(): Promise<
  RespuestaAccion<EquipoEstacionOpcion[]>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const { data, error } = await crearClienteSupabaseAdmin()
      .from('recursos_planeacion')
      .select('codigo, nombre, area')
      .eq('activo', true)
      .order('codigo');
    if (error) throw new Error(error.message);

    return {
      exito: true,
      datos: (data ?? []).map((recurso) => ({
        codigo: recurso.codigo,
        nombre: recurso.nombre,
        area: recurso.area,
      })),
    };
  } catch (error) {
    console.error('[PIPELINE] Error al consultar los equipos/estaciones:', error);
    return { exito: false, error: 'No se pudieron consultar los equipos/estaciones' };
  }
}
