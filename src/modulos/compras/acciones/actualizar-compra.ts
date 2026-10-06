'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorCompra } from '@/modulos/compras/servicios/errores-compra';
import { esquemaActualizarCompra } from '@/modulos/compras/validaciones/esquemas-compras';

/** SII-B8 F4: edita una compra en borrador con CAS. */
export async function actualizarCompraAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ compraId: string; actualizadoEn: string }>> {
  const analisis = esquemaActualizarCompra.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { compraId, actualizadoEn, datos } = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para gestionar compras' };
  }

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('actualizar_compra_borrador', {
    p_compra_id: compraId,
    p_actualizado_en_esperado: actualizadoEn,
    p_proveedor_id: datos.proveedorId,
    p_orden_id: datos.ordenId ?? null,
    p_monto_subtotal: datos.montoSubtotal,
    p_monto_iva: datos.montoIva,
    p_moneda: datos.moneda,
    p_tipo_cambio: datos.tipoCambio,
    p_fecha_vencimiento: datos.fechaVencimiento ?? null,
    p_notas: datos.notas ?? null,
    p_actor_id: usuario.id,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    return { exito: false, error: traducirErrorCompra(error?.message ?? '', error?.details ?? undefined) };
  }

  await registrarLog(
    usuario,
    'actualizar_compra_borrador',
    'compras',
    compraId,
    { total: fila.monto_total },
    correlationId,
  );

  return { exito: true, datos: { compraId, actualizadoEn: fila.actualizado_en } };
}
