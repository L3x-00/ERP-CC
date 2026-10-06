'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import {
  construirRutaArchivo,
  descartarSubidaArchivo,
  registrarArchivo,
} from '@/nucleo/almacenamiento/archivos/servicio';
import {
  sanearNombreArchivo,
  validarSubidaArchivo,
} from '@/nucleo/almacenamiento/archivos/validaciones';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaSubirArchivoPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';

const BUCKET = 'propuestas-archivos';

export type ResultadoSubirArchivo = { id: string; version: number };

/**
 * SII-B4.8: sube un archivo propio de la revisión DRAFT (general o técnico).
 * Se registra en el modelo único `archivos` (`entidad='propuesta_revision'`);
 * las revisiones enviadas quedan congeladas y no admiten adjuntos nuevos.
 */
export async function subirArchivoPropuestaAccion(
  formData: FormData,
): Promise<RespuestaAccion<ResultadoSubirArchivo>> {
  const analisis = esquemaSubirArchivoPropuesta.safeParse({
    revisionId: formData.get('revisionId'),
    tema: formData.get('tema') ?? 'general',
    nombreArchivo: formData.get('nombreArchivo'),
  });
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_editar_articulo'))) {
    return { exito: false, error: 'Sin permiso para adjuntar archivos a la propuesta' };
  }

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File)) {
    return { exito: false, error: 'Archivo requerido' };
  }
  const validacion = validarSubidaArchivo('propuesta_revision', {
    nombre: archivo.name,
    tamano: archivo.size,
  });
  if (!validacion.ok) {
    return { exito: false, error: validacion.error };
  }

  const admin = crearClienteSupabaseAdmin();
  const { data: revision } = await admin
    .from('propuesta_revisiones')
    .select('id, estado')
    .eq('id', analisis.data.revisionId)
    .maybeSingle();
  if (!revision) {
    return { exito: false, error: 'La revisión no existe' };
  }
  if (revision.estado !== 'DRAFT') {
    return { exito: false, error: 'Solo se adjuntan archivos a revisiones en borrador' };
  }

  const { tema, nombreArchivo } = analisis.data;
  const nombreErp = sanearNombreArchivo(nombreArchivo);
  const ruta = construirRutaArchivo('propuesta_revision', revision.id, nombreArchivo);
  const mime = archivo.type || 'application/octet-stream';

  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: mime, upsert: false });
  if (errorSubida) {
    return { exito: false, error: 'No se pudo subir el archivo' };
  }

  try {
    const registrado = await registrarArchivo(admin, {
      entidad: 'propuesta_revision',
      entidadId: revision.id,
      temaCodigo: tema,
      clase: tema,
      nombreOriginal: nombreArchivo,
      nombreErp,
      bucket: BUCKET,
      rutaStorage: ruta,
      mime,
      tamanoBytes: archivo.size,
      subidoPor: usuario.id,
    });

    await registrarLog(
      usuario,
      'subir_archivo_propuesta',
      'propuestas',
      revision.id,
      { archivoId: registrado.id, tema, version: registrado.version },
      nuevoCorrelationId(),
    );

    return { exito: true, datos: { id: registrado.id, version: registrado.version } };
  } catch {
    await descartarSubidaArchivo(admin, BUCKET, ruta);
    return { exito: false, error: 'No se pudo registrar el archivo' };
  }
}
