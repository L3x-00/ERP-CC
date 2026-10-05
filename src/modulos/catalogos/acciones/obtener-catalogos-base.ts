'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerCatalogosBaseServicio } from '@/modulos/catalogos/servicios/indice';
import type { CatalogosBase } from '@/modulos/catalogos/tipos/indice';
import { esquemaConsultaCatalogosBase } from '@/modulos/catalogos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Entrega todos los catálogos base de la pestaña Configuración. Incluye los
 * inactivos (visibles en historial) y `puedeEditar` para deshabilitar
 * formularios sin una segunda consulta.
 */
export async function obtenerCatalogosBaseAccion(
  entrada: unknown = {},
): Promise<RespuestaAccion<CatalogosBase>> {
  const analisis = esquemaConsultaCatalogosBase.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_ver'))) {
    return { exito: false, error: 'Sin permiso para ver catálogos' };
  }

  try {
    const datos = await obtenerCatalogosBaseServicio(
      crearClienteSupabaseAdmin(),
      analisis.data.soloActivos,
    );
    const puedeEditar = await can(usuario, 'catalogo_editar');
    return { exito: true, datos: { ...datos, puedeEditar } };
  } catch (error) {
    console.error('[CATALOGOS] Error al consultar catálogos base:', error);
    return { exito: false, error: 'No se pudieron consultar los catálogos' };
  }
}
