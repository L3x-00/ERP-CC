'use server';

import { z } from 'zod';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { crearUrlDescarga } from '@/nucleo/almacenamiento/descargar-archivo';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

const esquema = z
  .object({ pipelineId: z.uuid(), ruta: z.string().min(1).max(500) })
  .strict();

/**
 * Devuelve una URL firmada de corta duración para abrir/descargar un adjunto.
 * La ruta debe pertenecer a la carpeta de la oportunidad; además, `createSignedUrl`
 * sobre el cliente RLS vuelve a validar el acceso vía la política de storage.
 */
export async function obtenerUrlAdjuntoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ url: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };
  const { pipelineId, ruta } = analisis.data;

  if (!ruta.startsWith(`${pipelineId}/`) || ruta.includes('..')) {
    return { exito: false, error: 'Ruta inválida' };
  }

  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, pipelineId);
  if (!cargada) return { exito: false, error: 'No encontrada' };

  try {
    const url = await crearUrlDescarga(servidor, BUCKET_ADJUNTOS, ruta, 300);
    return { exito: true, datos: { url } };
  } catch {
    return { exito: false, error: 'No se pudo generar el enlace' };
  }
}
