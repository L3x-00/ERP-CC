'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorCompra } from '@/modulos/compras/servicios/errores-compra';
import { esquemaEstadoCompra } from '@/modulos/compras/validaciones/esquemas-compras';

/** SII-B8 F4: confirma, recibe o cancela una compra. */
export async function cambiarEstadoCompraAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ compraId: string; estado: string; actualizadoEn: string }>> {
  const analisis = esquemaEstadoCompra.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para gestionar compras' };
  }

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('cambiar_estado_compra', {
    p_compra_id: datos.compraId,
    p_actualizado_en_esperado: datos.actualizadoEn,
    p_estado_destino: datos.estado,
    p_motivo: datos.motivo ?? null,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    return { exito: false, error: traducirErrorCompra(error?.message ?? '', error?.details ?? undefined) };
  }

  await registrarLog(
    usuario,
    'cambiar_estado_compra',
    'compras',
    datos.compraId,
    { estado: fila.estado, motivo: datos.motivo ?? null },
    correlationId,
  );

  return { exito: true, datos: { compraId: fila.id, estado: fila.estado, actualizadoEn: fila.actualizado_en } };
}
