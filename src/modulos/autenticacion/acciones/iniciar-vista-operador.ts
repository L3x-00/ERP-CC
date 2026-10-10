'use server';

import { cookies } from 'next/headers';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { SesionOperador } from '@/modulos/autenticacion/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaIniciarVistaOperador } from '@/modulos/autenticacion/validaciones/esquema-vista-operador';
import {
  COOKIE_SESION_OPERADOR,
  TIMEOUT_SESION_OPERADOR_MINUTOS,
} from '@/nucleo/autenticacion/constantes';
import { serializarSesionOperador } from '@/nucleo/autenticacion/sesion';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

type ResultadoVistaOperador = { ruta: '/produccion-piso' };

/** Inicia una vista temporal y de solo lectura sin solicitar el PIN del operador. */
export async function iniciarVistaOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoVistaOperador>> {
  const analisis = esquemaIniciarVistaOperador.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const administrador = await obtenerUsuarioServidor();
  if (!administrador || administrador.rol !== 'admin') {
    return { exito: false, error: 'Sin permiso para ver como operador' };
  }

  const { data: operador, error } = await crearClienteSupabaseAdmin()
    .from('usuarios')
    .select('id, nombre_completo, pin_cambiado_en')
    .eq('id', analisis.data.operadorId)
    .eq('rol', 'operador')
    .eq('activo', true)
    .maybeSingle();

  if (error || !operador) {
    return { exito: false, error: 'El operador no está disponible' };
  }

  const ahora = new Date();
  const expira = new Date(ahora.getTime() + TIMEOUT_SESION_OPERADOR_MINUTOS * 60 * 1000);
  const sesion: SesionOperador = {
    usuarioId: operador.id,
    nombreUsuario: operador.nombre_completo,
    iniciadaEn: ahora.toISOString(),
    ultimaActividadEn: ahora.toISOString(),
    timeoutMinutos: TIMEOUT_SESION_OPERADOR_MINUTOS,
    pinCambiadoEn: operador.pin_cambiado_en ?? null,
    modo: 'delegada',
    administradorId: administrador.id,
    nombreAdministrador: administrador.nombreCompleto,
    motivoDelegacion: analisis.data.motivo,
    expiraEn: expira.toISOString(),
  };

  const valorCookie = await serializarSesionOperador(sesion);
  (await cookies()).set(COOKIE_SESION_OPERADOR, valorCookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TIMEOUT_SESION_OPERADOR_MINUTOS * 60,
  });

  await registrarLog(
    administrador,
    'iniciar_vista_operador',
    'autenticacion',
    operador.id,
    {
      operadorNombre: operador.nombre_completo,
      motivo: analisis.data.motivo,
      expiraEn: expira.toISOString(),
    },
  );

  return { exito: true, datos: { ruta: '/produccion-piso' } };
}
