'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { esquemaCrearUsuario } from '../validaciones/esquemas-permisos';

/** Traduce los errores de GoTrue a un mensaje accionable para el administrador. */
function mensajeError(mensaje: string): string {
  const texto = mensaje.toLowerCase();
  if (
    texto.includes('already') ||
    texto.includes('registered') ||
    texto.includes('duplicate')
  ) {
    return 'Ya existe un usuario con ese correo';
  }
  if (texto.includes('password')) {
    return 'La contraseña no cumple los requisitos de seguridad';
  }
  if (texto.includes('email')) {
    return 'El correo no es válido';
  }
  return 'No se pudo crear el usuario';
}

/**
 * Alta de usuario desde Configuración → Personas y accesos → Usuarios.
 *
 * Solo un administrador activo puede crear cuentas. La cuenta se crea en
 * Supabase Auth con el nombre y el rol en `user_metadata`; el trigger
 * `manejar_nuevo_usuario_auth` provisiona el perfil en `public.usuarios`.
 * Los permisos no se asignan por usuario: el rol elegido determina la fila de
 * la matriz de permisos, que el administrador puede ajustar en el apartado
 * Permisos. Toda alta y todo rechazo quedan auditados.
 */
export async function crearUsuarioAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const resultado = esquemaCrearUsuario.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario || usuario.rol !== 'admin' || !usuario.activo) {
    return { exito: false, error: 'Solo un administrador activo puede crear usuarios' };
  }

  const { nombreCompleto, email, password, rol } = resultado.data;
  const correlationId = nuevoCorrelationId();
  const clienteAdmin = crearClienteSupabaseAdmin();

  const alta = await clienteAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre_completo: nombreCompleto, rol },
  });

  if (alta.error || !alta.data.user) {
    const codigo = alta.error?.message ?? 'sin_detalle';
    console.error('[USUARIOS] Error al crear usuario:', codigo);
    await registrarLog(
      usuario,
      'crear_usuario_rechazado',
      'usuarios',
      email,
      { codigo: codigo.slice(0, 120), rol },
      correlationId,
    );
    return { exito: false, error: mensajeError(codigo) };
  }

  const id = alta.data.user.id;

  // El trigger crea el perfil. Este upsert asegura nombre, rol y estado también
  // en entornos restaurados donde el trigger pudo no existir, y nunca deja una
  // cuenta de Auth sin perfil en la aplicación.
  const perfil = await clienteAdmin
    .from('usuarios')
    .upsert(
      { id, email, nombre_completo: nombreCompleto, rol, activo: true },
      { onConflict: 'id' },
    );

  if (perfil.error) {
    console.error('[USUARIOS] No se pudo crear el perfil:', perfil.error.message);
    await clienteAdmin.auth.admin.deleteUser(id);
    await registrarLog(
      usuario,
      'crear_usuario_rechazado',
      'usuarios',
      email,
      { codigo: 'perfil_no_creado', rol },
      correlationId,
    );
    return { exito: false, error: 'No se pudo completar el perfil del usuario' };
  }

  await registrarLog(usuario, 'crear_usuario', 'usuarios', id, { rol, email }, correlationId);

  return { exito: true, datos: { id } };
}
