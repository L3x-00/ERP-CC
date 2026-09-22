'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  listarOperadoresAreasServicio,
  type OperadorAreaConfig,
} from '@/modulos/configuracion/servicios/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * OBS-09/PRD-11: operadores activos y las áreas que pueden atender, para el
 * panel de configuración. Solo expone identidad y códigos de catálogo; los
 * permisos y la lectura privilegiada quedan en el servidor.
 */
export async function obtenerOperadoresAreasAccion(): Promise<
  RespuestaAccion<OperadorAreaConfig[]>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) {
    return { exito: false, error: 'Sin permiso para configurar el sistema' };
  }

  try {
    // Cliente admin: la RLS de `usuarios` solo deja al propio usuario o admin, y
    // un gerente con permiso `configuracion` también administra operadores.
    const operadores = await listarOperadoresAreasServicio(crearClienteSupabaseAdmin());
    return { exito: true, datos: operadores };
  } catch (error) {
    console.error('[CONFIGURACION] Error al consultar operadores por área:', error);
    return { exito: false, error: 'No se pudieron consultar los operadores' };
  }
}
