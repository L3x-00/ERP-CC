'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import { esquemaRetirarArchivoPropuesta } from '../validaciones/esquemas-archivos-propuesta';

export type ResultadoRetirarArchivo = { retirados: number };

type ClienteAdmin = ReturnType<typeof crearClienteSupabaseAdmin>;

/** Vínculo propio del documento: cabecera de la revisión o un ítem suyo. */
type ArchivoPropio = {
  id: string;
  entidad: 'propuesta_revision' | 'propuesta_item';
  entidadId: string;
  temaCodigo: string | null;
  nombreErp: string | null;
};

/** Revisión física del archivo: la cabecera o la del ítem al que cuelga. */
async function revisionDelArchivo(
  admin: ClienteAdmin,
  archivo: ArchivoPropio,
): Promise<string | null> {
  if (archivo.entidad === 'propuesta_revision') return archivo.entidadId;
  const { data: item } = await admin
    .from('propuesta_items')
    .select('revision_id')
    .eq('id', archivo.entidadId)
    .maybeSingle();
  return item?.revision_id ?? null;
}

/**
 * Obs. cliente 2026-10-13 (6): «Quitar» un archivo propio de la propuesta.
 *
 * Marca `retirado_en`/`retirado_por` (soft-delete) sin borrar la fila ni el
 * binario: la vista principal filtra retirados y el historial queda auditable.
 * Se retira el linaje completo del documento (todas sus versiones por
 * `entidad + entidad_id + tema + nombre_erp`) para que quitar el documento no
 * resucite una versión anterior; las filas legadas sin nombre ERP se retiran
 * solas. Solo revisiones en borrador, archivos propios y permiso de edición
 * de artículos: lo revalida el servidor, no la UI.
 */
export async function retirarArchivoPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoRetirarArchivo>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaRetirarArchivoPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { propuestaId, archivoId } = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_editar_articulo'))) {
    return { exito: false, error: 'Sin permiso para quitar archivos de la propuesta' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { data: fila } = await admin
    .from('archivos')
    .select('id, entidad, entidad_id, tema_codigo, nombre_erp, retirado_en')
    .eq('id', archivoId)
    .maybeSingle();
  if (!fila) return { exito: false, error: 'El archivo no existe' };
  if (fila.retirado_en !== null) return { exito: false, error: 'El archivo ya fue retirado' };
  if (fila.entidad !== 'propuesta_revision' && fila.entidad !== 'propuesta_item') {
    return { exito: false, error: 'Solo se quitan archivos propios de la propuesta' };
  }
  const archivo: ArchivoPropio = {
    id: fila.id,
    entidad: fila.entidad,
    entidadId: fila.entidad_id,
    temaCodigo: fila.tema_codigo,
    nombreErp: fila.nombre_erp,
  };

  const revisionId = await revisionDelArchivo(admin, archivo);
  if (!revisionId) {
    return { exito: false, error: 'El archivo no pertenece a una revisión de la propuesta' };
  }
  const { data: revision } = await admin
    .from('propuesta_revisiones')
    .select('id, estado')
    .eq('id', revisionId)
    .eq('propuesta_id', propuestaId)
    .maybeSingle();
  if (!revision) return { exito: false, error: 'El archivo no pertenece a esta propuesta' };
  if (revision.estado !== 'DRAFT') {
    return { exito: false, error: 'Solo se quitan archivos de revisiones en borrador' };
  }

  // Objetivos del retiro: el linaje completo si el ERP lo identifica; la fila
  // sola cuando es metadata legada sin nombre ERP.
  let objetivosQuery = admin
    .from('archivos')
    .select('id')
    .eq('entidad', archivo.entidad)
    .eq('entidad_id', archivo.entidadId)
    .is('retirado_en', null);
  if (archivo.nombreErp) {
    objetivosQuery =
      archivo.temaCodigo === null
        ? objetivosQuery.is('tema_codigo', null)
        : objetivosQuery.eq('tema_codigo', archivo.temaCodigo);
    objetivosQuery = objetivosQuery.eq('nombre_erp', archivo.nombreErp);
  } else {
    objetivosQuery = objetivosQuery.eq('id', archivo.id);
  }
  const { data: objetivos, error: errorObjetivos } = await objetivosQuery;
  if (errorObjetivos) return { exito: false, error: 'No se pudo preparar el retiro' };
  const ids = (objetivos ?? []).map((filaObjetivo) => filaObjetivo.id);
  if (ids.length === 0) return { exito: false, error: 'El archivo ya fue retirado' };

  // CAS por `retirado_en is null`: dos retiros concurrentes no se pisan y el
  // segundo termina con cero filas (reporta «ya retirado» con este conteo).
  const { data: retiradas, error: errorRetiro } = await admin
    .from('archivos')
    .update({ retirado_en: new Date().toISOString(), retirado_por: usuario.id })
    .in('id', ids)
    .is('retirado_en', null)
    .select('id');
  if (errorRetiro) return { exito: false, error: 'No se pudo quitar el archivo' };
  const retirados = (retiradas ?? []).length;
  if (retirados === 0) return { exito: false, error: 'El archivo ya fue retirado' };

  await registrarLog(
    usuario,
    'retirar_archivo_propuesta',
    'propuestas',
    revisionId,
    {
      archivoId,
      entidad: archivo.entidad,
      entidadId: archivo.entidadId,
      nombreErp: archivo.nombreErp,
      retirados,
    },
    correlationId,
  );

  return { exito: true, datos: { retirados } };
}
