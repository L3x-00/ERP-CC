'use server';

import { z } from 'zod';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { subirArchivo } from '@/nucleo/almacenamiento/subir-archivo';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/** Tamaño máximo de adjunto: 20 MB. */
const MAX_BYTES = 20 * 1024 * 1024;

/** Extensiones permitidas (planos CAD, PDF, imágenes, hojas de cálculo). */
const EXTENSIONES_PERMITIDAS = new Set([
  'pdf', 'dxf', 'dwg', 'step', 'stp', 'igs', 'iges',
  'png', 'jpg', 'jpeg', 'webp',
  'xlsx', 'xls', 'csv', 'doc', 'docx',
]);

/**
 * Sube un archivo adjunto asociado a una oportunidad al bucket privado.
 *
 * Recibe `FormData` (no un objeto plano) para poder transportar el `File`
 * binario desde el cliente. La carga previa de la oportunidad valida, vía RLS,
 * que el usuario tiene acceso antes de escribir en el bucket. Limita tamaño y
 * extensión para no aceptar subidas arbitrarias.
 */
export async function agregarArchivoAdjuntoAccion(
  formData: FormData,
): Promise<RespuestaAccion<{ ruta: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const idAnalisis = z.uuid().safeParse(formData.get('pipelineId'));
  if (!idAnalisis.success) {
    return { exito: false, error: 'Oportunidad inválida' };
  }
  const pipelineId = idAnalisis.data;

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File)) {
    return { exito: false, error: 'Archivo requerido' };
  }

  if (archivo.size === 0 || archivo.size > MAX_BYTES) {
    return { exito: false, error: 'El archivo debe pesar entre 1 byte y 20 MB' };
  }

  const extension = archivo.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONES_PERMITIDAS.has(extension)) {
    return { exito: false, error: 'Tipo de archivo no permitido' };
  }

  const servidor = await crearClienteSupabaseServidor();

  const cargada = await obtenerOportunidadPorId(servidor, pipelineId);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }

  // Sanear el nombre: quitar separadores de ruta y '..' para que el archivo no
  // pueda escribirse fuera del prefijo <pipelineId>/ del bucket.
  const nombreSeguro = archivo.name.replace(/[/\\]/g, '_').replace(/\.{2,}/g, '_') || 'archivo';
  const ruta = `${pipelineId}/${Date.now()}-${nombreSeguro}`;
  try {
    await subirArchivo(servidor, BUCKET_ADJUNTOS, ruta, await archivo.arrayBuffer(), archivo.type);
  } catch {
    return { exito: false, error: 'No se pudo subir el archivo' };
  }

  await registrarLog(usuario, 'agregar_adjunto', 'pipeline', pipelineId, { ruta });

  return { exito: true, datos: { ruta } };
}
