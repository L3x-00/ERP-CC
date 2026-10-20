import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/configuracion-servicio';
import { UTILIDAD_OBJETIVO_PROPUESTA_DEFECTO } from '@/modulos/configuracion/tipos/indice';

/**
 * Utilidad objetivo de las propuestas (% sobre costo) desde Configuración.
 *
 * Usa el cliente admin (vía `obtenerConfiguracionGeneral`) porque la RLS de
 * `configuracion_sistema` limita el SELECT a admin/permiso `configuracion`, pero
 * solo se extrae este parámetro: ni empresa, ni plantillas, ni cuentas. Un fallo
 * de lectura no debe dejar la ficha sin indicador: se usa el valor por defecto.
 */
export async function obtenerUtilidadObjetivoPropuesta(): Promise<number> {
  try {
    const configuracion = await obtenerConfiguracionGeneral();
    return configuracion.tarifas.utilidadObjetivoPropuestaPorcentaje;
  } catch (error) {
    console.error(
      '[PROPUESTAS] No se pudo leer la utilidad objetivo; se usa el valor por defecto:',
      error instanceof Error ? error.message : error,
    );
    return UTILIDAD_OBJETIVO_PROPUESTA_DEFECTO;
  }
}
