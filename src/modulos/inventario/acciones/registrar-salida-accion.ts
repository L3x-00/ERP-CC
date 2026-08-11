'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { esquemaSalidaInventario } from '@/modulos/inventario/validaciones/inventario';
import {
  ErrorInventario,
  registrarMovimientoServicio,
} from '@/modulos/inventario/servicios/inventario-servicio';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Server Action: registra una salida de material a producción.
 *
 * Descuenta stock de forma atómica; si la cantidad supera el stock disponible,
 * la operación rebota con un error genérico y se registra el intento en
 * auditoría (regla de stock negativo prohibido). Patrón blindado: auth → Zod →
 * permiso → servicio → auditoría. Nunca lanza al cliente.
 */
export async function registrarSalidaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string; folio: string }>> {
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
  const admin = crearClienteSupabaseAdmin();

  try {
    const movimiento = await registrarMovimientoServicio(admin, {
      tipo: 'salida_produccion',
      materialId: datos.materialId,
      cantidadControl: datos.cantidadControl,
      operadorId: usuario.id,
      ...(datos.ordenId ? { ordenId: datos.ordenId } : {}),
      ...(datos.notas ? { notas: datos.notas } : {}),
    });

    await registrarLog(usuario, 'salida_inventario', 'inventario', movimiento.materialId, {
      folio: movimiento.folio,
      cantidadControl: datos.cantidadControl,
    });

    return { exito: true, datos: { id: movimiento.id, folio: movimiento.folio } };
  } catch (error) {
    if (error instanceof ErrorInventario && error.codigo === 'stock_insuficiente') {
      // Se registra el intento rechazado (auditoría), sin filtrar detalle al cliente.
      await registrarLog(usuario, 'salida_rechazada_stock', 'inventario', datos.materialId, {
        cantidadSolicitada: datos.cantidadControl,
      });
      return { exito: false, error: 'Stock insuficiente para la salida' };
    }
    console.error('[INVENTARIO] Error al registrar salida:', error);
    return { exito: false, error: 'No se pudo registrar la salida' };
  }
}
