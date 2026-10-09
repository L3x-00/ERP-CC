'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { registrarArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import {
  campoRutaSubida,
  camposPrepararSubida,
  esquemaDescartarSubida,
} from '@/nucleo/almacenamiento/archivos/esquemas-subida';
import {
  confirmarSubidaDirecta,
  descartarSubidaDirecta,
  prepararSubidaDirecta,
  type SubidaPreparada,
} from '@/nucleo/almacenamiento/archivos/subida-directa';
import { sanearNombreArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';

/** Tipos de archivo del documento (§9.3). */
const CLASES_PERMITIDAS = new Set(['CAD', 'DIBUJO', 'IMAGEN', 'ESPECIFICACIONES', 'OTROS']);

const destinoAdjunto = {
  pipelineId: z.uuid(),
  clase: z.string().max(40).optional(),
  nombre: z.string().trim().min(1).max(250),
};
const esquemaPreparar = z.object({ ...destinoAdjunto, ...camposPrepararSubida }).strict();
const esquemaConfirmar = z.object({ ...destinoAdjunto, ...campoRutaSubida }).strict();

/**
 * Usuario con acceso a la oportunidad. La carga con el cliente de servidor
 * valida el acceso vía RLS (dueño o `ver_pipeline_equipo`) antes de operar.
 */
async function usuarioConAcceso(pipelineId: string): Promise<{ usuario: UsuarioAutenticado } | { error: string }> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { error: 'No autorizado' };
  const cargada = await obtenerOportunidadPorId(await crearClienteSupabaseServidor(), pipelineId);
  if (!cargada) return { error: 'No encontrada' };
  return { usuario };
}

/**
 * Emite la URL firmada para subir un adjunto de la oportunidad directo a
 * Storage (H-B1-29: el binario no pasa por la Server Action). Solo metadatos.
 */
export async function prepararAdjuntoPipelineAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SubidaPreparada>> {
  const analisis = esquemaPreparar.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos de archivo inválidos' };
  const acceso = await usuarioConAcceso(analisis.data.pipelineId);
  if ('error' in acceso) return { exito: false, error: acceso.error };

  const { pipelineId, nombre, tamano, mime } = analisis.data;
  const preparada = await prepararSubidaDirecta(crearClienteSupabaseAdmin(), {
    bucket: BUCKET_ADJUNTOS,
    entidad: 'rfq',
    entidadId: pipelineId,
    usuarioId: acceso.usuario.id,
    solicitud: { nombre, tamano, mime },
  });
  return preparada.ok ? { exito: true, datos: preparada.datos } : { exito: false, error: preparada.error };
}

/**
 * Revalida el adjunto ya subido y registra su metadata en el modelo único
 * `archivos` (SII-B1.9); el perfil de la entidad `rfq` limita tamaño y
 * extensión. Si algo falla, la carga pendiente propia se descarta.
 */
export async function confirmarAdjuntoPipelineAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ ruta: string }>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaConfirmar.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos de archivo inválidos' };
  const acceso = await usuarioConAcceso(analisis.data.pipelineId);
  if ('error' in acceso) return { exito: false, error: acceso.error };
  const { usuario } = acceso;

  const { pipelineId, nombre, ruta } = analisis.data;
  const clasePropuesta = (analisis.data.clase ?? 'OTROS').toUpperCase();
  const clase = CLASES_PERMITIDAS.has(clasePropuesta) ? clasePropuesta : 'OTROS';
  const admin = crearClienteSupabaseAdmin();

  const confirmada = await confirmarSubidaDirecta(
    admin,
    { bucket: BUCKET_ADJUNTOS, entidad: 'rfq', entidadId: pipelineId, usuarioId: usuario.id, ruta, nombre },
    (objeto) =>
      registrarArchivo(admin, {
        entidad: 'rfq',
        entidadId: pipelineId,
        clase,
        nombreOriginal: nombre,
        nombreErp: sanearNombreArchivo(nombre),
        bucket: BUCKET_ADJUNTOS,
        rutaStorage: ruta,
        mime: objeto.mime,
        tamanoBytes: objeto.tamano,
        subidoPor: usuario.id,
      }),
  );
  if (!confirmada.ok) return { exito: false, error: confirmada.error };

  await registrarLog(usuario, 'agregar_adjunto', 'pipeline', pipelineId, { ruta, clase }, correlationId);
  return { exito: true, datos: { ruta } };
}

/** Descarta una subida directa inconclusa del propio usuario. */
export async function descartarAdjuntoPipelineAccion(
  entrada: unknown,
): Promise<RespuestaAccion<null>> {
  const analisis = esquemaDescartarSubida.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Ruta inválida' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const descartada = await descartarSubidaDirecta(crearClienteSupabaseAdmin(), {
    bucket: BUCKET_ADJUNTOS,
    ruta: analisis.data.ruta,
    usuarioId: usuario.id,
  });
  return descartada.ok ? { exito: true, datos: null } : { exito: false, error: descartada.error };
}
