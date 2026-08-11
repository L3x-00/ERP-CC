'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { esquemaCrearMaterial } from '@/modulos/inventario/validaciones/inventario';
import { crearMaterialServicio } from '@/modulos/inventario/servicios/inventario-servicio';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Server Action: crea un material del catálogo.
 *
 * Patrón: 'use server' → Zod safeParse → `can` (configuración/aprobar_ordenes)
 * → servicio → `registrarLog`. Errores al cliente siempre genéricos; la causa
 * real se loguea internamente. Nunca lanza al cliente.
 */
export async function crearMaterialAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaCrearMaterial.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await puedeGestionarInventario(usuario))) {
    return { exito: false, error: 'Sin permiso para gestionar materiales' };
  }

  const admin = crearClienteSupabaseAdmin();

  try {
    const material = await crearMaterialServicio(admin, analisis.data);
    await registrarLog(usuario, 'crear', 'inventario', material.id, {
      codigo: material.codigo,
    });
    return { exito: true, datos: { id: material.id } };
  } catch (error) {
    console.error('[INVENTARIO] Error al crear material:', error);
    return { exito: false, error: 'No se pudo crear el material' };
  }
}
