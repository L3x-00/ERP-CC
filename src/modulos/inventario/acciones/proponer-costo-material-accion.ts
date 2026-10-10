'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorCostoMaterial,
  mensajeErrorCosto,
  proponerCostoMaterialServicio,
} from '@/modulos/inventario/servicios/materiales-costos-servicio';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import { esquemaProponerCostoMaterial } from '@/modulos/inventario/validaciones/materiales-costos';

/**
 * Server Action: una compra o gasto propone un costo de material (C6.1/DC-13).
 * No cambia el maestro: la confirmación autorizada es otro paso.
 */
export async function proponerCostoMaterialAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ propuestaId: string }>> {
  const correlationId = nuevoCorrelationId();
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaProponerCostoMaterial.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await puedeGestionarInventario(usuario))) {
    return { exito: false, error: mensajeErrorCosto('sin_permiso_materiales') };
  }

  const datos = analisis.data;
  try {
    const propuestaId = await proponerCostoMaterialServicio(
      crearClienteSupabaseAdmin(),
      datos,
      usuario.id,
    );
    await registrarLog(
      usuario,
      'proponer_costo_material',
      'inventario',
      datos.materialId,
      {
        propuestaId,
        costo: datos.costo,
        moneda: datos.moneda,
        fuente: datos.fuente,
        referencia: datos.referencia,
      },
      correlationId,
    );
    return { exito: true, datos: { propuestaId } };
  } catch (error) {
    console.error('[MATERIALES] Error al proponer costo:', error);
    return {
      exito: false,
      error: mensajeErrorCosto(
        error instanceof ErrorCostoMaterial ? error.codigo : 'desconocido',
      ),
    };
  }
}
