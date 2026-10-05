'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';

export interface PermisosCatalogos {
  puedeVer: boolean;
  puedeEditar: boolean;
}

/**
 * Permisos efectivos de la pestaña de catálogos. La usa la barra de pestañas
 * de Configuración para no ofrecer la sección a quien no puede verla.
 */
export async function obtenerPermisosCatalogosAccion(): Promise<RespuestaAccion<PermisosCatalogos>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const [puedeVer, puedeEditar] = await Promise.all([
    can(usuario, 'catalogo_ver'),
    can(usuario, 'catalogo_editar'),
  ]);
  return { exito: true, datos: { puedeVer, puedeEditar } };
}
