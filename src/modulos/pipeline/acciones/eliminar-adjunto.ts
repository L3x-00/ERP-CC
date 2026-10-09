'use server';

import { z } from 'zod';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

const esquema = z
  .object({ pipelineId: z.uuid(), ruta: z.string().min(1).max(500) })
  .strict();

/**
 * Retira un adjunto de la vista sin borrar el binario ni su metadata histórica.
 * La oportunidad se valida con el cliente del usuario y la fila se marca como
 * no vigente mediante el cliente administrativo del servidor.
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

  const admin = crearClienteSupabaseAdmin();
  const { data: retirado, error } = await admin
    .from('archivos')
    .update({ vigente: false })
    .eq('ruta_storage', ruta)
    .eq('entidad', 'rfq')
    .eq('entidad_id', pipelineId)
    .eq('vigente', true)
    .select('id')
    .maybeSingle();
  if (error || !retirado) return { exito: false, error: 'No se pudo retirar el archivo' };

  await registrarLog(usuario, 'retirar_adjunto', 'pipeline', pipelineId, { ruta });
  return { exito: true, datos: { ruta } };
}
