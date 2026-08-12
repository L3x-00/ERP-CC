'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  registrarConsumoMaterialServicio,
  type ConsumoMaterialRegistrado,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaRegistrarConsumoMaterial } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Solicita a Postgres el consumo de material de una partida. El stock, kardex
 * y CPP se resuelven en la RPC atómica; esta acción solo protege la entrada,
 * autorización y auditoría de la operación.
 */
export async function registrarConsumoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConsumoMaterialRegistrado>> {
  const analisis = esquemaRegistrarConsumoMaterial.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para registrar consumo de material' };
  }

  try {
    const consumo = await registrarConsumoMaterialServicio(
      crearClienteSupabaseAdmin(),
      analisis.data,
    );
    await registrarLog(usuario, 'registrar_consumo_material', 'ordenes', consumo.id, {
      partidaId: analisis.data.partidaId,
      materialId: analisis.data.materialId,
      cantidadUsada: analisis.data.cantidadUsada,
      cantidadScrap: analisis.data.cantidadScrap,
      movimientoInventarioId: consumo.movimientoInventarioId,
    });
    return { exito: true, datos: consumo };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al registrar consumo:', error);
    await registrarLog(usuario, 'consumo_material_rechazado', 'ordenes', analisis.data.partidaId, {
      codigo,
      materialId: analisis.data.materialId,
    });
    return { exito: false, error: 'No se pudo registrar el consumo de material' };
  }
}
