'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { listarAreasTrabajoConfig } from '@/modulos/configuracion/servicios/configuracion-servicio';
import type { AreaTrabajoOpcion } from '@/modulos/pipeline/tipos/indice';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Áreas/departamento activas del catálogo de configuración, para asignar el
 * área de una línea de cotización (RFQ-05). Cotizar es función de vendedor, así
 * que basta la sesión; se lee con el cliente admin porque la RLS de
 * `areas_trabajo_config` exige el permiso `configuracion`, pero solo se expone
 * el mínimo operativo (código, nombre y si es área externa): ni costos ni
 * tarifas de venta salen de aquí.
 */
export async function obtenerAreasTrabajoAccion(): Promise<RespuestaAccion<AreaTrabajoOpcion[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const areas = await listarAreasTrabajoConfig();
    return {
      exito: true,
      datos: areas
        .filter((area) => area.activo)
        .map((area) => ({
          codigo: area.codigo,
          nombre: area.nombre,
          esExterno: area.esExterno,
          // OBS-14: la jerarquía viaja para agrupar el select del cotizador.
          padreCodigo: area.padreCodigo,
          tipo: area.tipo,
        })),
    };
  } catch (error) {
    console.error('[PIPELINE] Error al consultar las áreas de trabajo:', error);
    return { exito: false, error: 'No se pudieron consultar las áreas de trabajo' };
  }
}
