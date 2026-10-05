'use server';

import { z } from 'zod';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

const esquema = z
  .object({ pipelineId: z.uuid(), ruta: z.string().min(1).max(500) })
  .strict();

/**
 * Retira un adjunto de la oportunidad. La RLS de `storage.objects` (DELETE)
 * restringe el borrado al dueño/admin/`ver_pipeline_equipo`; aquí además se
 * valida que la ruta pertenezca a la oportunidad y se registra en auditoría.
 */
export async function eliminarAdjuntoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ ruta: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };
  const { pipelineId, ruta } = analisis.data;

  // Rutas nuevas `rfq/<pipelineId>/...` y rutas históricas `<pipelineId>/...`.
  const rutaValida =
    ruta.startsWith(`${pipelineId}/`) || ruta.startsWith(`rfq/${pipelineId}/`);
  if (!rutaValida || ruta.includes('..')) {
    return { exito: false, error: 'Ruta inválida' };
  }

  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, pipelineId);
  if (!cargada) return { exito: false, error: 'No encontrada' };

  const { error } = await servidor.storage.from(BUCKET_ADJUNTOS).remove([ruta]);
  if (error) return { exito: false, error: 'No se pudo eliminar el archivo' };

  // La historia no se borra en silencio: la metadata queda con vigente=false.
  const admin = crearClienteSupabaseAdmin();
  await admin.from('archivos').update({ vigente: false }).eq('ruta_storage', ruta);

  await registrarLog(usuario, 'eliminar_adjunto', 'pipeline', pipelineId, { ruta });
  return { exito: true, datos: { ruta } };
}
