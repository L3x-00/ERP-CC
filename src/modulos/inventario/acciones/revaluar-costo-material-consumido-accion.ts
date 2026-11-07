'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorCostoMaterial,
  mensajeErrorCosto,
  revaluarCostoMaterialConsumidoServicio,
  type ResultadoRecosteoMaterial,
} from '@/modulos/inventario/servicios/materiales-costos-servicio';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import { esquemaRevaluarCostoMaterialConsumido } from '@/modulos/inventario/validaciones/materiales-costos';

/**
 * Server Action B7: sustituye el costo provisional de los consumos y retrabajos
 * ya registrados por el costo comprobado. Exige `gestionar_inventario`, motivo
 * y una clave idempotente; no crea consumos nuevos.
 */
export async function revaluarCostoMaterialConsumidoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoRecosteoMaterial>> {
  const correlationId = nuevoCorrelationId();
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaRevaluarCostoMaterialConsumido.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await puedeGestionarInventario(usuario))) {
    return { exito: false, error: mensajeErrorCosto('sin_permiso_materiales') };
  }

  const datos = analisis.data;
  try {
    const resultado = await revaluarCostoMaterialConsumidoServicio(
      crearClienteSupabaseAdmin(),
      datos,
      usuario.id,
    );
    await registrarLog(
      usuario,
      'revaluar_costo_material_consumido',
      'inventario',
      datos.materialId,
      {
        costo: datos.costo,
        moneda: datos.moneda,
        motivo: datos.motivo,
        solicitudId: datos.solicitudId,
        consumosActualizados: resultado.consumosActualizados,
        retrabajosActualizados: resultado.retrabajosActualizados,
        importeAnteriorTotal: resultado.importeAnteriorTotal,
        importeNuevoTotal: resultado.importeNuevoTotal,
      },
      correlationId,
    );
    return { exito: true, datos: resultado };
  } catch (error) {
    console.error('[MATERIALES] Error al revaluar costo consumido:', error);
    return {
      exito: false,
      error: mensajeErrorCosto(
        error instanceof ErrorCostoMaterial ? error.codigo : 'desconocido',
      ),
    };
  }
}
