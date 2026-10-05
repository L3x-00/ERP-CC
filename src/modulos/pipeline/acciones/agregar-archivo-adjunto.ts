'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import {
  construirRutaArchivo,
  descartarSubidaArchivo,
  registrarArchivo,
} from '@/nucleo/almacenamiento/archivos/servicio';
import {
  sanearNombreArchivo,
  validarSubidaArchivo,
} from '@/nucleo/almacenamiento/archivos/validaciones';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';

/** Tipos de archivo del documento (§9.3). */
const CLASES_PERMITIDAS = new Set(['CAD', 'DIBUJO', 'IMAGEN', 'ESPECIFICACIONES', 'OTROS']);

/**
 * Sube un adjunto de una oportunidad al bucket privado y registra su metadata
 * en el modelo único `archivos` (SII-B1.9). La carga previa de la oportunidad
 * valida, vía RLS, que el usuario tiene acceso antes de escribir; el perfil de
 * la entidad `rfq` limita tamaño y extensión.
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

  const validacion = validarSubidaArchivo('rfq', { nombre: archivo.name, tamano: archivo.size });
  if (!validacion.ok) {
    return { exito: false, error: validacion.error };
  }

  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, pipelineId);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }

  const clasePropuesta = String(formData.get('clase') ?? 'OTROS').toUpperCase();
  const clase = CLASES_PERMITIDAS.has(clasePropuesta) ? clasePropuesta : 'OTROS';
  const mime = archivo.type || 'application/octet-stream';
  const ruta = construirRutaArchivo('rfq', pipelineId, archivo.name);
  const admin = crearClienteSupabaseAdmin();

  const { error: errorSubida } = await admin.storage
    .from(BUCKET_ADJUNTOS)
    .upload(ruta, archivo, { contentType: mime, upsert: false });
  if (errorSubida) {
    return { exito: false, error: 'No se pudo subir el archivo' };
  }

  try {
    await registrarArchivo(admin, {
      entidad: 'rfq',
      entidadId: pipelineId,
      clase,
      nombreOriginal: archivo.name,
      nombreErp: sanearNombreArchivo(archivo.name),
      bucket: BUCKET_ADJUNTOS,
      rutaStorage: ruta,
      mime,
      tamanoBytes: archivo.size,
      subidoPor: usuario.id,
    });
  } catch {
    await descartarSubidaArchivo(admin, BUCKET_ADJUNTOS, ruta);
    return { exito: false, error: 'No se pudo registrar el archivo' };
  }

  await registrarLog(usuario, 'agregar_adjunto', 'pipeline', pipelineId, { ruta, clase });

  return { exito: true, datos: { ruta } };
}
