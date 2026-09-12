'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  extraerMencionesYSanitizar,
  insertarComentario,
  mensajeErrorComentarios,
  notificarMencionesPorCorreo,
  obtenerUsuariosMencionables,
  usuarioPuedeVerEntidadComentario,
} from '@/modulos/comentarios/servicios/indice';
import type { ComentarioRegistro } from '@/modulos/comentarios/tipos/indice';
import { esquemaCrearComentario } from '@/modulos/comentarios/validaciones/indice';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Crea un comentario después de validar entidad, sesión y menciones activas. */
export async function agregarComentarioAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ComentarioRegistro>> {
  const analisis = esquemaCrearComentario.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const clienteSesion = await crearClienteSupabaseServidor();
    const tieneAcceso = await usuarioPuedeVerEntidadComentario(
      clienteSesion,
      usuario,
      analisis.data.entidadTipo,
      analisis.data.entidadId,
    );
    if (!tieneAcceso) {
      await registrarLog(usuario, 'agregar_comentario_rechazado', 'comentarios', analisis.data.entidadId, {
        entidadTipo: analisis.data.entidadTipo,
        motivo: 'entidad_no_disponible',
      });
      return { exito: false, error: 'No tienes acceso a este registro' };
    }

    const admin = crearClienteSupabaseAdmin();
    const usuarios = await obtenerUsuariosMencionables(admin);
    const resultadoTexto = extraerMencionesYSanitizar(analisis.data.contenido, usuarios);
    // Los UUID enviados por el navegador no son una fuente de autorización:
    // sólo las menciones que el parser encontró realmente en el texto generan
    // notificaciones, evitando avisos arbitrarios por manipulación del payload.
    const mencionesJson = resultadoTexto.mencionesJson;
    const comentario = await insertarComentario(
      admin,
      analisis.data,
      resultadoTexto.textoLimpio,
      mencionesJson,
      usuario.id,
    );
    await registrarLog(usuario, 'agregar_comentario', 'comentarios', comentario.id, {
      entidadTipo: comentario.entidadTipo,
      entidadId: comentario.entidadId,
      menciones: mencionesJson.length,
    });
    // El correo es un extra: si falla, el comentario ya quedó creado y las
    // notificaciones internas ya las generó el trigger de Postgres.
    try {
      const resumenCorreo = await notificarMencionesPorCorreo(admin, {
        autorId: usuario.id,
        autorNombre: usuario.nombreCompleto,
        comentario,
        mencionesIds: mencionesJson,
      });
      if (resumenCorreo.fallidos > 0) {
        console.error('[COMENTARIOS] Correos de mención no entregados:', resumenCorreo.fallidos);
      }
    } catch (errorCorreo) {
      console.error('[COMENTARIOS] Error al notificar menciones por correo:', errorCorreo);
    }
    return { exito: true, datos: comentario };
  } catch (error) {
    console.error('[COMENTARIOS] Error al agregar comentario:', error);
    await registrarLog(usuario, 'agregar_comentario_rechazado', 'comentarios', analisis.data.entidadId, {
      entidadTipo: analisis.data.entidadTipo,
      codigo: 'error_servicio_comentarios',
    });
    return { exito: false, error: mensajeErrorComentarios(error) };
  }
}
