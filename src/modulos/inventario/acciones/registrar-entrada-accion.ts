'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { esquemaEntradaInventario } from '@/modulos/inventario/validaciones/inventario';
import { registrarMovimientoServicio } from '@/modulos/inventario/servicios/inventario-servicio';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Server Action: registra una entrada de compra de material.
 *
 * Agrega stock y recalcula el Costo Promedio Ponderado de forma atómica (la
 * función Postgres bloquea el material). Patrón blindado: auth → Zod → permiso
 * → servicio → auditoría. Errores genéricos al cliente.
 */
export async function registrarEntradaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string; folio: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaEntradaInventario.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await puedeGestionarInventario(usuario))) {
    return { exito: false, error: 'Sin permiso para registrar entradas' };
  }

  const datos = analisis.data;
  const admin = crearClienteSupabaseAdmin();

  try {
    const movimiento = await registrarMovimientoServicio(admin, {
      tipo: 'entrada_compra',
      materialId: datos.materialId,
      cantidadCompra: datos.cantidadCompra,
      costoUnitarioCompra: datos.costoUnitarioCompra,
      operadorId: usuario.id,
      ...(datos.referenciaExterna ? { referenciaExterna: datos.referenciaExterna } : {}),
      ...(datos.notas ? { notas: datos.notas } : {}),
    });

    await registrarLog(usuario, 'entrada_inventario', 'inventario', movimiento.materialId, {
      folio: movimiento.folio,
      cantidadCompra: datos.cantidadCompra,
    });

    return { exito: true, datos: { id: movimiento.id, folio: movimiento.folio } };
  } catch (error) {
    console.error('[INVENTARIO] Error al registrar entrada:', error);
    return { exito: false, error: 'No se pudo registrar la entrada' };
  }
}
