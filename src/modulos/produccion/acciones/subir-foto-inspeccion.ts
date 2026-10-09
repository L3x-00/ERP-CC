'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { esquemaDescartarSubida } from '@/nucleo/almacenamiento/archivos/esquemas-subida';
import {
  confirmarSubidaDirecta,
  descartarSubidaDirecta,
  prepararSubidaDirecta,
  type SubidaPreparada,
} from '@/nucleo/almacenamiento/archivos/subida-directa';
import { sanearNombreArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import {
  esquemaConfirmarFotoInspeccion,
  esquemaPrepararFotoInspeccion,
} from '@/modulos/produccion/validaciones/corridas';

import { obtenerActorProduccion } from './utilidades-acciones';

type ClienteAdmin = ReturnType<typeof crearClienteSupabaseAdmin>;

/** Actor con permiso de calidad/producción y la inspección destino (revalidado en cada paso). */
async function autorizarFoto(
  admin: ClienteAdmin,
  inspeccionId: string,
): Promise<{ actor: UsuarioAutenticado; ordenId: string } | { error: string }> {
  const actor = await obtenerActorProduccion();
  if (!actor) return { error: 'No autorizado' };
  const autorizado = (await can(actor, 'calidad_inspeccionar'))
    || (await can(actor, 'calidad_liberar_primera_pieza'))
    || (await can(actor, 'gestionar_produccion'));
  if (!autorizado) return { error: 'Sin permiso para adjuntar evidencia' };

  const { data: inspeccion } = await admin
    .from('inspecciones_calidad')
    .select('id, orden_id')
    .eq('id', inspeccionId)
    .maybeSingle();
  if (!inspeccion) return { error: 'La inspección no existe' };
  return { actor, ordenId: inspeccion.orden_id };
}

/** Emite la URL firmada para subir una foto de evidencia directo a Storage (H-B1-29). */
export async function prepararFotoInspeccionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SubidaPreparada>> {
  const analisis = esquemaPrepararFotoInspeccion.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Foto o inspección inválida' };
  const { inspeccionId, nombre, tamano, mime } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const acceso = await autorizarFoto(admin, inspeccionId);
  if ('error' in acceso) return { exito: false, error: acceso.error };

  const preparada = await prepararSubidaDirecta(admin, {
    bucket: BUCKET_ADJUNTOS,
    entidad: 'inspeccion_calidad',
    entidadId: inspeccionId,
    usuarioId: acceso.actor.id,
    solicitud: { nombre, tamano, mime },
  });
  return preparada.ok ? { exito: true, datos: preparada.datos } : { exito: false, error: preparada.error };
}

/** Revalida la foto subida y la registra en `archivos` (inspeccion_calidad). */
export async function confirmarFotoInspeccionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaConfirmarFotoInspeccion.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Foto o inspección inválida' };
  const { inspeccionId, nombre, ruta } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const acceso = await autorizarFoto(admin, inspeccionId);
  if ('error' in acceso) return { exito: false, error: acceso.error };
  const { actor, ordenId } = acceso;

  const confirmada = await confirmarSubidaDirecta(
    admin,
    { bucket: BUCKET_ADJUNTOS, entidad: 'inspeccion_calidad', entidadId: inspeccionId, usuarioId: actor.id, ruta, nombre },
    (objeto) =>
      registrarArchivo(admin, {
        entidad: 'inspeccion_calidad',
        entidadId: inspeccionId,
        clase: 'EVIDENCIA',
        nombreOriginal: nombre,
        nombreErp: sanearNombreArchivo(nombre),
        bucket: BUCKET_ADJUNTOS,
        rutaStorage: ruta,
        mime: objeto.mime,
        tamanoBytes: objeto.tamano,
        subidoPor: actor.id,
      }),
  );
  if (!confirmada.ok) return { exito: false, error: confirmada.error };

  const { id } = confirmada.datos;
  await registrarLog(actor, 'subir_foto_inspeccion', 'produccion', ordenId, {
    inspeccionId,
    archivoId: id,
  }, correlationId);
  return { exito: true, datos: { id } };
}

/** Descarta una subida directa inconclusa del propio usuario. */
export async function descartarFotoInspeccionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<null>> {
  const analisis = esquemaDescartarSubida.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Ruta inválida' };
  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };

  const descartada = await descartarSubidaDirecta(crearClienteSupabaseAdmin(), {
    bucket: BUCKET_ADJUNTOS,
    ruta: analisis.data.ruta,
    usuarioId: actor.id,
  });
  return descartada.ok ? { exito: true, datos: null } : { exito: false, error: descartada.error };
}
