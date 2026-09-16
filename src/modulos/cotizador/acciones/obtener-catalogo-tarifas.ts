'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/configuracion-servicio';
import { CATALOGO_TARIFAS_DEFECTO } from '@/modulos/cotizador/servicios/catalogo-tarifas';
import type { CatalogoTarifasCotizador } from '@/modulos/cotizador/tipos/indice';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Devuelve el catálogo central de tarifas del cotizador para precargar el
 * formulario. Cualquier usuario autenticado puede leerlo (cotizar es función de
 * vendedor); las tarifas son parámetros internos de costo, no secretos.
 *
 * Usa el cliente admin (vía `obtenerConfiguracionGeneral`) porque la RLS de
 * `configuracion_sistema` limita el SELECT a admin/permiso `configuracion`, pero
 * NO expone empresa, plantillas ni cuentas bancarias: solo el catálogo de
 * tarifas. Ante cualquier fallo devuelve los valores por defecto para no dejar
 * al cotizador sin tarifas base.
 */
export async function obtenerCatalogoTarifasAccion(): Promise<
  RespuestaAccion<CatalogoTarifasCotizador>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const configuracion = await obtenerConfiguracionGeneral();
    return { exito: true, datos: configuracion.tarifas.estaciones };
  } catch {
    return { exito: true, datos: CATALOGO_TARIFAS_DEFECTO };
  }
}
