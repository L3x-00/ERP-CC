import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { PERMISOS } from '@/compartido/constantes/indice';
import {
  filaAUsuario,
  type FilaUsuario,
  type UsuarioAutenticado,
} from '@/modulos/autenticacion/tipos/indice';

/** Fila de usuarios sin la columna sensible `pin_operador`. */
type FilaUsuarioSinPin = Omit<FilaUsuario, 'pin_operador'>;

/** Columnas seleccionadas de `usuarios` (excluye `pin_operador` por seguridad). */
const COLUMNAS_USUARIO =
  'id, email, nombre_completo, rol, activo, ultimo_login_at, creado_en, actualizado_en';

/**
 * Obtiene el usuario autenticado actual con sus permisos resueltos.
 *
 * Versión para servidor (Server Actions y Server Components): usa el
 * cliente Supabase de servidor con las cookies de la petición. Consulta la
 * sesión con `auth.getUser()`, carga la fila de `usuarios` (sin
 * `pin_operador`) y resuelve los permisos desde `permisos_rol`; para rol
 * `admin` asigna los 10 permisos de `PERMISOS` sin consultar la base de
 * datos.
 *
 * @returns El usuario autenticado con permisos, o `null` si no hay sesión.
 */
export async function obtenerUsuarioServidor(): Promise<UsuarioAutenticado | null> {
  const cliente = await crearClienteSupabaseServidor();

  const { data: datosAuth, error: errorAuth } = await cliente.auth.getUser();
  if (errorAuth || !datosAuth.user) {
    return null;
  }

  const { data: fila, error: errorFila } = await cliente
    .from('usuarios')
    .select(COLUMNAS_USUARIO)
    .eq('id', datosAuth.user.id)
    .maybeSingle();

  if (errorFila || !fila) {
    return null;
  }

  const filaTipada = fila as FilaUsuarioSinPin;
  if (!filaTipada.activo) {
    // Cuenta desactivada: tratar como "sin sesión" en todo punto de consumo,
    // no solo al momento del login.
    return null;
  }

  const usuario = filaAUsuario({ ...filaTipada, pin_operador: null });

  let permisos: string[];
  if (usuario.rol === 'admin') {
    permisos = [...PERMISOS];
  } else {
    const { data: filasPermisos } = await cliente
      .from('permisos_rol')
      .select('permiso')
      .eq('rol', usuario.rol);

    permisos = ((filasPermisos ?? []) as { permiso: string }[]).map((f) => f.permiso);
  }

  return { ...usuario, permisos };
}
