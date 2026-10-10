'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  registrarConsumoMaterialServicio,
  registrarConsumoMaterialOperadorServicio,
  type ConsumoMaterialRegistrado,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaRegistrarConsumoMaterial } from '@/modulos/ordenes/validaciones/ordenes';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';

/**
 * Solicita a Postgres el consumo de material de una partida. La RPC congela el
 * costo confirmado y no modifica stock, kardex ni reservas.
 */
export async function registrarConsumoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConsumoMaterialRegistrado>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaRegistrarConsumoMaterial.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await puedeGestionarInventario(usuario))) {
    return { exito: false, error: 'Sin permiso para registrar consumo de material' };
  }

  try {
    const consumo = await registrarConsumoMaterialServicio(
      crearClienteSupabaseAdmin(),
      analisis.data,
      usuario.id,
    );
    await registrarLog(usuario, 'registrar_consumo_material', 'ordenes', consumo.id, {
      partidaId: analisis.data.partidaId,
      materialId: analisis.data.materialId,
      cantidadUsada: analisis.data.cantidadUsada,
      cantidadScrap: analisis.data.cantidadScrap,
      movimientoInventarioId: consumo.movimientoInventarioId,
    }, correlationId);
    return { exito: true, datos: consumo };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al registrar consumo:', error);
    await registrarLog(usuario, 'consumo_material_rechazado', 'ordenes', analisis.data.partidaId, {
      codigo,
      materialId: analisis.data.materialId,
    }, correlationId);
    return { exito: false, error: mensajeConsumo(codigo) };
  }
}

/**
 * Variante exclusiva para piso: el operador se autentica por PIN firmado y
 * vigente y registra el mismo snapshot económico sin operar inventario.
 */
export async function registrarConsumoOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConsumoMaterialRegistrado>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaRegistrarConsumoMaterial.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'registrar_consumo_material',
    analisis.data.partidaId,
  );
  if (!operador) {
    return { exito: false, error: 'Sesión de operador no válida' };
  }

  try {
    const consumo = await registrarConsumoMaterialOperadorServicio(
      crearClienteSupabaseAdmin(),
      { ...analisis.data, operadorId: operador.id },
    );
    await registrarLog(operador, 'registrar_consumo_material', 'ordenes', consumo.id, {
      partidaId: analisis.data.partidaId,
      materialId: analisis.data.materialId,
      cantidadUsada: analisis.data.cantidadUsada,
      cantidadScrap: analisis.data.cantidadScrap,
      movimientoInventarioId: consumo.movimientoInventarioId,
    }, correlationId);
    return { exito: true, datos: consumo };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error de consumo de operador:', error);
    await registrarLog(operador, 'consumo_material_rechazado', 'ordenes', analisis.data.partidaId, {
      codigo,
      materialId: analisis.data.materialId,
    }, correlationId);
    return { exito: false, error: mensajeConsumo(codigo) };
  }
}

function mensajeConsumo(codigo: ErrorOrden['codigo']): string {
  if (codigo === 'costo_material_no_configurado') {
    return 'El material no tiene un costo confirmado. Configúralo en Materiales y costos.';
  }
  if (codigo === 'tipo_cambio_no_configurado') {
    return 'Configura el tipo de cambio USD antes de registrar el consumo.';
  }
  if (codigo === 'material_inexistente_o_inactivo') {
    return 'El material ya no está disponible.';
  }
  if (codigo === 'material_no_corresponde_partida') {
    return 'El material no corresponde a la partida seleccionada.';
  }
  return 'No se pudo registrar el consumo de material';
}
