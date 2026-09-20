'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import type { CatalogoTiers } from '@/modulos/clientes/tipos/indice';
import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/indice';

/** Proyección pública de los catálogos comerciales configurables. */
export interface CatalogosComerciales {
  tiers: CatalogoTiers;
  categoriasGasto: readonly string[];
}

/**
 * Lee tiers (CFG-08) y categorías de gasto (CFG-09) para cualquier usuario
 * autenticado: son parámetros comerciales visibles en fichas, RFQ y gastos.
 */
export async function obtenerCatalogosComercialesAccion(): Promise<
  RespuestaAccion<CatalogosComerciales>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const configuracion = await obtenerConfiguracionGeneral();
    return {
      exito: true,
      datos: { tiers: configuracion.tiers, categoriasGasto: configuracion.categoriasGasto },
    };
  } catch (error) {
    console.error('[CONFIGURACION] Error al consultar catálogos comerciales:', error);
    return { exito: false, error: 'No se pudieron consultar los catálogos' };
  }
}
