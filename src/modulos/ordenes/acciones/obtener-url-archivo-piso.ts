'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { archivoPerteneceAOrden } from '@/modulos/ordenes/servicios/archivos-ficha-servicio';
import { ordenEstaEnPiso } from '@/modulos/ordenes/servicios/hoja-trabajo-lectura-servicio';
import { firmarLecturaArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { obtenerAccesoLecturaPiso } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z
  .object({ ordenId: z.uuid(), archivoId: z.uuid() })
  .strict();

/**
 * URL firmada de corta vida para abrir un archivo desde la hoja de trabajo del piso (O-05 C). El
 * operador entra con PIN y no tiene sesión del sistema, así que no aplica `can()`: la barrera es la
 * sesión de piso vigente, que la orden esté en SU piso (en proceso y con partidas asignadas a él) y
 * que el archivo figure en la lista congelada de esa orden. La firma usa service_role.
 */
export async function obtenerUrlArchivoPisoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ url: string }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const acceso = await obtenerAccesoLecturaPiso();
  if (!acceso) return { exito: false, error: 'No autorizado' };

  try {
    const admin = crearClienteSupabaseAdmin();
    const { ordenId, archivoId } = analisis.data;
    if (!(await ordenEstaEnPiso(admin, ordenId, acceso.operadorId))) {
      return { exito: false, error: 'La orden no está en tu piso' };
    }
    if ((await archivoPerteneceAOrden(admin, ordenId, archivoId)) !== true) {
      return { exito: false, error: 'El archivo no pertenece a esta orden' };
    }
    const url = await firmarLecturaArchivo(admin, archivoId, 300);
    return { exito: true, datos: { url } };
  } catch (error) {
    console.error('[ORDENES] Error al firmar archivo desde el piso:', error);
    return { exito: false, error: 'No se pudo generar el enlace del archivo' };
  }
}
