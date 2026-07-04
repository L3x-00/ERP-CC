import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import type { Json } from '@/compartido/tipos/supabase';

/**
 * Registra una entrada de auditoría en la tabla `logs`.
 *
 * Usa el cliente admin (service role, sin RLS) para garantizar la inserción
 * independientemente de los permisos del usuario. NUNCA lanza excepciones:
 * un fallo de auditoría no debe interrumpir la operación de negocio;
 * se reporta con `console.error('[AUDITORIA]', ...)`.
 *
 * @param usuario Usuario autenticado que ejecuta la acción.
 * @param accion Acción realizada ('crear', 'actualizar', 'iniciar_sesion', etc.).
 * @param modulo Módulo afectado ('autenticacion', 'clientes', 'ordenes', etc.).
 * @param recursoId Identificador del recurso afectado.
 * @param detalles Datos adicionales opcionales (se guardan como JSONB).
 */
export async function registrarLog(
  usuario: UsuarioAutenticado,
  accion: string,
  modulo: string,
  recursoId: string,
  detalles?: Record<string, unknown>,
): Promise<void> {
  try {
    const cliente = crearClienteSupabaseAdmin();

    const { error } = await cliente.from('logs').insert({
      usuario_id: usuario.id,
      nombre_usuario: usuario.nombreCompleto,
      rol: usuario.rol,
      accion,
      modulo,
      recurso_id: recursoId,
      // `detalles` es un objeto plano de datos serializables; el tipo público
      // Record<string, unknown> es ergonómico para los llamadores pero no es
      // estáticamente asignable al `Json` generado (que exige recursión
      // verificada) — el cast queda aislado en esta única frontera con la BD.
      detalles: (detalles ?? null) as Json | null,
    });

    if (error) {
      console.error('[AUDITORIA] Error al insertar log:', error.message);
    }
  } catch (error) {
    console.error('[AUDITORIA] Fallo inesperado al registrar log:', error);
  }
}
