'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorCostoMaterial,
  confirmarCostoMaterialServicio,
  mensajeErrorCosto,
} from '@/modulos/inventario/servicios/materiales-costos-servicio';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import { esquemaConfirmarCostoMaterial } from '@/modulos/inventario/validaciones/materiales-costos';
import type { MonedaCosto } from '@/modulos/inventario/tipos/materiales-costos';

/**
 * Server Action: confirma un costo (manual o de una propuesta) con control de
 * concurrencia (token CAS del material). Solo esta confirmación cambia el
 * maestro y registra la versión append-only del historial (C6.1/DC-13).
 */
export async function confirmarCostoMaterialAccion(entrada: unknown): Promise<
  RespuestaAccion<{
    materialId: string;
    costoVigente: number;
    monedaCosto: MonedaCosto;
    actualizadoEn: string;
  }>
> {
  const correlationId = nuevoCorrelationId();
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaConfirmarCostoMaterial.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await puedeGestionarInventario(usuario))) {
    return { exito: false, error: mensajeErrorCosto('sin_permiso_materiales') };
  }

  const datos = analisis.data;
  try {
    const confirmado = await confirmarCostoMaterialServicio(
      crearClienteSupabaseAdmin(),
      datos,
      usuario.id,
    );
    await registrarLog(
      usuario,
      'confirmar_costo_material',
      'inventario',
      datos.materialId,
      {
        costo: datos.costo,
        moneda: datos.moneda,
        fuente: datos.fuente,
        ...(datos.propuestaId ? { propuestaId: datos.propuestaId } : {}),
      },
      correlationId,
    );
    return { exito: true, datos: confirmado };
  } catch (error) {
    console.error('[MATERIALES] Error al confirmar costo:', error);
    return {
      exito: false,
      error: mensajeErrorCosto(
        error instanceof ErrorCostoMaterial ? error.codigo : 'desconocido',
      ),
    };
  }
}
