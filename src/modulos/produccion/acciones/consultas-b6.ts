'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  construirRutaArchivo,
  descartarSubidaArchivo,
  firmarLecturaArchivo,
  registrarArchivo,
} from '@/nucleo/almacenamiento/archivos/servicio';
import { sanearNombreArchivo, validarSubidaArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import {
  obtenerAutorizacionesHoraExtraServicio,
  obtenerCorridasOrdenServicio,
  obtenerInspeccionesOrdenServicio,
  obtenerMotivosPausaServicio,
  obtenerProcesosPisoServicio,
  obtenerRecursosLiberablesServicio,
  type AutorizacionHoraExtraDetalle,
  type CorridaDetalle,
  type InspeccionDetalle,
  type MotivoPausaCatalogo,
  type ProcesoPiso,
  type RecursoLiberable,
} from '@/modulos/produccion/servicios/consultas-b6-servicio';
import {
  esquemaConsultarAutorizacionesHoraExtra,
  esquemaConsultarCorridas,
  esquemaConsultarInspecciones,
  esquemaSubirFotoInspeccion,
} from '@/modulos/produccion/validaciones/corridas';

import { obtenerActorProduccion } from './utilidades-acciones';

const PERMISOS_PISO = [
  'gestionar_produccion',
  'produccion_operar',
  'calidad_inspeccionar',
  'calidad_liberar_primera_pieza',
] as const;

async function tienePermisoPiso(actor: UsuarioAutenticado): Promise<boolean> {
  for (const permiso of PERMISOS_PISO) {
    if (await can(actor, permiso)) return true;
  }
  return false;
}

/** Catálogos de piso (motivos de pausa + procesos) para la UI de corridas. */
export type CatalogosPiso = {
  motivos: MotivoPausaCatalogo[];
  procesos: ProcesoPiso[];
};

export async function obtenerCatalogosPisoAccion(): Promise<RespuestaAccion<CatalogosPiso>> {
  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await tienePermisoPiso(actor))) {
    return { exito: false, error: 'Sin permiso para ver el piso de producción' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const [motivos, procesos] = await Promise.all([
      obtenerMotivosPausaServicio(admin),
      obtenerProcesosPisoServicio(admin),
    ]);
    return { exito: true, datos: { motivos, procesos } };
  } catch (error) {
    console.error('[PRODUCCION] Error al cargar catálogos de piso:', error);
    return { exito: false, error: 'No se pudieron cargar los catálogos de piso' };
  }
}

/** Corridas de una orden con ítems y avance. */
export async function obtenerCorridasOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<CorridaDetalle[]>> {
  const resultado = esquemaConsultarCorridas.safeParse(entrada);
  if (!resultado.success) return { exito: false, error: 'Datos inválidos' };

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await tienePermisoPiso(actor))) {
    return { exito: false, error: 'Sin permiso para ver corridas' };
  }

  try {
    const corridas = await obtenerCorridasOrdenServicio(
      crearClienteSupabaseAdmin(),
      resultado.data.ordenId,
    );
    return { exito: true, datos: corridas };
  } catch (error) {
    console.error('[PRODUCCION] Error al cargar corridas:', error);
    return { exito: false, error: 'No se pudieron cargar las corridas' };
  }
}

/** Sesiones pausadas con motivo liberable ≥60 min (supervisor). */
export async function obtenerRecursosLiberablesAccion(): Promise<RespuestaAccion<RecursoLiberable[]>> {
  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  const autorizado = (await can(actor, 'gestionar_produccion'))
    || (await can(actor, 'gestionar_planeacion'));
  if (!autorizado) return { exito: false, error: 'Sin permiso para reclamar recursos' };

  try {
    const liberables = await obtenerRecursosLiberablesServicio(crearClienteSupabaseAdmin());
    return { exito: true, datos: liberables };
  } catch (error) {
    console.error('[PRODUCCION] Error al cargar recursos liberables:', error);
    return { exito: false, error: 'No se pudieron cargar los recursos liberables' };
  }
}

/** Autorizaciones de horas extra (Management/Admin). */
export async function obtenerAutorizacionesHoraExtraAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AutorizacionHoraExtraDetalle[]>> {
  const resultado = esquemaConsultarAutorizacionesHoraExtra.safeParse(entrada ?? {});
  if (!resultado.success) return { exito: false, error: 'Datos inválidos' };

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await can(actor, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para ver horas extra' };
  }

  try {
    const autorizaciones = await obtenerAutorizacionesHoraExtraServicio(
      crearClienteSupabaseAdmin(),
      resultado.data.ordenId,
    );
    return { exito: true, datos: autorizaciones };
  } catch (error) {
    console.error('[PRODUCCION] Error al cargar horas extra:', error);
    return { exito: false, error: 'No se pudieron cargar las autorizaciones' };
  }
}

