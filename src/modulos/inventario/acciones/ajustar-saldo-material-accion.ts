'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import {
  ErrorSaldoMaterial,
  ajustarSaldoMaterialServicio,
  mensajeErrorSaldo,
} from '@/modulos/inventario/servicios/saldos-material-servicio';
import { esquemaAjustarSaldoMaterial } from '@/modulos/inventario/validaciones/materiales-catalogo';

export type ResultadoAjustarSaldo = {
  saldoAnterior: number;
  saldoNuevo: number;
  actualizadoEn: string;
};

/**
 * Obs. cliente 2026-10-13 (8): ajuste manual de existencia (saldo por material
 * + espesor) con motivo obligatorio. El saldo solo cambia aquí: el consumo de
 * las órdenes no descuenta. La RPC revalida permiso, material/espesor y
 * registra el movimiento append-only; la acción deja la auditoría.
 */
export async function ajustarSaldoMaterialAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoAjustarSaldo>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaAjustarSaldoMaterial.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await puedeGestionarInventario(usuario))) {
    return { exito: false, error: mensajeErrorSaldo('sin_permiso_materiales') };
  }

  const datos = analisis.data;
  try {
    const ajustado = await ajustarSaldoMaterialServicio(
      crearClienteSupabaseAdmin(),
      datos,
      usuario.id,
    );
    await registrarLog(
      usuario,
      'ajustar_saldo_material',
      'inventario',
      datos.materialId,
      {
        espesorId: datos.espesorId ?? null,
        saldoAnterior: ajustado.saldoAnterior,
        saldoNuevo: ajustado.saldoNuevo,
        motivo: datos.motivo,
      },
      correlationId,
    );
    return { exito: true, datos: ajustado };
  } catch (error) {
    console.error('[SALDOS] Error al ajustar saldo:', error);
    return {
      exito: false,
      error: mensajeErrorSaldo(
        error instanceof ErrorSaldoMaterial ? error.codigo : 'desconocido',
      ),
    };
  }
}
