'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { esquemaCrearMaterial } from '@/modulos/inventario/validaciones/inventario';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Compatibilidad del inventario legado. Desde C6.3 rechaza nuevas altas y deja
 * una traza cuando un usuario autorizado intenta usar un cliente antiguo.
 */
export async function crearMaterialAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const correlationId = nuevoCorrelationId();
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

  await registrarLog(
    usuario,
    'operacion_inventario_retirada',
    'inventario',
    analisis.data.codigo,
    { operacion: 'crear_material' },
    correlationId,
  );
  return { exito: false, error: 'El inventario legado está disponible solo para consulta' };
}