/** Inspecciones de calidad de una orden. */
export async function obtenerInspeccionesOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<InspeccionDetalle[]>> {
  const resultado = esquemaConsultarInspecciones.safeParse(entrada);
  if (!resultado.success) return { exito: false, error: 'Datos inválidos' };

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await tienePermisoPiso(actor))) {
    return { exito: false, error: 'Sin permiso para ver inspecciones' };
  }

  try {
    const inspecciones = await obtenerInspeccionesOrdenServicio(
      crearClienteSupabaseAdmin(),
      resultado.data.ordenId,
    );
    return { exito: true, datos: inspecciones };
  } catch (error) {
    console.error('[PRODUCCION] Error al cargar inspecciones:', error);
    return { exito: false, error: 'No se pudieron cargar las inspecciones' };
  }
}

/** Sube una foto de evidencia y la registra en `archivos` (inspeccion_calidad). */
export async function subirFotoInspeccionAccion(
  formData: FormData,
): Promise<RespuestaAccion<{ id: string }>> {
  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  const autorizado = (await can(actor, 'calidad_inspeccionar'))
    || (await can(actor, 'calidad_liberar_primera_pieza'))
    || (await can(actor, 'gestionar_produccion'));
  if (!autorizado) return { exito: false, error: 'Sin permiso para adjuntar evidencia' };

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File)) return { exito: false, error: 'Archivo requerido' };

  const analisis = esquemaSubirFotoInspeccion.safeParse({
    inspeccionId: formData.get('inspeccionId'),
  });
  if (!analisis.success) return { exito: false, error: 'Inspección inválida' };

  const admin = crearClienteSupabaseAdmin();
  const { data: inspeccion } = await admin
    .from('inspecciones_calidad')
    .select('id, orden_id')
    .eq('id', analisis.data.inspeccionId)
    .maybeSingle();
  if (!inspeccion) return { exito: false, error: 'La inspección no existe' };

  const validacion = validarSubidaArchivo('inspeccion_calidad', {
    nombre: archivo.name,
    tamano: archivo.size,
  });
  if (!validacion.ok) return { exito: false, error: validacion.error };

  const mime = archivo.type || 'application/octet-stream';
  const ruta = construirRutaArchivo('inspeccion_calidad', inspeccion.id, archivo.name);
  const { error: errorSubida } = await admin.storage
    .from(BUCKET_ADJUNTOS)
    .upload(ruta, archivo, { contentType: mime, upsert: false });
  if (errorSubida) return { exito: false, error: 'No se pudo subir la foto' };

  let id: string;
  try {
    const registrado = await registrarArchivo(admin, {
      entidad: 'inspeccion_calidad',
      entidadId: inspeccion.id,
      clase: 'EVIDENCIA',
      nombreOriginal: archivo.name,
      nombreErp: sanearNombreArchivo(archivo.name),
      bucket: BUCKET_ADJUNTOS,
      rutaStorage: ruta,
      mime,
      tamanoBytes: archivo.size,
      subidoPor: actor.id,
    });
    id = registrado.id;
  } catch {
    await descartarSubidaArchivo(admin, BUCKET_ADJUNTOS, ruta);
    return { exito: false, error: 'No se pudo registrar la foto' };
  }

  await registrarLog(actor, 'subir_foto_inspeccion', 'produccion', inspeccion.orden_id, {
    inspeccionId: inspeccion.id,
    archivoId: id,
  }, nuevoCorrelationId());

  return { exito: true, datos: { id } };
}

/** Firma una URL corta de lectura para una foto de inspección. */
export async function firmarFotoInspeccionAccion(
  archivoId: unknown,
): Promise<RespuestaAccion<{ url: string }>> {
  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  const autorizado = (await can(actor, 'calidad_inspeccionar'))
    || (await can(actor, 'calidad_liberar_primera_pieza'))
    || (await can(actor, 'gestionar_produccion'));
  if (!autorizado) return { exito: false, error: 'Sin permiso para abrir evidencia' };

  const analisis = typeof archivoId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(archivoId);
  if (!analisis) return { exito: false, error: 'Archivo inválido' };

  const admin = crearClienteSupabaseAdmin();
  const { data: archivo } = await admin
    .from('archivos')
    .select('entidad')
    .eq('id', archivoId as string)
    .maybeSingle();
  if (!archivo || archivo.entidad !== 'inspeccion_calidad') {
    return { exito: false, error: 'La foto no existe' };
  }

  try {
    const url = await firmarLecturaArchivo(admin, archivoId as string);
    return { exito: true, datos: { url } };
  } catch {
    return { exito: false, error: 'No se pudo abrir la foto' };
  }
}
