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
  esquemaConfirmarEvidenciaEntrega,
  esquemaPrepararEvidenciaEntrega,
} from '@/modulos/entregas/validaciones/esquemas-entregas';

const BUCKET = 'entregas-evidencias';

export type ResultadoEvidenciaEntrega = { id: string; version: number };

type ClienteAdmin = ReturnType<typeof crearClienteSupabaseAdmin>;

/** Sesión, permiso `entrega_evidencia` y nota existente (revalidado en cada paso). */
async function autorizarEvidencia(
  admin: ClienteAdmin,
  notaId: string,
): Promise<{ usuario: UsuarioAutenticado; ordenId: string } | { error: string }> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { error: 'No autorizado' };
  if (!(await can(usuario, 'entrega_evidencia'))) {
    return { error: 'Sin permiso para adjuntar evidencia de entrega' };
  }
  const { data: nota } = await admin
    .from('notas_entrega')
    .select('id, orden_id')
    .eq('id', notaId)
    .maybeSingle();
  if (!nota) return { error: 'La nota de entrega no existe' };
  return { usuario, ordenId: nota.orden_id };
}

/**
 * SII-B7.2: emite la URL firmada para subir evidencia o firma de una nota
 * directo a Storage (H-B1-29: el binario no pasa por la Server Action).
 */
export async function prepararEvidenciaEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SubidaPreparada>> {
  const analisis = esquemaPrepararEvidenciaEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { notaId, nombreArchivo, tamano, mime } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const acceso = await autorizarEvidencia(admin, notaId);
  if ('error' in acceso) return { exito: false, error: acceso.error };

  const preparada = await prepararSubidaDirecta(admin, {
    bucket: BUCKET,
    entidad: 'entrega',
    entidadId: notaId,
    usuarioId: acceso.usuario.id,
    solicitud: { nombre: nombreArchivo, tamano, mime },
  });
  return preparada.ok ? { exito: true, datos: preparada.datos } : { exito: false, error: preparada.error };
}

/**
 * SII-B7.2: revalida el objeto subido y lo vincula a la nota exacta en el
 * modelo `archivos` (`entidad='entrega'`). Repetir el mismo nombre genera
 * versión nueva (reemplazo trazado, sin borrado silencioso).
 */
export async function confirmarEvidenciaEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEvidenciaEntrega>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaConfirmarEvidenciaEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { notaId, clase, nombreArchivo, ruta } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const acceso = await autorizarEvidencia(admin, notaId);
  if ('error' in acceso) return { exito: false, error: acceso.error };
  const { usuario, ordenId } = acceso;

  const confirmada = await confirmarSubidaDirecta(
    admin,
    { bucket: BUCKET, entidad: 'entrega', entidadId: notaId, usuarioId: usuario.id, ruta, nombre: nombreArchivo },
    (objeto) =>
      registrarArchivo(admin, {
        entidad: 'entrega',
        entidadId: notaId,
        temaCodigo: clase,
        clase,
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
    'vincular_evidencia_entrega',
    'entregas',
    notaId,
    { archivoId: id, clase, version, ordenId },
    correlationId,
  );
  return { exito: true, datos: { id, version } };
}

/** Descarta una subida directa inconclusa del propio usuario. */
export async function descartarEvidenciaEntregaAccion(
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
