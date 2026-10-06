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
import { esquemaSubirEvidenciaEntrega } from '@/modulos/entregas/validaciones/esquemas-entregas';

const BUCKET = 'entregas-evidencias';

export type ResultadoEvidenciaEntrega = { id: string; version: number };

/**
 * SII-B7.2: vincula evidencia o firma a una nota exacta en el modelo `archivos`
 * (`entidad='entrega'`). Repetir el mismo nombre genera versión nueva
 * (reemplazo trazado, sin borrado silencioso).
 */
export async function vincularEvidenciaEntregaAccion(
  formData: FormData,
): Promise<RespuestaAccion<ResultadoEvidenciaEntrega>> {
  const analisis = esquemaSubirEvidenciaEntrega.safeParse({
    notaId: formData.get('notaId'),
    clase: formData.get('clase'),
    nombreArchivo: formData.get('nombreArchivo'),
  });
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'entrega_evidencia'))) {
    return { exito: false, error: 'Sin permiso para adjuntar evidencia de entrega' };
  }

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File)) {
    return { exito: false, error: 'Archivo requerido' };
  }
  const validacion = validarSubidaArchivo('entrega', {
    nombre: archivo.name,
    tamano: archivo.size,
  });
  if (!validacion.ok) {
    return { exito: false, error: validacion.error };
  }

  const admin = crearClienteSupabaseAdmin();
  const { data: nota } = await admin
    .from('notas_entrega')
    .select('id, orden_id')
    .eq('id', analisis.data.notaId)
    .maybeSingle();
  if (!nota) {
    return { exito: false, error: 'La nota de entrega no existe' };
  }

  const { notaId, clase, nombreArchivo } = analisis.data;
  const nombreErp = sanearNombreArchivo(nombreArchivo);
  const ruta = construirRutaArchivo('entrega', notaId, nombreArchivo);
  const mime = archivo.type || 'application/octet-stream';

  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: mime, upsert: false });
  if (errorSubida) {
    return { exito: false, error: 'No se pudo subir la evidencia' };
  }

  try {
    const registrado = await registrarArchivo(admin, {
      entidad: 'entrega',
      entidadId: notaId,
      temaCodigo: clase,
      clase,
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
      'vincular_evidencia_entrega',
      'entregas',
      notaId,
      { archivoId: registrado.id, clase, version: registrado.version, ordenId: nota.orden_id },
      nuevoCorrelationId(),
    );

    return { exito: true, datos: { id: registrado.id, version: registrado.version } };
  } catch {
    await descartarSubidaArchivo(admin, BUCKET, ruta);
    return { exito: false, error: 'No se pudo registrar la evidencia' };
  }
}
