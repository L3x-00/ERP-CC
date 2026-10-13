'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorSaldoMaterial,
  listarMovimientosSaldo,
  listarSaldosMaterial,
  mensajeErrorSaldo,
} from '@/modulos/inventario/servicios/saldos-material-servicio';
import {
  puedeGestionarInventario,
  puedeVerMaterialesCostos,
} from '@/modulos/inventario/servicios/permiso-inventario';
import type {
  MovimientoSaldoMaterial,
  SaldosMaterialVista,
} from '@/modulos/inventario/tipos/materiales-costos';
import { esquemaConsultaMovimientosSaldo } from '@/modulos/inventario/validaciones/materiales-catalogo';

function mensajeDeError(error: unknown): string {
  return mensajeErrorSaldo(
    error instanceof ErrorSaldoMaterial ? error.codigo : 'desconocido',
  );
}

/**
 * Obs. cliente 2026-10-13 (8): saldos manuales de existencia por material y
 * espesor. Lectura permitida a `gestionar_inventario` o `ver_finanzas`; la
 * acción además informa si el actor puede ajustar (permiso de gestión).
 */
export async function listarSaldosMaterialAccion(): Promise<
  RespuestaAccion<SaldosMaterialVista>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await puedeVerMaterialesCostos(usuario))) {
    return { exito: false, error: 'Sin permiso para ver materiales y costos' };
  }
  try {
    const saldos = await listarSaldosMaterial(crearClienteSupabaseAdmin());
    return {
      exito: true,
      datos: { saldos, puedeGestionar: await puedeGestionarInventario(usuario) },
    };
  } catch (error) {
    console.error('[SALDOS] Error al consultar saldos:', error);
    return { exito: false, error: mensajeDeError(error) };
  }
}

/** Bitácora de ajustes de saldo, opcionalmente filtrada por material. */
export async function listarMovimientosSaldoMaterialAccion(
  entrada: unknown,
): Promise<RespuestaAccion<MovimientoSaldoMaterial[]>> {
  const analisis = esquemaConsultaMovimientosSaldo.safeParse(entrada ?? {});
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await puedeVerMaterialesCostos(usuario))) {
    return { exito: false, error: 'Sin permiso para ver materiales y costos' };
  }
  try {
    const movimientos = await listarMovimientosSaldo(
      crearClienteSupabaseAdmin(),
      analisis.data,
    );
    return { exito: true, datos: movimientos };
  } catch (error) {
    console.error('[SALDOS] Error al consultar movimientos:', error);
    return { exito: false, error: mensajeDeError(error) };
  }
}
