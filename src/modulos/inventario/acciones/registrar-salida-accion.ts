'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { esquemaSalidaInventario } from '@/modulos/inventario/validaciones/inventario';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Compatibilidad del inventario legado. Desde C6.3 rechaza salidas nuevas y
 * audita el intento autorizado sin tocar existencias ni movimientos.
 */
export async function registrarSalidaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string; folio: string }>> {
  const correlationId = nuevoCorrelationId();
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaSalidaInventario.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await puedeGestionarInventario(usuario))) {
    return { exito: false, error: 'Sin permiso para registrar salidas' };
  }

  const datos = analisis.data;
  await registrarLog(
    usuario,
    'operacion_inventario_retirada',
    'inventario',
    datos.materialId,
    { operacion: 'salida' },
    correlationId,
  );
  return { exito: false, error: 'El inventario legado está disponible solo para consulta' };
}
