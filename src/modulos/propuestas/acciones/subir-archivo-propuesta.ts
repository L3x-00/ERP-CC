'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { esquemaDescartarSubida } from '@/nucleo/almacenamiento/archivos/esquemas-subida';
import {
  confirmarSubidaDirecta,
  descartarSubidaDirecta,
  prepararSubidaDirecta,
  type SubidaPreparada,
} from '@/nucleo/almacenamiento/archivos/subida-directa';
import { sanearNombreArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  esquemaConfirmarArchivoPropuesta,
  esquemaPrepararArchivoPropuesta,
} from '@/modulos/propuestas/validaciones/esquemas-propuestas';

const BUCKET = 'propuestas-archivos';

export type ResultadoSubirArchivo = { id: string; version: number };

type ClienteAdmin = ReturnType<typeof crearClienteSupabaseAdmin>;

/**
 * Sesión, permiso y revisión en borrador. Se revalida al preparar y al
 * confirmar: la revisión puede enviarse (y congelarse) entre ambos pasos.
 */
async function editorDeRevision(
  admin: ClienteAdmin,
  revisionId: string,
): Promise<{ usuario: UsuarioAutenticado } | { error: string }> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_editar_articulo'))) {
    return { error: 'Sin permiso para adjuntar archivos a la propuesta' };
  }
  const { data: revision } = await admin
    .from('propuesta_revisiones')
    .select('id, estado')
    .eq('id', revisionId)
    .maybeSingle();
  if (!revision) return { error: 'La revisión no existe' };
  if (revision.estado !== 'DRAFT') {
    return { error: 'Solo se adjuntan archivos a revisiones en borrador' };
  }
  return { usuario };
}

/**
 * SII-B4.8: emite la URL firmada para subir un archivo propio de la revisión
 * DRAFT (general o técnico) directo a Storage (H-B1-29). Solo metadatos.
 */
export async function prepararSubidaArchivoPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SubidaPreparada>> {
  const analisis = esquemaPrepararArchivoPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { revisionId, nombreArchivo, tamano, mime } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const editor = await editorDeRevision(admin, revisionId);
  if ('error' in editor) return { exito: false, error: editor.error };

  const preparada = await prepararSubidaDirecta(admin, {
    bucket: BUCKET,
    entidad: 'propuesta_revision',
    entidadId: revisionId,
    usuarioId: editor.usuario.id,
    solicitud: { nombre: nombreArchivo, tamano, mime },
  });
  return preparada.ok ? { exito: true, datos: preparada.datos } : { exito: false, error: preparada.error };
}

/**
 * SII-B4.8: revalida el objeto subido y lo registra en el modelo único
 * `archivos` (`entidad='propuesta_revision'`); las revisiones enviadas quedan
 * congeladas y no admiten adjuntos nuevos.
 */
export async function confirmarArchivoPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoSubirArchivo>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaConfirmarArchivoPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { revisionId, tema, nombreArchivo, ruta } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const editor = await editorDeRevision(admin, revisionId);
  if ('error' in editor) return { exito: false, error: editor.error };
  const { usuario } = editor;

  const confirmada = await confirmarSubidaDirecta(
    admin,
    {
      bucket: BUCKET,
      entidad: 'propuesta_revision',
      entidadId: revisionId,
      usuarioId: usuario.id,
      ruta,
      nombre: nombreArchivo,
    },
    (objeto) =>
      registrarArchivo(admin, {
        entidad: 'propuesta_revision',
        entidadId: revisionId,
        temaCodigo: tema,
        clase: tema,
        nombreOriginal: nombreArchivo,
        nombreErp: sanearNombreArchivo(nombreArchivo),
        bucket: BUCKET,
        rutaStorage: ruta,
        mime: objeto.mime,
        tamanoBytes: objeto.tamano,
        subidoPor: usuario.id,
      }),
  );
  if (!confirmada.ok) return { exito: false, error: confirmada.error };

  const { id, version } = confirmada.datos;
  await registrarLog(
    usuario,
    'subir_archivo_propuesta',
    'propuestas',
    revisionId,
    { archivoId: id, tema, version },
    correlationId,
  );
  return { exito: true, datos: { id, version } };
}

/** Descarta una subida directa inconclusa del propio usuario. */
export async function descartarSubidaArchivoPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<null>> {
  const analisis = esquemaDescartarSubida.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Ruta inválida' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const descartada = await descartarSubidaDirecta(crearClienteSupabaseAdmin(), {
    bucket: BUCKET,
    ruta: analisis.data.ruta,
    usuarioId: usuario.id,
  });
  return descartada.ok ? { exito: true, datos: null } : { exito: false, error: descartada.error };
}
