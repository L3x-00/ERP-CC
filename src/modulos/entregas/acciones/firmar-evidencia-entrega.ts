'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { firmarLecturaArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaFirmarEvidenciaEntrega } from '@/modulos/entregas/validaciones/esquemas-entregas';

export type ResultadoFirmaEvidencia = { url: string };

/**
 * SII-B7.2: firma una URL corta (120 s) para leer evidencia/firma de una
 * entrega. La visibilidad la impone la RLS de `archivos` para `entrega`
 * (`entrega_evidencia`/`entrega_generar`/`orden_vista`/`ver_finanzas`).
 */
export async function firmarEvidenciaEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoFirmaEvidencia>> {
  const analisis = esquemaFirmarEvidenciaEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();
    const { data: archivo } = await servidor
      .from('archivos')
      .select('id, entidad')
      .eq('id', analisis.data.archivoId)
      .eq('entidad', 'entrega')
      .maybeSingle();
    if (!archivo) {
      return { exito: false, error: 'La evidencia no existe' };
    }

    const url = await firmarLecturaArchivo(
      crearClienteSupabaseAdmin(),
      analisis.data.archivoId,
      120,
    );
    return { exito: true, datos: { url } };
  } catch {
    return { exito: false, error: 'No se pudo firmar la evidencia' };
  }
}
