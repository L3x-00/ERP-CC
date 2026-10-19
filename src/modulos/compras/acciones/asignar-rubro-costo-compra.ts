'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { traducirErrorCompra } from '@/modulos/compras/servicios/errores-compra';
import { esquemaAsignarRubroCostoCompra } from '@/modulos/compras/validaciones/esquemas-compras';

/** C10.1/F09 (D11): clasifica una compra histórica con Orden y sin rubro. */
export async function asignarRubroCostoCompraAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ compraId: string }>> {
  const analisis = esquemaAsignarRubroCostoCompra.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para clasificar compras' };
  }

  const correlationId = nuevoCorrelationId();
  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin.rpc('asignar_rubro_costo_compra', {
    p_compra_id: datos.compraId,
    p_rubro_costo: datos.rubroCosto,
    p_actor_id: usuario.id,
    p_correlation_id: correlationId,
  });

  const fila = Array.isArray(data) ? data[0] : null;
  if (error || !fila) {
    await registrarLog(
      usuario,
      'asignar_rubro_costo_compra_rechazado',
      'compras',
      datos.compraId,
      { codigo: (error?.message ?? 'sin_respuesta').slice(0, 120) },
      correlationId,
    );
    return { exito: false, error: traducirErrorCompra(error?.message ?? '', error?.details ?? undefined) };
  }

  await registrarLog(
    usuario,
    'asignar_rubro_costo_compra',
    'compras',
    datos.compraId,
    { rubroCosto: fila.rubro_costo },
    correlationId,
  );

  return { exito: true, datos: { compraId: datos.compraId } };
}
