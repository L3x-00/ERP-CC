'use server';

import { z } from 'zod';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { listarAdjuntosOportunidad, type ArchivoAdjunto } from '@/modulos/pipeline/servicios/listar-adjuntos';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/** Lista los adjuntos de una oportunidad accesible por el usuario (RLS). */
export async function obtenerAdjuntosAccion(pipelineId: unknown): Promise<RespuestaAccion<ArchivoAdjunto[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const id = z.uuid().safeParse(pipelineId);
  if (!id.success) return { exito: false, error: 'Oportunidad inválida' };

  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, id.data);
  if (!cargada) return { exito: false, error: 'No encontrada' };

  try {
    const adjuntos = await listarAdjuntosOportunidad(servidor, id.data);
    return { exito: true, datos: adjuntos };
  } catch {
    return { exito: false, error: 'No se pudieron listar los adjuntos' };
  }
}
