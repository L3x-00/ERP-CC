'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { firmarLecturaArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { esquemaFirmarArchivoPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';

export type ResultadoFirmarArchivo = { url: string };

/**
 * SII-B4.8: firma una URL corta (120 s) para leer un archivo ligado a la
 * propuesta. La visibilidad se valida con el cliente RLS del usuario (la
 * `archivos` RLS usa el permiso de la entidad: `propuesta_vista` para la
 * propuesta, dueño/equipo para los archivos heredados del RFQ).
 */
export async function firmarArchivoPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoFirmarArchivo>> {
  const analisis = esquemaFirmarArchivoPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();
    const { data: archivo, error } = await servidor
      .from('archivos')
      .select('id')
      .eq('id', analisis.data.archivoId)
      .maybeSingle();
    if (error || !archivo) {
      return { exito: false, error: 'Archivo no encontrado' };
    }

    const url = await firmarLecturaArchivo(
      crearClienteSupabaseAdmin(),
      analisis.data.archivoId,
      120,
    );
    return { exito: true, datos: { url } };
  } catch {
    return { exito: false, error: 'No se pudo firmar el archivo' };
  }
}
